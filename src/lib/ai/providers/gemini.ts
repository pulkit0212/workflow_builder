import { buildMeetingSummarizerPrompt } from "@/features/tools/meeting-summarizer/prompts/build-prompt";
import { meetingSummarizerOutputSchema } from "@/features/tools/meeting-summarizer/schema";
import { MeetingProviderError, type MeetingSummaryProvider, type MeetingSummaryProviderResult } from "@/lib/ai/providers/types";

const defaultGeminiModel = "gemini-2.5-flash";
const rawPreviewLimit = 300;

type GeminiErrorPayload = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

type GeminiResponsePayload = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    totalTokenCount?: number;
  };
};

const meetingSummarizerGeminiJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "key_points", "action_items"],
  propertyOrdering: ["summary", "key_points", "action_items"],
  properties: {
    summary: {
      type: "string",
      description: "A concise factual summary of the meeting in 2 to 4 sentences."
    },
    key_points: {
      type: "array",
      description: "Short standalone discussion points that capture the main topics covered.",
      items: {
        type: "string"
      }
    },
    action_items: {
      type: "array",
      description: "All clearly assigned tasks or commitments, preserving owners and deadlines exactly when present.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["task", "owner", "deadline"],
        propertyOrdering: ["task", "owner", "deadline"],
        properties: {
          task: {
            type: "string",
            description: "The concrete task or next step."
          },
          owner: {
            type: "string",
            description: "The exact owner if stated; otherwise an empty string."
          },
          deadline: {
            type: "string",
            description: "The exact deadline if stated; otherwise an empty string."
          }
        }
      }
    }
  }
} as const;

function getGeminiApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new MeetingProviderError({
      provider: "gemini",
      message: "Gemini API key is not configured.",
      statusCode: 503,
      details: {
        provider: "gemini",
        code: "missing_api_key"
      }
    });
  }

  return apiKey;
}

function buildGeminiMeetingSummarizerPrompt(transcript: string) {
  return [
    buildMeetingSummarizerPrompt({ provider: "gemini", transcript }),
    "",
    "Focus on extraction quality:",
    "- Keep the summary concise and factual.",
    "- Capture the main discussion points, not side chatter.",
    "- Include every clearly assigned action item.",
    "- Preserve owner names and deadlines exactly as written when present."
  ].join("\n");
}

function createRawPreview(value: string) {
  return value.trim().slice(0, rawPreviewLimit);
}

function getGeminiText(payload: GeminiResponsePayload) {
  const text = payload.candidates?.flatMap((candidate) => candidate.content?.parts ?? []).map((part) => part.text ?? "").join("").trim();

  if (!text) {
    throw new MeetingProviderError({
      provider: "gemini",
      message: "Gemini returned an empty response.",
      statusCode: 502
    });
  }

  return text;
}

function parseGeminiApiResponse(rawResponseText: string) {
  try {
    return JSON.parse(rawResponseText) as GeminiResponsePayload;
  } catch {
    throw new MeetingProviderError({
      provider: "gemini",
      message: "Gemini returned invalid JSON.",
      statusCode: 502,
      details: {
        provider: "gemini",
        stage: "summarization",
        rawPreview: createRawPreview(rawResponseText)
      }
    });
  }
}

function parseGeminiStructuredOutput(rawStructuredText: string) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawStructuredText);
  } catch {
    throw new MeetingProviderError({
      provider: "gemini",
      message: "Gemini returned invalid structured output.",
      statusCode: 502,
      details: {
        provider: "gemini",
        stage: "summarization",
        rawPreview: createRawPreview(rawStructuredText)
      }
    });
  }

  const result = meetingSummarizerOutputSchema.safeParse(parsed);

  if (!result.success) {
    throw new MeetingProviderError({
      provider: "gemini",
      message: "Gemini returned invalid structured output.",
      statusCode: 502,
      details: {
        provider: "gemini",
        stage: "summarization",
        rawPreview: createRawPreview(rawStructuredText)
      }
    });
  }

  return result.data;
}

export const geminiMeetingSummaryProvider: MeetingSummaryProvider = {
  async summarizeMeeting(transcript: string): Promise<MeetingSummaryProviderResult> {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${defaultGeminiModel}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": getGeminiApiKey()
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: buildGeminiMeetingSummarizerPrompt(transcript)
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema: meetingSummarizerGeminiJsonSchema
          }
        })
      });

      if (!response.ok) {
        let payload: GeminiErrorPayload | null = null;

        try {
          payload = (await response.json()) as GeminiErrorPayload;
        } catch {
          payload = null;
        }

        const providerMessage = payload?.error?.message || "Gemini request failed.";
        const statusCode = response.status || payload?.error?.code || 502;
        const isQuotaLike = statusCode === 429;

        throw new MeetingProviderError({
          provider: "gemini",
          message: isQuotaLike ? "Gemini quota or rate limit exceeded. Please retry later or check billing." : "Gemini request failed.",
          statusCode,
          details: {
            provider: "gemini",
            status: statusCode,
            code: isQuotaLike ? "rate_limit_exceeded" : payload?.error?.status || null,
            ...(isQuotaLike ? {} : { providerMessage })
          }
        });
      }

      const rawResponseText = await response.text();
      const payload = parseGeminiApiResponse(rawResponseText);
      const rawStructuredText = getGeminiText(payload);

      return {
        provider: "gemini",
        model: defaultGeminiModel,
        tokensUsed: payload.usageMetadata?.totalTokenCount ?? 0,
        output: parseGeminiStructuredOutput(rawStructuredText)
      };
    } catch (error) {
      if (error instanceof MeetingProviderError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : "Gemini request failed.";
      throw new MeetingProviderError({
        provider: "gemini",
        message: /json/i.test(message) ? "Gemini returned invalid structured output." : "Gemini request failed.",
        statusCode: /json/i.test(message) ? 502 : 500,
        details: {
          provider: "gemini",
          stage: "summarization"
        }
      });
    }
  }
};
