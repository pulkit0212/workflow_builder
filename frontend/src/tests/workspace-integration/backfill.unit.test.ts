/**
 * Unit Tests: Backfill Script
 *
 * Verifies that the backfill logic:
 * 1. Updates meeting_sessions rows with NULL workspaceId to the user's first active workspace
 * 2. Updates action_items rows with NULL workspaceId to the user's first active workspace
 * 3. Skips users who have no active workspace and logs a warning
 *
 * Validates: Requirements 1.6, 1.7, 2.5
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Types ─────────────────────────────────────────────────────────────────────

type MeetingRow = {
  id: string;
  userId: string;
  workspaceId: string | null;
};

type ActionItemRow = {
  id: string;
  userId: string;
  meetingId: string | null;
  workspaceId: string | null;
};

type WorkspaceMembership = {
  userId: string;
  workspaceId: string;
  status: "active" | "pending" | "removed";
  createdAt: Date;
};

// ── Pure backfill logic (mirrors scripts/backfill-workspace.ts) ───────────────

/**
 * Returns the workspaceId of the user's first active workspace, or null.
 */
function getFirstActiveWorkspaceId(
  memberships: WorkspaceMembership[],
  userId: string
): string | null {
  const active = memberships
    .filter((m) => m.userId === userId && m.status === "active")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return active[0]?.workspaceId ?? null;
}

type BackfillResult = {
  updated: string[];   // ids of rows that were updated
  skipped: string[];   // userIds that were skipped (no workspace)
  warnings: string[];  // warning messages emitted
};

/**
 * Pure backfill logic for meeting_sessions.
 * Returns which rows were updated and which users were skipped.
 */
function backfillMeetings(
  meetings: MeetingRow[],
  memberships: WorkspaceMembership[],
  warn: (msg: string) => void
): { rows: MeetingRow[]; result: BackfillResult } {
  const nullRows = meetings.filter((m) => m.workspaceId === null);
  const uniqueUserIds = [...new Set(nullRows.map((r) => r.userId))];

  const updated: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];

  const rows = meetings.map((m) => ({ ...m })); // clone

  for (const userId of uniqueUserIds) {
    const workspaceId = getFirstActiveWorkspaceId(memberships, userId);
    if (!workspaceId) {
      const msg = `[Backfill] No active workspace found for user ${userId} — skipping their meetings.`;
      warn(msg);
      warnings.push(msg);
      skipped.push(userId);
      continue;
    }

    for (const row of rows) {
      if (row.userId === userId && row.workspaceId === null) {
        row.workspaceId = workspaceId;
        updated.push(row.id);
      }
    }
  }

  return { rows, result: { updated, skipped, warnings } };
}

/**
 * Pure backfill logic for action_items.
 * First tries to inherit workspaceId from the associated meeting_session,
 * then falls back to the user's first active workspace.
 */
function backfillActionItems(
  items: ActionItemRow[],
  meetings: MeetingRow[],
  memberships: WorkspaceMembership[],
  warn: (msg: string) => void
): { rows: ActionItemRow[]; result: BackfillResult } {
  const nullRows = items.filter((i) => i.workspaceId === null);

  const updated: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];

  const rows = items.map((i) => ({ ...i })); // clone

  for (const item of nullRows) {
    let workspaceId: string | null = null;

    // Try to inherit from the associated meeting
    if (item.meetingId) {
      const meeting = meetings.find((m) => m.id === item.meetingId);
      workspaceId = meeting?.workspaceId ?? null;
    }

    // Fall back to user's first active workspace
    if (!workspaceId) {
      workspaceId = getFirstActiveWorkspaceId(memberships, item.userId);
    }

    if (!workspaceId) {
      const msg = `[Backfill] No active workspace found for action item ${item.id} (user ${item.userId}) — skipping.`;
      warn(msg);
      warnings.push(msg);
      skipped.push(item.userId);
      continue;
    }

    const target = rows.find((r) => r.id === item.id)!;
    target.workspaceId = workspaceId;
    updated.push(item.id);
  }

  return { rows, result: { updated, skipped, warnings } };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_A = "user-aaaa-0000-0000-000000000001";
const USER_B = "user-bbbb-0000-0000-000000000002";
const USER_C = "user-cccc-0000-0000-000000000003"; // no workspace

const WS_1 = "ws-1111-0000-0000-000000000001";
const WS_2 = "ws-2222-0000-0000-000000000002";

const memberships: WorkspaceMembership[] = [
  { userId: USER_A, workspaceId: WS_1, status: "active", createdAt: new Date("2024-01-01") },
  { userId: USER_A, workspaceId: WS_2, status: "active", createdAt: new Date("2024-02-01") },
  { userId: USER_B, workspaceId: WS_2, status: "active", createdAt: new Date("2024-01-15") },
  // USER_C has no active memberships
  { userId: USER_C, workspaceId: WS_1, status: "removed", createdAt: new Date("2024-01-01") },
];

