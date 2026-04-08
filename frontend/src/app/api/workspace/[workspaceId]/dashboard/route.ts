import { auth } from "@clerk/nextjs/server";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";
import { db } from "@/lib/db/client";
import { meetingSessions } from "@/db/schema/meeting-sessions";
import { actionItems } from "@/db/schema/action-items";
import { workspaceMembers, workspaceMoveRequests } from "@/db/schema";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ workspaceId: string }>;
};

/** Returns the start of the current calendar month (UTC). */
function getStartOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

export async function GET(_request: Request, context: RouteContext) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  try {
    await ensureDatabaseReady();

    if (!db) {
      return apiError("DATABASE_URL is not configured.", 503);
    }

    const user = await syncCurrentUserToDatabase(userId);
    const { workspaceId } = await context.params;

    // Verify the user is an active member of this workspace
    const [membership] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, user.id),
          eq(workspaceMembers.status, "active")
        )
      )
      .limit(1);

    if (!membership) {
      return apiError("You are not an active member of this workspace.", 403, {
        error: "forbidden",
      });
    }

    const isAdmin =
      membership.role === "admin" || membership.role === "owner";

    const monthStart = getStartOfCurrentMonth();

    // Run all queries in parallel
    const [
      totalMeetingsResult,
      meetingsThisMonthResult,
      totalActionItemsResult,
      pendingActionItemsResult,
      recentMeetings,
      actionItemsByAssigneeRows,
      members,
      pendingMoveRequestsResult,
    ] = await Promise.all([
      // 1. Total approved meetings
      db
        .select({ value: count() })
        .from(meetingSessions)
        .where(
          and(
            eq(meetingSessions.workspaceId, workspaceId),
            eq(meetingSessions.workspaceMoveStatus, "approved")
          )
        ),

      // 2. Approved meetings this calendar month
      db
        .select({ value: count() })
        .from(meetingSessions)
        .where(
          and(
            eq(meetingSessions.workspaceId, workspaceId),
            eq(meetingSessions.workspaceMoveStatus, "approved"),
            gte(meetingSessions.createdAt, monthStart)
          )
        ),

      // 3. Total action items
      db
        .select({ value: count() })
        .from(actionItems)
        .where(eq(actionItems.workspaceId, workspaceId)),

      // 4. Pending action items
      db
        .select({ value: count() })
        .from(actionItems)
        .where(
          and(
            eq(actionItems.workspaceId, workspaceId),
            eq(actionItems.status, "pending")
          )
        ),

      // 5. 5 most recent approved meetings (desc by workspaceMovedAt)
      db
        .select({
          id: meetingSessions.id,
          title: meetingSessions.title,
          userId: meetingSessions.userId,
          status: meetingSessions.status,
          workspaceMoveStatus: meetingSessions.workspaceMoveStatus,
          workspaceMovedAt: meetingSessions.workspaceMovedAt,
          createdAt: meetingSessions.createdAt,
          scheduledStartTime: meetingSessions.scheduledStartTime,
        })
        .from(meetingSessions)
        .where(
          and(
            eq(meetingSessions.workspaceId, workspaceId),
            eq(meetingSessions.workspaceMoveStatus, "approved")
          )
        )
        .orderBy(desc(meetingSessions.workspaceMovedAt))
        .limit(5),

      // 6. Action items grouped by assignee (owner)
      db
        .select({
          owner: actionItems.owner,
          count: count(),
        })
        .from(actionItems)
        .where(eq(actionItems.workspaceId, workspaceId))
        .groupBy(actionItems.owner),

      // 7. Active workspace members
      db
        .select({
          id: workspaceMembers.id,
          userId: workspaceMembers.userId,
          role: workspaceMembers.role,
          status: workspaceMembers.status,
          createdAt: workspaceMembers.createdAt,
        })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.status, "active")
          )
        ),

      // 8. Pending move requests count (only fetched; filtered below for non-admins)
      db
        .select({ value: count() })
        .from(workspaceMoveRequests)
        .where(
          and(
            eq(workspaceMoveRequests.workspaceId, workspaceId),
            eq(workspaceMoveRequests.status, "pending")
          )
        ),
    ]);

    const response: Record<string, unknown> = {
      success: true,
      totalMeetings: totalMeetingsResult[0]?.value ?? 0,
      meetingsThisMonth: meetingsThisMonthResult[0]?.value ?? 0,
      totalActionItems: totalActionItemsResult[0]?.value ?? 0,
      pendingActionItems: pendingActionItemsResult[0]?.value ?? 0,
      recentMeetings,
      actionItemsByAssignee: actionItemsByAssigneeRows,
      members,
    };

    // Only expose pending move requests count to admins/owners
    if (isAdmin) {
      response.pendingMoveRequestsCount = pendingMoveRequestsResult[0]?.value ?? 0;
    }

    return apiSuccess(response);
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
