import {
  meetingAiProviderSchema,
  transcriptionProviderSchema,
  type MeetingAiProvider,
  type MeetingTranscriptionProvider
} from "@/features/tools/meeting-summarizer/types";

export const meetingAiProviderOptions: Array<{
  value: MeetingAiProvider;
  label: string;
  description: string;
  disabled?: boolean;
}> = [
  {
    value: "gemini",
    label: "Gemini",
    description: "Use Google Gemini for real-time meeting transcription and structured summaries."
  },
  {
    value: "openai",
    label: "OpenAI",
    description: "Coming soon - OpenAI support will be available in a future update.",
    disabled: true
  }
];

export function getMeetingProviderLabel(provider: MeetingAiProvider) {
  return meetingAiProviderOptions.find((option) => option.value === provider)?.label ?? "Gemini";
}

export function resolveDefaultMeetingProvider(value: unknown): MeetingAiProvider {
  const parsed = meetingAiProviderSchema.safeParse(value);
  return parsed.success ? parsed.data : "gemini";
}

export const meetingTranscriptionProviderOptions: Array<{
  value: MeetingTranscriptionProvider;
  label: string;
  description: string;
}> = [
  {
    value: "gemini",
    label: "Gemini",
    description: "Use Google Gemini for real-time meeting transcription and structured summaries."
  }
];

export function getMeetingTranscriptionProviderLabel(provider: MeetingTranscriptionProvider) {
  return meetingTranscriptionProviderOptions.find((option) => option.value === provider)?.label ?? "Gemini";
}

export function resolveDefaultTranscriptionProvider(value: unknown): MeetingTranscriptionProvider {
  const parsed = transcriptionProviderSchema.safeParse(value);
  return parsed.success ? parsed.data : "gemini";
}
