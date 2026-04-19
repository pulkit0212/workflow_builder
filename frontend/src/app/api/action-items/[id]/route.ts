import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { db } from "@/lib/db/client";
import { actionItems } from "@/db/schema";
import { resolveWorkspaceIdForRequest } from "@/lib/workspaces/server";

const VALID_STATUSES = ["pending", "in_progress", "done", "hold"] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return apiError("Unauthorized.", 401);
  if (!db) return apiError("Database not configured.", 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", 400);
  }

  const { status } = body as { status?: string };
  if (!status || !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    return apiError("Invalid status. Must be one of: pending, in_progress, done, hold.", 400);
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const workspaceId = await resolveWorkspaceIdForRequest(request, user.id);
    const { id } = await params;

    await db
      .update(actionItems)
      .set({ status, updatedAt: new Date() })
      .where(
        workspaceId
          ? and(eq(actionItems.id, id), eq(actionItems.workspaceId, workspaceId), eq(actionItems.userId, user.id))
          : and(eq(actionItems.id, id), eq(actionItems.userId, user.id))
      );

    return apiSuccess({ success: true });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to update action item.", 500);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return apiError("Unauthorized.", 401);
  if (!db) return apiError("Database not configured.", 503);

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const workspaceId = await resolveWorkspaceIdForRequest(request, user.id);
    const { id } = await params;

    await db
      .delete(actionItems)
      .where(
        workspaceId
          ? and(eq(actionItems.id, id), eq(actionItems.workspaceId, workspaceId), eq(actionItems.userId, user.id))
          : and(eq(actionItems.id, id), eq(actionItems.userId, user.id))
      );

    return apiSuccess({ success: true });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to delete action item.", 500);
  }
}
