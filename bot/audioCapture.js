const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const AUDIO_DIR = path.join(process.cwd(), "tmp", "audio");

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
    console.log("[Audio] Using audio source:", audioSource);
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

    ffmpeg.stderr.on("data", (chunk) => {
      const message = chunk.toString();

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
        resolve({ success: true, ffmpeg, outputPath });
      }, 1_500);

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

function stopRecording(ffmpegProcess) {
  return new Promise((resolve) => {
    ffmpegProcess.on("close", () => {
      console.log("[Audio] Recording stopped");
      resolve();
    });
    ffmpegProcess.kill("SIGINT");
  });
}

module.exports = { startRecording, stopRecording };
