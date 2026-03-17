import { transcribeAudioWithGemini } from "@/lib/ai/transcription/gemini";

export type TranscriptionProvider = "gemini";

export type TranscriptionResult = {
  provider: TranscriptionProvider;
  transcript: string;
  metadata?: Record<string, unknown>;
};

export async function transcribeAudio(params: {
  provider: TranscriptionProvider;
  fileName: string;
  mimeType: string;
  size: number;
  fileBuffer?: ArrayBuffer;
}) {
  switch (params.provider) {
    case "gemini":
      return transcribeAudioWithGemini({
        ...params,
        provider: "gemini"
      });
    default:
      throw new Error("Selected transcription provider is unavailable.");
  }
}