// ── Tests: meeting_sessions backfill ──────────────────────────────────────────

describe("backfillMeetings", () => {
  it("updates rows with NULL workspaceId to the user's first active workspace", () => {
    const meetings: MeetingRow[] = [
      { id: "m1", userId: USER_A, workspaceId: null },
      { id: "m2", userId: USER_A, workspaceId: null },
      { id: "m3", userId: USER_B, workspaceId: null },
    ];

    const warn = vi.fn();
    const { rows, result } = backfillMeetings(meetings, memberships, warn);

    // All three rows should be updated
    expect(result.updated).toHaveLength(3);
    expect(result.updated).toContain("m1");
    expect(result.updated).toContain("m2");
    expect(result.updated).toContain("m3");

    // USER_A's meetings → WS_1 (earliest active membership)
    expect(rows.find((r) => r.id === "m1")?.workspaceId).toBe(WS_1);
    expect(rows.find((r) => r.id === "m2")?.workspaceId).toBe(WS_1);

    // USER_B's meeting → WS_2
    expect(rows.find((r) => r.id === "m3")?.workspaceId).toBe(WS_2);

    // No warnings for users with workspaces
    expect(warn).not.toHaveBeenCalled();
  });

  it("skips users with no active workspace and logs a warning", () => {
    const meetings: MeetingRow[] = [
      { id: "m1", userId: USER_C, workspaceId: null },
      { id: "m2", userId: USER_C, workspaceId: null },
    ];

    const warn = vi.fn();
    const { rows, result } = backfillMeetings(meetings, memberships, warn);

    // No rows updated
    expect(result.updated).toHaveLength(0);

    // USER_C is in skipped list
    expect(result.skipped).toContain(USER_C);

    // workspaceId remains null
    expect(rows.find((r) => r.id === "m1")?.workspaceId).toBeNull();
    expect(rows.find((r) => r.id === "m2")?.workspaceId).toBeNull();

    // Warning was emitted
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain(USER_C);
  });

  it("does not touch rows that already have a workspaceId", () => {
    const meetings: MeetingRow[] = [
      { id: "m1", userId: USER_A, workspaceId: WS_2 }, // already set
      { id: "m2", userId: USER_A, workspaceId: null },
    ];

    const warn = vi.fn();
    const { rows, result } = backfillMeetings(meetings, memberships, warn);

    // Only m2 should be updated
    expect(result.updated).toEqual(["m2"]);

    // m1 keeps its original workspaceId
    expect(rows.find((r) => r.id === "m1")?.workspaceId).toBe(WS_2);

    // m2 gets USER_A's first active workspace
    expect(rows.find((r) => r.id === "m2")?.workspaceId).toBe(WS_1);
  });

  it("handles a mix of users — some with workspaces, some without", () => {
    const meetings: MeetingRow[] = [
      { id: "m1", userId: USER_A, workspaceId: null },
      { id: "m2", userId: USER_C, workspaceId: null }, // no workspace
      { id: "m3", userId: USER_B, workspaceId: null },
    ];

    const warn = vi.fn();
    const { rows, result } = backfillMeetings(meetings, memberships, warn);

    expect(result.updated).toContain("m1");
    expect(result.updated).toContain("m3");
    expect(result.updated).not.toContain("m2");

    expect(result.skipped).toContain(USER_C);
    expect(warn).toHaveBeenCalledOnce();

    expect(rows.find((r) => r.id === "m2")?.workspaceId).toBeNull();
  });

  it("returns empty result when there are no NULL rows", () => {
    const meetings: MeetingRow[] = [
      { id: "m1", userId: USER_A, workspaceId: WS_1 },
    ];

    const warn = vi.fn();
    const { result } = backfillMeetings(meetings, memberships, warn);

    expect(result.updated).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(warn).not.toHaveBeenCalled();
  });
});

// ── Tests: action_items backfill ──────────────────────────────────────────────

