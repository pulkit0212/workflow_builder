/**
 * Unit Tests: PATCH /api/workspace/[workspaceId]/action-items/[itemId]/status
 *
 * Validates: Requirements 11.2, 11.3, 11.5
 *
 * Tests:
 *   1. Returns 401 when not authenticated
 *   2. Returns 400 when status is invalid
 *   3. Returns 404 when action item not found
 *   4. Returns 403 when user is neither the assigned member nor an admin
 *   5. Assigned member can update their own action item status (200)
 *   6. Admin can update any action item status (200)
 *   7. When status='done': completedAt is set to a Date
 *   8. When status!='done': completedAt is set to null
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { PATCH } from "@/app/api/workspace/[workspaceId]/action-items/[itemId]/status/route";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
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
const WORKSPACE_ID = "00000000-0000-0000-0000-000000000002";
const ITEM_ID = "00000000-0000-0000-0000-000000000003";
const ASSIGNED_MEMBER_NAME = "Alice Smith";

function makeRequest(body: unknown): Request {
  return new Request(
    `http://localhost/api/workspace/${WORKSPACE_ID}/action-items/${ITEM_ID}/status`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function makeContext(workspaceId = WORKSPACE_ID, itemId = ITEM_ID) {
  return { params: Promise.resolve({ workspaceId, itemId }) };
}

async function setupAuth(userId: string | null = CLERK_USER_ID) {
  const { auth } = await import("@clerk/nextjs/server");
  vi.mocked(auth).mockResolvedValue({ userId } as any);
}

async function setupCurrentUser(opts: { id?: string; fullName?: string | null } = {}) {
  const { syncCurrentUserToDatabase } = await import("@/lib/auth/current-user");
  vi.mocked(syncCurrentUserToDatabase).mockResolvedValue({
    id: opts.id ?? DB_USER_ID,
    clerkUserId: CLERK_USER_ID,
    email: "user@example.com",
    fullName: opts.fullName ?? null,
    createdAt: new Date(),
  } as any);
}

/**
 * Sets up db.select to return different results per call index.
 * Call 0: action item lookup
 * Call 1: membership lookup
 */
