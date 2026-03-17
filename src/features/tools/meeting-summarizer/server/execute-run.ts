import { ZodError } from "zod";
import { normalizeMeetingSummarizerOutput } from "@/features/tools/meeting-summarizer/post-process";
import { meetingSummarizerOutputSchema } from "@/features/tools/meeting-summarizer/schema";
import { createAiRun } from "@/lib/db/mutations/ai-runs";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { ensureToolRecord } from "@/lib/db/queries/tools";
import { getMeetingSummaryProvider } from "@/lib/ai/providers";
import { MeetingProviderError } from "@/lib/ai/providers/types";
import { toolRegistry } from "@/lib/ai/tool-registry";
import { ToolExecutionError } from "@/lib/ai/tool-execution-error";
import { generateRunTitle } from "@/lib/run-title";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { isForeignKeyViolationError, isMissingDatabaseRelationError } from "@/lib/db/errors";
import type { MeetingSummarizerInput, MeetingSummarizerOutput } from "@/features/tools/meeting-summarizer/types";

const meetingRunLogPrefix = "[meeting-summarizer-run]";

async function persistFailedRun(params: {
  clerkUserId: string;
  title: string;
  inputJson: Record<string, unknown>;
  model: string;
  tokensUsed: number;
  message: string;
}) {
  try {
    const tool = toolRegistry["meeting-summarizer"];
    const user = await syncCurrentUserToDatabase(params.clerkUserId);
    const toolRecord = await ensureToolRecord(tool);

    await createAiRun({
      userId: user.id,
      toolId: toolRecord.id,
      title: params.title,
      status: "failed",
      inputJson: params.inputJson,
      outputJson: {
        error: params.message
      },
      model: params.model,
      tokensUsed: params.tokensUsed
    });
  } catch {
    // Preserve the original execution error if failure persistence also breaks.
  }
}

function normalizeTitle(transcript: string) {
  const generatedTitle = generateRunTitle(transcript, "Meeting Summarizer");
  return generatedTitle || "Meeting Summary";
}

export async function executeMeetingSummarizerRun(rawInput: unknown, clerkUserId: string) {
  const tool = toolRegistry["meeting-summarizer"];
  const parsedInput = tool.inputSchema?.safeParse(rawInput);

  if (!parsedInput?.success) {
    throw new ToolExecutionError("Invalid tool input.", 400, parsedInput?.error.flatten());
  }

  const input = parsedInput.data as MeetingSummarizerInput;
  const inputJson = input as Record<string, unknown>;
  const title = normalizeTitle(input.transcript);

  await ensureDatabaseReady();

  let output: MeetingSummarizerOutput | null = null;
  let model: string = input.provider;
  let tokensUsed = 0;

  try {
    const provider = getMeetingSummaryProvider(input.provider);
    const result = await provider.summarizeMeeting(input.transcript);
    const validatedOutput = meetingSummarizerOutputSchema.parse(
      normalizeMeetingSummarizerOutput(result.output)
    );

    output = validatedOutput;
    model = result.model;
    tokensUsed = result.tokensUsed;
  } catch (error) {
    let executionError: ToolExecutionError;

    if (error instanceof MeetingProviderError) {
      executionError = new ToolExecutionError(error.message, error.statusCode, error.details);
    } else if (error instanceof ZodError) {
      executionError = new ToolExecutionError("Model returned invalid structured output.", 502, error.flatten());
    } else {
      executionError = new ToolExecutionError(
        error instanceof Error ? error.message : "Unexpected tool execution error.",
        500
      );
    }

    console.error(`${meetingRunLogPrefix} generation failed`, {
      provider: input.provider,
      message: executionError.message,
      statusCode: executionError.statusCode
    });

    await persistFailedRun({
      clerkUserId,
      title,
      inputJson,
      model,
      tokensUsed,
      message: executionError.message
    });

    throw executionError;
  }

  if (!output) {
    throw new ToolExecutionError("Model returned invalid structured output.", 502);
  }

  try {
    const user = await syncCurrentUserToDatabase(clerkUserId);
    const toolRecord = await ensureToolRecord(tool);
    const run = await createAiRun({
      userId: user.id,
      toolId: toolRecord.id,
      title,
      status: "completed",
      inputJson,
      outputJson: output as unknown as Record<string, unknown>,
      model,
      tokensUsed
    });

    return {
      id: run.id,
      title: run.title || "Meeting Summary",
      status: run.status,
      tool: {
        slug: tool.slug,
        name: tool.name
      },
      inputJson: run.inputJson,
      outputJson: output,
      createdAt: run.createdAt.toISOString()
    };
  } catch (error) {
    if (!isMissingDatabaseRelationError(error)) {
      if (error instanceof Error && error.message === "Authenticated Clerk user not found.") {
        throw new ToolExecutionError("Authenticated Clerk user could not be resolved.", 401);
      }

      if (error instanceof Error && error.message === "Authenticated user does not have a primary email address.") {
        throw new ToolExecutionError("Your account is missing a primary email address.", 400);
      }

      if (error instanceof Error && error.message === "DATABASE_URL is not configured.") {
        throw new ToolExecutionError("DATABASE_URL is not configured.", 503);
      }

      if (isForeignKeyViolationError(error)) {
        throw new ToolExecutionError(
          "Unable to save the run because the required user or tool record is missing. Retry after syncing your database.",
          409
        );
      }

      throw new ToolExecutionError("Failed to save the AI run.", 500);
    }

    throw new ToolExecutionError(
      "Your database tables are not set up yet. Run your database migrations, then try again.",
      503
    );
  }
}
