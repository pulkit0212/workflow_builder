import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { userPreferences } from "@/db/schema";

export const runtime = "nodejs";

const botSettingsSchema = z.object({
  botDisplayName: z.string().min(1, "Bot display name cannot be empty"),
  audioSource: z.string().optional()
});

function getDbOrThrow() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return db;
}

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const database = getDbOrThrow();

    const body = await request.json();
    const validation = botSettingsSchema.safeParse(body);

    if (!validation.success) {
      return apiError(
        `Invalid request data: ${validation.error.message}`,
        400
      );
    }

    const { botDisplayName, audioSource } = validation.data;

    // Update bot settings in user_preferences
    await database
      .update(userPreferences)
      .set({
        botDisplayName,
        audioSource: audioSource ?? "default",
        updatedAt: new Date()
      })
      .where(eq(userPreferences.userId, user.id));

    return apiSuccess({ success: true });
  } catch (error) {
    console.error("Failed to save bot settings:", error);
    return apiError(
      error instanceof Error ? error.message : "Failed to save bot settings.",
      500
    );
  }
}
