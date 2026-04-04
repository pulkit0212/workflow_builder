const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { Pool } = require("pg");
const { joinMeeting, leaveMeeting, watchMeetingEnd } = require("./meetingBot");
const { getAudioFileInfo, startRecording, stopRecording, waitForRecordingToFlush } = require("./audioCapture");
const { summarizeMeeting, summarizeWithRetry } = require("./summarize");
const { logger } = require("./logger");

// Load .env.local for DATABASE_URL when running outside Next.js
try {
  require("dotenv").config({ path: path.join(process.cwd(), ".env.local") });
} catch {
  // dotenv optional — DATABASE_URL may already be in environment
}

const dbPool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

const PROJECT_ROOT = process.cwd();
const BOT_DIR = path.join(PROJECT_ROOT, "bot");
const TMP_DIR = path.join(PROJECT_ROOT, "tmp");
const AUDIO_DIR = path.join(TMP_DIR, "audio");
const activeBrowsers = new Map();

fs.mkdirSync(AUDIO_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

logger.info("Bot", "PROJECT_ROOT", { path: process.cwd() });
logger.info("Bot", "BOT_DIR", { path: BOT_DIR });
logger.info("Bot", "AUDIO_DIR", { path: AUDIO_DIR });

function botLog(meetingId, event, data = {}) {
  const log = {
    timestamp: new Date().toISOString(),
    meetingId,
    event,
    ...data
  };
  console.log("[Artivaa Bot]", JSON.stringify(log));
}

/**
 * Fetches the session row by meetingId from the DB.
 * Returns a plain object with camelCase keys, or null if not found.
 * Requirements: 2.6
 */
async function getSessionFromDB(meetingId) {
  if (!dbPool) {
    console.warn("[Bot] getSessionFromDB: DATABASE_URL not set — returning null");
    return null;
  }

  try {
    const result = await dbPool.query(
      "SELECT * FROM meeting_sessions WHERE id = $1",
      [meetingId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      ffmpegPid: row.ffmpeg_pid,
      outputPath: row.output_path,
      status: row.status,
      errorCode: row.error_code,
      failureReason: row.failure_reason,
      joinedAt: row.joined_at,
      recordingStartedAt: row.recording_started_at,
    };
  } catch (err) {
    console.error(`[Bot] getSessionFromDB(${meetingId}) failed:`, err.message);
    return null;
  }
}

/**
 * Upserts session fields to the meeting_sessions table.
 * Accepted fields in `data`: ffmpegPid, outputPath, status, errorCode, failureReason,
 * platform, platformName, joinedAt, joinStatus, audioSource, recordingStartedAt,
 * meetingUrl, startupLog, failedAt, and any other column-mapped fields.
 *
 * Requirements: 2.6
 */
async function saveSessionToDB(meetingId, data) {
  if (!dbPool) {
    console.warn("[Bot] saveSessionToDB: DATABASE_URL not set — skipping DB write");
    return;
  }

  // Map JS camelCase keys to snake_case DB columns
  const columnMap = {
    ffmpegPid: "ffmpeg_pid",
    outputPath: "output_path",
    status: "status",
    errorCode: "error_code",
    failureReason: "failure_reason",
    failedAt: "failed_at",
    platform: "provider",
    // platformName intentionally NOT mapped — must never overwrite the user-defined title
    joinedAt: "joined_at",
    recordingStartedAt: "recording_started_at",
    participants: "participants",
  };

  const setClauses = [];
  const values = [];
  let idx = 1;

  for (const [key, col] of Object.entries(columnMap)) {
    if (Object.prototype.hasOwnProperty.call(data, key) && data[key] !== undefined) {
      setClauses.push(`${col} = $${idx}`);
      values.push(data[key]);
      idx++;
    }
  }

  // Always bump updated_at
  setClauses.push(`updated_at = NOW()`);

  if (setClauses.length === 1) {
    // Only updated_at — nothing meaningful to write
    return;
  }

  values.push(meetingId);

  const sql = `
    UPDATE meeting_sessions
    SET ${setClauses.join(", ")}
    WHERE id = $${idx}
  `;

  try {
    await dbPool.query(sql, values);
  } catch (err) {
    console.error(`[Bot] saveSessionToDB(${meetingId}) failed:`, err.message);
  }
}

/**
 * Marks a session as cleaned up by setting status to 'deleted'.
 * Requirements: 2.6
 */
async function deleteSession(meetingId) {
  await saveSessionToDB(meetingId, { status: "deleted" });
}

async function persistSessionFailure(meetingId, errorCode, failureReason) {
  const existingData = (await getSessionFromDB(meetingId)) || {};
  saveSessionToDB(meetingId, {
    ...existingData,
    status: "failed",
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

/**
 * Returns true if the process with the given PID is still alive.
 * Uses signal 0 (no-op) to probe the process without killing it.
 * Returns false if the process is dead or we lack permission to signal it.
 * Requirements: 2.7
 */
function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
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

    if (stats.size < 10_000) {
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

/**
 * Spawns `python3 transcribe.py <audioPath>` as a child process and returns a
 * Promise that resolves when the process exits with code 0, or rejects with the
 * stderr output on any non-zero exit code.
 * Using spawn (not execSync) keeps the Node.js event loop unblocked.
 * Requirements: 2.4, 2.5
 */
async function transcribeAsync(audioPath) {
  return new Promise((resolve, reject) => {
    const transcribeScript = path.join(BOT_DIR, "transcribe.py");
    const proc = spawn('python3', [transcribeScript, audioPath]);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);
    proc.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr)));
  });
}

/**
 * Wraps transcribeAsync with exponential backoff retry logic.
 * Retries up to maxRetries times with delays of 2s, 4s, 8s between attempts.
 * Throws on final failure after maxRetries attempts.
 * Requirements: 2.11
 */
async function transcribeWithRetry(audioPath, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await transcribeAsync(audioPath);
    } catch (err) {
      if (attempt === maxRetries - 1) throw err;
      await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)));
    }
  }
}

