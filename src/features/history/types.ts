import type { MeetingAiProvider, MeetingSummarizerOutput } from "@/features/tools/meeting-summarizer/types";

export type AiRunRecord = {
  id: string;
  title: string | null;
  status: string;
  inputJson: Record<string, unknown> | null;
  outputJson: Record<string, unknown> | null;
  model?: string | null;
  tokensUsed?: number;
  createdAt: string;
  updatedAt?: string;
  tool: {
    slug: string;
    name: string;
    description?: string;
  };
};

export type AiRunDetailResponse = {
  success: true;
  run: AiRunRecord;
};

export type AiRunListResponse = {
  success: true;
  runs: AiRunRecord[];
};

export type AiRunErrorResponse = {
  success: false;
  message: string;
  details?: unknown;
};

export type MeetingHistoryRun = Omit<AiRunRecord, "outputJson"> & {
  outputJson: MeetingSummarizerOutput;
};

export function getProviderFromInput(inputJson: Record<string, unknown> | null | undefined): MeetingAiProvider | null {
  const provider = inputJson?.provider;
  return provider === "openai" || provider === "gemini" ? provider : null;
}
