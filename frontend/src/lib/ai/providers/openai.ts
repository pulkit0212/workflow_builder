import OpenAI from "openai";
import { buildMeetingSummarizerPrompt } from "@/features/tools/meeting-summarizer/prompts/build-prompt";
import { meetingSummarizerOutputSchema } from "@/features/tools/meeting-summarizer/schema";
import { normalizeMeetingSummarizerOutput } from "@/features/tools/meeting-summarizer/post-process";
import { getOpenAIClient } from "@/lib/ai/openai";
import { parseJsonResponse } from "@/lib/ai/response-parser";
import { MeetingProviderError, type MeetingSummaryProvider, type MeetingSummaryProviderResult } from "@/lib/ai/providers/types";

const defaultOpenAIModel = "gpt-4.1-mini";

function getOutputText(response: OpenAI.Responses.Response) {
  const text = response.output_text?.trim();

  if (!text) {
    throw new MeetingProviderError({
      provider: "openai",
      message: "OpenAI returned an empty response.",
      statusCode: 502
    });
  }

  return text;
}

function getUsageTokens(response: OpenAI.Responses.Response) {
  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;

  return inputTokens + outputTokens;
}

function getOpenAIErrorDetails(error: InstanceType<typeof OpenAI.APIError>) {
  const providerError =
    error.error && typeof error.error === "object" && "error" in error.error
      ? (error.error as { error?: Record<string, unknown> }).error
      : error.error;

  const providerMessage =
    providerError &&
    typeof providerError === "object" &&
    "message" in providerError &&
    typeof providerError.message === "string"
      ? providerError.message
      : error.message;

  const providerType =
    providerError &&
    typeof providerError === "object" &&
    "type" in providerError &&
    typeof providerError.type === "string"
      ? providerError.type
      : error.type;

  const providerCode =
    providerError &&
    typeof providerError === "object" &&
    "code" in providerError &&
    typeof providerError.code === "string"
      ? providerError.code
      : error.code;

  return {
    status: error.status ?? 502,
    type: providerType ?? null,
    code: providerCode ?? null,
    providerMessage
  };
}

function isOpenAIQuotaError(details: {
  status: number;
  code: string | null;
}) {
  return details.status === 429 && details.code === "insufficient_quota";
}

export const openAiMeetingSummaryProvider: MeetingSummaryProvider = {
  async summarizeMeeting(transcript: string): Promise<MeetingSummaryProviderResult> {
    try {
      const response = await getOpenAIClient().responses.create({
        model: process.env.OPENAI_MODEL || defaultOpenAIModel,
        input: buildMeetingSummarizerPrompt({ provider: "openai", transcript })
      });
      const parsedOutput = parseJsonResponse(getOutputText(response), meetingSummarizerOutputSchema);
      const output = normalizeMeetingSummarizerOutput(
        {
          summary: parsedOutput.summary,
          key_points: parsedOutput.key_points,
          action_items: parsedOutput.action_items.map((item) => ({
            task: item.task,
            owner: item.owner ?? "",
            deadline: item.deadline ?? "",
            dueDate: item.dueDate ?? item.deadline ?? "",
            priority: item.priority ?? "Medium",
            completed: item.completed ?? false
          }))
        }
      );

      return {
        provider: "openai",
        model: response.model || process.env.OPENAI_MODEL || defaultOpenAIModel,
        tokensUsed: getUsageTokens(response),
        output
      };
    } catch (error) {
      if (error instanceof MeetingProviderError) {
        throw error;
      }

      if (error instanceof OpenAI.APIError) {
        const details = getOpenAIErrorDetails(error);
        throw new MeetingProviderError({
          provider: "openai",
          message: isOpenAIQuotaError(details)
            ? "OpenAI quota exceeded. Please check billing or add credits to your OpenAI project."
            : "OpenAI request failed.",
          statusCode: details.status,
          details: {
            provider: "openai",
            status: details.status,
            type: details.type,
            code: details.code,
            ...(isOpenAIQuotaError(details) ? {} : { providerMessage: details.providerMessage })
          }
        });
      }

      if (error instanceof Error && error.message === "OPENAI_API_KEY is not configured.") {
        throw new MeetingProviderError({
          provider: "openai",
          message: "OpenAI API key is not configured.",
          statusCode: 503,
          details: {
            provider: "openai",
            code: "missing_api_key"
          }
        });
      }

      const message = error instanceof Error ? error.message : "OpenAI request failed.";
      throw new MeetingProviderError({
        provider: "openai",
        message: /json/i.test(message) ? "OpenAI returned invalid structured output." : message,
        statusCode: /json/i.test(message) ? 502 : 500,
        details: {
          provider: "openai"
        }
      });
    }
  }
};
