import { ToolExecutionError } from "@/lib/ai/tool-execution-error";
import {
  convertAudioForGemini,
  shouldConvertAudioForGemini
} from "@/lib/ai/transcription/audio-conversion";

const supportedGeminiAudioMimeTypes = new Set([
  "audio/wav",
  "audio/mp3",
  "audio/mpeg",
  "audio/aiff",
  "audio/aac",
  "audio/ogg",
  "audio/flac"
]);

const defaultGeminiTranscriptionModel = process.env.GEMINI_TRANSCRIPTION_MODEL || "gemini-2.5-flash";
const maxInlineAudioBytes = 20 * 1024 * 1024;

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  usageMetadata?: {
    totalTokenCount?: number;
  };
  promptFeedback?: {
    blockReason?: string;
  };
  error?: {
    message?: string;
    code?: number;
    status?: string;
  };
};

function getGeminiApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new ToolExecutionError("Gemini API key is not configured.", 503, {
      provider: "gemini",
      code: "missing_api_key"
    });
  }

  return apiKey;
}

function normalizeGeminiMimeType(mimeType: string) {
  if (mimeType === "audio/mpeg") {
    return "audio/mp3";
  }

  return mimeType;
}

function assertSupportedMimeType(mimeType: string) {
  const normalizedMimeType = normalizeGeminiMimeType(mimeType);

  if (!supportedGeminiAudioMimeTypes.has(normalizedMimeType)) {
    throw new ToolExecutionError("Unsupported audio format for Gemini transcription.", 400, {
      provider: "gemini",
      code: "unsupported_audio_format"
    });
  }

  return normalizedMimeType;
}

function extractGeminiTranscript(payload: GeminiGenerateContentResponse) {
  const transcript = payload.candidates?.flatMap((candidate) => candidate.content?.parts ?? []).map((part) => part.text ?? "").join("").trim();

  if (!transcript) {
    throw new ToolExecutionError("Unable to transcribe this recording.", 502, {
      provider: "gemini"
    });
  }

  return transcript;
}

export async function transcribeAudioWithGemini(params: {
  provider: "gemini";
  fileName: string;
  mimeType: string;
  size: number;
  fileBuffer?: ArrayBuffer;
}) {
  if (!params.fileBuffer) {
    throw new ToolExecutionError("An audio recording is required.", 400);
  }

  const apiKey = getGeminiApiKey();
  let workingFileBuffer = params.fileBuffer;
  let workingMimeType = params.mimeType;
  let conversionMetadata: Record<string, unknown> | undefined;

  if (shouldConvertAudioForGemini({
    mimeType: params.mimeType,
    fileName: params.fileName
  })) {
    const convertedAudio = await convertAudioForGemini({
      fileBuffer: params.fileBuffer,
      mimeType: params.mimeType,
      fileName: params.fileName
    });

    workingFileBuffer = convertedAudio.fileBuffer;
    workingMimeType = convertedAudio.mimeType;
    conversionMetadata = convertedAudio.metadata;
  }

  const mimeType = assertSupportedMimeType(workingMimeType);

  if (params.size > maxInlineAudioBytes) {
    throw new ToolExecutionError("This recording is too large for inline Gemini transcription.", 400, {
      provider: "gemini",
      code: "audio_too_large"
    });
  }

  const workingSize = workingFileBuffer.byteLength;

  if (workingSize > maxInlineAudioBytes) {
    throw new ToolExecutionError("This recording is too large for inline Gemini transcription.", 400, {
      provider: "gemini",
      code: "audio_too_large"
    });
  }

  const base64Audio = Buffer.from(workingFileBuffer).toString("base64");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${defaultGeminiTranscriptionModel}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: [
                  "Transcribe this meeting audio accurately.",
                  "Preserve speaker turns if possible.",
                  "Preserve names if they are clearly audible.",
                  "Do not summarize the audio.",
                  "Do not omit commitments, owners, or deadlines if they are present.",
                  "Return plain transcript text only."
                ].join(" ")
              },
              {
                inlineData: {
                  mimeType,
                  data: base64Audio
                }
              }
            ]
          }
        ]
      })
    }
  );

  let payload: GeminiGenerateContentResponse;

  try {
    payload = (await response.json()) as GeminiGenerateContentResponse;
  } catch {
    throw new ToolExecutionError("Gemini transcription failed.", 502, {
      provider: "gemini"
    });
  }

  if (!response.ok || payload.error || payload.promptFeedback?.blockReason) {
    const statusCode = response.status || payload.error?.code || 502;
    throw new ToolExecutionError(
      statusCode === 429 ? "Gemini transcription rate limit exceeded." : "Gemini transcription failed.",
      statusCode,
      {
        provider: "gemini",
        code: payload.error?.status || null
      }
    );
  }

  return {
    provider: "gemini" as const,
    transcript: extractGeminiTranscript(payload),
    metadata: {
      mimeType,
      model: defaultGeminiTranscriptionModel,
      totalTokenCount: payload.usageMetadata?.totalTokenCount ?? 0,
      ...(conversionMetadata ?? {})
    }
  };
}
