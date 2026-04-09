import { auth, clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import {
  actionItems,
  meetingSessions,
  userPreferences,
  userIntegrations,
  subscriptions,
  users
} from "@/db/schema";

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

    // Delete in correct order to maintain referential integrity
    // Requirements 5.2, 5.3, 5.6
    await database.delete(actionItems).where(eq(actionItems.userId, user.id));
    await database.delete(meetingSessions).where(eq(meetingSessions.userId, user.id));
    await database.delete(userPreferences).where(eq(userPreferences.userId, user.id));
    await database.delete(userIntegrations).where(eq(userIntegrations.userId, user.id));
    await database.delete(subscriptions).where(eq(subscriptions.userId, user.clerkUserId));
    await database.delete(users).where(eq(users.id, user.id));

    // Delete user from Clerk after database cleanup
    // Requirement 5.3
    const clerk = await clerkClient();
    await clerk.users.deleteUser(userId);

    return apiSuccess({ success: true });
  } catch (error) {
    console.error("Failed to delete account:", error);
    return apiError(
      error instanceof Error ? error.message : "Failed to delete account.",
      500
    );
  }
}
