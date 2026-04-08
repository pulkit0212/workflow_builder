import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { acceptJoinRequestSchema } from "@/features/workspaces/schema";
import {
  addWorkspaceMember,
  updateWorkspaceJoinRequest
} from "@/lib/db/mutations/workspaces";
import {
  getWorkspaceJoinRequestById,
  getWorkspaceMembership
} from "@/lib/db/queries/workspaces";

function canManageWorkspace(role: string) {
  return role === "owner" || role === "admin";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; requestId: string }> }
) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  const { workspaceId, requestId } = await context.params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", 400);
  }

  const parsed = acceptJoinRequestSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("Invalid join request approval input.", 400, parsed.error.flatten());
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const membership = await getWorkspaceMembership(workspaceId, user.id);

    if (!membership || !canManageWorkspace(membership.role)) {
      return apiError("You cannot approve join requests for this workspace.", 403);
    }

    const joinRequest = await getWorkspaceJoinRequestById(requestId);

    if (!joinRequest || joinRequest.workspaceId !== workspaceId || joinRequest.status !== "pending") {
      return apiError("Join request not found.", 404);
    }

    const member = await addWorkspaceMember({
      workspaceId,
      userId: joinRequest.userId,
      role: parsed.data.role,
      status: "active"
    });
    await updateWorkspaceJoinRequest({
      requestId,
      status: "accepted"
    });

    return apiSuccess({
      success: true,
      member: {
        ...member,
        createdAt: member.createdAt.toISOString()
      }
    });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to accept join request.",
      500
    );
  }
}
