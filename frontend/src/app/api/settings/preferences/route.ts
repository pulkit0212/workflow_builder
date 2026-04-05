import { auth } from "@clerk/nextjs/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { userPreferences } from "@/db/schema";

export const runtime = "nodejs";

const defaultEmailNotifications = {
  meetingSummary: true,
  actionItems: false,
  weeklyDigest: false,
  productUpdates: true
};

const preferencesSchema = z.object({
  emailNotifications: z
    .object({
      meetingSummary: z.boolean().optional(),
      actionItems: z.boolean().optional(),
      weeklyDigest: z.boolean().optional(),
      productUpdates: z.boolean().optional()
    })
    .optional(),
  defaultEmailTone: z
    .enum(["professional", "friendly", "formal", "concise"])
    .optional(),
  summaryLength: z.enum(["brief", "standard", "detailed"]).optional(),
  language: z.enum(["en", "hi"]).optional()
});

function getDbOrThrow() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return db;
}

/**
 * djb2-style hash into signed 64-bit range for pg_advisory_xact_lock (same idea as meetings URL lock).
 */
function userPreferencesLockKey(userId: string): bigint {
  let hash = BigInt(5381);
  const mask = BigInt("0xFFFFFFFFFFFFFFFF");
  const signedMax = BigInt("0x7FFFFFFFFFFFFFFF");
  const mod = BigInt("0x10000000000000000");
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << BigInt(5)) + hash + BigInt(userId.charCodeAt(i))) & mask;
  }
  if (hash > signedMax) {
    hash -= mod;
  }
  return hash;
}

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const database = getDbOrThrow();

    // Try to fetch existing preferences
    const [existingPrefs] = await database
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, user.id))
      .limit(1);

    // If preferences don't exist, create defaults
    if (!existingPrefs) {
      const [newPrefs] = await database
        .insert(userPreferences)
        .values({
          userId: user.id,
          emailNotifications: defaultEmailNotifications,
          defaultEmailTone: "professional",
          summaryLength: "standard",
          language: "en",
          botDisplayName: "Artiva Notetaker",
          audioSource: "default"
        })
        .returning();

      return apiSuccess({
        success: true,
        preferences: {
          emailNotifications: newPrefs.emailNotifications,
          defaultEmailTone: newPrefs.defaultEmailTone,
          summaryLength: newPrefs.summaryLength,
          language: newPrefs.language,
          botDisplayName: newPrefs.botDisplayName,
          audioSource: newPrefs.audioSource
        }
      });
    }

    return apiSuccess({
      success: true,
      preferences: {
        emailNotifications: existingPrefs.emailNotifications,
        defaultEmailTone: existingPrefs.defaultEmailTone,
        summaryLength: existingPrefs.summaryLength,
        language: existingPrefs.language,
        botDisplayName: existingPrefs.botDisplayName,
        audioSource: existingPrefs.audioSource
      }
    });
  } catch (error) {
    console.error("Failed to fetch preferences:", error);
    return apiError(
      error instanceof Error ? error.message : "Failed to fetch preferences.",
      500
    );
  }
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
    const validation = preferencesSchema.safeParse(body);

    if (!validation.success) {
      return apiError(
        `Invalid request data: ${validation.error.message}`,
        400
      );
    }

    const updates = validation.data;
    const lockKey = userPreferencesLockKey(user.id);

    return await database.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

      const [existingPrefs] = await tx
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, user.id))
        .limit(1);

      if (!existingPrefs) {
        const [newPrefs] = await tx
          .insert(userPreferences)
          .values({
            userId: user.id,
            emailNotifications: updates.emailNotifications
              ? { ...defaultEmailNotifications, ...updates.emailNotifications }
              : defaultEmailNotifications,
            defaultEmailTone: updates.defaultEmailTone ?? "professional",
            summaryLength: updates.summaryLength ?? "standard",
            language: updates.language ?? "en",
            botDisplayName: "Artiva Notetaker",
            audioSource: "default"
          })
          .returning();

        return apiSuccess({
          success: true,
          preferences: {
            emailNotifications: newPrefs.emailNotifications,
            defaultEmailTone: newPrefs.defaultEmailTone,
            summaryLength: newPrefs.summaryLength,
            language: newPrefs.language,
            botDisplayName: newPrefs.botDisplayName,
            audioSource: newPrefs.audioSource
          }
        });
      }

      const updateData: Record<string, unknown> = { updatedAt: new Date() };

      if (updates.emailNotifications) {
        updateData.emailNotifications = {
          ...(existingPrefs.emailNotifications as Record<string, boolean>),
          ...updates.emailNotifications
        };
      }

      if (updates.defaultEmailTone) {
        updateData.defaultEmailTone = updates.defaultEmailTone;
      }

      if (updates.summaryLength) {
        updateData.summaryLength = updates.summaryLength;
      }

      if (updates.language) {
        updateData.language = updates.language;
      }

      const [updatedPrefs] = await tx
        .update(userPreferences)
        .set(updateData)
        .where(eq(userPreferences.userId, user.id))
        .returning();

      return apiSuccess({
        success: true,
        preferences: {
          emailNotifications: updatedPrefs.emailNotifications,
          defaultEmailTone: updatedPrefs.defaultEmailTone,
          summaryLength: updatedPrefs.summaryLength,
          language: updatedPrefs.language,
          botDisplayName: updatedPrefs.botDisplayName,
          audioSource: updatedPrefs.audioSource
        }
      });
    });
  } catch (error) {
    console.error("Failed to save preferences:", error);
    return apiError(
      error instanceof Error ? error.message : "Failed to save preferences.",
      500
    );
  }
}
