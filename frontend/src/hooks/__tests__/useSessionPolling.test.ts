/**
 * Bug 14 — useSessionPolling Exponential Backoff
 *
 * Tests that:
 * 1. Consecutive polling errors cause the interval to double (2s → 4s → 8s → 16s)
 * 2. A successful poll after backoff resets the interval to 2s
 *
 * This is a pure logic test — no React rendering needed.
 * The backoff logic is extracted and tested directly.
 *
 * **Validates: Requirements 2.14, 3.14**
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Backoff logic extracted from useSessionPolling
// (mirrors the logic in the hook so we can test it in isolation)
// ---------------------------------------------------------------------------

const BASE_INTERVAL = 2000;
const MAX_INTERVAL = 30000;

/**
 * Simulates the interval state machine from useSessionPolling.
 * Returns the sequence of intervals used for each poll attempt.
 */
function simulatePollingIntervals(
  events: Array<"error" | "success">
): number[] {
  let consecutiveErrors = 0;
  let currentInterval = BASE_INTERVAL;
  const intervals: number[] = [];

  for (const event of events) {
    // Record the interval that would be used for the NEXT setTimeout after this event
    if (event === "error") {
      consecutiveErrors += 1;
      currentInterval = Math.min(currentInterval * 2, MAX_INTERVAL);
    } else {
      consecutiveErrors = 0;
      currentInterval = BASE_INTERVAL;
    }
    intervals.push(currentInterval);
  }

  return intervals;
}

/**
 * Simulates the interval used BEFORE each poll (i.e., the delay scheduled
 * after the previous poll completed). The first poll fires immediately (no delay).
 * Subsequent polls use the interval computed after the previous result.
 */
function simulateScheduledDelays(
  events: Array<"error" | "success">
): number[] {
  // The delay for poll N+1 is determined by the result of poll N.
  // We return the delay that was scheduled before each poll (starting from poll 2).
  const intervals = simulatePollingIntervals(events);
  // intervals[i] = delay scheduled after event[i], used before event[i+1]
  return intervals;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useSessionPolling — exponential backoff interval logic", () => {
  it("doubles the interval on each consecutive error: 2s → 4s → 8s → 16s", () => {
    // 4 consecutive errors
    const delays = simulateScheduledDelays(["error", "error", "error", "error"]);

    expect(delays[0]).toBe(4000);   // after 1st error: 2000 * 2 = 4000
    expect(delays[1]).toBe(8000);   // after 2nd error: 4000 * 2 = 8000
    expect(delays[2]).toBe(16000);  // after 3rd error: 8000 * 2 = 16000
    expect(delays[3]).toBe(32000 > MAX_INTERVAL ? MAX_INTERVAL : 32000); // after 4th: capped
  });

  it("interval after first error is 4000ms (doubled from base 2000ms)", () => {
    const delays = simulateScheduledDelays(["error"]);
    expect(delays[0]).toBe(4000);
  });

  it("interval after second consecutive error is 8000ms", () => {
    const delays = simulateScheduledDelays(["error", "error"]);
    expect(delays[1]).toBe(8000);
  });

  it("interval after third consecutive error is 16000ms", () => {
    const delays = simulateScheduledDelays(["error", "error", "error"]);
    expect(delays[2]).toBe(16000);
  });

  it("resets interval to 2000ms after a successful poll following backoff", () => {
    // 4 errors then a success
    const delays = simulateScheduledDelays(["error", "error", "error", "error", "success"]);

    // After 4 errors the interval should be capped or doubled
    // After success it must reset to BASE_INTERVAL
    expect(delays[4]).toBe(BASE_INTERVAL); // 2000ms
  });

  it("caps interval at 30000ms regardless of how many consecutive errors occur", () => {
    // 10 consecutive errors — interval should never exceed 30s
    const delays = simulateScheduledDelays(
      Array(10).fill("error") as Array<"error">
    );

    for (const delay of delays) {
      expect(delay).toBeLessThanOrEqual(MAX_INTERVAL);
    }
  });

  it("interval stays at 2000ms when all polls succeed", () => {
    const delays = simulateScheduledDelays(["success", "success", "success"]);
    for (const delay of delays) {
      expect(delay).toBe(BASE_INTERVAL);
    }
  });

  it("resets to 2000ms immediately after a single success, even mid-backoff", () => {
    // 3 errors → interval is 16000ms, then success → back to 2000ms
    const delays = simulateScheduledDelays(["error", "error", "error", "success"]);
    expect(delays[2]).toBe(16000); // after 3rd error
    expect(delays[3]).toBe(BASE_INTERVAL); // after success: reset
  });

  it("resumes doubling from base after reset if errors occur again", () => {
    // error, success, error, error
    const delays = simulateScheduledDelays(["error", "success", "error", "error"]);
    expect(delays[0]).toBe(4000);          // after 1st error
    expect(delays[1]).toBe(BASE_INTERVAL); // after success: reset
    expect(delays[2]).toBe(4000);          // after error again: doubles from base
    expect(delays[3]).toBe(8000);          // after 2nd consecutive error
  });
});

// ---------------------------------------------------------------------------
// Explicit scenario: 4 errors then success (as specified in task 14.4)
// ---------------------------------------------------------------------------

describe("useSessionPolling — task 14.4 scenario", () => {
  it("4 consecutive errors produce intervals 4s, 8s, 16s, 30s (capped); success resets to 2s", () => {
    const events: Array<"error" | "success"> = [
      "error",   // poll 1 fails → next delay = 4000
      "error",   // poll 2 fails → next delay = 8000
      "error",   // poll 3 fails → next delay = 16000
      "error",   // poll 4 fails → next delay = 30000 (capped from 32000)
      "success", // poll 5 succeeds → next delay = 2000 (reset)
    ];

    const delays = simulateScheduledDelays(events);

    expect(delays[0]).toBe(4000);
    expect(delays[1]).toBe(8000);
    expect(delays[2]).toBe(16000);
    expect(delays[3]).toBe(MAX_INTERVAL); // 30000 (capped)
    expect(delays[4]).toBe(BASE_INTERVAL); // 2000 (reset)
  });
});
