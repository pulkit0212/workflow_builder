import { createHash } from "crypto";
import { and, eq } from "drizzle-orm";
import { aiRuns } from "@/db/schema";
import { db } from "@/lib/db/client";

const aiRunsLogPrefix = "[db-ai-runs]";

function getDbOrThrow() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return db;
}

/**
 * Stable SHA-256 hash of the run's identity: userId + toolId + sorted inputJson keys.
 * Used to detect duplicate submissions of the same input so we upsert instead of
 * inserting a new failed row on every retry.
 */
export function computeInputHash(
  userId: string,
  toolId: string,
  inputJson: Record<string, unknown>
): string {
  // Sort keys for stability regardless of insertion order
  const stable = JSON.stringify(inputJson, Object.keys(inputJson).sort());
  return createHash("sha256")
    .update(`${userId}:${toolId}:${stable}`)
    .digest("hex");
}

type CreateAiRunInput = {
  userId: string;
  toolId: string;
  title: string;
  status: string;
  inputJson: Record<string, unknown>;
  outputJson: Record<string, unknown> | null;
  model: string;
  tokensUsed: number;
  inputHash?: string;
};

/**
 * Insert a new run record.
 */
export async function createAiRun(values: CreateAiRunInput) {
  const database = getDbOrThrow();
  console.info(`${aiRunsLogPrefix} inserting ai_run`, {
    userId: values.userId,
    toolId: values.toolId,
    status: values.status,
    title: values.title,
  });

  const [run] = await database.insert(aiRuns).values(values).returning();

  if (!run) {
    throw new Error("Failed to persist AI run.");
  }

  console.info(`${aiRunsLogPrefix} insert succeeded`, { runId: run.id, status: run.status });
  return run;
}

/**
 * Upsert a run by inputHash:
 * - If a run with the same inputHash already exists (regardless of status), update it in-place.
 * - Otherwise insert a new row.
 *
 * This prevents duplicate rows when the user retries a failing generation.
 */
export async function upsertAiRun(values: CreateAiRunInput & { inputHash: string }) {
  const database = getDbOrThrow();

  // Look for an existing run with the same hash
  const [existing] = await database
    .select({ id: aiRuns.id, status: aiRuns.status })
    .from(aiRuns)
    .where(
      and(
        eq(aiRuns.userId, values.userId),
        eq(aiRuns.toolId, values.toolId),
        eq(aiRuns.inputHash, values.inputHash)
      )
    )
    .limit(1);

  if (existing) {
    console.info(`${aiRunsLogPrefix} updating existing run`, {
      runId: existing.id,
      prevStatus: existing.status,
      nextStatus: values.status,
    });

    const [updated] = await database
      .update(aiRuns)
      .set({
        status: values.status,
        outputJson: values.outputJson,
        model: values.model,
        tokensUsed: values.tokensUsed,
        title: values.title,
        updatedAt: new Date(),
      })
      .where(eq(aiRuns.id, existing.id))
      .returning();

    if (!updated) throw new Error("Failed to update AI run.");
    return updated;
  }

  // No existing run — insert fresh
  console.info(`${aiRunsLogPrefix} inserting new ai_run`, {
    userId: values.userId,
    toolId: values.toolId,
    status: values.status,
  });

  const [run] = await database.insert(aiRuns).values(values).returning();
  if (!run) throw new Error("Failed to persist AI run.");

  console.info(`${aiRunsLogPrefix} insert succeeded`, { runId: run.id });
  return run;
}
