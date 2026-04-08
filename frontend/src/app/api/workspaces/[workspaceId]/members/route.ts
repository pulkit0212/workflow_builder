import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { addWorkspaceMemberSchema } from "@/features/workspaces/schema";
import { addWorkspaceMember } from "@/lib/db/mutations/workspaces";
import { getWorkspaceMembership, listWorkspaceMembers } from "@/lib/db/queries/workspaces";

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

    if (!membership) {
      return apiError("You do not have access to this workspace.", 403);
    }

    const members = await listWorkspaceMembers(workspaceId);
    return apiSuccess({
      success: true,
      members: members.map((member) => ({
        ...member,
        createdAt: member.createdAt.toISOString()
      }))
    });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to load workspace members.",
      500
    );
  }
}

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

  const parsed = addWorkspaceMemberSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("Invalid member input.", 400, parsed.error.flatten());
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const membership = await getWorkspaceMembership(workspaceId, user.id);

    if (!membership || !canManageWorkspace(membership.role)) {
      return apiError("You cannot manage members in this workspace.", 403);
    }

    const nextMembership = await addWorkspaceMember({
      workspaceId,
      userId: parsed.data.userId,
      role: parsed.data.role
    });

    return apiSuccess(
      {
        success: true,
        member: {
          ...nextMembership,
          createdAt: nextMembership.createdAt.toISOString()
        }
      },
      201
    );
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to add workspace member.",
      500
    );
  }
}
