import { auth } from "@clerk/nextjs/server";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";
import { resolveWorkspaceIdForRequest } from "@/lib/workspaces/server";
import { db } from "@/lib/db/client";
import { meetingSessions } from "@/db/schema/meeting-sessions";
import { actionItems } from "@/db/schema/action-items";
import { workspaceMembers } from "@/db/schema";

function getDbOrThrow() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return db;
}

/** Returns the start of the current ISO calendar week (Monday 00:00:00 UTC). */
function getStartOfCurrentWeek(): Date {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday, 1 = Monday, …
  const diff = (day === 0 ? -6 : 1 - day); // shift to Monday
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
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

    // ── Counts ────────────────────────────────────────────────────────────────

    const [{ totalMeetings }] = await database
      .select({ totalMeetings: count() })
      .from(meetingSessions)
      .where(eq(meetingSessions.workspaceId, workspaceId));

    const weekStart = getStartOfCurrentWeek();
    const [{ meetingsThisWeek }] = await database
      .select({ meetingsThisWeek: count() })
      .from(meetingSessions)
      .where(
        and(
          eq(meetingSessions.workspaceId, workspaceId),
          gte(meetingSessions.createdAt, weekStart)
        )
      );

    const [{ totalActionItems }] = await database
      .select({ totalActionItems: count() })
      .from(actionItems)
      .where(eq(actionItems.workspaceId, workspaceId));

    const [{ activeMemberCount }] = await database
      .select({ activeMemberCount: count() })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.status, "active")
        )
      );

    // ── Recent lists ──────────────────────────────────────────────────────────

    const recentMeetings = await database
      .select({
        id: meetingSessions.id,
        userId: meetingSessions.userId,
        workspaceId: meetingSessions.workspaceId,
        title: meetingSessions.title,
        status: meetingSessions.status,
        visibility: meetingSessions.visibility,
        summary: meetingSessions.summary,
        createdAt: meetingSessions.createdAt,
        updatedAt: meetingSessions.updatedAt,
      })
      .from(meetingSessions)
      .where(eq(meetingSessions.workspaceId, workspaceId))
      .orderBy(desc(meetingSessions.createdAt))
      .limit(5);

    const pendingActionItems = await database
      .select({
        id: actionItems.id,
        task: actionItems.task,
        owner: actionItems.owner,
        dueDate: actionItems.dueDate,
        priority: actionItems.priority,
        status: actionItems.status,
        meetingId: actionItems.meetingId,
        meetingTitle: actionItems.meetingTitle,
        workspaceId: actionItems.workspaceId,
        createdAt: actionItems.createdAt,
        updatedAt: actionItems.updatedAt,
      })
      .from(actionItems)
      .where(
        and(
          eq(actionItems.workspaceId, workspaceId),
          eq(actionItems.status, "pending")
        )
      )
      .orderBy(desc(actionItems.createdAt))
      .limit(5);

    return apiSuccess({
      success: true,
      totalMeetings,
      meetingsThisWeek,
      totalActionItems,
      activeMemberCount,
      recentMeetings,
      pendingActionItems,
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return apiError(
        "Your database tables are not set up yet. Run your database migrations, then try again.",
        503
      );
    }
    return apiError(
      error instanceof Error ? error.message : "Failed to load workspace dashboard.",
      500
    );
  }
}
