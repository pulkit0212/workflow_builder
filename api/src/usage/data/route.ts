import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { actionItems, aiRuns, meetingSessions, subscriptions, uploadedFiles, usageLogs } from "@/db/schema";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";

export const runtime = "nodejs";

function getDbOrThrow() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return db;
}

export async function DELETE() {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const database = getDbOrThrow();

    await database.delete(uploadedFiles).where(eq(uploadedFiles.userId, user.id));
    await database.delete(actionItems).where(eq(actionItems.userId, user.id));
    await database.delete(meetingSessions).where(eq(meetingSessions.userId, user.id));
    await database.delete(aiRuns).where(eq(aiRuns.userId, user.id));
    await database.delete(usageLogs).where(eq(usageLogs.userId, user.id));
    await database
      .update(subscriptions)
      .set({
        meetingsUsedThisMonth: 0,
        lastResetDate: new Date()
      })
      .where(eq(subscriptions.userId, user.clerkUserId));

    return apiSuccess({
      success: true
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return apiError(
        "Your database tables are not set up yet. Run your database migrations, then try again.",
        503
      );
    }

    return apiError(error instanceof Error ? error.message : "Failed to delete meeting data.", 500);
  }
}
