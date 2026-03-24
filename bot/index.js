const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const { joinMeeting, leaveMeeting } = require("./meetingBot");
const { startRecording } = require("./audioCapture");
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

async function cleanupJoinArtifacts(meetingId, browser) {
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

async function startBot(meetingId, meetingUrl, onStatusUpdate) {
  try {
    await onStatusUpdate(meetingId, "waiting_for_join");

    const { browser, page, status } = await joinMeeting(meetingUrl, meetingId);

    if (status === "failed") {
      await cleanupJoinArtifacts(meetingId, browser);
      await onStatusUpdate(meetingId, "failed");
      return {
        success: false,
        error: "Google Meet rejected the bot. Run npm run setup:bot-profile first, then try again.",
      };
    }

    if (status === "waiting_for_admission") {
      console.log("[Bot] Bot is in waiting room. Recording will start after admission.");
      await onStatusUpdate(meetingId, "waiting_for_join");
    }

    if (status === "joined") {
      console.log("[Bot] Bot confirmed in meeting. Starting recording.");
    }

    const recording = await startRecording(meetingId);

    if (!recording.success) {
      console.error(`[Bot] Recording failed to start for ${meetingId}: ${recording.error}`);
      await cleanupJoinArtifacts(meetingId, browser);
      await onStatusUpdate(meetingId, "failed");
      return {
        success: false,
        error: recording.error || "Failed to start recording",
      };
    }

    writeSession(meetingId, {
      ffmpegPid: recording.ffmpeg.pid,
      outputPath: recording.outputPath,
      joinStatus: status,
    });
    activeBrowsers.set(meetingId, browser);
    await onStatusUpdate(meetingId, "capturing");

    console.log(`[Bot] Meeting ${meetingId} joined and recording started`);
    return { success: true, outputPath: recording.outputPath };
  } catch (error) {
    console.error("[Bot] Failed to start:", error);
    await onStatusUpdate(meetingId, "failed");
    return { success: false, error: error instanceof Error ? error.message : "Failed to start bot" };
  }
}

async function stopBot(meetingId, onStatusUpdate) {
  const session = getSession(meetingId);

  if (!session) {
    return { success: false, error: "No active bot session found" };
  }

  try {
    await onStatusUpdate(meetingId, "processing");

    try {
      process.kill(session.ffmpegPid, "SIGINT");
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    } catch (error) {
      console.log("[Bot] ffmpeg already stopped or PID not found");
    }

    const browser = activeBrowsers.get(meetingId);
    if (browser) {
      await leaveMeeting(browser);
      activeBrowsers.delete(meetingId);
    }

    deleteSession(meetingId);

    const transcribeScript = path.join(BOT_DIR, "transcribe.py");
    const result = execSync(`python3 ${transcribeScript} ${session.outputPath}`, {
      timeout: 300_000,
    });

    const { transcript, error } = JSON.parse(result.toString());

    if (error || !transcript) {
      await onStatusUpdate(meetingId, "failed");
      return { success: false, error: error || "Transcription failed" };
    }

    const summary = await summarizeMeeting(transcript);
    await onStatusUpdate(meetingId, "completed");

    return { success: true, transcript, summary };
  } catch (error) {
    console.error("[Bot] Failed to stop:", error);
    await onStatusUpdate(meetingId, "failed");
    return { success: false, error: error instanceof Error ? error.message : "Failed to stop bot" };
  }
}

module.exports = { startBot, stopBot };
