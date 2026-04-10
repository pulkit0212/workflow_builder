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
import { db } from "@/lib/db/client";
import { workspaces, workspaceMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

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

    const canManageJoinRequests = membership.role === "admin";

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

const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(255)
});

export async function PATCH(
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

  const parsed = updateWorkspaceSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid workspace input.", 400, parsed.error.flatten());
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const membership = await getWorkspaceMembership(workspaceId, user.id);

    if (!membership || membership.role !== "admin") {
      return apiError("Only the workspace admin can update the workspace name.", 403);
    }

    if (!db) throw new Error("DATABASE_URL is not configured.");

    const [updated] = await db
      .update(workspaces)
      .set({ name: parsed.data.name, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId))
      .returning();

    if (!updated) {
      return apiError("Workspace not found.", 404);
    }

    return apiSuccess({ success: true, workspace: { id: updated.id, name: updated.name } });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to update workspace.", 500);
  }
}

export async function DELETE(
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

    if (!membership || membership.role !== "admin") {
      return apiError("Only the workspace admin can delete the workspace.", 403);
    }

    if (!db) throw new Error("DATABASE_URL is not configured.");

    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));

    return apiSuccess({ success: true });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to delete workspace.", 500);
  }
}
