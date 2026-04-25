const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { once } = require("node:events");

const AUDIO_DIR = path.join(process.cwd(), "tmp", "audio");
const MIN_AUDIO_BYTES = 32 * 1024;
const STARTUP_WAIT_MS = 2_500;
const STDERR_TAIL_LIMIT = 20;
const SILENCE_THRESHOLD_DB = -60;

function ensureAudioDir() {
  if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
  }
}

/**
 * Runs a 2-second ffmpeg probe on the given audio source and parses the RMS
 * level from the astats filter output.
 *
 * @param {string} audioSource - PulseAudio source name (Linux) or device name
 * @returns {Promise<{ level: number|null, isSilent: boolean }>}
 *   level: RMS level in dBFS, or null if parsing failed
 *   isSilent: true if level < SILENCE_THRESHOLD_DB; false on parse failure (fail open)
 */
async function checkAudioLevel(audioSource) {
  const isMac = process.platform === "darwin";
  const isLinux = process.platform === "linux";

  let probeArgs;
  if (isLinux) {
    probeArgs = ["-f", "pulse", "-i", audioSource, "-t", "2", "-af", "astats", "-f", "null", "-"];
  } else if (isMac) {
    probeArgs = ["-f", "avfoundation", "-i", `:${audioSource}`, "-t", "2", "-af", "astats", "-f", "null", "-"];
  } else {
    // Unsupported platform — fail open
    return { level: null, isSilent: false };
  }

  return new Promise((resolve) => {
    let stderrOutput = "";
    let probe;

    try {
      probe = spawn("ffmpeg", probeArgs, { stdio: ["ignore", "ignore", "pipe"] });
    } catch (err) {
      console.warn("[Audio] checkAudioLevel: failed to spawn ffmpeg probe:", err.message);
      return resolve({ level: null, isSilent: false });
    }

    probe.stderr.on("data", (chunk) => {
      stderrOutput += chunk.toString();
    });

    probe.on("error", (err) => {
      console.warn("[Audio] checkAudioLevel: probe error:", err.message);
      resolve({ level: null, isSilent: false });
    });

    probe.once("close", () => {
      // Look for "RMS level dB:" in astats output
      const match = stderrOutput.match(/RMS level dB:\s*(-inf|[-\d.]+)/i);
      if (!match) {
        console.warn("[Audio] checkAudioLevel: could not parse RMS level from probe output");
        return resolve({ level: null, isSilent: false });
      }

      const rawValue = match[1];
      const level = rawValue === "-inf" ? -Infinity : parseFloat(rawValue);

      if (Number.isNaN(level)) {
        console.warn("[Audio] checkAudioLevel: RMS level parsed as NaN");
        return resolve({ level: null, isSilent: false });
      }

      const isSilent = level < SILENCE_THRESHOLD_DB;
      console.log(`[Audio] checkAudioLevel: RMS level = ${level} dBFS, isSilent = ${isSilent}`);
      resolve({ level, isSilent });
    });
  });
}

async function startRecording(meetingId) {
  ensureAudioDir();
  const outputPath = path.join(AUDIO_DIR, `meeting-${meetingId}.wav`);
  const isMac = process.platform === "darwin";
  const isLinux = process.platform === "linux";

  // ── Pre-recording audio level check ──────────────────────────────────────
  if (isLinux || isMac) {
    const audioSourceForCheck = isLinux
      ? (process.env.MEETING_AUDIO_SOURCE || "default")
      : "BlackHole 2ch";

    const { level, isSilent } = await checkAudioLevel(audioSourceForCheck);

    if (isSilent) {
      console.warn(
        `[Audio] Pre-recording check: audio source "${audioSourceForCheck}" appears silent ` +
        `(RMS level = ${level} dBFS, threshold = ${SILENCE_THRESHOLD_DB} dBFS). Aborting recording.`
      );
      return { success: false, error: "silent_audio_source", errorCode: "silent_audio_source" };
    }

    if (level === null) {
      console.warn("[Audio] Pre-recording check: could not determine audio level — proceeding anyway (fail open)");
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

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
    const micSource = process.env.MEETING_MIC_SOURCE || null;
    console.log("[Audio] ══════════════════════════════════");
    console.log("[Audio] Starting recording (Linux / PipeWire-PulseAudio)");
    console.log("[Audio] Monitor source:", audioSource);
    console.log("[Audio] Mic source:", micSource || "not set — only capturing remote audio");
    console.log("[Audio] Output:", outputPath);
    console.log("[Audio] Sample rate: 16000 Hz");
    console.log("[Audio] ══════════════════════════════════");

    if (micSource) {
      // Mix monitor (remote participants) + microphone (local user) into one track
      ffmpegArgs = [
        "-y",
        "-f", "pulse", "-i", audioSource,   // input 0: monitor (remote audio)
        "-f", "pulse", "-i", micSource,      // input 1: microphone (local audio)
        "-filter_complex", "amix=inputs=2:duration=longest:dropout_transition=0",
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        outputPath,
      ];
    } else {
      ffmpegArgs = [
        "-y",
        "-f", "pulse",
        "-i", audioSource,
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        outputPath,
      ];
    }
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

      if (
        /\[(panic|error|fatal)\]|Could not|failed to|Invalid|No such|Unknown/i.test(message) &&
        !/deprecated|bitrate|frame=/i.test(message)
      ) {
        console.error("[Audio] ffmpeg:", message.trim());
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
  const { code, signal } = await new Promise((resolve) => {
    ffmpegProcess.once("close", (exitCode, sig) => resolve({ code: exitCode, signal: sig }));
  });
  console.log("[Audio] ffmpeg exited with code:", code, signal ? `signal: ${signal}` : "");
  if (code !== 0 && code !== 255 && code !== null) {
    console.error("[Audio] ffmpeg unexpected exit code:", code);
  }
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

module.exports = { startRecording, stopRecording, waitForRecordingToFlush, getAudioFileInfo, checkAudioLevel };
