import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ToolExecutionError } from "@/lib/ai/tool-execution-error";

const execFileAsync = promisify(execFile);

const webmMimeTypes = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "video/webm",
  "video/webm;codecs=opus"
]);

function getExtensionFromMimeType(mimeType: string) {
  if (mimeType.includes("ogg")) {
    return "ogg";
  }

  if (mimeType.includes("wav")) {
    return "wav";
  }

  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) {
    return "mp3";
  }

  if (mimeType.includes("aac")) {
    return "aac";
  }

  if (mimeType.includes("aiff")) {
    return "aiff";
  }

  if (mimeType.includes("flac")) {
    return "flac";
  }

  if (mimeType.includes("webm")) {
    return "webm";
  }

  return "bin";
}

export function shouldConvertAudioForGemini(params: { mimeType: string; fileName: string }) {
  const normalizedMimeType = params.mimeType.trim().toLowerCase();
  const normalizedFileName = params.fileName.trim().toLowerCase();

  return webmMimeTypes.has(normalizedMimeType) || normalizedFileName.endsWith(".webm");
}

export async function convertAudioForGemini(params: {
  fileBuffer: ArrayBuffer;
  mimeType: string;
  fileName: string;
}) {
  const inputExtension = getExtensionFromMimeType(params.mimeType);
  const tempId = randomUUID();
  const inputPath = join(tmpdir(), `meeting-audio-${tempId}.${inputExtension}`);
  const outputPath = join(tmpdir(), `meeting-audio-${tempId}.wav`);

  try {
    await fs.writeFile(inputPath, Buffer.from(params.fileBuffer));

    try {
      await execFileAsync("ffmpeg", [
        "-y",
        "-i",
        inputPath,
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "wav",
        outputPath
      ]);
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";

      if (code === "ENOENT") {
        throw new ToolExecutionError(
          "Gemini transcription needs ffmpeg to convert browser-recorded WebM audio on this machine.",
          503,
          {
            provider: "gemini",
            code: "ffmpeg_missing"
          }
        );
      }

      throw new ToolExecutionError("Unable to convert this recording for Gemini transcription.", 500, {
        provider: "gemini",
        code: "audio_conversion_failed"
      });
    }

    const convertedBuffer = await fs.readFile(outputPath);

    return {
      fileBuffer: convertedBuffer.buffer.slice(
        convertedBuffer.byteOffset,
        convertedBuffer.byteOffset + convertedBuffer.byteLength
      ),
      mimeType: "audio/wav" as const,
      fileName: params.fileName.replace(/\.[^.]+$/, "") + ".wav",
      metadata: {
        convertedFromMimeType: params.mimeType,
        convertedToMimeType: "audio/wav",
        conversion: "ffmpeg"
      }
    };
  } finally {
    await Promise.allSettled([
      fs.unlink(inputPath),
      fs.unlink(outputPath)
    ]);
  }
}
