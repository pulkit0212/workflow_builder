import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { getWorkspaceMembership } from "@/lib/db/queries/workspaces";
import { removeWorkspaceMember } from "@/lib/db/mutations/workspaces";

export async function POST(
  _request: Request,
  context: { params: Promise<{ workspaceId: string }> }
) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  const { workspaceId } = await context.params;

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const membership = await getWorkspaceMembership(workspaceId, user.id);

    if (!membership) {
      return apiError("You are not a member of this workspace.", 403);
    }

    if (membership.role === "owner") {
      return apiError(
        "Workspace owners cannot leave. Transfer ownership first or delete the workspace.",
        400
      );
    }

    await removeWorkspaceMember({ memberId: membership.id, workspaceId });

    return apiSuccess({ success: true });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to leave workspace.", 500);
  }
}
