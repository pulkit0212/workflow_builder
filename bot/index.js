const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const { joinMeeting, leaveMeeting, watchMeetingEnd } = require("./meetingBot");
const { getAudioFileInfo, startRecording, stopRecording, waitForRecordingToFlush } = require("./audioCapture");
const { summarizeMeeting } = require("./summarize");

const PROJECT_ROOT = process.cwd();
const BOT_DIR = path.join(PROJECT_ROOT, "bot");
const TMP_DIR = path.join(PROJECT_ROOT, "tmp");
const AUDIO_DIR = path.join(TMP_DIR, "audio");
const SESSIONS_FILE = path.join(TMP_DIR, "bot-sessions.json");
const activeBrowsers = new Map();

fs.mkdirSync(AUDIO_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

console.log("[Bot] PROJECT_ROOT:", process.cwd());
console.log("[Bot] BOT_DIR:", BOT_DIR);
console.log("[Bot] AUDIO_DIR:", AUDIO_DIR);
console.log("[Bot] SESSIONS_FILE:", SESSIONS_FILE);

function botLog(meetingId, event, data = {}) {
  const log = {
    timestamp: new Date().toISOString(),
    meetingId,
    event,
    ...data
  };
  console.log("[Artiva Bot]", JSON.stringify(log));
}

function readSessions() {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) {
      return {};
    }

    return JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeSession(meetingId, data) {
  const sessions = readSessions();
  sessions[meetingId] = {
    ...data,
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(SESSIONS_FILE), { recursive: true });
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

function deleteSession(meetingId) {
  const sessions = readSessions();
  delete sessions[meetingId];
  fs.mkdirSync(path.dirname(SESSIONS_FILE), { recursive: true });
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

function getSession(meetingId) {
  return readSessions()[meetingId] || null;
}

function persistSessionFailure(meetingId, errorCode, failureReason) {
  const existingData = getSession(meetingId) || {};
  writeSession(meetingId, {
    ...existingData,
    state: "failed",
    errorCode: errorCode || "unknown",
    failureReason: failureReason || null,
    failedAt: new Date().toISOString(),
  });
}

async function cleanupJoinArtifacts(meetingId, browser) {
  clearActiveHandles(activeBrowsers.get(meetingId));

  if (browser) {
    try {
      await leaveMeeting(browser);
    } catch {
      // ignore cleanup errors
    }
  }

  activeBrowsers.delete(meetingId);
  deleteSession(meetingId);
}

function formatBotError(error, fallback) {
  return error instanceof Error ? error.message : fallback;
}

function clearActiveHandles(activeSession) {
  if (!activeSession) {
    return;
  }

  if (activeSession.watchInterval) {
    clearInterval(activeSession.watchInterval);
    activeSession.watchInterval = null;
  }

  if (activeSession.safetyTimeout) {
    clearTimeout(activeSession.safetyTimeout);
    activeSession.safetyTimeout = null;
  }
}

function validateAudioFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return { valid: false, reason: "Audio file not found. Recording may have failed." };
    }

    const stats = fs.statSync(filePath);
    const fileSizeKB = stats.size / 1024;

    console.log(`[Audio] File size: ${fileSizeKB.toFixed(1)} KB`);

    if (fileSizeKB < 50) {
      return {
        valid: false,
        reason: "No audio was captured. Please check your MEETING_AUDIO_SOURCE setting.",
        errorCode: "no_audio_captured"
      };
    }

    if (fileSizeKB < 200) {
      console.warn("[Audio] Small file — may be very short recording");
    }

    return { valid: true, fileSizeKB };
  } catch (error) {
    return {
      valid: false,
      reason: "Could not read audio file: " + (error instanceof Error ? error.message : "unknown error")
    };
  }
}