async function setupDbSelect(
  actionItemRow: object | null,
  membershipRow: object | null = null
) {
  const { db } = await import("@/lib/db/client");
  let callIndex = 0;
  const rows = [
    actionItemRow ? [actionItemRow] : [],
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

/**
 * Sets up db.update to return the given updated row.
 */
async function setupDbUpdate(updatedRow: object) {
  const { db } = await import("@/lib/db/client");
  const mockReturning = vi.fn().mockResolvedValue([updatedRow]);
  const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  vi.mocked(db!.update).mockReturnValue({ set: mockSet } as any);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PATCH /api/workspace/[workspaceId]/action-items/[itemId]/status - Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Authentication ──────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    await setupAuth(null);

    const response = await PATCH(makeRequest({ status: "done" }), makeContext());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
  });

  // ── 2. Request body validation ─────────────────────────────────────────────

  it("returns 400 when status is invalid", async () => {
    await setupAuth();

    const response = await PATCH(makeRequest({ status: "invalid_status" }), makeContext());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 400 when status is missing", async () => {
    await setupAuth();

    const response = await PATCH(makeRequest({}), makeContext());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 400 when body is not valid JSON", async () => {
    await setupAuth();

    const request = new Request(
      `http://localhost/api/workspace/${WORKSPACE_ID}/action-items/${ITEM_ID}/status`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "{ invalid json",
      }
    );

    const response = await PATCH(request, makeContext());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  // ── 3. Action item not found ───────────────────────────────────────────────

  it("returns 404 when action item does not exist", async () => {
    await setupAuth();
    await setupCurrentUser();
    await setupDbSelect(null); // no action item row

    const response = await PATCH(makeRequest({ status: "done" }), makeContext());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.details?.error).toBe("not_found");
  });

  // ── 4. Authorization — non-assigned, non-admin ─────────────────────────────

  it("returns 403 when user is neither the assigned member nor an admin", async () => {
    // Requirement 11.2 — only assigned member or admin may update
    await setupAuth();
    await setupCurrentUser({ fullName: "Bob Jones" }); // not the assigned member

    await setupDbSelect(
      { id: ITEM_ID, owner: ASSIGNED_MEMBER_NAME, workspaceId: WORKSPACE_ID },
      { role: "member" } // member role, not admin
    );

    const response = await PATCH(makeRequest({ status: "in_progress" }), makeContext());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.details?.error).toBe("forbidden");
  });

  it("returns 403 when user has no workspace membership", async () => {
    await setupAuth();
    await setupCurrentUser({ fullName: "Bob Jones" });

    await setupDbSelect(
      { id: ITEM_ID, owner: ASSIGNED_MEMBER_NAME, workspaceId: WORKSPACE_ID },
      null // no membership
    );

    const response = await PATCH(makeRequest({ status: "pending" }), makeContext());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
  });

  // ── 5. Assigned member can update ─────────────────────────────────────────

  it("returns 200 when assigned member updates their own action item", async () => {
    // Requirement 11.2 — assigned member is authorized
    await setupAuth();
    await setupCurrentUser({ fullName: ASSIGNED_MEMBER_NAME });

    await setupDbSelect(
      { id: ITEM_ID, owner: ASSIGNED_MEMBER_NAME, workspaceId: WORKSPACE_ID },
      { role: "member" } // member role — authorized because owner matches
    );

    await setupDbUpdate({
      id: ITEM_ID,
      status: "in_progress",
      completedAt: null,
    });

    const response = await PATCH(makeRequest({ status: "in_progress" }), makeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  // ── 6. Admin can update any action item ───────────────────────────────────

  it("returns 200 when admin updates an action item assigned to someone else", async () => {
    // Requirement 11.2 — admin is always authorized
    await setupAuth();
    await setupCurrentUser({ fullName: "Admin User" }); // not the assigned member

    await setupDbSelect(
      { id: ITEM_ID, owner: ASSIGNED_MEMBER_NAME, workspaceId: WORKSPACE_ID },
      { role: "admin" } // admin role
    );

    await setupDbUpdate({
      id: ITEM_ID,
      status: "done",
      completedAt: new Date(),
    });

    const response = await PATCH(makeRequest({ status: "done" }), makeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("returns 200 when workspace owner updates an action item", async () => {
    await setupAuth();
    await setupCurrentUser({ fullName: "Workspace Owner" });

    await setupDbSelect(
      { id: ITEM_ID, owner: ASSIGNED_MEMBER_NAME, workspaceId: WORKSPACE_ID },
      { role: "owner" } // owner role
    );

    await setupDbUpdate({
      id: ITEM_ID,
      status: "hold",
      completedAt: null,
    });

    const response = await PATCH(makeRequest({ status: "hold" }), makeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  // ── 7. completedAt set when status='done' ─────────────────────────────────

  it("sets completedAt to a Date when status is 'done'", async () => {
    // Requirement 11.3 — completedAt must be set when status='done'
    await setupAuth();
    await setupCurrentUser({ fullName: ASSIGNED_MEMBER_NAME });

    await setupDbSelect(
      { id: ITEM_ID, owner: ASSIGNED_MEMBER_NAME, workspaceId: WORKSPACE_ID },
      { role: "member" }
    );

    const { db } = await import("@/lib/db/client");

    let capturedSetPayload: Record<string, unknown> | null = null;

    const mockReturning = vi.fn().mockResolvedValue([{ id: ITEM_ID, status: "done", completedAt: new Date() }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
      capturedSetPayload = payload;
      return { where: mockWhere };
    });
    vi.mocked(db!.update).mockReturnValue({ set: mockSet } as any);

    await PATCH(makeRequest({ status: "done" }), makeContext());

    expect(capturedSetPayload).not.toBeNull();
    expect(capturedSetPayload!.completedAt).toBeInstanceOf(Date);
    expect(capturedSetPayload!.status).toBe("done");
  });

  // ── 8. completedAt cleared when status!='done' ────────────────────────────

  it("sets completedAt to null when status is 'pending'", async () => {
    // Requirement 11.5 — completedAt must be null when status!='done'
    await setupAuth();
    await setupCurrentUser({ fullName: ASSIGNED_MEMBER_NAME });

    await setupDbSelect(
      { id: ITEM_ID, owner: ASSIGNED_MEMBER_NAME, workspaceId: WORKSPACE_ID },
      { role: "member" }
    );

    const { db } = await import("@/lib/db/client");

    let capturedSetPayload: Record<string, unknown> | null = null;

    const mockReturning = vi.fn().mockResolvedValue([{ id: ITEM_ID, status: "pending", completedAt: null }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
      capturedSetPayload = payload;
      return { where: mockWhere };
    });
    vi.mocked(db!.update).mockReturnValue({ set: mockSet } as any);

    await PATCH(makeRequest({ status: "pending" }), makeContext());

    expect(capturedSetPayload).not.toBeNull();
    expect(capturedSetPayload!.completedAt).toBeNull();
    expect(capturedSetPayload!.status).toBe("pending");
  });

  it("sets completedAt to null when status is 'in_progress'", async () => {
    // Requirement 11.5 — completedAt must be null when status!='done'
    await setupAuth();
    await setupCurrentUser({ fullName: ASSIGNED_MEMBER_NAME });

    await setupDbSelect(
      { id: ITEM_ID, owner: ASSIGNED_MEMBER_NAME, workspaceId: WORKSPACE_ID },
      { role: "member" }
    );

    const { db } = await import("@/lib/db/client");

    let capturedSetPayload: Record<string, unknown> | null = null;

    const mockReturning = vi.fn().mockResolvedValue([{ id: ITEM_ID, status: "in_progress", completedAt: null }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
      capturedSetPayload = payload;
      return { where: mockWhere };
    });
    vi.mocked(db!.update).mockReturnValue({ set: mockSet } as any);

    await PATCH(makeRequest({ status: "in_progress" }), makeContext());

    expect(capturedSetPayload).not.toBeNull();
    expect(capturedSetPayload!.completedAt).toBeNull();
    expect(capturedSetPayload!.status).toBe("in_progress");
  });

  it("sets completedAt to null when status is 'hold'", async () => {
    // Requirement 11.5 — completedAt must be null when status!='done'
    await setupAuth();
    await setupCurrentUser({ fullName: ASSIGNED_MEMBER_NAME });

    await setupDbSelect(
      { id: ITEM_ID, owner: ASSIGNED_MEMBER_NAME, workspaceId: WORKSPACE_ID },
      { role: "member" }
    );

    const { db } = await import("@/lib/db/client");

    let capturedSetPayload: Record<string, unknown> | null = null;

    const mockReturning = vi.fn().mockResolvedValue([{ id: ITEM_ID, status: "hold", completedAt: null }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
      capturedSetPayload = payload;
      return { where: mockWhere };
    });
    vi.mocked(db!.update).mockReturnValue({ set: mockSet } as any);

    await PATCH(makeRequest({ status: "hold" }), makeContext());

    expect(capturedSetPayload).not.toBeNull();
    expect(capturedSetPayload!.completedAt).toBeNull();
    expect(capturedSetPayload!.status).toBe("hold");
  });
});
