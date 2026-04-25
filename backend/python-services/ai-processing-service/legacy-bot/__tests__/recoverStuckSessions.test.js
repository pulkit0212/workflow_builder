"use strict";

/**
 * Unit tests for recoverStuckSessions in index.js
 *
 * Tests that:
 * - 'processing' and 'summarizing' sessions are marked failed unconditionally
 * - 'capturing' and 'waiting_for_join' sessions still check ffmpeg_pid
 *
 * Validates: Requirements 2.8, 3.8
 */

// ── Mock all external dependencies before requiring index.js ─────────────────

// Mock pg Pool
const mockQuery = jest.fn();
const mockPoolInstance = { query: mockQuery };
jest.mock("pg", () => ({
  Pool: jest.fn(() => mockPoolInstance),
}));

// Mock meetingBot
jest.mock("../meetingBot", () => ({
  joinMeeting: jest.fn(),
  leaveMeeting: jest.fn(),
  watchMeetingEnd: jest.fn(),
}));

// Mock audioCapture
jest.mock("../audioCapture", () => ({
  getAudioFileInfo: jest.fn(),
  startRecording: jest.fn(),
  stopRecording: jest.fn(),
  waitForRecordingToFlush: jest.fn(),
}));

// Mock summarize
jest.mock("../summarize", () => ({
  summarizeMeeting: jest.fn(),
  summarizeWithRetry: jest.fn(),
  generateInsights: jest.fn(),
  generateChapters: jest.fn(),
}));

// Mock logger
jest.mock("../logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

// Prevent the HTTP server from actually binding a port
jest.mock("node:http", () => ({
  createServer: jest.fn(() => ({
    listen: jest.fn(),
    on: jest.fn(),
  })),
}));

// Set DATABASE_URL so dbPool is created (non-null)
process.env.DATABASE_URL = "postgresql://test:test@localhost/test";

// ── Load the module under test ────────────────────────────────────────────────

// We require AFTER mocks are set up
const { recoverStuckSessions, isProcessRunning } = require("../index");

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a mock DB row for a session.
 */
function makeRow(id, status, ffmpegPid = null) {
  return { id, status, ffmpeg_pid: ffmpegPid };
}

/**
 * Capture all UPDATE calls made to saveSessionToDB (via dbPool.query).
 * Returns an array of { meetingId, status, errorCode } objects.
 */
function captureUpdates() {
  const updates = [];
  for (const call of mockQuery.mock.calls) {
    const sql = call[0];
    const params = call[1];
    if (typeof sql === "string" && sql.trim().toUpperCase().startsWith("UPDATE")) {
      // params layout from saveSessionToDB: [...values, meetingId]
      // We look for status and error_code in the SET clause
      const statusMatch = sql.match(/status\s*=\s*\$(\d+)/i);
      const errorCodeMatch = sql.match(/error_code\s*=\s*\$(\d+)/i);
      const idMatch = sql.match(/WHERE id\s*=\s*\$(\d+)/i);

      const statusIdx = statusMatch ? parseInt(statusMatch[1], 10) - 1 : null;
      const errorCodeIdx = errorCodeMatch ? parseInt(errorCodeMatch[1], 10) - 1 : null;
      const idIdx = idMatch ? parseInt(idMatch[1], 10) - 1 : null;

      updates.push({
        meetingId: idIdx !== null ? params[idIdx] : null,
        status: statusIdx !== null ? params[statusIdx] : null,
        errorCode: errorCodeIdx !== null ? params[errorCodeIdx] : null,
      });
    }
  }
  return updates;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

describe("recoverStuckSessions — processing/summarizing sessions", () => {
  test("marks a 'processing' session as failed with errorCode=server_restart unconditionally", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeRow("session-proc-1", "processing", null)],
    });
    // Subsequent UPDATE calls
    mockQuery.mockResolvedValue({ rows: [] });

    await recoverStuckSessions();

    const updates = captureUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].meetingId).toBe("session-proc-1");
    expect(updates[0].status).toBe("failed");
    expect(updates[0].errorCode).toBe("server_restart");
  });

  test("marks a 'summarizing' session as failed with errorCode=server_restart unconditionally", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeRow("session-sum-1", "summarizing", null)],
    });
    mockQuery.mockResolvedValue({ rows: [] });

    await recoverStuckSessions();

    const updates = captureUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].meetingId).toBe("session-sum-1");
    expect(updates[0].status).toBe("failed");
    expect(updates[0].errorCode).toBe("server_restart");
  });

  test("marks 'processing' session failed even when a ffmpeg_pid is present (no process check)", async () => {
    // processing sessions should NOT check the pid — mark failed regardless
    mockQuery.mockResolvedValueOnce({
      rows: [makeRow("session-proc-2", "processing", 99999)],
    });
    mockQuery.mockResolvedValue({ rows: [] });

    await recoverStuckSessions();

    const updates = captureUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe("failed");
    expect(updates[0].errorCode).toBe("server_restart");
  });
});

