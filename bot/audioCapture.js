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
    ffmpegArgs = [
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
    ffmpegArgs = [
      "-f",
      "pulse",
      "-i",
      "default",
      "-acodec",
      "pcm_s16le",
      "-ar",
      "16000",
      "-ac",
      "1",
      outputPath,
    ];
  } else {
    throw new Error("Unsupported OS for audio capture");
  }

  const ffmpeg = spawn("ffmpeg", ffmpegArgs);

  ffmpeg.stderr.on("data", () => {
    // ffmpeg logs to stderr during normal operation.
  });

  ffmpeg.on("error", (error) => {
    console.error("[Audio] ffmpeg error:", error);
  });

  console.log(`[Audio] Recording started: ${outputPath}`);
  return { ffmpeg, outputPath };
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
