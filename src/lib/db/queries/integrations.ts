import { and, eq } from "drizzle-orm";
import { integrations } from "@/db/schema";
import { db } from "@/lib/db/client";

function getDbOrThrow() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return db;
}

export async function listIntegrationsByUser(userId: string) {
  const database = getDbOrThrow();

  return database.select().from(integrations).where(eq(integrations.userId, userId));
}

export async function listEnabledIntegrationsByUser(userId: string) {
  const database = getDbOrThrow();

  return database
    .select()
    .from(integrations)
    .where(and(eq(integrations.userId, userId), eq(integrations.enabled, true)));
}

export async function getIntegrationByUserAndType(userId: string, type: string) {
  const database = getDbOrThrow();

  const [integration] = await database
    .select()
    .from(integrations)
    .where(and(eq(integrations.userId, userId), eq(integrations.type, type)))
    .limit(1);

  return integration ?? null;
}
