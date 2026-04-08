import { auth } from "@clerk/nextjs/server";
import { and, eq, gte, isNotNull, ne, sql } from "drizzle-orm";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { actionItems, meetingSessions, uploadedFiles } from "@/db/schema";
import { getUserSubscription } from "@/lib/subscription.server";
import { getPlanLimits } from "@/lib/subscription";
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
    const subscription = await getUserSubscription(userId);

    // Calculate month start
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // Parallel queries for statistics
    const [
      meetingsThisMonthRow,
      meetingsAllTimeRow,
      transcriptsGeneratedRow,
      actionItemsCreatedRow,
      documentsAnalyzedRow
    ] = await Promise.all([
      database
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
        ),
      database
        .select({ value: sql<number>`count(*)::int` })
        .from(meetingSessions)
        .where(
          workspaceId
            ? and(eq(meetingSessions.workspaceId, workspaceId), eq(meetingSessions.userId, user.id))
            : eq(meetingSessions.userId, user.id)
        ),
      database
        .select({ value: sql<number>`count(*)::int` })
        .from(meetingSessions)
        .where(
          workspaceId
            ? and(
                eq(meetingSessions.workspaceId, workspaceId),
                eq(meetingSessions.userId, user.id),
                isNotNull(meetingSessions.transcript),
                ne(meetingSessions.transcript, "")
              )
            : and(
                eq(meetingSessions.userId, user.id),
                isNotNull(meetingSessions.transcript),
                ne(meetingSessions.transcript, "")
              )
        ),
      database
        .select({ value: sql<number>`count(*)::int` })
        .from(actionItems)
        .where(
          workspaceId
            ? and(eq(actionItems.workspaceId, workspaceId), eq(actionItems.userId, user.id))
            : eq(actionItems.userId, user.id)
        ),
      database
        .select({ value: sql<number>`count(*)::int` })
        .from(uploadedFiles)
        .where(eq(uploadedFiles.userId, user.id))
    ]);

    const limits = getPlanLimits(subscription.plan);

    return apiSuccess({
      success: true,
      meetingsThisMonth: meetingsThisMonthRow[0]?.value ?? 0,
      meetingsAllTime: meetingsAllTimeRow[0]?.value ?? 0,
      transcriptsGenerated: transcriptsGeneratedRow[0]?.value ?? 0,
      actionItemsCreated: actionItemsCreatedRow[0]?.value ?? 0,
      documentsAnalyzed: documentsAnalyzedRow[0]?.value ?? 0,
      memberSince: user.createdAt.toISOString(),
      limits
    });
  } catch (error) {
    console.error("Failed to fetch usage stats:", error);
    return apiError(
      error instanceof Error ? error.message : "Failed to fetch usage stats.",
      500
    );
  }
}
