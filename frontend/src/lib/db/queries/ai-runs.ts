import { and, desc, eq } from "drizzle-orm";
import { aiRuns, tools } from "@/db/schema";
import { db } from "@/lib/db/client";

function getDbOrThrow() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return db;
}

export async function listRunsByUser(userId: string, toolSlug?: string) {
  const database = getDbOrThrow();
  const condition = toolSlug
    ? and(eq(aiRuns.userId, userId), eq(tools.slug, toolSlug))
    : eq(aiRuns.userId, userId);

  return database
    .select({
      id: aiRuns.id,
      title: aiRuns.title,
      status: aiRuns.status,
      inputJson: aiRuns.inputJson,
      outputJson: aiRuns.outputJson,
      model: aiRuns.model,
      tokensUsed: aiRuns.tokensUsed,
      createdAt: aiRuns.createdAt,
      updatedAt: aiRuns.updatedAt,
      tool: {
        id: tools.id,
        slug: tools.slug,
        name: tools.name,
        description: tools.description
      }
    })
    .from(aiRuns)
    .innerJoin(tools, eq(aiRuns.toolId, tools.id))
    .where(condition)
    .orderBy(desc(aiRuns.createdAt));
}

export async function getRunByIdForUser(runId: string, userId: string) {
  const database = getDbOrThrow();

  const [run] = await database
    .select({
      id: aiRuns.id,
      title: aiRuns.title,
      status: aiRuns.status,
      inputJson: aiRuns.inputJson,
      outputJson: aiRuns.outputJson,
      model: aiRuns.model,
      tokensUsed: aiRuns.tokensUsed,
      createdAt: aiRuns.createdAt,
      updatedAt: aiRuns.updatedAt,
      tool: {
        id: tools.id,
        slug: tools.slug,
        name: tools.name,
        description: tools.description
      }
    })
    .from(aiRuns)
    .innerJoin(tools, eq(aiRuns.toolId, tools.id))
    .where(and(eq(aiRuns.id, runId), eq(aiRuns.userId, userId)))
    .limit(1);

  return run ?? null;
}
