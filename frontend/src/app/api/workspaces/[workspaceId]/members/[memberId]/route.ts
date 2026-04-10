import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { updateWorkspaceMemberSchema } from "@/features/workspaces/schema";
import {
  removeWorkspaceMember,
  updateWorkspaceMember
} from "@/lib/db/mutations/workspaces";
import {
  getWorkspaceMemberById,
  getWorkspaceMembership
} from "@/lib/db/queries/workspaces";

function canManageWorkspace(role: string) {
  return role === "admin";
}

function canManageTarget(actorRole: string, targetRole: string) {
  if (actorRole === "admin") {
    return targetRole === "member" || targetRole === "viewer";
  }
  return false;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ workspaceId: string; memberId: string }> }
) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  const { workspaceId, memberId } = await context.params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", 400);
  }

  const parsed = updateWorkspaceMemberSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("Invalid member update input.", 400, parsed.error.flatten());
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const actorMembership = await getWorkspaceMembership(workspaceId, user.id);

    if (!actorMembership || !canManageWorkspace(actorMembership.role)) {
      return apiError("You cannot manage members in this workspace.", 403);
    }

    const targetMembership = await getWorkspaceMemberById(memberId);

    if (!targetMembership || targetMembership.workspaceId !== workspaceId) {
      return apiError("Workspace member not found.", 404);
    }

    if (!canManageTarget(actorMembership.role, targetMembership.role)) {
      return apiError("You cannot change this member's role.", 403);
    }

    const member = await updateWorkspaceMember({
      memberId,
      workspaceId,
      role: parsed.data.role,
      status: targetMembership.status
    });

    return apiSuccess({
      success: true,
      member: {
        ...member,
        createdAt: member.createdAt.toISOString()
      }
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to update member.", 500);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ workspaceId: string; memberId: string }> }
) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  const { workspaceId, memberId } = await context.params;

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const actorMembership = await getWorkspaceMembership(workspaceId, user.id);

    if (!actorMembership || !canManageWorkspace(actorMembership.role)) {
      return apiError("You cannot manage members in this workspace.", 403);
    }

    const targetMembership = await getWorkspaceMemberById(memberId);

    if (!targetMembership || targetMembership.workspaceId !== workspaceId) {
      return apiError("Workspace member not found.", 404);
    }

    if (targetMembership.userId === user.id) {
      return apiError("You cannot remove yourself from the workspace.", 400);
    }

    if (!canManageTarget(actorMembership.role, targetMembership.role)) {
      return apiError("You cannot remove this member.", 403);
    }

    const member = await removeWorkspaceMember({
      memberId,
      workspaceId
    });

    return apiSuccess({
      success: true,
      member: {
        ...member,
        createdAt: member.createdAt.toISOString()
      }
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to remove member.", 500);
  }
}
