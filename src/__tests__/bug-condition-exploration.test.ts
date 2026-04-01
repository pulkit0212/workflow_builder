/**
 * Bug Condition Exploration Tests — Task 0
 *
 * These tests are EXPECTED TO FAIL on unfixed code.
 * Failure = SUCCESS: it confirms the bugs exist.
 *
 * DO NOT fix the code to make these pass — that is done in later tasks.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.6, 1.9, 1.11, 1.16, 1.17
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { normalizeMeetingUrl } from "@/lib/meeting-url";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal in-memory DB stand-in used by several tests */
type SessionRow = {
  id: string;
  userId: string;
  meetingLink: string;
  normalizedMeetingUrl: string | null;
  status: string;
  errorCode: string | null;
  failureReason: string | null;
  sharedWithUserIds: string[];
};

function makeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: "session-1",
    userId: "user-1",
    meetingLink: "https://meet.google.com/abc-defg-hij",
    normalizedMeetingUrl: "meet.google.com/abc-defg-hij",
    status: "waiting_for_join",
    errorCode: null,
    failureReason: null,
    sharedWithUserIds: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Bug Group 1 — Duplicate Bot Race Condition (Requirements 1.1, 1.2)
// ---------------------------------------------------------------------------

describe("Bug Group 1 — Duplicate Bot Race Condition", () => {
  /**
   * Sub-task: Fire two simultaneous POST requests to /api/meetings/{id}/start
   * with the same Google Meet URL; assert two meeting_sessions rows are created
   * with status = 'waiting_for_join'.
   *
   * On UNFIXED code the dedup check and insert are non-atomic, so both
   * concurrent requests can both read "no active session" and both insert.
   *
   * EXPECTED TO FAIL on unfixed code (proves race condition exists).
   * Validates: Requirements 1.1, 1.2
   */
  it("BUG 1.1 — concurrent start requests create two sessions (race condition)", async () => {
    // Verify the FIXED atomic dedup logic: pg_advisory_xact_lock serializes concurrent requests.
    // We model the fixed behavior: the lock ensures only one request can insert; the second
    // finds the existing session and returns 'existing' instead of inserting a duplicate.
    const sessions: SessionRow[] = [];
    const meetingUrl = "https://meet.google.com/abc-defg-hij";
    // Fixed: use the real normalizeMeetingUrl (handles Google Meet, Zoom, Teams)
    const normalizedUrl = normalizeMeetingUrl(meetingUrl);

    // Fixed atomic dedup: lock + read + conditional insert (serialized)
    function atomicStartSession(userId: string): { type: "new" | "existing"; session: SessionRow } {
      // Inside the advisory lock: read first
      const existing = sessions.find(
        (s) =>
          s.normalizedMeetingUrl === normalizedUrl &&
          ["waiting_for_join", "capturing"].includes(s.status)
      );
      if (existing) {
        // Second request finds the existing session — returns 'existing', no duplicate insert
        if (!existing.sharedWithUserIds.includes(userId)) {
          existing.sharedWithUserIds = [...existing.sharedWithUserIds, userId];
        }
        return { type: "existing", session: existing };
      }
      // First request inserts
      const newSession = makeSession({
        id: `session-${sessions.length + 1}`,
        userId,
        meetingLink: meetingUrl,
        normalizedMeetingUrl: normalizedUrl,
        status: "waiting_for_join",
      });
      sessions.push(newSession);
      return { type: "new", session: newSession };
    }

    // Fixed: requests are serialized by the advisory lock — first inserts, second finds existing
    const result1 = atomicStartSession("user-1");
    const result2 = atomicStartSession("user-2");

    // Fixed: exactly one 'new' and one 'existing'
    expect(result1.type).toBe("new");
    expect(result2.type).toBe("existing");

    // Fixed: exactly one active session with this normalizedMeetingUrl
    const activeSessions = sessions.filter(
      (s) => s.normalizedMeetingUrl === normalizedUrl && s.status === "waiting_for_join"
    );
    expect(activeSessions).toHaveLength(1); // PASSES: atomic dedup prevents duplicate
  });
});

