import type { MeetingAiProvider } from "@/features/tools/meeting-summarizer/types";
import { geminiMeetingSummaryProvider } from "@/lib/ai/providers/gemini";
import { openAiMeetingSummaryProvider } from "@/lib/ai/providers/openai";
import type { MeetingSummaryProvider } from "@/lib/ai/providers/types";

const meetingSummaryProviders: Record<MeetingAiProvider, MeetingSummaryProvider> = {
  openai: openAiMeetingSummaryProvider,
  gemini: geminiMeetingSummaryProvider
};

export function getMeetingSummaryProvider(provider: MeetingAiProvider) {
  return meetingSummaryProviders[provider];
}
