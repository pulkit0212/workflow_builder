import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import {
  listWorkspaceJoinRequests,
  getWorkspaceById,
  getWorkspaceMembership,
  listWorkspaceMeetings,
  listWorkspaceMembers
} from "@/lib/db/queries/workspaces";

export async function GET(
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

    if (!membership) {
      return apiError("You do not have access to this workspace.", 403);
    }

    const [members, meetings, joinRequests] = await Promise.all([
      listWorkspaceMembers(workspaceId),
      listWorkspaceMeetings(workspaceId),
      listWorkspaceJoinRequests(workspaceId)
    ]);

    const canManageJoinRequests =
      membership.role === "owner" || membership.role === "admin";

    return apiSuccess({
      success: true,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        ownerId: workspace.ownerId,
        createdAt: workspace.createdAt.toISOString(),
        currentUserRole: membership.role,
        members: members.map((member) => ({
          ...member,
          createdAt: member.createdAt.toISOString()
        })),
        meetings: meetings.map((meeting) => ({
          ...meeting,
          createdAt: meeting.createdAt.toISOString()
        })),
        joinRequests: canManageJoinRequests
          ? joinRequests.map((joinRequest) => ({
              ...joinRequest,
              createdAt: joinRequest.createdAt.toISOString()
            }))
          : []
      }
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to load workspace.", 500);
  }
}
