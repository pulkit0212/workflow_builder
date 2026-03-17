import { executeMeetingSummarizerRun } from "@/features/tools/meeting-summarizer/server/execute-run";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { getRunByIdForUser, listRunsByUser } from "@/lib/db/queries/ai-runs";
import { toolRegistry, type ToolSlug } from "@/lib/ai/tool-registry";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { isMissingDatabaseRelationError, isMissingUsersTableError } from "@/lib/db/errors";
import { ToolExecutionError } from "@/lib/ai/tool-execution-error";

const toolRunLogPrefix = "[tool-run]";

export async function executeToolRun(toolSlug: string, rawInput: unknown, clerkUserId: string) {
  console.info(`${toolRunLogPrefix} starting tool execution`, {
    toolSlug,
    clerkUserId
  });

  if (!(toolSlug in toolRegistry)) {
    console.error(`${toolRunLogPrefix} tool lookup failed`, { toolSlug });
    throw new ToolExecutionError("Tool not found.", 404);
  }

  const tool = toolRegistry[toolSlug as ToolSlug];
  console.info(`${toolRunLogPrefix} tool resolved`, {
    toolSlug: tool.slug,
    implemented: tool.implemented
  });

  if (!tool.implemented || !tool.inputSchema || !tool.outputSchema || !tool.promptBuilder) {
    console.error(`${toolRunLogPrefix} tool is not implemented`, {
      toolSlug: tool.slug
    });
    throw new ToolExecutionError(`${tool.name} is not implemented yet.`, 501);
  }

  if (tool.slug === "meeting-summarizer") {
    return executeMeetingSummarizerRun(rawInput, clerkUserId);
  }

  throw new ToolExecutionError(`${tool.name} is not implemented yet.`, 501);
}

export async function getRunsForUser(clerkUserId: string, toolSlug?: string) {
  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(clerkUserId);
    return listRunsByUser(user.id, toolSlug);
  } catch (error) {
    if (isMissingUsersTableError(error) || isMissingDatabaseRelationError(error)) {
      return [];
    }

    throw error;
  }
}

export async function getRunDetailForUser(runId: string, clerkUserId: string) {
  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(clerkUserId);
    return getRunByIdForUser(runId, user.id);
  } catch (error) {
    if (isMissingUsersTableError(error) || isMissingDatabaseRelationError(error)) {
      return null;
    }

    throw error;
  }
}
