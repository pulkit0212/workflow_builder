import type { MeetingSummarizerOutput } from "@/features/tools/meeting-summarizer/types";

export type MeetingSummaryProviderResult = {
  provider: "openai" | "gemini";
  model: string;
  tokensUsed: number;
  output: MeetingSummarizerOutput;
};

export interface MeetingSummaryProvider {
  summarizeMeeting(transcript: string): Promise<MeetingSummaryProviderResult>;
}

export class MeetingProviderError extends Error {
  provider: "openai" | "gemini";
  statusCode: number;
  details?: unknown;

  constructor(params: {
    provider: "openai" | "gemini";
    message: string;
    statusCode: number;
    details?: unknown;
  }) {
    super(params.message);
    this.provider = params.provider;
    this.statusCode = params.statusCode;
    this.details = params.details;
  }
}