// Concurrency semaphore — max 2 simultaneous transcription jobs
let activeTranscriptions = 0;
const MAX_CONCURRENT_TRANSCRIPTIONS = 2;
const transcriptionQueue = [];

/**
 * Runs transcribeWithRetry gated by the concurrency semaphore.
 * If 2 jobs are already running, queues the job until a slot opens.
 * Requirements: 2.12
 */
async function transcribeQueued(audioPath) {
  if (activeTranscriptions >= MAX_CONCURRENT_TRANSCRIPTIONS) {
    await new Promise((resolve) => transcriptionQueue.push(resolve));
  }
  activeTranscriptions++;
  try {
    return await transcribeWithRetry(audioPath);
  } finally {
    activeTranscriptions--;
    if (transcriptionQueue.length > 0) {
      const next = transcriptionQueue.shift();
      next();
    }
  }
}

async function startBot(meetingId, meetingUrl, onStatusUpdate) {
  try {
    botLog(meetingId, "bot_started", { meetingUrl });
    await onStatusUpdate(meetingId, "waiting_for_join");

    const { browser, page, status, platform, platformName, reason, message } = await joinMeeting(meetingUrl, meetingId);
    botLog(meetingId, "join_result", {
      status,
      platform: platform || "google",
      platformName: platformName || "Google Meet",
      reason: reason || status
    });

    if (status === "failed") {
      await cleanupJoinArtifacts(meetingId, browser);

      const errorCode = reason || "meet_access_denied";
      const failureReason =
        message ||
        (errorCode === "unsupported_platform"
          ? "This meeting platform is not supported yet. Use Google Meet, Zoom, or Microsoft Teams."
          : "Meeting platform rejected the bot. Run npm run setup:bot-profile once, sign in manually, then try again.");

      botLog(meetingId, "bot_failed", {
        error: failureReason,
        errorCode
      });
      await onStatusUpdate(meetingId, "failed", {
        errorCode,
        failureReason
      });

      return {
        success: false,
        error: failureReason,
        errorCode
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
      logger.info("Bot", "Bot confirmed in meeting. Starting recording.", { sessionId: meetingId });
    }

    const recording = await startRecording(meetingId);

    if (!recording.success) {
      logger.error("Bot", "Recording failed to start", { sessionId: meetingId, error: recording.error });
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

    await saveSessionToDB(meetingId, {
      ffmpegPid: recording.ffmpeg.pid,
      outputPath: recording.outputPath,
      platform: platform || "google",
      platformName: platformName || "Google Meet",
      joinedAt: new Date().toISOString(),
      joinStatus: status,
      audioSource: recording.audioSource || null,
      recordingStartedAt: new Date().toISOString(),
      meetingUrl,
      startupLog: recording.startupLog || "",
    });

    const watchInterval = await watchMeetingEnd(
      page,
      platform || "google",
      meetingId,
      async (id, reason) => {
        botLog(id, "meeting_auto_ended", { reason });

        if (reason === "kicked") {
          await saveSessionToDB(id, { errorCode: "bot_kicked" });
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
      platform: platform || "google",
      platformName: platformName || "Google Meet"
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

    logger.info("Bot", `Meeting joined and recording started`, { sessionId: meetingId });
    return { success: true, outputPath: recording.outputPath };
  } catch (error) {
    logger.error("Bot", "Failed to start", { sessionId: meetingId, error: formatBotError(error, "Failed to start bot") });
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
  const session = await getSessionFromDB(meetingId);
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

    console.log("[Stop] ═══ Audio file check ═══");
    console.log("[Stop] Audio file path:", session.outputPath);
    const audioExists = fs.existsSync(session.outputPath);
    const audioSize = audioExists ? fs.statSync(session.outputPath).size : 0;
    console.log("[Stop] Audio exists:", audioExists, "Size:", (audioSize / 1024).toFixed(1), "KB");

    const audioStats = fs.statSync(outputPath);
    const fileSizeKB = audioStats.size / 1024;
    console.log(`[Audio] File size: ${fileSizeKB.toFixed(1)} KB`);
    botLog(meetingId, "recording_stopped", {
      durationSeconds: duration,
      fileSizeKB: Number(fileSizeKB.toFixed(1)),
    });

    const MIN_SIZE_1MIN = 500;

    if (!audioExists || audioSize < 10_000) {
      console.error("[Stop] Audio file missing or too small (< 10 KB)");
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
        transcript: null,
      });
      return {
        success: false,
        error:
          "No audio captured. Check your MEETING_AUDIO_SOURCE setting.",
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

    logger.info("Stop", "Starting transcription", { sessionId: meetingId });
    logger.debug("Stop", "Audio path", { sessionId: meetingId, path: outputPath });

    let transcript;
    let transcriptResult;

    try {
      const output = await transcribeQueued(outputPath);

      const preview = typeof output === "string" ? output.substring(0, 200) : String(output).substring(0, 200);
      console.log("[Stop] Raw transcription output (first 200 chars):", preview);

      transcriptResult = JSON.parse(typeof output === "string" ? output.trim() : output.toString().trim());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error("Stop", "Transcription failed", { sessionId: meetingId, error: msg });
      persistSessionFailure(meetingId, "transcription_failed", msg);
      botLog(meetingId, "bot_failed", {
        error: msg,
        errorCode: "transcription_failed",
      });
      await onStatusUpdate(meetingId, "failed", {
        errorCode: "transcription_failed",
        failureReason: msg,
        recordingFilePath: session.outputPath,
        recordingEndedAt,
        transcript: null,
      });
      deleteSession(meetingId);
      return { success: false, error: "Transcription failed: " + msg, errorCode: "transcription_failed" };
    }

    const transcribeError = transcriptResult.error;
    transcript = transcriptResult.transcript;

    if (transcribeError || !transcript) {
      const errMsg = transcribeError || "Transcription failed";
      console.error("[Stop] Transcription returned error:", errMsg);
      persistSessionFailure(meetingId, "transcription_failed", errMsg);
      await onStatusUpdate(meetingId, "failed", {
        errorCode: "transcription_failed",
        failureReason: errMsg,
        recordingFilePath: session.outputPath,
        recordingEndedAt,
        transcript: null,
      });
      deleteSession(meetingId);
      return { success: false, error: errMsg, errorCode: "transcription_failed" };
    }

    console.log("[Stop] Transcript length:", transcript.length);
    console.log("[Stop] Transcript preview:", transcript.substring(0, 100));

    if (!transcript || transcript.trim().length < 10) {
      console.error("[Stop] Transcript is empty or too short");
      persistSessionFailure(meetingId, "empty_transcript", "Transcript is empty. Audio may be silence.");
      await onStatusUpdate(meetingId, "failed", {
        errorCode: "empty_transcript",
        failureReason: "Transcript is empty. Audio may be silence. Check MEETING_AUDIO_SOURCE.",
        recordingFilePath: session.outputPath,
        recordingEndedAt,
        transcript: "",
      });
      deleteSession(meetingId);
      return {
        success: false,
        error: "Transcript is empty. Audio may be silence. Check MEETING_AUDIO_SOURCE.",
        errorCode: "empty_transcript",
      };
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

    logger.info("Stop", "Starting summarization", { sessionId: meetingId });
    let summary;
    try {
      summary = await summarizeWithRetry(transcript);
      logger.info("Stop", "Summary generated", { sessionId: meetingId, chars: JSON.stringify(summary).length });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error("Stop", "Summary failed", { sessionId: meetingId, error: msg });
      summary = {
        summary: "Summary generation failed: " + msg,
        key_decisions: [],
        action_items: [],
        key_topics: [],
        risks_and_blockers: [],
      };
    }

    if (!summary || !summary.summary) {
      summary = {
        summary: "Summary unavailable.",
        key_decisions: [],
        action_items: [],
        key_topics: [],
        risks_and_blockers: [],
      };
    }

    botLog(meetingId, "summary_completed", {
      actionItemCount: Array.isArray(summary.action_items) ? summary.action_items.length : 0,
    });

    logger.info("Stop", "Saving to database", { sessionId: meetingId });
    // Save participants extracted by Gemini
    if (Array.isArray(summary.participants) && summary.participants.length > 0) {
      await saveSessionToDB(meetingId, { participants: summary.participants });
    }

    // Save action items to action_items table (non-fatal)
    const actionItemsList = Array.isArray(summary.action_items) ? summary.action_items : [];
    if (actionItemsList.length > 0 && dbPool) {
      try {
        const sessionRow = await getSessionFromDB(meetingId);
        const meetingTitle = sessionRow?.title || "Meeting";
        // Get the userId from the meeting_sessions row
        const userResult = await dbPool.query(
          "SELECT user_id, shared_with_user_ids FROM meeting_sessions WHERE id = $1",
          [meetingId]
        );
        const ownerUserId = userResult.rows[0]?.user_id;
        const sharedUserIds = userResult.rows[0]?.shared_with_user_ids || [];
        const allUserIds = ownerUserId ? [ownerUserId, ...sharedUserIds] : [];
        const now = new Date();
        for (const userId of allUserIds) {
          for (const item of actionItemsList) {
            await dbPool.query(
              `INSERT INTO action_items (id, task, owner, due_date, priority, completed, status, meeting_id, meeting_title, user_id, source, created_at, updated_at)
               VALUES (gen_random_uuid(), $1, $2, $3, $4, false, 'pending', $5, $6, $7, 'meeting', $8, $8)`,
              [
                item.task || "",
                item.owner || "Unassigned",
                item.due_date || "Not specified",
                item.priority || "Medium",
                meetingId,
                meetingTitle,
                userId,
                now,
              ]
            );
          }
        }
        logger.info("Bot", `Saved ${actionItemsList.length} action items to DB`, { sessionId: meetingId });
      } catch (e) {
        logger.error("Bot", "Failed to save action items to DB (non-fatal)", { sessionId: meetingId, error: e.message });
      }
    }

    await onStatusUpdate(meetingId, "completed", {
      errorCode: null,
      failureReason: null,
      recordingFilePath: session.outputPath,
      recordingEndedAt,
      transcript,
      summary,
      meetingDurationSeconds: meetingDurationSeconds ?? null,
      outputPath: session.outputPath,
    });
    logger.info("Stop", "Meeting completed successfully", { sessionId: meetingId });

    // Cleanup: delete temp audio file after successful copy to private/recordings/
    if (session.outputPath && fs.existsSync(session.outputPath)) {
      try {
        fs.unlinkSync(session.outputPath);
        console.log("[Cleanup] Deleted temp audio:", session.outputPath);
      } catch (e) {
        console.warn("[Cleanup] Could not delete temp file:", e instanceof Error ? e.message : e);
      }
    }

    deleteSession(meetingId);

    return {
      success: true,
      transcript,
      meetingDurationSeconds: meetingDurationSeconds ?? undefined,
      summary,
      outputPath: session.outputPath,
    };
  } catch (error) {
    logger.error("Bot", "Failed to stop", { sessionId: meetingId, error: formatBotError(error, "Failed to stop bot") });
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
    // Cleanup temp audio on failure too
    if (session?.outputPath && fs.existsSync(session.outputPath)) {
      try { fs.unlinkSync(session.outputPath); } catch (e) { /* non-fatal */ }
    }
    return { success: false, error: formatBotError(error, "Failed to stop bot") };
  }
}

/**
 * On bot process startup, finds any sessions stuck in 'capturing' or 'waiting_for_join'
 * from a previous run and marks them as failed if their ffmpeg process is no longer alive.
 * Requirements: 2.7, 3.10
 */
async function recoverStuckSessions() {
  if (!dbPool) {
    console.warn("[Bot] recoverStuckSessions: DATABASE_URL not set — skipping recovery");
    return;
  }

  try {
    const result = await dbPool.query(
      "SELECT id, ffmpeg_pid FROM meeting_sessions WHERE status IN ('capturing', 'waiting_for_join')"
    );

    if (result.rows.length === 0) {
      console.log("[Bot] recoverStuckSessions: no stuck sessions found");
      return;
    }

    console.log(`[Bot] recoverStuckSessions: found ${result.rows.length} stuck session(s)`);

    for (const row of result.rows) {
      const meetingId = row.id;
      const ffmpegPid = row.ffmpeg_pid;
      const isAlive = ffmpegPid != null && isProcessRunning(ffmpegPid);

      if (!isAlive) {
        console.log(`[Bot] recoverStuckSessions: marking session ${meetingId} as failed (pid ${ffmpegPid} not running)`);
        await saveSessionToDB(meetingId, {
          status: "failed",
          errorCode: "server_restart",
          failureReason: "Server restarted while session was active",
          failedAt: new Date().toISOString(),
        });
      } else {
        console.log(`[Bot] recoverStuckSessions: session ${meetingId} has live pid ${ffmpegPid} — leaving untouched`);
      }
    }
  } catch (err) {
    logger.error("Bot", "recoverStuckSessions failed", { error: err.message });
  }
}

recoverStuckSessions();

module.exports = { startBot, stopBot, isProcessRunning, recoverStuckSessions, transcribeAsync, transcribeWithRetry, transcribeQueued };
