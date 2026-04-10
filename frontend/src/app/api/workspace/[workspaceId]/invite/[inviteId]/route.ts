import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { workspaceInvites, workspaceMembers } from "@/db/schema";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; inviteId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return apiError("Unauthorized.", 401);

  const { workspaceId, inviteId } = await params;

  try {
    await ensureDatabaseReady();
    const database = db!;
    const user = await syncCurrentUserToDatabase(userId);

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

    await database
      .update(workspaceInvites)
      .set({ status: "revoked" })
      .where(
        and(
          eq(workspaceInvites.id, inviteId),
          eq(workspaceInvites.workspaceId, workspaceId),
          eq(workspaceInvites.status, "pending")
        )
      );

    return apiSuccess({ success: true });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to revoke invite.", 500);
  }
}
