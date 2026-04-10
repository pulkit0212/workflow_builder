import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { workspaceInvites, workspaceMembers } from "@/db/schema";

const acceptBodySchema = z.object({
  token: z.string().min(1)
});

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return apiError("Unauthorized.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", 400);
  }

  const parsed = acceptBodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Token is required.", 400);
  }

  const { token } = parsed.data;

  try {
    await ensureDatabaseReady();
    const database = db!;

    // Resolve identity from Clerk session only
    const user = await syncCurrentUserToDatabase(userId);

    const result = await database.transaction(async (tx) => {
      // Lock the invite row
      const [invite] = await tx
        .select()
        .from(workspaceInvites)
        .where(eq(workspaceInvites.token, token))
        .limit(1)
        .for("update");

      if (!invite) {
        return { error: "Invite not found.", status: 404, code: "token_not_found" };
      }

      if (invite.expiresAt < new Date()) {
        return { error: "This invite has expired.", status: 410, code: "token_expired" };
      }

      if (invite.status === "accepted") {
        return { error: "This invite has already been used.", status: 410, code: "token_already_used" };
      }

      if (invite.status === "revoked") {
        return { error: "This invite has been revoked.", status: 410, code: "token_revoked" };
      }

      // Email must match — identity from session only
      if (invite.invitedEmail.toLowerCase() !== user.email.toLowerCase()) {
        return { error: "email_mismatch", status: 403, code: "email_mismatch" };
      }

      // Insert workspace member (skip if already exists)
      await tx
        .insert(workspaceMembers)
        .values({
          workspaceId: invite.workspaceId,
          userId: user.id,
          role: "member",
          status: "active"
        })
        .onConflictDoNothing();

      // Mark invite as accepted
      await tx
        .update(workspaceInvites)
        .set({ status: "accepted", acceptedAt: new Date() })
        .where(eq(workspaceInvites.id, invite.id));

      return { workspaceId: invite.workspaceId };
    });

    if ("error" in result) {
      return apiError(result.error, result.status, { code: result.code });
    }

    return apiSuccess({ workspaceId: result.workspaceId });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to accept invite.", 500);
  }
}
