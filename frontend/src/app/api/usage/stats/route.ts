import { auth } from "@clerk/nextjs/server";
import { and, eq, gte, isNotNull, ne, sql } from "drizzle-orm";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { actionItems, meetingSessions, uploadedFiles } from "@/db/schema";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";
import { resolveWorkspaceIdForRequest } from "@/lib/workspaces/server";

export const runtime = "nodejs";

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
    const database = getDbOrThrow();
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [meetingsThisMonthRow] = await database
      .select({ value: sql<number>`count(*)::int` })
      .from(meetingSessions)
      .where(
        workspaceId
          ? and(
              eq(meetingSessions.workspaceId, workspaceId),
              eq(meetingSessions.userId, user.id),
              gte(meetingSessions.createdAt, monthStart)
            )
          : and(
              eq(meetingSessions.userId, user.id),
              gte(meetingSessions.createdAt, monthStart)
            )
      );

    const [meetingsAllTimeRow] = await database
      .select({ value: sql<number>`count(*)::int` })
      .from(meetingSessions)
      .where(
        workspaceId
          ? and(eq(meetingSessions.workspaceId, workspaceId), eq(meetingSessions.userId, user.id))
          : eq(meetingSessions.userId, user.id)
      );

    const [transcriptsGeneratedRow] = await database
      .select({ value: sql<number>`count(*)::int` })
      .from(meetingSessions)
      .where(
        workspaceId
          ? and(
              eq(meetingSessions.userId, user.id),
              eq(meetingSessions.workspaceId, workspaceId),
              isNotNull(meetingSessions.transcript),
              ne(meetingSessions.transcript, "")
            )
          : and(
              eq(meetingSessions.userId, user.id),
              isNotNull(meetingSessions.transcript),
              ne(meetingSessions.transcript, "")
            )
      );

    const [actionItemsCreatedRow] = await database
      .select({ value: sql<number>`count(*)::int` })
      .from(actionItems)
      .where(
        workspaceId
          ? and(eq(actionItems.workspaceId, workspaceId), eq(actionItems.userId, user.id))
          : eq(actionItems.userId, user.id)
      );

    const [documentsAnalyzedRow] = await database
      .select({ value: sql<number>`count(*)::int` })
      .from(uploadedFiles)
      .where(eq(uploadedFiles.userId, user.id));

    return apiSuccess({
      success: true,
      meetingsThisMonth: meetingsThisMonthRow?.value ?? 0,
      meetingsAllTime: meetingsAllTimeRow?.value ?? 0,
      transcriptsGenerated: transcriptsGeneratedRow?.value ?? 0,
      actionItemsCreated: actionItemsCreatedRow?.value ?? 0,
      documentsAnalyzed: documentsAnalyzedRow?.value ?? 0,
      memberSince: user.createdAt.toISOString()
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return apiError(
        "Your database tables are not set up yet. Run your database migrations, then try again.",
        503
      );
    }

    return apiError(error instanceof Error ? error.message : "Failed to load usage stats.", 500);
  }
}
