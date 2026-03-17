import { aiRuns } from "@/db/schema";
import { db } from "@/lib/db/client";

const aiRunsLogPrefix = "[db-ai-runs]";

function getDbOrThrow() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return db;
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
};

export async function createAiRun(values: CreateAiRunInput) {
  const database = getDbOrThrow();
  console.info(`${aiRunsLogPrefix} inserting ai_run`, {
    userId: values.userId,
    toolId: values.toolId,
    status: values.status,
    title: values.title
  });

  const [run] = await database.insert(aiRuns).values(values).returning();

  if (!run) {
    console.error(`${aiRunsLogPrefix} insert returned no row`, {
      userId: values.userId,
      toolId: values.toolId
    });
    throw new Error("Failed to persist AI run.");
  }

  console.info(`${aiRunsLogPrefix} insert succeeded`, {
    runId: run.id,
    status: run.status
  });

  return run;
}
