import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";
import { db } from "@/lib/db/client";
import { workspaceMembers, workspaceMoveRequests } from "@/db/schema";
import { meetingSessions } from "@/db/schema/meeting-sessions";
import { users } from "@/db/schema/users";

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
      return apiError("You are not an active member of this workspace.", 403, {
        error: "forbidden"
      });
    }

    // Parse query params — default to pending only; ?status=all returns all
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");
    const returnAll = statusFilter === "all";

    // Alias tables for the two user joins
    const requestedByUser = users;

    const baseConditions = [eq(workspaceMoveRequests.workspaceId, workspaceId)];
    if (!returnAll) {
      baseConditions.push(eq(workspaceMoveRequests.status, "pending"));
    }

    const rows = await db
      .select({
        id: workspaceMoveRequests.id,
        meetingId: workspaceMoveRequests.meetingId,
        workspaceId: workspaceMoveRequests.workspaceId,
        requestedBy: workspaceMoveRequests.requestedBy,
        status: workspaceMoveRequests.status,
        adminNote: workspaceMoveRequests.adminNote,
        reviewedBy: workspaceMoveRequests.reviewedBy,
        reviewedAt: workspaceMoveRequests.reviewedAt,
        createdAt: workspaceMoveRequests.createdAt,
        meetingTitle: meetingSessions.title,
        requestedByName: requestedByUser.fullName,
      })
      .from(workspaceMoveRequests)
      .leftJoin(meetingSessions, eq(workspaceMoveRequests.meetingId, meetingSessions.id))
      .leftJoin(requestedByUser, eq(workspaceMoveRequests.requestedBy, requestedByUser.id))
      .where(and(...baseConditions))
      .orderBy(workspaceMoveRequests.createdAt);

    return apiSuccess({ success: true, moveRequests: rows });
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return apiError(
        "Your database tables are not set up yet. Run your database migrations, then try again.",
        503
      );
    }
    return apiError(
      error instanceof Error ? error.message : "Failed to load move requests.",
      500
    );
  }
}
