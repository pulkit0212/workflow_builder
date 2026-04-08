/**
 * Unit Tests: POST /api/meetings/[id]/request-move
 *
 * Validates: Requirements 6.2, 6.3, 6.4
 *
 * Tests:
 *   1. Returns 401 when not authenticated
 *   2. Returns 400 when body is invalid (missing workspaceId)
 *   3. Returns 403 when user is not an active workspace member
 *   4. Returns 409 with 'request_already_pending' when a pending request already exists
 *   5. Returns 200 and inserts a row with status='pending' and requestedBy=userId on success
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/meetings/[id]/request-move/route";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
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
const REQUEST_ID = "00000000-0000-0000-0000-000000000004";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/meetings/" + MEETING_ID + "/request-move", {
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
 * Call 0: membership check
 * Call 1: duplicate pending request check
 */
async function setupDbSelect(
  membershipRow: object | null,
  existingRequestRow: object | null = null
) {
  const { db } = await import("@/lib/db/client");
  let callIndex = 0;
  const rows = [
    membershipRow ? [membershipRow] : [],
    existingRequestRow ? [existingRequestRow] : [],
  ];

  vi.mocked(db!.select).mockImplementation(() => {
    const result = rows[callIndex++] ?? [];
    const mockLimit = vi.fn().mockResolvedValue(result);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    return { from: mockFrom } as any;
  });
}

async function setupDbInsert(returnedRow: object = { id: REQUEST_ID }) {
  const { db } = await import("@/lib/db/client");
  const mockReturning = vi.fn().mockResolvedValue([returnedRow]);
  const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
  vi.mocked(db!.insert).mockReturnValue({ values: mockValues } as any);
  return { mockValues, mockReturning };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/meetings/[id]/request-move - Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Authentication ──────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    // Requirement 6.1 — unauthenticated requests must be rejected
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
      "http://localhost/api/meetings/" + MEETING_ID + "/request-move",
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

  // ── 3. Membership check ────────────────────────────────────────────────────

  it("returns 403 when user is not an active workspace member", async () => {
    // Requirement 6.2 — user must be an active member of the target workspace
    await setupAuth();
    await setupCurrentUser(DB_USER_ID);
    await setupDbSelect(null); // no active membership

    const response = await POST(makeRequest({ workspaceId: WORKSPACE_ID }), makeContext());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.details?.error).toBe("forbidden");
  });

  // ── 4. Duplicate pending request ──────────────────────────────────────────

  it("returns 409 with 'request_already_pending' when a pending request already exists", async () => {
    // Requirement 6.3 — cannot create a duplicate pending request
    await setupAuth();
    await setupCurrentUser(DB_USER_ID);
    await setupDbSelect(
      { id: "membership-id", workspaceId: WORKSPACE_ID, userId: DB_USER_ID, status: "active" },
      { id: REQUEST_ID, meetingId: MEETING_ID, workspaceId: WORKSPACE_ID, status: "pending" }
    );

    const response = await POST(makeRequest({ workspaceId: WORKSPACE_ID }), makeContext());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.details?.error).toBe("request_already_pending");
  });

  // ── 5. Success — row inserted with correct fields ─────────────────────────

  it("returns 200 on success", async () => {
    // Requirement 6.4 — successful request returns 200
    await setupAuth();
    await setupCurrentUser(DB_USER_ID);
    await setupDbSelect(
      { id: "membership-id", workspaceId: WORKSPACE_ID, userId: DB_USER_ID, status: "active" },
      null // no existing pending request
    );
    await setupDbInsert({ id: REQUEST_ID });

    const response = await POST(makeRequest({ workspaceId: WORKSPACE_ID }), makeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("inserts a row with status='pending' and requestedBy=userId on success", async () => {
    // Requirement 6.4 — row must have status='pending' and requestedBy=authenticated user's id
    await setupAuth();
    await setupCurrentUser(DB_USER_ID);
    await setupDbSelect(
      { id: "membership-id", workspaceId: WORKSPACE_ID, userId: DB_USER_ID, status: "active" },
      null
    );
    const { mockValues } = await setupDbInsert({ id: REQUEST_ID });

    await POST(makeRequest({ workspaceId: WORKSPACE_ID }), makeContext());

    expect(mockValues).toHaveBeenCalledOnce();
    const insertPayload = mockValues.mock.calls[0][0];
    expect(insertPayload.status).toBe("pending");
    expect(insertPayload.requestedBy).toBe(DB_USER_ID);
  });

  it("inserts a row with the correct meetingId and workspaceId", async () => {
    // Requirement 6.4 — row must reference the correct meeting and workspace
    await setupAuth();
    await setupCurrentUser(DB_USER_ID);
    await setupDbSelect(
      { id: "membership-id", workspaceId: WORKSPACE_ID, userId: DB_USER_ID, status: "active" },
      null
    );
    const { mockValues } = await setupDbInsert({ id: REQUEST_ID });

    await POST(makeRequest({ workspaceId: WORKSPACE_ID }), makeContext(MEETING_ID));

    const insertPayload = mockValues.mock.calls[0][0];
    expect(insertPayload.meetingId).toBe(MEETING_ID);
    expect(insertPayload.workspaceId).toBe(WORKSPACE_ID);
  });

  it("returns the requestId in the response body on success", async () => {
    await setupAuth();
    await setupCurrentUser(DB_USER_ID);
    await setupDbSelect(
      { id: "membership-id", workspaceId: WORKSPACE_ID, userId: DB_USER_ID, status: "active" },
      null
    );
    await setupDbInsert({ id: REQUEST_ID });

    const response = await POST(makeRequest({ workspaceId: WORKSPACE_ID }), makeContext());
    const body = await response.json();

    expect(body.requestId).toBe(REQUEST_ID);
    expect(body.meetingId).toBe(MEETING_ID);
    expect(body.workspaceId).toBe(WORKSPACE_ID);
  });

  // ── 6. No insert when checks fail ─────────────────────────────────────────

  it("does not call db.insert when membership check fails", async () => {
    await setupAuth();
    await setupCurrentUser(DB_USER_ID);
    await setupDbSelect(null); // no membership

    const { db } = await import("@/lib/db/client");

    await POST(makeRequest({ workspaceId: WORKSPACE_ID }), makeContext());

    expect(db!.insert).not.toHaveBeenCalled();
  });

  it("does not call db.insert when a pending request already exists", async () => {
    await setupAuth();
    await setupCurrentUser(DB_USER_ID);
    await setupDbSelect(
      { id: "membership-id", workspaceId: WORKSPACE_ID, userId: DB_USER_ID, status: "active" },
      { id: REQUEST_ID, meetingId: MEETING_ID, workspaceId: WORKSPACE_ID, status: "pending" }
    );

    const { db } = await import("@/lib/db/client");

    await POST(makeRequest({ workspaceId: WORKSPACE_ID }), makeContext());

    expect(db!.insert).not.toHaveBeenCalled();
  });
});
