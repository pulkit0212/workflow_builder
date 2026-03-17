import type {
  MeetingAiProvider,
  MeetingSummarizerInput,
  MeetingSummarizerOutput,
  MeetingTranscriptionProvider
} from "@/features/tools/meeting-summarizer/types";

export type ToolRunResponse<TOutput> = {
  success: true;
  run: {
    id: string;
    title: string | null;
    status: string;
    tool: {
      slug: string;
      name: string;
    };
    inputJson: Record<string, unknown> | null;
    outputJson: TOutput;
    createdAt: string;
  };
};

export type ToolErrorResponse = {
  success: false;
  message: string;
  details?: unknown;
};

export type MeetingSummarizerClientError = Error & {
  details?: unknown;
  isQuotaError?: boolean;
  provider?: MeetingAiProvider;
};

export type MeetingTranscriptionResponse = {
  success: true;
  transcript: string;
  provider: MeetingTranscriptionProvider;
  transcriptionProvider: MeetingTranscriptionProvider;
  metadata?: Record<string, unknown> | null;
};

type ProviderErrorDetails = {
  provider?: MeetingAiProvider;
  status?: number;
  type?: string | null;
  code?: string | null;
};

function isQuotaError(details: unknown): details is ProviderErrorDetails {
  if (!details || typeof details !== "object") {
    return false;
  }

  const quotaDetails = details as ProviderErrorDetails;
  return quotaDetails.status === 429 && (quotaDetails.code === "insufficient_quota" || quotaDetails.code === "rate_limit_exceeded");
}

function getProvider(details: unknown): MeetingAiProvider | undefined {
  if (!details || typeof details !== "object" || !("provider" in details)) {
    return undefined;
  }

  const provider = (details as { provider?: unknown }).provider;
  return provider === "openai" || provider === "gemini" ? provider : undefined;
}

function getErrorMessage(payload: ToolErrorResponse) {
  if (
    payload.details &&
    typeof payload.details === "object" &&
    "fieldErrors" in payload.details &&
    payload.details.fieldErrors &&
    typeof payload.details.fieldErrors === "object"
  ) {
    const fieldErrors = payload.details.fieldErrors as Record<string, string[] | undefined>;
    const transcriptError = fieldErrors.transcript?.[0];
    const providerError = fieldErrors.provider?.[0];

    if (transcriptError) {
      return transcriptError;
    }

    if (providerError) {
      return providerError;
    }
  }

  return payload.message;
}

export async function runMeetingSummarizer(input: MeetingSummarizerInput) {
  const response = await fetch("/api/tools/meeting-summarizer/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  const payload = (await response.json()) as ToolRunResponse<MeetingSummarizerOutput> | ToolErrorResponse;

  if (!response.ok) {
    const error = new Error("message" in payload ? getErrorMessage(payload) : "Failed to generate summary.") as MeetingSummarizerClientError;
    error.details = "details" in payload ? payload.details : undefined;
    error.isQuotaError = "details" in payload ? isQuotaError(payload.details) : false;
    error.provider = "details" in payload ? getProvider(payload.details) : undefined;
    throw error;
  }

  if (!payload.success) {
    const error = new Error(getErrorMessage(payload)) as MeetingSummarizerClientError;
    error.details = payload.details;
    error.isQuotaError = isQuotaError(payload.details);
    error.provider = getProvider(payload.details);
    throw error;
  }

  return payload;
}

export async function transcribeMeetingRecording(file: File, provider: MeetingTranscriptionProvider) {
  const formData = new FormData();
  formData.append("audio", file);
  formData.append("provider", provider);

  const response = await fetch("/api/tools/meeting-summarizer/transcribe", {
    method: "POST",
    body: formData
  });

  const payload = (await response.json()) as MeetingTranscriptionResponse | ToolErrorResponse;

  if (!response.ok || !payload.success) {
    throw new Error("message" in payload ? payload.message : "Failed to generate transcript.");
  }

  return payload;
}
