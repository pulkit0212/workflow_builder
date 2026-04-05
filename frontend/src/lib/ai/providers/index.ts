import type { MeetingAiProvider } from "@/features/tools/meeting-summarizer/types";
import { geminiMeetingSummaryProvider } from "@/lib/ai/providers/gemini";
import { openAiMeetingSummaryProvider } from "@/lib/ai/providers/openai";
import type { MeetingSummaryProvider, MeetingSummaryProviderResult } from "@/lib/ai/providers/types";
import { MeetingProviderError } from "@/lib/ai/providers/types";

const meetingSummaryProviders: Record<MeetingAiProvider, MeetingSummaryProvider> = {
  openai: openAiMeetingSummaryProvider,
  gemini: geminiMeetingSummaryProvider
};

/**
 * Returns a provider that:
 * 1. Uses AI_PROVIDER env var (or "gemini" default) as primary
 * 2. Falls back to the other provider if primary fails and the fallback key is set
 * The `requestedProvider` param is ignored — provider is always controlled by env.
 */
export function getMeetingSummaryProvider(_requestedProvider?: MeetingAiProvider): MeetingSummaryProvider {
  return {
    async summarizeMeeting(transcript: string): Promise<MeetingSummaryProviderResult> {
      const envProvider = (process.env.AI_PROVIDER ?? "gemini") as MeetingAiProvider;
      const primary = meetingSummaryProviders[envProvider] ?? geminiMeetingSummaryProvider;

      try {
        return await primary.summarizeMeeting(transcript);
      } catch (primaryError) {
        console.error("[AI PRIMARY FAILED]", envProvider, primaryError instanceof Error ? primaryError.message : primaryError);

        // Attempt fallback to the other provider if its key is configured
        const fallbackProvider: MeetingAiProvider = envProvider === "openai" ? "gemini" : "openai";
        const fallbackKeyPresent =
          fallbackProvider === "gemini"
            ? Boolean(process.env.GEMINI_API_KEY)
            : Boolean(process.env.OPENAI_API_KEY);

        if (fallbackKeyPresent) {
          const fallback = meetingSummaryProviders[fallbackProvider];
          try {
            console.warn("[AI FALLBACK] Trying", fallbackProvider);
            return await fallback.summarizeMeeting(transcript);
          } catch (fallbackError) {
            console.error("[AI FALLBACK FAILED]", fallbackProvider, fallbackError instanceof Error ? fallbackError.message : fallbackError);
            throw fallbackError;
          }
        }

        throw primaryError;
      }
    }
  };
}
