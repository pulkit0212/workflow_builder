import { auth } from "@clerk/nextjs/server";
import { and, eq, ilike } from "drizzle-orm";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";
import { resolveWorkspaceIdForRequest } from "@/lib/workspaces/server";
import { db } from "@/lib/db/client";
import { actionItems } from "@/db/schema/action-items";

function getDbOrThrow() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return db;
}

export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const workspaceId = await resolveWorkspaceIdForRequest(request, user.id);

    if (!workspaceId) {
      return apiError("Workspace is required.", 400, { error: "workspace_required" });
    }

    const database = getDbOrThrow();

    // Parse query params
    const { searchParams } = new URL(request.url);
    const assignee = searchParams.get("assignee")?.trim() ?? "";
    const meetingId = searchParams.get("meetingId")?.trim() ?? "";
    const priority = searchParams.get("priority")?.trim() ?? "";
    const status = searchParams.get("status")?.trim() ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [eq(actionItems.workspaceId, workspaceId)];

    if (assignee) {
      conditions.push(ilike(actionItems.owner, `%${assignee}%`));
    }

    if (meetingId) {
      conditions.push(eq(actionItems.meetingId, meetingId));
    }

    if (priority) {
      conditions.push(eq(actionItems.priority, priority));
    }

    if (status) {
      conditions.push(eq(actionItems.status, status));
    }

    const items = await database
      .select({
        id: actionItems.id,
        task: actionItems.task,
        owner: actionItems.owner,
        dueDate: actionItems.dueDate,
        priority: actionItems.priority,
        completed: actionItems.completed,
        status: actionItems.status,
        meetingId: actionItems.meetingId,
        meetingTitle: actionItems.meetingTitle,
        workspaceId: actionItems.workspaceId,
        userId: actionItems.userId,
        source: actionItems.source,
        createdAt: actionItems.createdAt,
        updatedAt: actionItems.updatedAt,
      })
      .from(actionItems)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset);

    return apiSuccess({ success: true, actionItems: items, page, limit });
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return apiError(
        "Your database tables are not set up yet. Run your database migrations, then try again.",
        503
      );
    }
    return apiError(
      error instanceof Error ? error.message : "Failed to load workspace action items.",
      500
    );
  }
}
