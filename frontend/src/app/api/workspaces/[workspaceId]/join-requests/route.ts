import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { getWorkspaceMembership, listWorkspaceJoinRequests } from "@/lib/db/queries/workspaces";

function canManageWorkspace(role: string) {
  return role === "owner" || role === "admin";
}

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
    const membership = await getWorkspaceMembership(workspaceId, user.id);

    if (!membership || !canManageWorkspace(membership.role)) {
      return apiError("You cannot review join requests for this workspace.", 403);
    }

    const joinRequests = await listWorkspaceJoinRequests(workspaceId);

    return apiSuccess({
      success: true,
      joinRequests: joinRequests.map((request) => ({
        ...request,
        createdAt: request.createdAt.toISOString()
      }))
    });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to load join requests.",
      500
    );
  }
}
