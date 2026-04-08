import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { createWorkspaceJoinRequest } from "@/lib/db/mutations/workspaces";
import {
  getPendingWorkspaceJoinRequest,
  getWorkspaceById,
  getWorkspaceMembership,
  listWorkspaceMeetings,
  listWorkspaceMembers
} from "@/lib/db/queries/workspaces";

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
    const workspace = await getWorkspaceById(workspaceId);

    if (!workspace) {
      return apiError("Workspace not found.", 404);
    }

    const membership = await getWorkspaceMembership(workspaceId, user.id);

    if (membership) {
      return apiError("You are already an active member of this workspace.", 409);
    }

    const pendingRequest = await getPendingWorkspaceJoinRequest(workspaceId, user.id);

    if (!pendingRequest) {
      await createWorkspaceJoinRequest({
        workspaceId,
        userId: user.id
      });
    }

    const [members, meetings] = await Promise.all([
      listWorkspaceMembers(workspaceId),
      listWorkspaceMeetings(workspaceId)
    ]);

    return apiSuccess({
      success: true,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        ownerId: workspace.ownerId,
        createdAt: workspace.createdAt.toISOString(),
        role: "viewer",
        memberCount: members.filter((member) => member.status === "active").length,
        meetingCount: meetings.length
      }
    });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to create join request.",
      500
    );
  }
}
