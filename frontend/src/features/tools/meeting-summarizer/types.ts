import type { z } from "zod";
import {
  meetingAiProviderSchema,
  meetingInputTypeSchema,
  meetingActionItemSchema,
  meetingSummarizerInputSchema,
  meetingSummarizerOutputSchema,
  transcriptionProviderSchema
} from "@/features/tools/meeting-summarizer/schema";

export {
  meetingAiProviderSchema,
  transcriptionProviderSchema
} from "@/features/tools/meeting-summarizer/schema";

export type MeetingAiProvider = z.infer<typeof meetingAiProviderSchema>;
export type MeetingInputType = z.infer<typeof meetingInputTypeSchema>;
export type MeetingTranscriptionProvider = z.infer<typeof transcriptionProviderSchema>;
export type MeetingSummarizerInput = z.infer<typeof meetingSummarizerInputSchema>;
export type MeetingActionItem = z.infer<typeof meetingActionItemSchema>;
export type MeetingSummarizerOutput = z.infer<typeof meetingSummarizerOutputSchema>;
