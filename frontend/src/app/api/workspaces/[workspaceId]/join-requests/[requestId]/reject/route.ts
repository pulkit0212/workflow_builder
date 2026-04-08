import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { updateWorkspaceJoinRequest } from "@/lib/db/mutations/workspaces";
import {
  getWorkspaceJoinRequestById,
  getWorkspaceMembership
} from "@/lib/db/queries/workspaces";

function canManageWorkspace(role: string) {
  return role === "owner" || role === "admin";
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ workspaceId: string; requestId: string }> }
) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  const { workspaceId, requestId } = await context.params;

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const membership = await getWorkspaceMembership(workspaceId, user.id);

    if (!membership || !canManageWorkspace(membership.role)) {
      return apiError("You cannot reject join requests for this workspace.", 403);
    }

    const joinRequest = await getWorkspaceJoinRequestById(requestId);

    if (!joinRequest || joinRequest.workspaceId !== workspaceId || joinRequest.status !== "pending") {
      return apiError("Join request not found.", 404);
    }

    const updatedRequest = await updateWorkspaceJoinRequest({
      requestId,
      status: "rejected"
    });

    return apiSuccess({
      success: true,
      joinRequest: {
        ...updatedRequest,
        createdAt: updatedRequest.createdAt.toISOString()
      }
    });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to reject join request.",
      500
    );
  }
}
