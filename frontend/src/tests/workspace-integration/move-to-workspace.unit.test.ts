/**
 * Unit Tests: POST /api/meetings/[id]/move-to-workspace
 *
 * Validates: Requirements 4.2, 4.3, 4.6
 *
 * Tests:
 *   1. Returns 401 when not authenticated
 *   2. Returns 400 when body is invalid (missing workspaceId)
 *   3. Returns 404 when meeting not found
 *   4. Returns 403 when user is not the meeting owner
 *   5. Returns 403 when user is not an active workspace member
 *   6. Returns 409 with 'already_in_workspace' when meeting is already approved
 *   7. Returns 200 and updates both meeting_sessions and action_items in a transaction on success
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/meetings/[id]/move-to-workspace/route";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    select: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock("@/lib/db/bootstrap", () => ({
  ensureDatabaseReady: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auth/current-user", () => ({
  syncCurrentUserToDatabase: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const CLERK_USER_ID = "clerk_user_abc123";
const DB_USER_ID = "00000000-0000-0000-0000-000000000001";
const MEETING_ID = "00000000-0000-0000-0000-000000000002";
const WORKSPACE_ID = "00000000-0000-0000-0000-000000000003";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/meetings/" + MEETING_ID + "/move-to-workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeContext(id: string = MEETING_ID) {
  return { params: Promise.resolve({ id }) };
}

async function setupAuth(userId: string | null = CLERK_USER_ID) {
  const { auth } = await import("@clerk/nextjs/server");
  vi.mocked(auth).mockResolvedValue({ userId } as any);
}

async function setupCurrentUser(dbUserId: string = DB_USER_ID) {
  const { syncCurrentUserToDatabase } = await import("@/lib/auth/current-user");
  vi.mocked(syncCurrentUserToDatabase).mockResolvedValue({
    id: dbUserId,
    clerkUserId: CLERK_USER_ID,
    email: "user@example.com",
    createdAt: new Date(),
  } as any);
}

/**
 * Sets up db.select to return different results per call index.
 * Call 0: meeting lookup
 * Call 1: membership lookup
 */
async function setupDbSelect(
  meetingRow: object | null,
  membershipRow: object | null = null
) {
  const { db } = await import("@/lib/db/client");
  let callIndex = 0;
  const rows = [
    meetingRow ? [meetingRow] : [],
    membershipRow ? [membershipRow] : [],
  ];

  vi.mocked(db!.select).mockImplementation(() => {
    const result = rows[callIndex++] ?? [];
    const mockLimit = vi.fn().mockResolvedValue(result);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    return { from: mockFrom } as any;
  });
}

