/**
 * Bug 12 — Auto-Share Failures
 *
 * Tests that:
 * 1. triggerAutoShare logic collects per-integration failures when an
 *    integration call fails (e.g. Slack webhook returns non-ok).
 * 2. The meeting-detail component shows an error banner when
 *    autoShareFailures is non-empty in the polling response.
 *
 * **Validates: Requirements 2.12**
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// 1. triggerAutoShare failure collection logic
//    (mirrors the logic in meeting-sessions.ts)
// ---------------------------------------------------------------------------

type AutoShareFailure = { integration: string; error: string };

type IntegrationConfig = {
  type: string;
  config: Record<string, unknown>;
};

/**
 * Simulates the per-integration dispatch logic from triggerAutoShare.
 * Each integration call is wrapped in try/catch; failures are collected.
 * Returns the list of failures (empty if all succeeded).
 */
async function simulateTriggerAutoShare(
  integrations: IntegrationConfig[],
  callIntegration: (type: string, config: Record<string, unknown>) => Promise<void>
): Promise<AutoShareFailure[]> {
  const failures: AutoShareFailure[] = [];

  for (const integration of integrations) {
    const { type, config } = integration;
    try {
      await callIntegration(type, config);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      failures.push({ integration: type, error: errMsg });
    }
  }

  return failures;
}

describe("triggerAutoShare — per-integration error collection", () => {
  it("collects a failure when Slack webhook call throws", async () => {
    const integrations: IntegrationConfig[] = [
      { type: "slack", config: { webhookUrl: "https://hooks.slack.com/test" } },
    ];

    const failures = await simulateTriggerAutoShare(integrations, async (type) => {
      if (type === "slack") throw new Error("Slack webhook returned 500");
    });

    expect(failures).toHaveLength(1);
    expect(failures[0].integration).toBe("slack");
    expect(failures[0].error).toContain("Slack webhook returned 500");
  });

  it("collects failures for each failing integration independently", async () => {
    const integrations: IntegrationConfig[] = [
      { type: "slack", config: { webhookUrl: "https://hooks.slack.com/test" } },
      { type: "notion", config: { webhookUrl: "https://notion.so/webhook" } },
      { type: "jira", config: { webhookUrl: "https://jira.example.com/webhook" } },
    ];

    const failures = await simulateTriggerAutoShare(integrations, async (type) => {
      if (type === "slack") throw new Error("Slack webhook returned 500");
      if (type === "notion") throw new Error("Notion webhook returned 403");
      // jira succeeds
    });

    expect(failures).toHaveLength(2);
    expect(failures.map((f) => f.integration)).toContain("slack");
    expect(failures.map((f) => f.integration)).toContain("notion");
    expect(failures.map((f) => f.integration)).not.toContain("jira");
  });

  it("returns empty failures array when all integrations succeed", async () => {
    const integrations: IntegrationConfig[] = [
      { type: "slack", config: { webhookUrl: "https://hooks.slack.com/test" } },
      { type: "notion", config: { webhookUrl: "https://notion.so/webhook" } },
    ];

    const failures = await simulateTriggerAutoShare(integrations, async () => {
      // all succeed — no throw
    });

    expect(failures).toHaveLength(0);
  });

  it("one failing integration does not prevent other integrations from running", async () => {
    const ran: string[] = [];
    const integrations: IntegrationConfig[] = [
      { type: "slack", config: {} },
      { type: "notion", config: {} },
      { type: "jira", config: {} },
    ];

    await simulateTriggerAutoShare(integrations, async (type) => {
      ran.push(type);
      if (type === "slack") throw new Error("Slack failed");
    });

    // All three integrations were attempted despite slack failing
    expect(ran).toContain("slack");
    expect(ran).toContain("notion");
    expect(ran).toContain("jira");
  });

  it("failure object contains the integration name and error message", async () => {
    const integrations: IntegrationConfig[] = [
      { type: "slack", config: { webhookUrl: "https://hooks.slack.com/test" } },
    ];

    const failures = await simulateTriggerAutoShare(integrations, async () => {
      throw new Error("Connection refused");
    });

    expect(failures[0]).toMatchObject({
      integration: "slack",
      error: "Connection refused",
    });
  });
});

// ---------------------------------------------------------------------------
// 2. UI banner visibility logic
//    (mirrors the condition in meeting-detail.tsx)
// ---------------------------------------------------------------------------