describe("recoverStuckSessions — capturing/waiting_for_join sessions (unchanged behavior)", () => {
  test("marks 'capturing' session as failed when ffmpeg_pid is null", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeRow("session-cap-1", "capturing", null)],
    });
    mockQuery.mockResolvedValue({ rows: [] });

    await recoverStuckSessions();

    const updates = captureUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].meetingId).toBe("session-cap-1");
    expect(updates[0].status).toBe("failed");
    expect(updates[0].errorCode).toBe("server_restart");
  });

  test("marks 'waiting_for_join' session as failed when ffmpeg_pid is null", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeRow("session-wfj-1", "waiting_for_join", null)],
    });
    mockQuery.mockResolvedValue({ rows: [] });

    await recoverStuckSessions();

    const updates = captureUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].meetingId).toBe("session-wfj-1");
    expect(updates[0].status).toBe("failed");
    expect(updates[0].errorCode).toBe("server_restart");
  });

  test("leaves 'capturing' session untouched when ffmpeg process is alive", async () => {
    // Use a real PID that is guaranteed to be alive (the current process)
    const alivePid = process.pid;
    mockQuery.mockResolvedValueOnce({
      rows: [makeRow("session-cap-alive", "capturing", alivePid)],
    });
    mockQuery.mockResolvedValue({ rows: [] });

    await recoverStuckSessions();

    const updates = captureUpdates();
    // No UPDATE should have been issued for this session
    expect(updates).toHaveLength(0);
  });

  test("marks 'capturing' session as failed when ffmpeg process is dead", async () => {
    // PID 999999999 is virtually guaranteed to not exist
    const deadPid = 999999999;
    mockQuery.mockResolvedValueOnce({
      rows: [makeRow("session-cap-dead", "capturing", deadPid)],
    });
    mockQuery.mockResolvedValue({ rows: [] });

    await recoverStuckSessions();

    const updates = captureUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].meetingId).toBe("session-cap-dead");
    expect(updates[0].status).toBe("failed");
    expect(updates[0].errorCode).toBe("server_restart");
  });
});

describe("recoverStuckSessions — all four statuses together", () => {
  test("correctly handles a mix of all four statuses in one run", async () => {
    const alivePid = process.pid;
    const deadPid = 999999999;

    mockQuery.mockResolvedValueOnce({
      rows: [
        makeRow("s-capturing-alive", "capturing", alivePid),
        makeRow("s-capturing-dead", "capturing", deadPid),
        makeRow("s-waiting", "waiting_for_join", null),
        makeRow("s-processing", "processing", null),
        makeRow("s-summarizing", "summarizing", null),
      ],
    });
    mockQuery.mockResolvedValue({ rows: [] });

    await recoverStuckSessions();

    const updates = captureUpdates();

    // 4 sessions should be marked failed (all except the alive capturing one)
    expect(updates).toHaveLength(4);

    const failedIds = updates.map((u) => u.meetingId);
    expect(failedIds).not.toContain("s-capturing-alive");
    expect(failedIds).toContain("s-capturing-dead");
    expect(failedIds).toContain("s-waiting");
    expect(failedIds).toContain("s-processing");
    expect(failedIds).toContain("s-summarizing");

    // All failed sessions should have errorCode=server_restart
    for (const u of updates) {
      expect(u.status).toBe("failed");
      expect(u.errorCode).toBe("server_restart");
    }
  });
});

describe("recoverStuckSessions — SQL query includes all four statuses", () => {
  test("queries for all four statuses in the SELECT", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await recoverStuckSessions();

    const selectCall = mockQuery.mock.calls[0];
    const sql = selectCall[0];
    expect(sql).toMatch(/capturing/);
    expect(sql).toMatch(/waiting_for_join/);
    expect(sql).toMatch(/processing/);
    expect(sql).toMatch(/summarizing/);
  });
});

describe("recoverStuckSessions — no sessions", () => {
  test("does nothing when no stuck sessions are found", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await recoverStuckSessions();

    // Only the SELECT query should have been called, no UPDATEs
    const updates = captureUpdates();
    expect(updates).toHaveLength(0);
  });
});
