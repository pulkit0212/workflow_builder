import { auth } from "@clerk/nextjs/server";
import { and, count, desc, eq, gte, ilike } from "drizzle-orm";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";
import { db } from "@/lib/db/client";
import { actionItems } from "@/db/schema";
import { canUseActionItems } from "@/lib/subscription";
import { getUserSubscription } from "@/lib/subscription.server";
import { resolveWorkspaceIdForRequest } from "@/lib/workspaces/server";

function getDbOrThrow() {
  if (!db) throw new Error("DATABASE_URL is not configured.");
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
    const subscription = await getUserSubscription(user.clerkUserId);

    if (!canUseActionItems(subscription.plan)) {
      return apiError("Action items require Pro or Elite plan.", 403, {
        error: "upgrade_required",
        currentPlan: subscription.plan
      });
    }

    const database = getDbOrThrow();
    const { searchParams } = new URL(request.url);
    const page = Math.max(Number.parseInt(searchParams.get("page") ?? "1", 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(searchParams.get("limit") ?? "10", 10) || 10, 1), 50);
    const tab = searchParams.get("tab") ?? "all";
    const firstName = (searchParams.get("firstName") ?? "").trim().toLowerCase();
    const source = searchParams.get("source") ?? "all";

    const conditions = workspaceId
      ? [eq(actionItems.workspaceId, workspaceId), eq(actionItems.userId, user.id)]
      : [eq(actionItems.userId, user.id)];

    // Tab filters
    if (tab === "high_priority") {
      conditions.push(eq(actionItems.priority, "High"));
    } else if (tab === "my_items" && firstName) {
      conditions.push(ilike(actionItems.owner, `%${firstName}%`));
    } else if (tab === "this_week") {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      conditions.push(gte(actionItems.createdAt, sevenDaysAgo));
    }

    // Source filter
    if (source === "meeting") {
      conditions.push(eq(actionItems.source, "meeting"));
    } else if (source === "task-generator") {
      conditions.push(eq(actionItems.source, "task-generator"));
    } else if (source === "document") {
      conditions.push(eq(actionItems.source, "document"));
    }

    const where = and(...conditions);

    const [rows, totalRows] = await Promise.all([
      database
        .select()
        .from(actionItems)
        .where(where)
        .orderBy(desc(actionItems.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      database
        .select({ count: count() })
        .from(actionItems)
        .where(where)
    ]);

    const total = totalRows[0]?.count ?? 0;

    return apiSuccess({
      success: true,
      items: rows.map((item) => ({
        id: item.id,
        task: item.task,
        owner: item.owner,
        dueDate: item.dueDate,
        priority: item.priority,
        completed: item.completed,
        status: item.status,
        source: item.source,
        meetingId: item.meetingId ?? null,
        meetingTitle: item.meetingTitle ?? null,
        createdAt: item.createdAt.toISOString()
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(Math.ceil(total / limit), 1)
      }
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return apiError(
        "Your database tables are not set up yet. Run your database migrations, then try again.",
        503
      );
    }
    return apiError(error instanceof Error ? error.message : "Failed to load action items.", 500);
  }
}
