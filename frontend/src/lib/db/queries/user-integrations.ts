import { and, eq } from "drizzle-orm";
import { userIntegrations } from "@/db/schema";
import { db } from "@/lib/db/client";

function getDbOrThrow() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return db;
}

export async function getUserIntegration(userId: string, provider: string) {
  const database = getDbOrThrow();

  const [integration] = await database
    .select()
    .from(userIntegrations)
    .where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.provider, provider)))
    .limit(1);

  return integration ?? null;
}