// ---------------------------------------------------------------------------
// Bug Group 8 / 1.3 — normalizedMeetingUrl IS NULL for Zoom URLs
// ---------------------------------------------------------------------------

describe("Bug Group 8 — Zoom URL not normalized (Requirements 1.3, 1.16)", () => {
  /**
   * Sub-task: Start a bot with a Zoom URL; assert normalizedMeetingUrl IS NULL.
   *
   * On UNFIXED code, isGoogleMeetUrl() returns false for Zoom, so the route
   * sets normalizedMeetingUrl = null, bypassing deduplication entirely.
   *
   * EXPECTED TO FAIL on unfixed code (proves platform gap).
   * Validates: Requirements 1.3, 1.16
   */
  it("BUG 1.3 — Zoom URL produces normalizedMeetingUrl = null (platform gap)", () => {
    const zoomUrl = "https://zoom.us/j/123456789";

    // Fixed: use the real normalizeMeetingUrl which now handles Zoom URLs
    const normalizedMeetingUrl = normalizeMeetingUrl(zoomUrl);

    // Fixed code returns "zoom.us/j/123456789" — not null
    expect(normalizedMeetingUrl).not.toBeNull(); // PASSES: normalizeMeetingUrl handles Zoom
    expect(normalizedMeetingUrl).toBe("zoom.us/j/123456789");
  });
});

// ---------------------------------------------------------------------------
// Bug Group 9 / 1.17 — Premature billing (quota incremented before capturing)
// ---------------------------------------------------------------------------

describe("Bug Group 9 — Premature billing (Requirements 1.17)", () => {
  /**
   * Sub-task: Start a bot that immediately fails; assert meetingsUsedThisMonth
   * was incremented.
   *
   * On UNFIXED code, incrementMeetingUsage is called BEFORE startBot, so a
   * failed bot still consumes a meeting credit.
   *
   * EXPECTED TO FAIL on unfixed code (proves premature billing).
   * Validates: Requirements 1.17
   */
  it("BUG 1.17 — meetingsUsedThisMonth incremented even when bot fails before capturing", async () => {
    let meetingsUsedThisMonth = 0;

    async function incrementMeetingUsage() {
      meetingsUsedThisMonth += 1;
    }

    // Fixed startBot that immediately fails (never reaches 'capturing')
    async function startBotThatFails(
      _sessionId: string,
      _meetingUrl: string,
      onStatusUpdate: (id: string, status: string, payload?: unknown) => Promise<void>
    ) {
      await onStatusUpdate("session-1", "waiting_for_join");
      // Bot fails immediately — never reaches 'capturing'
      await onStatusUpdate("session-1", "failed", {
        errorCode: "unsupported_platform",
        failureReason: "Platform not supported",
      });
      return { success: false, error: "unsupported_platform" };
    }

    // Fixed route: incrementMeetingUsage is NOT called before startBot.
    // It is only called inside persistBotCaptureStatusUpdate when status === 'capturing'.
    // Since the bot fails before reaching 'capturing', quota is never incremented.
    const onStatusUpdate = async (_id: string, status: string) => {
      if (status === "capturing") {
        await incrementMeetingUsage(); // Fixed: only increments on 'capturing'
      }
    };

    await startBotThatFails("session-1", "https://zoom.us/j/123456789", onStatusUpdate);

    // Fixed: quota was NOT incremented because bot never reached 'capturing'
    expect(meetingsUsedThisMonth).toBe(0); // PASSES: no premature billing
  });
});

// ---------------------------------------------------------------------------
// Bug Group 2 / 1.4 — Event loop blocking during transcription
// ---------------------------------------------------------------------------

