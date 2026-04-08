import { auth } from "@clerk/nextjs/server";
import { and, desc, eq, ilike } from "drizzle-orm";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";
import { db } from "@/lib/db/client";
import { meetingSessions } from "@/db/schema/meeting-sessions";
import { workspaceMembers } from "@/db/schema";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ workspaceId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
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
      return apiError("You are not an active member of this workspace.", 403, { error: "forbidden" });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const offset = (page - 1) * limit;

    // Build where conditions — only approved meetings for this workspace
    const conditions = [
      eq(meetingSessions.workspaceId, workspaceId),
      eq(meetingSessions.workspaceMoveStatus, "approved"),
    ];

    if (search) {
      conditions.push(ilike(meetingSessions.title, `%${search}%`));
    }

    const meetings = await db
      .select({
        id: meetingSessions.id,
        title: meetingSessions.title,
        userId: meetingSessions.userId,
        status: meetingSessions.status,
        workspaceMoveStatus: meetingSessions.workspaceMoveStatus,
        createdAt: meetingSessions.createdAt,
        scheduledStartTime: meetingSessions.scheduledStartTime,
        summary: meetingSessions.summary,
        participants: meetingSessions.participants,
      })
      .from(meetingSessions)
      .where(and(...conditions))
      .orderBy(desc(meetingSessions.createdAt))
      .limit(limit)
      .offset(offset);

    // Truncate summary to 200 chars if present
    const result = meetings.map((m) => ({
      ...m,
      summary: m.summary && m.summary.length > 200 ? m.summary.slice(0, 200) : m.summary,
    }));

    return apiSuccess({ success: true, meetings: result, page, limit });
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return apiError(
        "Your database tables are not set up yet. Run your database migrations, then try again.",
        503
      );
    }
    return apiError(
      error instanceof Error ? error.message : "Failed to load workspace meetings.",
      500
    );
  }
}
