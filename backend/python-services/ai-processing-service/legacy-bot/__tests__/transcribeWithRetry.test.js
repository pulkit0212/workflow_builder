"use strict";

/**
 * Unit test for transcribeWithRetry in index.js
 *
 * Tests that transcribeWithRetry retries transcribeAsync on failure and
 * returns the successful result on the third attempt.
 *
 * Validates: Requirements 2.7
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

// ── Replace global setTimeout with a zero-delay version before loading index ──
// transcribeWithRetry uses `setTimeout(r, 2000 * Math.pow(2, attempt))` for backoff.
// We replace it with an immediate resolver so tests don't wait for real delays.
const realSetTimeout = global.setTimeout;
global.setTimeout = (fn, _delay, ...args) => realSetTimeout(fn, 0, ...args);

// ── Mock node:child_process spawn to control transcribeAsync behaviour ────────
// transcribeAsync uses spawn internally. We control the mock per-call via a
// queue of handlers so we can simulate fail-fail-succeed sequences.

const spawnHandlers = [];

jest.mock("node:child_process", () => ({
  spawn: jest.fn(() => {
    const handler = spawnHandlers.shift();
    if (!handler) throw new Error("No spawn handler queued");
    return handler();
  }),
}));

/**
 * Helper: push a handler that makes spawn emit a successful transcription.
 */
function queueSpawnSuccess(transcript = '{"transcript":"Hello world","error":null}') {
  spawnHandlers.push(() => {
    const EventEmitter = require("node:events");
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const proc = new EventEmitter();
    proc.stdout = stdout;
    proc.stderr = stderr;

    setImmediate(() => {
      stdout.emit("data", transcript);
      proc.emit("close", 0);
    });

    return proc;
  });
}

/**
 * Helper: push a handler that makes spawn emit a failure (non-zero exit).
 */
function queueSpawnFailure(errorMsg = "Transient error") {
  spawnHandlers.push(() => {
    const EventEmitter = require("node:events");
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const proc = new EventEmitter();
    proc.stdout = stdout;
    proc.stderr = stderr;

    setImmediate(() => {
      stderr.emit("data", errorMsg);
      proc.emit("close", 1);
    });

    return proc;
  });
}

// Set DATABASE_URL so dbPool is created (non-null)
process.env.DATABASE_URL = "postgresql://test:test@localhost/test";

// ── Load the module under test ────────────────────────────────────────────────

const { transcribeWithRetry } = require("../index");

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  spawnHandlers.length = 0;
});

describe("transcribeWithRetry", () => {
  test("returns successful result on third attempt when first two fail", async () => {
    const successResult = '{"transcript":"Hello world","error":null}';

    queueSpawnFailure("Transient error on attempt 1");
    queueSpawnFailure("Transient error on attempt 2");
    queueSpawnSuccess(successResult);

    const result = await transcribeWithRetry("/fake/audio.wav");

    expect(result).toBe(successResult);
  });

  test("calls spawn (transcribeAsync) exactly 3 times when first two attempts fail", async () => {
    const { spawn } = require("node:child_process");
    const successResult = '{"transcript":"Meeting notes","error":null}';

    queueSpawnFailure("Network timeout");
    queueSpawnFailure("Network timeout");
    queueSpawnSuccess(successResult);

    await transcribeWithRetry("/fake/audio.wav");

    expect(spawn).toHaveBeenCalledTimes(3);
  });

  test("throws after exhausting all retries when every attempt fails", async () => {
    queueSpawnFailure("Persistent failure");
    queueSpawnFailure("Persistent failure");
    queueSpawnFailure("Persistent failure");

    await expect(transcribeWithRetry("/fake/audio.wav")).rejects.toThrow("Persistent failure");
  });

  test("returns result immediately on first attempt without retrying", async () => {
    const { spawn } = require("node:child_process");
    const successResult = '{"transcript":"Quick success","error":null}';

    queueSpawnSuccess(successResult);

    const result = await transcribeWithRetry("/fake/audio.wav");

    expect(result).toBe(successResult);
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});