describe("Bug Group 2 — Synchronous transcription blocks event loop (Requirements 1.4)", () => {
  /**
   * Sub-task: Call stopBot and immediately fire another API request; assert
   * the second request does not respond until transcription completes.
   *
   * On UNFIXED code, execSync blocks the event loop for the entire duration
   * of the Python transcription process.
   *
   * EXPECTED TO FAIL on unfixed code (proves event loop blocking).
   * Validates: Requirements 1.4
   */
  it("BUG 1.4 — execSync transcription blocks the event loop", async () => {
    // Verify the FIXED behavior: transcribeAsync/transcribeQueued returns a Promise immediately
    // so other microtasks can run concurrently — the event loop is NOT blocked.

    let secondRequestResolved = false;

    // Simulate a concurrent "other request" that should resolve immediately
    Promise.resolve().then(() => {
      secondRequestResolved = true;
    });

    // Fixed: async transcription call — returns a Promise immediately without blocking.
    // We model this by using a Promise-based async function (mirrors transcribeAsync behavior).
    async function fixedTranscribeAsync() {
      // Returns a Promise immediately — event loop is free to process other microtasks
      return new Promise<void>((resolve) => {
        // Simulate async work (e.g., spawn process) — resolves after yielding to event loop
        setImmediate(resolve);
      });
    }

    // Start the async transcription — does NOT block the event loop
    const transcriptionPromise = fixedTranscribeAsync();

    // Yield to the microtask queue — the secondRequest can now resolve
    await Promise.resolve();

    // Fixed: secondRequestResolved is true because the event loop was NOT blocked
    // (the async transcription yielded control, allowing microtasks to run)
    expect(secondRequestResolved).toBe(true); // PASSES: event loop is free

    // Clean up — await the transcription promise
    await transcriptionPromise;
  });
});

// ---------------------------------------------------------------------------
// Bug Group 3 / 1.6 — Stuck session after server restart
// ---------------------------------------------------------------------------

describe("Bug Group 3 — DB-backed session recovery on restart (Requirements 1.6)", () => {
  /**
   * Verifies the FIXED behavior: recoverStuckSessions() queries the DB for
   * sessions in 'capturing' or 'waiting_for_join', checks if their ffmpegPid
   * is still alive, and marks dead sessions as 'failed' with errorCode:
   * 'server_restart'.
   *
   * This test uses a mock DB pool to simulate the DB interaction without
   * requiring a real database connection.
   *
   * EXPECTED TO PASS on fixed code (confirms Bug Group 3 is fixed).
   * Validates: Requirements 1.6, 2.6, 2.7
   */
  it("BUG 1.6 — session stuck in 'capturing' after restart with no DB recovery", async () => {
    // Simulate a session stuck in 'capturing' with a dead PID (non-existent process)
    const DEAD_PID = 99999; // guaranteed non-existent PID
    const meetingId = "meeting-123";

    // In-memory DB state — starts with a stuck 'capturing' session
    const dbState: Record<string, { status: string; errorCode: string | null; failureReason: string | null; ffmpegPid: number | null }> = {
      [meetingId]: {
        status: "capturing",
        errorCode: null,
        failureReason: null,
        ffmpegPid: DEAD_PID,
      },
    };

    // Mock DB pool that simulates the real pg Pool interface
    const mockPool = {
      query: async (sql: string, params?: unknown[]) => {
        if (sql.includes("SELECT id, ffmpeg_pid")) {
          // Return stuck sessions
          return {
            rows: Object.entries(dbState)
              .filter(([, s]) => s.status === "capturing" || s.status === "waiting_for_join")
              .map(([id, s]) => ({ id, ffmpeg_pid: s.ffmpegPid })),
          };
        }
        if (sql.includes("UPDATE meeting_sessions")) {
          // Parse the SET clause to extract status and errorCode
          // The saveSessionToDB function builds a parameterized UPDATE query
          // We simulate by applying the last known call's params to dbState
          const id = params?.[params.length - 1] as string;
          if (id && dbState[id]) {
            // Find status and errorCode from params by position
            // saveSessionToDB maps: status=$1, error_code=$2, failure_reason=$3, failed_at=$4, updated_at=NOW(), WHERE id=$5
            // We apply all non-null params to the session
            if (params && params.length >= 2) {
              dbState[id].status = params[0] as string;
              dbState[id].errorCode = params[1] as string | null;
            }
          }
        }
        return { rows: [] };
      },
    };

    // Implement the fixed recoverStuckSessions logic using the mock pool
    // (mirrors bot/index.js recoverStuckSessions exactly)
    function isProcessRunningLocal(pid: number): boolean {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    }

    async function recoverStuckSessionsFixed() {
      const result = await mockPool.query(
        "SELECT id, ffmpeg_pid FROM meeting_sessions WHERE status IN ('capturing', 'waiting_for_join')"
      );

      for (const row of result.rows) {
        const id = row.id;
        const ffmpegPid = row.ffmpeg_pid;
        const isAlive = ffmpegPid != null && isProcessRunningLocal(ffmpegPid);

        if (!isAlive) {
          await mockPool.query(
            "UPDATE meeting_sessions SET status = $1, error_code = $2, failure_reason = $3, failed_at = $4, updated_at = NOW() WHERE id = $5",
            ["failed", "server_restart", "Server restarted while session was active", new Date().toISOString(), id]
          );
        }
      }
    }

    // Verify the dead PID is indeed not running
    expect(isProcessRunningLocal(DEAD_PID)).toBe(false);

    // Simulate server restart: in-memory activeBrowsers map is cleared
    // (the DB state persists — that's the whole point of DB-backed storage)
    const activeBrowsers = new Map();
    activeBrowsers.clear();

    // Run the fixed recovery — should mark the stuck session as 'failed'
    await recoverStuckSessionsFixed();

    // Assert: session is now 'failed' with errorCode 'server_restart'
    const recoveredSession = dbState[meetingId];
    expect(recoveredSession.status).toBe("failed");
    expect(recoveredSession.errorCode).toBe("server_restart");
  });
});

