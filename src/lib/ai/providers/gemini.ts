import { MeetingProviderError, type MeetingSummaryProvider, type MeetingSummaryProviderResult } from "@/lib/ai/providers/types";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { summarizeMeetingWithGemini } = require("@/lib/ai/providers/gemini-shared.js");

export const geminiMeetingSummaryProvider: MeetingSummaryProvider = {
  async summarizeMeeting(transcript: string): Promise<MeetingSummaryProviderResult> {
    try {
      return await summarizeMeetingWithGemini(transcript);
    } catch (error) {
      if (error instanceof MeetingProviderError) {
        throw error;
      }

      const provider = typeof error === "object" && error && "provider" in error ? (error as { provider?: "gemini" }).provider : "gemini";
      const statusCode =
        typeof error === "object" && error && "statusCode" in error ? (error as { statusCode?: number }).statusCode ?? 500 : 500;
      const details = typeof error === "object" && error && "details" in error ? (error as { details?: unknown }).details : { provider: "gemini", stage: "summarization" };
      const message = error instanceof Error ? error.message : "Gemini request failed.";

      throw new MeetingProviderError({
        provider: provider ?? "gemini",
        message,
        statusCode,
        details
      });
    }
  }
};