describe("backfillActionItems", () => {
  const meetingRows: MeetingRow[] = [
    { id: "meeting-1", userId: USER_A, workspaceId: WS_1 },
    { id: "meeting-2", userId: USER_B, workspaceId: WS_2 },
    { id: "meeting-3", userId: USER_A, workspaceId: null }, // meeting itself not yet backfilled
  ];

  it("updates action items with NULL workspaceId to the user's first active workspace", () => {
    const items: ActionItemRow[] = [
      { id: "ai1", userId: USER_A, meetingId: null, workspaceId: null },
      { id: "ai2", userId: USER_B, meetingId: null, workspaceId: null },
    ];

    const warn = vi.fn();
    const { rows, result } = backfillActionItems(items, meetingRows, memberships, warn);

    expect(result.updated).toContain("ai1");
    expect(result.updated).toContain("ai2");

    expect(rows.find((r) => r.id === "ai1")?.workspaceId).toBe(WS_1);
    expect(rows.find((r) => r.id === "ai2")?.workspaceId).toBe(WS_2);
    expect(warn).not.toHaveBeenCalled();
  });

  it("inherits workspaceId from the associated meeting when available", () => {
    const items: ActionItemRow[] = [
      { id: "ai1", userId: USER_A, meetingId: "meeting-1", workspaceId: null },
      { id: "ai2", userId: USER_B, meetingId: "meeting-2", workspaceId: null },
    ];

    const warn = vi.fn();
    const { rows, result } = backfillActionItems(items, meetingRows, memberships, warn);

    expect(result.updated).toContain("ai1");
    expect(result.updated).toContain("ai2");

    // Inherits from meeting, not from user's first workspace
    expect(rows.find((r) => r.id === "ai1")?.workspaceId).toBe(WS_1);
    expect(rows.find((r) => r.id === "ai2")?.workspaceId).toBe(WS_2);
  });

  it("falls back to user's first active workspace when meeting has no workspaceId", () => {
    const items: ActionItemRow[] = [
      // meeting-3 has workspaceId = null, so should fall back to user membership
      { id: "ai1", userId: USER_A, meetingId: "meeting-3", workspaceId: null },
    ];

    const warn = vi.fn();
    const { rows, result } = backfillActionItems(items, meetingRows, memberships, warn);

    expect(result.updated).toContain("ai1");
    // Falls back to USER_A's first active workspace
    expect(rows.find((r) => r.id === "ai1")?.workspaceId).toBe(WS_1);
  });

  it("skips users with no active workspace and logs a warning", () => {
    const items: ActionItemRow[] = [
      { id: "ai1", userId: USER_C, meetingId: null, workspaceId: null },
    ];

    const warn = vi.fn();
    const { rows, result } = backfillActionItems(items, meetingRows, memberships, warn);

    expect(result.updated).toHaveLength(0);
    expect(result.skipped).toContain(USER_C);
    expect(rows.find((r) => r.id === "ai1")?.workspaceId).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain(USER_C);
  });

  it("does not touch rows that already have a workspaceId", () => {
    const items: ActionItemRow[] = [
      { id: "ai1", userId: USER_A, meetingId: null, workspaceId: WS_2 }, // already set
      { id: "ai2", userId: USER_A, meetingId: null, workspaceId: null },
    ];

    const warn = vi.fn();
    const { rows, result } = backfillActionItems(items, meetingRows, memberships, warn);

    expect(result.updated).toEqual(["ai2"]);
    expect(rows.find((r) => r.id === "ai1")?.workspaceId).toBe(WS_2);
    expect(rows.find((r) => r.id === "ai2")?.workspaceId).toBe(WS_1);
  });

  it("returns empty result when there are no NULL rows", () => {
    const items: ActionItemRow[] = [
      { id: "ai1", userId: USER_A, meetingId: null, workspaceId: WS_1 },
    ];

    const warn = vi.fn();
    const { result } = backfillActionItems(items, meetingRows, memberships, warn);

    expect(result.updated).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(warn).not.toHaveBeenCalled();
  });
});

// ── Tests: getFirstActiveWorkspaceId ─────────────────────────────────────────

describe("getFirstActiveWorkspaceId", () => {
  it("returns the earliest active workspace for a user", () => {
    const result = getFirstActiveWorkspaceId(memberships, USER_A);
    // USER_A has WS_1 (Jan 1) and WS_2 (Feb 1) — should return WS_1
    expect(result).toBe(WS_1);
  });

  it("returns null when user has no active memberships", () => {
    const result = getFirstActiveWorkspaceId(memberships, USER_C);
    expect(result).toBeNull();
  });

  it("returns null for an unknown userId", () => {
    const result = getFirstActiveWorkspaceId(memberships, "unknown-user");
    expect(result).toBeNull();
  });

  it("ignores non-active memberships", () => {
    const mems: WorkspaceMembership[] = [
      { userId: USER_A, workspaceId: WS_1, status: "removed", createdAt: new Date("2024-01-01") },
      { userId: USER_A, workspaceId: WS_2, status: "pending", createdAt: new Date("2024-02-01") },
    ];
    const result = getFirstActiveWorkspaceId(mems, USER_A);
    expect(result).toBeNull();
  });
});
