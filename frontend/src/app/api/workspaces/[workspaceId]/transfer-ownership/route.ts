import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { getWorkspaceMembership, getWorkspaceMemberById } from "@/lib/db/queries/workspaces";
import { db } from "@/lib/db/client";
import { workspaces, workspaceMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const transferOwnershipSchema = z.object({
  newOwnerMemberId: z.string().min(1)
});

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> }
) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  const { workspaceId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", 400);
  }

  const parsed = transferOwnershipSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid input.", 400, parsed.error.flatten());
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const actorMembership = await getWorkspaceMembership(workspaceId, user.id);

    if (!actorMembership || actorMembership.role !== "admin") {
      return apiError("Only the workspace admin can transfer ownership.", 403);
    }

    const targetMembership = await getWorkspaceMemberById(parsed.data.newOwnerMemberId);

    if (
      !targetMembership ||
      targetMembership.workspaceId !== workspaceId ||
      targetMembership.status !== "active"
    ) {
      return apiError("Target member not found or not active in this workspace.", 404);
    }

    if (targetMembership.userId === user.id) {
      return apiError("You are already the owner.", 400);
    }

    if (!db) throw new Error("DATABASE_URL is not configured.");

    // Transfer: promote target to 'admin', demote current admin to 'member'
    await db
      .update(workspaceMembers)
      .set({ role: "admin" })
      .where(
        and(
          eq(workspaceMembers.id, targetMembership.id),
          eq(workspaceMembers.workspaceId, workspaceId)
        )
      );

    await db
      .update(workspaceMembers)
      .set({ role: "member" })
      .where(
        and(
          eq(workspaceMembers.id, actorMembership.id),
          eq(workspaceMembers.workspaceId, workspaceId)
        )
      );

    // Update workspace ownerId
    await db
      .update(workspaces)
      .set({ ownerId: targetMembership.userId, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));

    return apiSuccess({ success: true });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to transfer ownership.",
      500
    );
  }
}