async function releaseActiveResources(meetingId, session) {
  const activeSession = activeBrowsers.get(meetingId);
  clearActiveHandles(activeSession);

  try {
    if (activeSession?.ffmpegProcess) {
      await stopRecording(activeSession.ffmpegProcess);
    } else if (session?.ffmpegPid) {
      process.kill(session.ffmpegPid, "SIGINT");
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  } catch {
    // ignore cleanup errors
  }

  try {
    if (activeSession?.browser) {
      await leaveMeeting(activeSession.browser);
    }
  } catch {
    // ignore cleanup errors
  }

  activeBrowsers.delete(meetingId);
}

async function startBot(meetingId, meetingUrl, onStatusUpdate) {
  try {
    botLog(meetingId, "bot_started", { meetingUrl });
    await onStatusUpdate(meetingId, "waiting_for_join");

    const { browser, page, status } = await joinMeeting(meetingUrl, meetingId);
    botLog(meetingId, "join_result", { status, reason: status });

    if (status === "failed") {
      await cleanupJoinArtifacts(meetingId, browser);
      botLog(meetingId, "bot_failed", {
        error: "Google Meet rejected the bot.",
        errorCode: "meet_access_denied",
      });
      await onStatusUpdate(meetingId, "failed", {
        errorCode: "meet_access_denied",
        failureReason:
          "Google Meet rejected the bot. Run npm run setup:bot-profile once, sign in manually, then try again.",
      });
      return {
        success: false,
        error: "Google Meet rejected the bot. Run npm run setup:bot-profile first, then try again.",
      };
    }

    if (status === "waiting_for_admission") {
      console.log("[Bot] Bot is in waiting room. Recording will start after admission.");
      botLog(meetingId, "join_result", {
        status: "waiting_for_admission",
        reason: "host_admission_required",
      });
      await onStatusUpdate(meetingId, "waiting_for_admission", {
        errorCode: "host_admission_required",
        failureReason: "Bot is waiting to be admitted by the meeting host.",
      });
    }

    if (status === "joined") {
      console.log("[Bot] Bot confirmed in meeting. Starting recording.");
    }

    const recording = await startRecording(meetingId);

    if (!recording.success) {
      console.error(`[Bot] Recording failed to start for ${meetingId}: ${recording.error}`);
      await cleanupJoinArtifacts(meetingId, browser);
      botLog(meetingId, "bot_failed", {
        error: recording.error || "Failed to start recording",
        errorCode: "recording_start_failed",
      });
      await onStatusUpdate(meetingId, "failed", {
        errorCode: "recording_start_failed",
        failureReason: recording.error || "Failed to start recording",
      });
      return {
        success: false,
        error: recording.error || "Failed to start recording",
      };
    }

    writeSession(meetingId, {
      ffmpegPid: recording.ffmpeg.pid,
      outputPath: recording.outputPath,
      joinedAt: new Date().toISOString(),
      joinStatus: status,
      audioSource: recording.audioSource || null,
      recordingStartedAt: new Date().toISOString(),
      meetingUrl,
      startupLog: recording.startupLog || "",
    });

    const watchInterval = await watchMeetingEnd(
      page,
      meetingId,
      async (id, reason) => {
        botLog(id, "meeting_auto_ended", { reason });

        if (reason === "kicked") {
          const currentSession = getSession(id);
          if (currentSession) {
            writeSession(id, {
              ...currentSession,
              errorCode: "bot_kicked"
            });
          }
        }

        await stopBot(id, onStatusUpdate).catch((error) =>
          console.error("[Bot] Auto-stop error:", error.message)
        );
      }
    );

    const MAX_DURATION = 4 * 60 * 60 * 1000;
    const safetyTimeout = setTimeout(async () => {
      botLog(meetingId, "max_duration_reached", { maxHours: 4 });
      await stopBot(meetingId, onStatusUpdate).catch(console.error);
    }, MAX_DURATION);

    botLog(meetingId, "recording_started", {
      outputPath: recording.outputPath,
      ffmpegPid: recording.ffmpeg.pid,
    });
    activeBrowsers.set(meetingId, {
      browser,
      page,
      ffmpegProcess: recording.ffmpeg,
      watchInterval,
      safetyTimeout,
      stopInProgress: false,
    });
    await onStatusUpdate(meetingId, "capturing", {
      errorCode: null,
      failureReason: null,
      recordingFilePath: recording.outputPath,
      recordingStartedAt: new Date().toISOString(),
      recordingEndedAt: null,
    });

    console.log(`[Bot] Meeting ${meetingId} joined and recording started`);
    return { success: true, outputPath: recording.outputPath };
  } catch (error) {
    console.error("[Bot] Failed to start:", error);
    botLog(meetingId, "bot_failed", {
      error: formatBotError(error, "Failed to start bot"),
      errorCode: "bot_start_failed",
    });
    await onStatusUpdate(meetingId, "failed", {
      errorCode: "bot_start_failed",
      failureReason: formatBotError(error, "Failed to start bot"),
    });
    return { success: false, error: formatBotError(error, "Failed to start bot") };
  }
}

async function stopBot(meetingId, onStatusUpdate) {
  const session = getSession(meetingId);
  const outputPath = session?.outputPath;
  const activeSession = activeBrowsers.get(meetingId);

  if (!session) {
    return { success: false, error: "No active bot session found" };
  }

  if (activeSession?.stopInProgress) {
    return { success: false, error: "Bot stop already in progress" };
  }

  if (activeSession) {
    activeSession.stopInProgress = true;
    clearActiveHandles(activeSession);
  }

  try {
    const recordingStartedAt = session.recordingStartedAt ? new Date(session.recordingStartedAt) : null;
    const meetingDurationSeconds = recordingStartedAt
      ? Math.max(0, Math.round((Date.now() - recordingStartedAt.getTime()) / 1000))
      : null;
    const joinedAt = session.joinedAt ? new Date(session.joinedAt) : null;
    const duration = joinedAt ? Math.round((Date.now() - joinedAt.getTime()) / 1000) : null;
    console.log(`[Bot] Meeting duration: ${duration} seconds`);
    const recordingEndedAt = new Date().toISOString();
    await onStatusUpdate(meetingId, "processing", {
      errorCode: null,
      recordingEndedAt,
      failureReason: null,
    });

    try {
      process.kill(session.ffmpegPid, 0);
      const browserFfmpeg = activeSession && activeSession.ffmpegProcess;

      if (browserFfmpeg) {
        await stopRecording(browserFfmpeg);
      } else {
        process.kill(session.ffmpegPid, "SIGINT");
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        console.log("[Audio] Recording stopped cleanly");
      }
    } catch (error) {
      console.log("[Audio] ffmpeg already stopped — attempting to use existing audio file");
    }

    const flushResult = await waitForRecordingToFlush(outputPath);
    if (!flushResult.success) {
      const fileInfo = getAudioFileInfo(outputPath);
      const errorMessage = `${flushResult.error} Check MEETING_AUDIO_SOURCE and confirm system audio is routed into PulseAudio/BlackHole.`;
      await releaseActiveResources(meetingId, session);
      persistSessionFailure(meetingId, "no_audio_captured", errorMessage);
      botLog(meetingId, "bot_failed", {
        error: errorMessage,
        errorCode: "no_audio_captured",
      });
      await onStatusUpdate(meetingId, "failed", {
        errorCode: "no_audio_captured",
        failureReason: errorMessage,
        recordingFilePath: outputPath,
        recordingEndedAt,
      });
      return {
        success: false,
        error: `${errorMessage} Current file size: ${fileInfo.size} bytes.`,
        errorCode: "no_audio_captured",
      };
    }

    const audioExists = fs.existsSync(session.outputPath);
    const audioSize = audioExists ? fs.statSync(session.outputPath).size : 0;
    console.log(`[Audio] File exists: ${audioExists}, size: ${(audioSize / 1024).toFixed(1)} KB`);

    const audioStats = fs.statSync(outputPath);
    const fileSizeKB = audioStats.size / 1024;
    console.log(`[Audio] File size: ${fileSizeKB.toFixed(1)} KB`);
    botLog(meetingId, "recording_stopped", {
      durationSeconds: duration,
      fileSizeKB: Number(fileSizeKB.toFixed(1)),
    });

    const MIN_SIZE_1MIN = 500;

    if (fileSizeKB < 50) {
      console.error("[Audio] File too small — likely silence or capture failed");
      await releaseActiveResources(meetingId, session);
      persistSessionFailure(
        meetingId,
        "no_audio_captured",
        "No audio was captured. Check your MEETING_AUDIO_SOURCE setting in .env.local. Run: pactl list short sources to find the correct device."
      );
      botLog(meetingId, "bot_failed", {
        error: "No audio was captured. Check your MEETING_AUDIO_SOURCE setting in .env.local. Run: pactl list short sources to find the correct device.",
        errorCode: "no_audio_captured",
      });
      await onStatusUpdate(meetingId, "failed", {
        errorCode: "no_audio_captured",
        failureReason:
          "No audio was captured. Check your MEETING_AUDIO_SOURCE setting in .env.local. Run: pactl list short sources to find the correct device.",
        recordingFilePath: outputPath,
        recordingEndedAt,
      });
      return {
        success: false,
        error:
          "No audio was captured. Check your MEETING_AUDIO_SOURCE setting in .env.local. Run: pactl list short sources to find the correct device.",
        errorCode: "no_audio_captured",
      };
    }

    if (fileSizeKB < MIN_SIZE_1MIN) {
      console.warn("[Audio] File smaller than expected — audio may be partial");
    }

    if (activeSession?.browser) {
      await leaveMeeting(activeSession.browser);
    }
    activeBrowsers.delete(meetingId);

    const audioValidation = validateAudioFile(session.outputPath);
    if (!audioValidation.valid) {
      console.error("[Bot] Audio validation failed:", audioValidation.reason);
      persistSessionFailure(
        meetingId,
        audioValidation.errorCode || "audio_validation_failed",
        audioValidation.reason
      );
      await onStatusUpdate(meetingId, "failed", {
        errorCode: audioValidation.errorCode || "audio_validation_failed",
        failureReason: audioValidation.reason,
        recordingFilePath: outputPath,
        recordingEndedAt,
      });
      activeBrowsers.delete(meetingId);
      deleteSession(meetingId);
      return {
        success: false,
        error: audioValidation.reason,
        errorCode: audioValidation.errorCode || "audio_validation_failed"
      };
    }

    const transcribeScript = path.join(BOT_DIR, "transcribe.py");
    botLog(meetingId, "transcription_started", {});
    const result = execSync(`python3 ${transcribeScript} ${outputPath}`, {
      timeout: 300_000,
    });

    const { transcript, error } = JSON.parse(result.toString());

    if (error || !transcript) {
      persistSessionFailure(meetingId, "transcription_failed", error || "Transcription failed");
      botLog(meetingId, "bot_failed", {
        error: error || "Transcription failed",
        errorCode: "transcription_failed",
      });
      await onStatusUpdate(meetingId, "failed", {
        errorCode: "transcription_failed",
        failureReason: error || "Transcription failed",
        recordingFilePath: session.outputPath,
        recordingEndedAt,
      });
      return { success: false, error: error || "Transcription failed" };
    }
    botLog(meetingId, "transcription_completed", {
      transcriptLength: transcript.length,
    });

    await onStatusUpdate(meetingId, "summarizing", {
      errorCode: null,
      failureReason: null,
      recordingFilePath: session.outputPath,
      recordingEndedAt,
    });
    const summary = await summarizeMeeting(transcript);
    if (
      !summary ||
      !summary.summary ||
      summary.summary.startsWith("Summary generation failed:") ||
      summary.summary === "Summary unavailable - Gemini API key not configured."
    ) {
      persistSessionFailure(
        meetingId,
        "summary_failed",
        summary?.summary || "Summary generation failed. The transcript may be empty."
      );
      botLog(meetingId, "bot_failed", {
        error: summary?.summary || "Summary generation failed. The transcript may be empty.",
        errorCode: "summary_failed",
      });
      await onStatusUpdate(meetingId, "failed", {
        errorCode: "summary_failed",
        failureReason:
          summary?.summary || "Summary generation failed. The transcript may be empty.",
        recordingFilePath: session.outputPath,
        recordingEndedAt,
      });
      return {
        success: false,
        error: summary?.summary || "Summary generation failed. The transcript may be empty.",
        errorCode: "summary_failed",
      };
    }
    botLog(meetingId, "summary_completed", {
      actionItemCount: Array.isArray(summary.action_items) ? summary.action_items.length : 0,
    });
    await onStatusUpdate(meetingId, "completed", {
      errorCode: null,
      failureReason: null,
      recordingFilePath: session.outputPath,
      recordingEndedAt,
    });
    deleteSession(meetingId);

    return {
      success: true,
      transcript,
      meetingDurationSeconds: meetingDurationSeconds ?? undefined,
      summary,
    };
  } catch (error) {
    console.error("[Bot] Failed to stop:", error);
    activeBrowsers.delete(meetingId);
    persistSessionFailure(meetingId, "bot_stop_failed", formatBotError(error, "Failed to stop bot"));
    botLog(meetingId, "bot_failed", {
      error: formatBotError(error, "Failed to stop bot"),
      errorCode: "bot_stop_failed",
    });
    await onStatusUpdate(meetingId, "failed", {
      errorCode: "bot_stop_failed",
      failureReason: formatBotError(error, "Failed to stop bot"),
      recordingFilePath: session.outputPath,
      recordingEndedAt: new Date().toISOString(),
    });
    return { success: false, error: formatBotError(error, "Failed to stop bot") };
  }
}

function recoverStaleSessions() {
  try {
    const sessions = readSessions();
    const now = Date.now();

    for (const [meetingId, session] of Object.entries(sessions)) {
      if (session.state === "capturing" && session.joinedAt) {
        const joinedAt = new Date(session.joinedAt).getTime();
        const hoursElapsed = (now - joinedAt) / (1000 * 60 * 60);

        if (hoursElapsed > 5) {
          console.log(`[Bot] Recovering stale session: ${meetingId}`);
          deleteSession(meetingId);
        }
      }

      if (session.state === "processing" && session.updatedAt) {
        const updatedAt = new Date(session.updatedAt).getTime();
        const minsElapsed = (now - updatedAt) / (1000 * 60);

        if (minsElapsed > 30) {
          console.log(`[Bot] Stale processing session: ${meetingId}`);
          deleteSession(meetingId);
        }
      }
    }
  } catch (error) {
    console.error("[Bot] Session recovery error:", error instanceof Error ? error.message : error);
  }
}

recoverStaleSessions();

module.exports = { startBot, stopBot };
