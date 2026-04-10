import { auth } from "@clerk/nextjs/server";
import { and, eq, ilike, notInArray } from "drizzle-orm";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { users, workspaceInvites, workspaceMembers } from "@/db/schema";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return apiError("Unauthorized.", 401);

  const { workspaceId } = await params;
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";

  if (q.length < 2) {
    return apiSuccess({ suggestions: [] });
  }

  try {
    await ensureDatabaseReady();
    const database = db!;
    const user = await syncCurrentUserToDatabase(userId);

    // Check caller is owner or admin
    const [membership] = await database
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, user.id),
          eq(workspaceMembers.status, "active")
        )
      )
      .limit(1);

    if (!membership || membership.role !== "admin") {
      return apiError("Forbidden.", 403);
    }

    // Emails already with a pending invite for this workspace
    const pendingInvites = await database
      .select({ email: workspaceInvites.invitedEmail })
      .from(workspaceInvites)
      .where(
        and(
          eq(workspaceInvites.workspaceId, workspaceId),
          eq(workspaceInvites.status, "pending")
        )
      );
    const pendingEmails = pendingInvites.map((r) => r.email);

    // Emails already active members
    const activeMembers = await database
      .select({ email: users.email })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.status, "active")
        )
      );
    const memberEmails = activeMembers.map((r) => r.email);

    const excludedEmails = [...new Set([...pendingEmails, ...memberEmails])];

    const conditions = [ilike(users.email, `%${q}%`)];
    if (excludedEmails.length > 0) {
      conditions.push(notInArray(users.email, excludedEmails));
    }

    const matches = await database
      .select({ email: users.email })
      .from(users)
      .where(and(...conditions))
      .limit(5);

    return apiSuccess({ suggestions: matches.map((r) => r.email) });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to fetch suggestions.", 500);
  }
}
