import { and, eq } from "drizzle-orm";
import { integrations } from "@/db/schema";
import { db } from "@/lib/db/client";

function getDbOrThrow() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return db;
}

type UpsertIntegrationInput = {
  userId: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
};

export async function upsertIntegration(values: UpsertIntegrationInput) {
  const database = getDbOrThrow();
  const now = new Date();
  const [existing] = await database
    .select()
    .from(integrations)
    .where(and(eq(integrations.userId, values.userId), eq(integrations.type, values.type)))
    .limit(1);

  const [integration] = existing
    ? await database
        .update(integrations)
        .set({
          enabled: values.enabled,
          config: values.config,
          updatedAt: now
        })
        .where(eq(integrations.id, existing.id))
        .returning()
    : await database
        .insert(integrations)
        .values({
          userId: values.userId,
          type: values.type,
          enabled: values.enabled,
          config: values.config,
          updatedAt: now
        })
        .returning();

  if (!integration) {
    throw new Error("Failed to save integration.");
  }

  return integration;
}