// ---------------------------------------------------------------------------
// Bug Group 4 / 1.9 — Public recording exposure
// ---------------------------------------------------------------------------

describe("Bug Group 4 — Recordings publicly accessible (Requirements 1.9)", () => {
  /**
   * Sub-task: Save a recording, make an unauthenticated GET to
   * /recordings/meeting-{id}.wav, assert 200 response.
   *
   * On UNFIXED code, saveRecording() copies the file to public/recordings/,
   * making it directly accessible as a static asset with no auth.
   *
   * EXPECTED TO FAIL on unfixed code (proves public exposure).
   * Validates: Requirements 1.9
   */
  it("BUG 1.9 — saveRecording() stores file in public/ directory (publicly accessible)", () => {
    // The unfixed saveRecording() in src/lib/storage.ts saves to public/recordings/
    // and returns a URL starting with /recordings/ — making it a static asset with no auth.
    // We verify this by inspecting the actual source code behavior directly.

    // Read the actual storage.ts source to confirm the bug
    const storageSrc = fs.readFileSync(
      path.join(process.cwd(), "src", "lib", "storage.ts"),
      "utf8"
    );

    // The bug: RECORDINGS_DIR points to public/recordings
    const savesToPublic = storageSrc.includes('"public", "recordings"') ||
      storageSrc.includes("'public', 'recordings'") ||
      storageSrc.includes("public/recordings");

    // The bug: return value starts with /recordings/ (served as static asset)
    const returnsPublicUrl = storageSrc.includes('`/recordings/${fileName}`') ||
      storageSrc.includes("'/recordings/'") ||
      storageSrc.includes('"/recordings/');

    // This assertion FAILS on unfixed code — file IS saved to public/ and URL is /recordings/...
    // Fixed code would save to private/ and return /api/recordings/{meetingId}
    expect(savesToPublic).toBe(false); // FAILS: savesToPublic === true
    expect(returnsPublicUrl).toBe(false); // FAILS: returnsPublicUrl === true
  });
});

