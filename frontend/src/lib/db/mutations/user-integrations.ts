import { and, eq } from "drizzle-orm";
import { userIntegrations } from "@/db/schema";
import { db } from "@/lib/db/client";

function getDbOrThrow() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return db;
}

type UpsertUserIntegrationInput = {
  userId: string;
  provider: string;
  email?: string | null;
  scopes?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiry?: Date | null;
};

export async function upsertUserIntegration(values: UpsertUserIntegrationInput) {
  const database = getDbOrThrow();
  const now = new Date();
  const [existingIntegration] = await database
    .select()
    .from(userIntegrations)
    .where(and(eq(userIntegrations.userId, values.userId), eq(userIntegrations.provider, values.provider)))
    .limit(1);

  const [integration] = existingIntegration
    ? await database
        .update(userIntegrations)
        .set({
          email: values.email ?? null,
          scopes: values.scopes ?? null,
          accessToken: values.accessToken ?? null,
          refreshToken: values.refreshToken ?? null,
          expiry: values.expiry ?? null,
          updatedAt: now
        })
        .where(eq(userIntegrations.id, existingIntegration.id))
        .returning()
    : await database
        .insert(userIntegrations)
        .values({
          userId: values.userId,
          provider: values.provider,
          email: values.email ?? null,
          scopes: values.scopes ?? null,
          accessToken: values.accessToken ?? null,
          refreshToken: values.refreshToken ?? null,
          expiry: values.expiry ?? null,
          updatedAt: now
        })
        .returning();

  if (!integration) {
    throw new Error("Failed to persist integration.");
  }

  return integration;
}

export async function deleteUserIntegration(userId: string, provider: string) {
  const database = getDbOrThrow();

  const [integration] = await database
    .delete(userIntegrations)
    .where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.provider, provider)))
    .returning();

  return integration ?? null;
}
