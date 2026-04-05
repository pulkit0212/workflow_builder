import { meetingFollowUpResponseSchema } from "@/features/meeting-followup/schema";
import { buildMeetingFollowUpPrompt } from "@/features/meeting-followup/server/prompt";
import type { MeetingActionItem } from "@/features/tools/meeting-summarizer/types";

const defaultGeminiModel = process.env.GEMINI_FOLLOWUP_MODEL || "gemini-2.5-flash";

function getGeminiApiKey() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  return process.env.GEMINI_API_KEY;
}

function extractGeminiText(payload: {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}) {
  const text = payload.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini returned an empty follow-up email.");
  }

  return text;
}

export async function generateMeetingFollowUpEmail(input: {
  title: string;
  summary: string;
  keyPoints: string[];
  actionItems: MeetingActionItem[];
}) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${defaultGeminiModel}:generateContent`,
    {
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
                text: buildMeetingFollowUpPrompt(input)
              }
            ]
          }
        ]
      })
    }
  );

  if (!response.ok) {
    throw new Error("Failed to generate the follow-up email.");
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
        }>;
      };
    }>;
  };

  return meetingFollowUpResponseSchema.parse({
    followUpEmail: extractGeminiText(payload)
  }).followUpEmail;
}
