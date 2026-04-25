"use strict";

/**
 * Unit tests for checkAudioLevel and startRecording in audioCapture.js
 *
 * Tests that:
 * - startRecording returns { success: false, errorCode: 'silent_audio_source' }
 *   when the ffmpeg probe reports a silent audio source
 * - startRecording proceeds to the main recording spawn when audio is active
 * - checkAudioLevel correctly parses RMS level from ffmpeg stderr output
 * - checkAudioLevel fails open (returns { level: null, isSilent: false }) on parse failure
 *
 * Validates: Requirements 2.6, 3.6
 */

const EventEmitter = require("node:events");

// ── Spawn mock infrastructure ─────────────────────────────────────────────────
// We queue handlers so each spawn() call consumes the next handler in line.

const spawnHandlers = [];

jest.mock("node:child_process", () => ({
  spawn: jest.fn(() => {
    const handler = spawnHandlers.shift();
    if (!handler) throw new Error("No spawn handler queued — did you forget to queue one?");
    return handler();
  }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal fake child_process with stdout, stderr, and event emitter.
 */
function makeFakeProc() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = jest.fn();
  return proc;
}

/**
 * Queue a probe spawn that emits the given stderr text then closes with code 0.
 */
function queueProbeOutput(stderrText) {
  spawnHandlers.push(() => {
    const proc = makeFakeProc();
    setImmediate(() => {
      proc.stderr.emit("data", stderrText);
      proc.emit("close", 0);
    });
    return proc;
  });
}

/**
 * Queue a probe spawn that closes without emitting any stderr (parse failure).
 */
function queueProbeNoOutput() {
  spawnHandlers.push(() => {
    const proc = makeFakeProc();
    setImmediate(() => {
      proc.emit("close", 0);
    });
    return proc;
  });
}

/**
 * Queue a main recording spawn that never exits on its own (simulates a
 * long-running ffmpeg recording process). startRecording resolves via the
 * STARTUP_WAIT_MS timeout, so we just need the process to stay alive.
 */
function queueRecordingSpawn() {
  spawnHandlers.push(() => {
    const proc = makeFakeProc();
    // Do not emit 'exit' or 'close' — the startup timeout will fire first
    return proc;
  });
}

// ── Sample ffmpeg astats stderr snippets ──────────────────────────────────────

const SILENT_PROBE_STDERR = `
ffmpeg version 6.0 Copyright (c) 2000-2023 the FFmpeg developers
  built with gcc 12
Input #0, pulse, from 'default':
  Duration: N/A, start: 0.000000, bitrate: 512 kb/s
    Stream #0:0: Audio: pcm_s16le, 44100 Hz, stereo, s16, 512 kb/s
[Parsed_astats_0 @ 0x...] Channel: 1
[Parsed_astats_0 @ 0x...] DC offset: -0.000001
[Parsed_astats_0 @ 0x...] Min level: -0.000031
[Parsed_astats_0 @ 0x...] Max level: 0.000031
[Parsed_astats_0 @ 0x...] Min difference: 0.000000
[Parsed_astats_0 @ 0x...] Max difference: 0.000031
[Parsed_astats_0 @ 0x...] Mean difference: 0.000000
[Parsed_astats_0 @ 0x...] RMS difference: 0.000000
[Parsed_astats_0 @ 0x...] Peak level dB: -90.308998
[Parsed_astats_0 @ 0x...] RMS level dB: -91.000000
[Parsed_astats_0 @ 0x...] RMS peak dB: -91.000000
[Parsed_astats_0 @ 0x...] RMS trough dB: -91.000000
[Parsed_astats_0 @ 0x...] Crest factor: 1.000000
[Parsed_astats_0 @ 0x...] Flat factor: 0.000000
[Parsed_astats_0 @ 0x...] Peak count: 0.000000
[Parsed_astats_0 @ 0x...] Noise floor dB: -91.000000
[Parsed_astats_0 @ 0x...] Noise floor count: 0.000000
[Parsed_astats_0 @ 0x...] Entropy: 0.000000
[Parsed_astats_0 @ 0x...] Number of samples: 88200
[Parsed_astats_0 @ 0x...] Overall
[Parsed_astats_0 @ 0x...] RMS level dB: -91.000000
`;

const ACTIVE_PROBE_STDERR = `
ffmpeg version 6.0 Copyright (c) 2000-2023 the FFmpeg developers
Input #0, pulse, from 'default':
  Duration: N/A, start: 0.000000, bitrate: 512 kb/s
    Stream #0:0: Audio: pcm_s16le, 44100 Hz, stereo, s16, 512 kb/s
[Parsed_astats_0 @ 0x...] Channel: 1
[Parsed_astats_0 @ 0x...] RMS level dB: -18.500000
[Parsed_astats_0 @ 0x...] Overall
[Parsed_astats_0 @ 0x...] RMS level dB: -18.500000
`;

// ── Module under test ─────────────────────────────────────────────────────────

// Force Linux platform so the audio-level check path is exercised
const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");

beforeAll(() => {
  Object.defineProperty(process, "platform", { value: "linux", configurable: true });
  process.env.MEETING_AUDIO_SOURCE = "test-monitor-source";
});

afterAll(() => {
  if (originalPlatform) {
    Object.defineProperty(process, "platform", originalPlatform);
  }
  delete process.env.MEETING_AUDIO_SOURCE;
});

const { startRecording, checkAudioLevel } = require("../audioCapture");

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  spawnHandlers.length = 0;
});

// ── checkAudioLevel unit tests ────────────────────────────────────────────────

describe("checkAudioLevel", () => {
  test("returns isSilent=true when RMS level is below -60 dBFS", async () => {
    queueProbeOutput(SILENT_PROBE_STDERR);

    const result = await checkAudioLevel("test-monitor-source");

    expect(result.isSilent).toBe(true);
    expect(result.level).toBeLessThan(-60);
  });

  test("returns isSilent=false when RMS level is above -60 dBFS", async () => {
    queueProbeOutput(ACTIVE_PROBE_STDERR);

    const result = await checkAudioLevel("test-monitor-source");

    expect(result.isSilent).toBe(false);
    expect(result.level).toBeGreaterThan(-60);
  });

  test("returns { level: null, isSilent: false } when stderr has no RMS level (fail open)", async () => {
    queueProbeNoOutput();

    const result = await checkAudioLevel("test-monitor-source");

    expect(result.level).toBeNull();
    expect(result.isSilent).toBe(false);
  });

  test("parses the correct numeric RMS value from stderr", async () => {
    queueProbeOutput(ACTIVE_PROBE_STDERR);

    const result = await checkAudioLevel("test-monitor-source");

    expect(result.level).toBeCloseTo(-18.5, 1);
  });

  test("handles -inf RMS level as -Infinity and marks it silent", async () => {
    const infStderr = `[Parsed_astats_0 @ 0x...] RMS level dB: -inf\n`;
    queueProbeOutput(infStderr);

    const result = await checkAudioLevel("test-monitor-source");

    expect(result.level).toBe(-Infinity);
    expect(result.isSilent).toBe(true);
  });
});

// ── startRecording integration tests ─────────────────────────────────────────

describe("startRecording — silent audio source", () => {
  test("returns { success: false, errorCode: 'silent_audio_source' } when probe detects silence", async () => {
    // First spawn = probe (silent output), no second spawn needed
    queueProbeOutput(SILENT_PROBE_STDERR);

    const result = await startRecording("test-meeting-silent");

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("silent_audio_source");
    expect(result.error).toBe("silent_audio_source");
  });

  test("does NOT spawn the main recording process when audio is silent", async () => {
    const { spawn } = require("node:child_process");
    queueProbeOutput(SILENT_PROBE_STDERR);

    await startRecording("test-meeting-no-main-spawn");

    // Only the probe spawn should have been called (once)
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});

describe("startRecording — active audio source", () => {
  test("proceeds to main recording spawn when probe detects active audio", async () => {
    const { spawn } = require("node:child_process");

    // First spawn = probe (active audio), second spawn = main recording
    queueProbeOutput(ACTIVE_PROBE_STDERR);
    queueRecordingSpawn();

    // startRecording is async: it awaits checkAudioLevel (which resolves via
    // setImmediate), then registers a setTimeout for STARTUP_WAIT_MS.
    // We use legacy fake timers and flush the event loop in stages.
    jest.useFakeTimers({ legacyFakeTimers: true });

    const recordingPromise = startRecording("test-meeting-active");

    // Flush setImmediate callbacks so the probe 'close' event fires and
    // checkAudioLevel resolves, allowing startRecording to register its
    // STARTUP_WAIT_MS setTimeout.
    jest.runAllImmediates();
    // Drain microtask queue (the awaited checkAudioLevel promise)
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Now the STARTUP_WAIT_MS setTimeout is registered — advance past it
    jest.advanceTimersByTime(3000);

    const result = await recordingPromise;

    jest.useRealTimers();

    // Two spawns: probe + main recording
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
  }, 15000);

  test("returns success with outputPath and ffmpeg process when audio is active", async () => {
    queueProbeOutput(ACTIVE_PROBE_STDERR);
    queueRecordingSpawn();

    jest.useFakeTimers({ legacyFakeTimers: true });

    const recordingPromise = startRecording("test-meeting-active-2");

    jest.runAllImmediates();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    jest.advanceTimersByTime(3000);

    const result = await recordingPromise;

    jest.useRealTimers();

    expect(result.success).toBe(true);
    expect(result.outputPath).toContain("test-meeting-active-2");
    expect(result.ffmpeg).toBeDefined();
  }, 15000);
});

describe("startRecording — probe failure (fail open)", () => {
  test("proceeds with recording when probe cannot parse RMS level", async () => {
    const { spawn } = require("node:child_process");

    // Probe returns no parseable output → fail open → proceed to recording
    queueProbeNoOutput();
    queueRecordingSpawn();

    jest.useFakeTimers({ legacyFakeTimers: true });

    const recordingPromise = startRecording("test-meeting-probe-fail");

    jest.runAllImmediates();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    jest.advanceTimersByTime(3000);

    const result = await recordingPromise;

    jest.useRealTimers();

    // Both probe and main recording spawns should have been called
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
  }, 15000);
});