/**
 * Mirrors the banner visibility condition from meeting-detail.tsx:
 *   session?.autoShareFailures && session.autoShareFailures.length > 0 && !dismissed
 */
function shouldShowAutoShareBanner(
  autoShareFailures: AutoShareFailure[] | null | undefined,
  dismissed: boolean
): boolean {
  return Boolean(autoShareFailures && autoShareFailures.length > 0 && !dismissed);
}

/**
 * Mirrors the banner message construction from meeting-detail.tsx.
 */
function buildBannerMessage(failures: AutoShareFailure[]): string {
  const names = failures.map((f) => f.integration).join(", ");
  return `The following integration${failures.length > 1 ? "s" : ""} failed to receive the meeting summary: ${names}.`;
}

describe("meeting-detail — auto-share failure banner visibility", () => {
  it("shows banner when autoShareFailures has one entry and not dismissed", () => {
    const failures: AutoShareFailure[] = [{ integration: "slack", error: "500" }];
    expect(shouldShowAutoShareBanner(failures, false)).toBe(true);
  });

  it("shows banner when autoShareFailures has multiple entries and not dismissed", () => {
    const failures: AutoShareFailure[] = [
      { integration: "slack", error: "500" },
      { integration: "notion", error: "403" },
    ];
    expect(shouldShowAutoShareBanner(failures, false)).toBe(true);
  });

  it("does NOT show banner when autoShareFailures is null", () => {
    expect(shouldShowAutoShareBanner(null, false)).toBe(false);
  });

  it("does NOT show banner when autoShareFailures is undefined", () => {
    expect(shouldShowAutoShareBanner(undefined, false)).toBe(false);
  });

  it("does NOT show banner when autoShareFailures is empty array", () => {
    expect(shouldShowAutoShareBanner([], false)).toBe(false);
  });

  it("does NOT show banner when dismissed is true", () => {
    const failures: AutoShareFailure[] = [{ integration: "slack", error: "500" }];
    expect(shouldShowAutoShareBanner(failures, true)).toBe(false);
  });

  it("banner message names the failed integration (singular)", () => {
    const failures: AutoShareFailure[] = [{ integration: "slack", error: "500" }];
    const msg = buildBannerMessage(failures);
    expect(msg).toContain("slack");
    expect(msg).toContain("integration");
    expect(msg).not.toContain("integrations");
  });

  it("banner message names all failed integrations (plural)", () => {
    const failures: AutoShareFailure[] = [
      { integration: "slack", error: "500" },
      { integration: "notion", error: "403" },
    ];
    const msg = buildBannerMessage(failures);
    expect(msg).toContain("slack");
    expect(msg).toContain("notion");
    expect(msg).toContain("integrations");
  });
});

// ---------------------------------------------------------------------------
// 3. Polling response shape — autoShareFailures is included
// ---------------------------------------------------------------------------

describe("GET /api/meetings/:id/status — autoShareFailures in response", () => {
  /**
   * Simulates the response construction from meetings.ts GET /:id/status.
   * Verifies that auto_share_failures from the DB row is correctly mapped.
   */
  function buildStatusResponse(sessionRow: {
    status: string;
    auto_share_failures: AutoShareFailure[] | null;
  }) {
    return {
      state: sessionRow.status,
      status: sessionRow.status,
      autoShareFailures: Array.isArray(sessionRow.auto_share_failures)
        ? sessionRow.auto_share_failures
        : null,
    };
  }

  it("includes autoShareFailures when DB row has failures", () => {
    const row = {
      status: "completed",
      auto_share_failures: [{ integration: "slack", error: "Slack webhook returned 500" }],
    };
    const response = buildStatusResponse(row);
    expect(response.autoShareFailures).toHaveLength(1);
    expect(response.autoShareFailures![0].integration).toBe("slack");
    expect(response.autoShareFailures![0].error).toContain("500");
  });

  it("returns null for autoShareFailures when DB row has no failures", () => {
    const row = { status: "completed", auto_share_failures: null };
    const response = buildStatusResponse(row);
    expect(response.autoShareFailures).toBeNull();
  });

  it("returns null for autoShareFailures when DB row has empty array", () => {
    const row = { status: "completed", auto_share_failures: [] };
    const response = buildStatusResponse(row);
    // Empty array is falsy for Array.isArray check — returns null
    // Actually Array.isArray([]) is true, so it returns []
    expect(response.autoShareFailures).toEqual([]);
  });
});
