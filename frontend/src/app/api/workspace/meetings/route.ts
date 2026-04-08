import { auth } from "@clerk/nextjs/server";
import { and, eq, ilike, or } from "drizzle-orm";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";
import { resolveWorkspaceIdForRequest } from "@/lib/workspaces/server";
import { db } from "@/lib/db/client";
import { meetingSessions } from "@/db/schema/meeting-sessions";
import { workspaceMembers } from "@/db/schema";

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

    // Determine requester's role in this workspace
    const [membership] = await database
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

    const role = membership?.role ?? "viewer";
    const isViewer = role === "viewer";

    // Parse query params
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const memberId = searchParams.get("memberId")?.trim() ?? "";
    const status = searchParams.get("status")?.trim() ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [eq(meetingSessions.workspaceId, workspaceId)];

    // Viewers cannot see private meetings they don't own
    if (isViewer) {
      conditions.push(
        or(
          eq(meetingSessions.visibility, "workspace"),
          eq(meetingSessions.visibility, "shared"),
          and(
            eq(meetingSessions.visibility, "private"),
            eq(meetingSessions.userId, user.id)
          )
        )!
      );
    }

    if (search) {
      conditions.push(
        or(
          ilike(meetingSessions.title, `%${search}%`),
          ilike(meetingSessions.summary, `%${search}%`)
        )!
      );
    }

    if (memberId) {
      conditions.push(eq(meetingSessions.userId, memberId));
    }

    if (status) {
      conditions.push(eq(meetingSessions.status, status));
    }

    const meetings = await database
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
      .where(and(...conditions))
      .limit(limit)
      .offset(offset);

    return apiSuccess({ success: true, meetings, page, limit });
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return apiError(
        "Your database tables are not set up yet. Run your database migrations, then try again.",
        503
      );
    }
    return apiError(error instanceof Error ? error.message : "Failed to load workspace meetings.", 500);
  }
}