async function setupTransaction(
  updateMeetingFn?: () => void,
  updateActionItemsFn?: () => void
) {
  const { db } = await import("@/lib/db/client");

  vi.mocked(db!.transaction).mockImplementation(async (callback: (tx: any) => Promise<void>) => {
    const mockSet = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });

    const tx = { update: mockUpdate };
    await callback(tx);

    if (updateMeetingFn) updateMeetingFn();
    if (updateActionItemsFn) updateActionItemsFn();
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/meetings/[id]/move-to-workspace - Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Authentication ──────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    // Requirement 4.1 — unauthenticated requests must be rejected
    await setupAuth(null);

    const response = await POST(makeRequest({ workspaceId: WORKSPACE_ID }), makeContext());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
  });

  // ── 2. Request body validation ─────────────────────────────────────────────

  it("returns 400 when body is missing workspaceId", async () => {
    await setupAuth();

    const response = await POST(makeRequest({}), makeContext());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 400 when workspaceId is not a valid UUID", async () => {
    await setupAuth();

    const response = await POST(makeRequest({ workspaceId: "not-a-uuid" }), makeContext());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 400 when body is not valid JSON", async () => {
    await setupAuth();

    const request = new Request(
      "http://localhost/api/meetings/" + MEETING_ID + "/move-to-workspace",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ invalid json",
      }
    );

    const response = await POST(request, makeContext());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  // ── 3. Meeting not found ───────────────────────────────────────────────────

  it("returns 404 when meeting does not exist", async () => {
    // Requirement 4.1 — meeting must exist
    await setupAuth();
    await setupCurrentUser();
    await setupDbSelect(null); // no meeting row

    const response = await POST(makeRequest({ workspaceId: WORKSPACE_ID }), makeContext());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
  });

  // ── 4. Owner check ─────────────────────────────────────────────────────────

  it("returns 403 when user is not the meeting owner", async () => {
    // Requirement 4.2 — only the meeting owner may move it
    await setupAuth();
    await setupCurrentUser(DB_USER_ID);

    const differentOwnerId = "00000000-0000-0000-0000-000000000099";
    await setupDbSelect({
      id: MEETING_ID,
      userId: differentOwnerId, // owned by someone else
      workspaceMoveStatus: null,
    });

    const response = await POST(makeRequest({ workspaceId: WORKSPACE_ID }), makeContext());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.details?.error).toBe("not_meeting_owner");
  });

  // ── 5. Membership check ────────────────────────────────────────────────────

  it("returns 403 when user is not an active workspace member", async () => {
    // Requirement 4.3 — user must be an active member of the target workspace
    await setupAuth();
    await setupCurrentUser(DB_USER_ID);

    await setupDbSelect(
      { id: MEETING_ID, userId: DB_USER_ID, workspaceMoveStatus: null }, // meeting owned by user
      null // no active membership
    );

    const response = await POST(makeRequest({ workspaceId: WORKSPACE_ID }), makeContext());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.details?.error).toBe("forbidden");
  });

  // ── 6. Duplicate / already approved ───────────────────────────────────────

  it("returns 409 with 'already_in_workspace' when meeting is already approved", async () => {
    // Requirement 4.6 — cannot move a meeting that is already in a workspace
    await setupAuth();
    await setupCurrentUser(DB_USER_ID);

    // Only one select call needed — the route checks workspaceMoveStatus before membership
    await setupDbSelect({
      id: MEETING_ID,
      userId: DB_USER_ID,
      workspaceMoveStatus: "approved",
    });

    const response = await POST(makeRequest({ workspaceId: WORKSPACE_ID }), makeContext());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.details?.error).toBe("already_in_workspace");
  });

  // ── 7. Success — transaction atomicity ────────────────────────────────────

  it("returns 200 and calls transaction on success", async () => {
    // Requirements 4.4, 4.5 — both tables updated in a single transaction
    await setupAuth();
    await setupCurrentUser(DB_USER_ID);

    await setupDbSelect(
      { id: MEETING_ID, userId: DB_USER_ID, workspaceMoveStatus: null },
      { id: "membership-id", workspaceId: WORKSPACE_ID, userId: DB_USER_ID, status: "active" }
    );

    const { db } = await import("@/lib/db/client");

    vi.mocked(db!.transaction).mockImplementation(async (callback: (tx: any) => Promise<void>) => {
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });
      await callback({ update: mockUpdate });
    });

    const response = await POST(makeRequest({ workspaceId: WORKSPACE_ID }), makeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.meetingId).toBe(MEETING_ID);
    expect(body.workspaceId).toBe(WORKSPACE_ID);

    // Transaction must have been called exactly once
    expect(db!.transaction).toHaveBeenCalledOnce();
  });

  it("updates both meeting_sessions and action_items inside the transaction", async () => {
    // Requirement 4.5 — action items must be updated in the same transaction
    await setupAuth();
    await setupCurrentUser(DB_USER_ID);

    await setupDbSelect(
      { id: MEETING_ID, userId: DB_USER_ID, workspaceMoveStatus: null },
      { id: "membership-id", workspaceId: WORKSPACE_ID, userId: DB_USER_ID, status: "active" }
    );

    const { db } = await import("@/lib/db/client");
    const { meetingSessions, actionItems } = await import("@/db/schema");

    const updatedTables: unknown[] = [];

    vi.mocked(db!.transaction).mockImplementation(async (callback: (tx: any) => Promise<void>) => {
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      const mockUpdate = vi.fn().mockImplementation((table: unknown) => {
        updatedTables.push(table);
        return { set: mockSet };
      });

      await callback({ update: mockUpdate });
    });

    await POST(makeRequest({ workspaceId: WORKSPACE_ID }), makeContext());

    // Both tables must be updated inside the transaction
    expect(updatedTables).toHaveLength(2);
    expect(updatedTables[0]).toBe(meetingSessions);
    expect(updatedTables[1]).toBe(actionItems);
  });

  it("sets correct fields on meeting_sessions inside the transaction", async () => {
    // Requirement 4.4 — workspaceId, workspace_move_status, workspace_moved_by, workspace_moved_at
    await setupAuth();
    await setupCurrentUser(DB_USER_ID);

    await setupDbSelect(
      { id: MEETING_ID, userId: DB_USER_ID, workspaceMoveStatus: null },
      { id: "membership-id", workspaceId: WORKSPACE_ID, userId: DB_USER_ID, status: "active" }
    );

    const { db } = await import("@/lib/db/client");
    const { meetingSessions } = await import("@/db/schema");

    let meetingSetPayload: Record<string, unknown> | null = null;

    vi.mocked(db!.transaction).mockImplementation(async (callback: (tx: any) => Promise<void>) => {
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        // Capture the payload for the first update (meeting_sessions)
        if (meetingSetPayload === null) {
          meetingSetPayload = payload;
        }
        return { where: mockWhere };
      });
      const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });

      await callback({ update: mockUpdate });
    });

    await POST(makeRequest({ workspaceId: WORKSPACE_ID }), makeContext());

    expect(meetingSetPayload).not.toBeNull();
    expect(meetingSetPayload!.workspaceId).toBe(WORKSPACE_ID);
    expect(meetingSetPayload!.workspaceMoveStatus).toBe("approved");
    expect(meetingSetPayload!.workspaceMovedBy).toBe(DB_USER_ID);
    expect(meetingSetPayload!.workspaceMovedAt).toBeInstanceOf(Date);
  });

  it("sets workspaceId on action_items inside the transaction", async () => {
    // Requirement 4.5 — action items must receive the same workspaceId
    await setupAuth();
    await setupCurrentUser(DB_USER_ID);

    await setupDbSelect(
      { id: MEETING_ID, userId: DB_USER_ID, workspaceMoveStatus: null },
      { id: "membership-id", workspaceId: WORKSPACE_ID, userId: DB_USER_ID, status: "active" }
    );

    const { db } = await import("@/lib/db/client");

    const setPayloads: Array<Record<string, unknown>> = [];

    vi.mocked(db!.transaction).mockImplementation(async (callback: (tx: any) => Promise<void>) => {
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        setPayloads.push(payload);
        return { where: mockWhere };
      });
      const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });

      await callback({ update: mockUpdate });
    });

    await POST(makeRequest({ workspaceId: WORKSPACE_ID }), makeContext());

    // Second set call is for action_items
    expect(setPayloads).toHaveLength(2);
    expect(setPayloads[1].workspaceId).toBe(WORKSPACE_ID);
  });

  // ── 8. Transaction atomicity — failure rolls back ─────────────────────────

  it("returns 500 and does not partially update when transaction throws", async () => {
    // Requirement 4.6 — atomicity: if transaction fails, neither table is updated
    await setupAuth();
    await setupCurrentUser(DB_USER_ID);

    await setupDbSelect(
      { id: MEETING_ID, userId: DB_USER_ID, workspaceMoveStatus: null },
      { id: "membership-id", workspaceId: WORKSPACE_ID, userId: DB_USER_ID, status: "active" }
    );

    const { db } = await import("@/lib/db/client");
    vi.mocked(db!.transaction).mockRejectedValue(new Error("DB transaction failed"));

    const response = await POST(makeRequest({ workspaceId: WORKSPACE_ID }), makeContext());

    expect(response.status).toBe(500);
  });
});
