const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { once } = require("node:events");

const AUDIO_DIR = path.join(process.cwd(), "tmp", "audio");
const MIN_AUDIO_BYTES = 32 * 1024;
const STARTUP_WAIT_MS = 2_500;
const STDERR_TAIL_LIMIT = 20;

function ensureAudioDir() {
  if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
  }
}

function startRecording(meetingId) {
  ensureAudioDir();
  const outputPath = path.join(AUDIO_DIR, `meeting-${meetingId}.wav`);
  const isMac = process.platform === "darwin";
  const isLinux = process.platform === "linux";

  let ffmpegArgs;

  if (isMac) {
    console.log("[Audio] Starting macOS capture using BlackHole 2ch");
    ffmpegArgs = [
      "-y",
      "-f",
      "avfoundation",
      "-i",
      ":BlackHole 2ch",
      "-acodec",
      "pcm_s16le",
      "-ar",
      "16000",
      "-ac",
      "1",
      outputPath,
    ];
  } else if (isLinux) {
    const audioSource = process.env.MEETING_AUDIO_SOURCE || "default";
    console.log("[Audio] ─────────────────────────────────");
    console.log("[Audio] Recording started");
    console.log("[Audio] Source:", audioSource);
    console.log("[Audio] Output:", outputPath);
    console.log("[Audio] Sample rate: 16000 Hz");
    console.log("[Audio] ─────────────────────────────────");
    console.log(`[Audio] Starting Linux PulseAudio capture using source: ${audioSource}`);
    ffmpegArgs = [
      "-y",
      "-f",
      "pulse",
      "-i",
      audioSource,
      "-acodec",
      "pcm_s16le",
      "-ar",
      "16000",
      "-ac",
      "1",
      outputPath,
    ];
  } else {
    return {
      success: false,
      error: "Unsupported OS for audio capture",
    };
  }

  try {
    const ffmpeg = spawn("ffmpeg", ffmpegArgs, {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let startupError = null;
    const stderrTail = [];

    ffmpeg.stderr.on("data", (chunk) => {
      const message = chunk.toString();
      stderrTail.push(message.trim());
      if (stderrTail.length > STDERR_TAIL_LIMIT) {
        stderrTail.shift();
      }

      if (
        /no such file|not found|invalid argument|unknown input format|cannot open audio device|input\/output error/i.test(
          message
        )
      ) {
        startupError = message.trim();
      }
    });

    ffmpeg.on("error", (error) => {
      startupError = error.message;
      console.error("[Audio] ffmpeg error:", error);
    });

    return new Promise((resolve) => {
      const startupTimeout = setTimeout(() => {
        if (startupError) {
          try {
            ffmpeg.kill("SIGINT");
          } catch {
            // ignore cleanup errors
          }

          resolve({
            success: false,
            error: `ffmpeg failed to start recording: ${startupError}`,
          });
          return;
        }

        console.log(`[Audio] Recording started: ${outputPath}`);
        resolve({
          success: true,
          ffmpeg,
          outputPath,
          audioSource: isLinux ? process.env.MEETING_AUDIO_SOURCE || "default" : "BlackHole 2ch",
          startupLog: stderrTail.join("\n"),
        });
      }, STARTUP_WAIT_MS);

      ffmpeg.once("exit", (code, signal) => {
        clearTimeout(startupTimeout);

        if (startupError) {
          resolve({
            success: false,
            error: `ffmpeg exited during startup: ${startupError}`,
          });
          return;
        }

        resolve({
          success: false,
          error: `ffmpeg exited before recording stabilized (code: ${code}, signal: ${signal})`,
        });
      });
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown ffmpeg startup error",
    };
  }
}

async function stopRecording(ffmpegProcess) {
  ffmpegProcess.kill("SIGINT");
  await once(ffmpegProcess, "close");
  console.log("[Audio] Recording stopped");
}

function getAudioFileInfo(outputPath) {
  try {
    const stats = fs.statSync(outputPath);
    return {
      exists: true,
      size: stats.size,
      modifiedAt: stats.mtimeMs,
    };
  } catch {
    return {
      exists: false,
      size: 0,
      modifiedAt: 0,
    };
  }
}

async function waitForRecordingToFlush(outputPath, options = {}) {
  const minimumBytes = options.minimumBytes ?? MIN_AUDIO_BYTES;
  const timeoutMs = options.timeoutMs ?? 12_000;
  const pollMs = options.pollMs ?? 500;
  const startedAt = Date.now();
  let previousSize = -1;
  let stableSamples = 0;

  while (Date.now() - startedAt < timeoutMs) {
    const info = getAudioFileInfo(outputPath);

    if (info.exists && info.size >= minimumBytes) {
      if (info.size === previousSize) {
        stableSamples += 1;
      } else {
        stableSamples = 0;
        previousSize = info.size;
      }

      if (stableSamples >= 2) {
        return {
          success: true,
          size: info.size,
        };
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  const finalInfo = getAudioFileInfo(outputPath);
  return {
    success: false,
    size: finalInfo.size,
    error: finalInfo.exists
      ? `Recording file did not reach a usable size. Captured ${finalInfo.size} bytes.`
      : "Recording file was never written to disk.",
  };
}

module.exports = { startRecording, stopRecording, waitForRecordingToFlush, getAudioFileInfo };