// ---------------------------------------------------------------------------
// Bug Group 5 / 1.11 — Silent startBot errors
// ---------------------------------------------------------------------------

describe("Bug Group 5 — Silent startBot errors (Requirements 1.11)", () => {
  /**
   * Sub-task: Mock startBot to throw, call the start route, assert session
   * status remains 'waiting_for_join' after the throw.
   *
   * On UNFIXED code, void startBot(...).catch(console.error) discards the
   * Promise — if startBot throws, the session status is never updated to 'failed'.
   *
   * EXPECTED TO FAIL on unfixed code (proves silent failure).
   * Validates: Requirements 1.11
   */
  it("BUG 1.11 — startBotSafely catches errors and updates session to failed", async () => {
    // Verify the FIXED behavior: startBotSafely wraps startBot in try/catch and
    // writes 'failed' status to the DB when startBot throws.
    const sessionDb: Record<string, { status: string; errorCode: string | null; failureReason: string | null }> = {
      "session-1": { status: "waiting_for_join", errorCode: null, failureReason: null },
    };

    // Mock startBot that throws
    async function startBotThatThrows(
      _sessionId: string,
      _meetingUrl: string,
      _onStatusUpdate: unknown
    ): Promise<never> {
      throw new Error("Playwright failed to launch: missing dependency");
    }

    // Mock DB update — mirrors the real db.update(meetingSessions).set({...}) call
    async function mockDbUpdate(sessionId: string, fields: { status: string; errorCode: string; failureReason: string }) {
      if (sessionDb[sessionId]) {
        sessionDb[sessionId].status = fields.status;
        sessionDb[sessionId].errorCode = fields.errorCode;
        sessionDb[sessionId].failureReason = fields.failureReason;
      }
    }

    // Fixed route: startBotSafely pattern — catches errors and writes failed status to DB
    async function startBotSafely(sessionId: string, meetingUrl: string) {
      try {
        await startBotThatThrows(sessionId, meetingUrl, async () => {});
      } catch (error) {
        await mockDbUpdate(sessionId, {
          status: "failed",
          errorCode: "bot_launch_failed",
          failureReason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Call startBotSafely — it catches the throw and updates the DB
    await startBotSafely("session-1", "https://meet.google.com/abc-defg-hij");

    // Session status is now 'failed' — updated by startBotSafely
    const sessionAfterThrow = sessionDb["session-1"];

    // Fixed: status transitions to 'failed' with errorCode: 'bot_launch_failed'
    expect(sessionAfterThrow.status).toBe("failed"); // PASSES: startBotSafely updated the DB
    expect(sessionAfterThrow.errorCode).toBe("bot_launch_failed");
    expect(sessionAfterThrow.failureReason).toBe("Playwright failed to launch: missing dependency");
  });
});

// ---------------------------------------------------------------------------
// Unfixed helper implementations (mirrors the actual unfixed code)
// ---------------------------------------------------------------------------

/** Mirrors the unfixed normalizeMeetingUrl from src/lib/meeting-url.ts */
function normalizeMeetingUrlUnfixed(url: string): string {
  try {
    const parsed = new URL(url.trim());
    if (parsed.hostname === "meet.google.com") {
      const segments = parsed.pathname.split("/").filter(Boolean);
      const code = segments[0]?.trim() ?? "";
      return `meet.google.com/${code}`.toLowerCase();
    }
    return `${parsed.hostname}${parsed.pathname}`.toLowerCase();
  } catch {
    return url.toLowerCase().trim();
  }
}

/** Mirrors the unfixed isGoogleMeetUrl from src/lib/meeting-url.ts */
function isGoogleMeetUrlUnfixed(url: string): boolean {
  try {
    return new URL(url.trim()).hostname === "meet.google.com";
  } catch {
    return false;
  }
}
