/**
 * Preservation Property Tests - Task 2
 * Property 2: Preservation - Workspace-Scoped Routes Unchanged
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.9, 3.11
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted so mock functions are available when vi.mock factories run
const {
  mockAuth, mockSyncUser, mockEnsureDb, mockGetSubscription,
  mockResolveWorkspaceId, mockListMeetingsByUser, mockListMeetingsPaginated, mockDbSelect,
} = vi.hoisted(() => {
  return {
    mockAuth: vi.fn().mockResolvedValue({ userId: "clerk-user-1" }),
    mockSyncUser: vi.fn().mockResolvedValue({
      id: "db-user-1", clerkUserId: "clerk-user-1", email: "test@example.com",
      fullName: "Test User", plan: "free",
      createdAt: new Date("2024-01-01"), updatedAt: new Date("2024-01-01"),
    }),
    mockEnsureDb: vi.fn().mockResolvedValue(undefined),
    mockGetSubscription: vi.fn().mockResolvedValue({ plan: "pro" }),
    mockResolveWorkspaceId: vi.fn(),
    mockListMeetingsByUser: vi.fn().mockResolvedValue([]),
    mockListMeetingsPaginated: vi.fn().mockResolvedValue({
      sessions: [], pagination: { total: 0, page: 1, limit: 6, totalPages: 1 },
    }),
    mockDbSelect: vi.fn(),
  };
});

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/auth/current-user", () => ({ syncCurrentUserToDatabase: mockSyncUser }));
vi.mock("@/lib/db/bootstrap", () => ({ ensureDatabaseReady: mockEnsureDb }));
vi.mock("@/lib/subscription.server", () => ({ getUserSubscription: mockGetSubscription }));
vi.mock("@/lib/workspaces/server", () => ({ resolveWorkspaceIdForRequest: mockResolveWorkspaceId }));
vi.mock("@/lib/db/queries/meeting-sessions", () => ({
  listMeetingSessionsByUser: mockListMeetingsByUser,
  listMeetingSessionsByUserPaginated: mockListMeetingsPaginated,
}));
vi.mock("@/lib/db/client", () => ({ db: { select: mockDbSelect } }));

import { GET as workspaceMeetingsGET } from "@/app/api/workspace/[workspaceId]/meetings/route";
import { GET as workspaceDashboardGET } from "@/app/api/workspace/dashboard/route";
import { GET as personalMeetingsGET } from "@/app/api/meetings/route";
import { GET as personalActionItemsGET } from "@/app/api/action-items/route";
import { GET as personalReportsGET } from "@/app/api/meetings/reports/route";

const VALID_WORKSPACE_ID = "workspace-abc-123";

function makeWorkspaceRequest(url: string, workspaceId: string, method = "GET"): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json", "x-workspace-id": workspaceId },
  });
}

function makeRequestNoWorkspace(url: string, method = "GET"): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
  });
}

function defaultUserMock() {
  return {
    id: "db-user-1", clerkUserId: "clerk-user-1", email: "test@example.com",
    fullName: "Test User", plan: "free",
    createdAt: new Date("2024-01-01"), updatedAt: new Date("2024-01-01"),
  };
}

function resetMocks() {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: "clerk-user-1" });
  mockSyncUser.mockResolvedValue(defaultUserMock());
  mockEnsureDb.mockResolvedValue(undefined);
  mockGetSubscription.mockResolvedValue({ plan: "pro" });
  mockListMeetingsByUser.mockResolvedValue([]);
  mockListMeetingsPaginated.mockResolvedValue({
    sessions: [], pagination: { total: 0, page: 1, limit: 6, totalPages: 1 },
  });
}

describe("Property 2a: Workspace routes return 200 with valid membership (Req 3.1, 3.2, 3.3)", () => {
  beforeEach(resetMocks);

  it("PRESERVE 3.1 - GET /api/workspace/[id]/meetings with valid membership returns 200", async () => {
    mockResolveWorkspaceId.mockResolvedValue(VALID_WORKSPACE_ID);
    let callCount = 0;
    mockDbSelect.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return { limit: vi.fn().mockResolvedValue([{ role: "member", workspaceId: VALID_WORKSPACE_ID }]) };
          }
          return {
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([]) }),
            }),
            limit: vi.fn().mockResolvedValue([]),
          };
        }),
      }),
    }));
    const req = makeWorkspaceRequest(`/api/workspace/${VALID_WORKSPACE_ID}/meetings`, VALID_WORKSPACE_ID);
    const res = await workspaceMeetingsGET(req, { params: Promise.resolve({ workspaceId: VALID_WORKSPACE_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body).toHaveProperty("meetings");
  });

  it("PRESERVE 3.3 - GET /api/workspace/dashboard with valid x-workspace-id returns 200", async () => {
    mockResolveWorkspaceId.mockResolvedValue(VALID_WORKSPACE_ID);
    // Dashboard makes 6 db.select calls: 4 count queries + 2 list queries
    // Count queries: totalMeetings, meetingsThisWeek, totalActionItems, activeMemberCount
    // List queries: recentMeetings, pendingActionItems
    let dashCallCount = 0;
    const countResults = [
      [{ totalMeetings: 0 }],
      [{ meetingsThisWeek: 0 }],
      [{ totalActionItems: 0 }],
      [{ activeMemberCount: 0 }],
    ];
    mockDbSelect.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          const idx = dashCallCount++;
          if (idx < 4) {
            // Count queries: .where() is awaited directly (no .limit())
            // Must return a thenable (Promise-like) AND support .orderBy() for list queries
            const result = Promise.resolve(countResults[idx] ?? [{ count: 0 }]);
            return result;
          }
          // List queries: .where().orderBy().limit()
          return {
            orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
          };
        }),
      }),
    }));
    const req = makeWorkspaceRequest("/api/workspace/dashboard", VALID_WORKSPACE_ID);
    const res = await workspaceDashboardGET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

describe("Property 2b: Workspace routes reject unauthorized users with 403/401 (Req 3.11)", () => {
  beforeEach(resetMocks);

  it("PRESERVE 3.11 - GET /api/workspace/[id]/meetings without membership returns 403", async () => {
    mockResolveWorkspaceId.mockResolvedValue(VALID_WORKSPACE_ID);
    mockDbSelect.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
      }),
    }));
    const req = makeWorkspaceRequest(`/api/workspace/${VALID_WORKSPACE_ID}/meetings`, VALID_WORKSPACE_ID);
    const res = await workspaceMeetingsGET(req, { params: Promise.resolve({ workspaceId: VALID_WORKSPACE_ID }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body?.details?.error).toBe("forbidden");
  });

  it("PRESERVE 3.3 - GET /api/workspace/dashboard without x-workspace-id returns 400 workspace_required", async () => {
    mockResolveWorkspaceId.mockResolvedValue(null);
    const req = makeRequestNoWorkspace("/api/workspace/dashboard");
    const res = await workspaceDashboardGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body?.details?.error).toBe("workspace_required");
  });
});

describe("Property 2c: Personal routes with valid x-workspace-id return 200 workspace-scoped (Req 3.9)", () => {
  beforeEach(resetMocks);

  it("PRESERVE 3.9 - GET /api/meetings with valid x-workspace-id returns 200 workspace-scoped", async () => {
    mockResolveWorkspaceId.mockResolvedValue(VALID_WORKSPACE_ID);
    mockListMeetingsByUser.mockResolvedValue([]);
    const req = makeWorkspaceRequest("/api/meetings", VALID_WORKSPACE_ID);
    const res = await personalMeetingsGET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body).toHaveProperty("meetings");
  });

  it("PRESERVE 3.9 - GET /api/action-items with valid x-workspace-id returns 200 workspace-scoped", async () => {
    mockResolveWorkspaceId.mockResolvedValue(VALID_WORKSPACE_ID);
    mockGetSubscription.mockResolvedValue({ plan: "pro" });
    mockDbSelect.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([]) }),
          }),
          limit: vi.fn().mockResolvedValue([{ count: 0 }]),
        }),
      }),
    }));
    const req = makeWorkspaceRequest("/api/action-items", VALID_WORKSPACE_ID);
    const res = await personalActionItemsGET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("PRESERVE 3.9 - GET /api/meetings/reports with valid x-workspace-id returns 200 workspace-scoped", async () => {
    mockResolveWorkspaceId.mockResolvedValue(VALID_WORKSPACE_ID);
    mockGetSubscription.mockResolvedValue({ plan: "pro" });
    mockListMeetingsPaginated.mockResolvedValue({
      sessions: [], pagination: { total: 0, page: 1, limit: 6, totalPages: 1 },
    });
    const req = makeWorkspaceRequest("/api/meetings/reports", VALID_WORKSPACE_ID);
    const res = await personalReportsGET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("meetings");
    expect(body).toHaveProperty("pagination");
  });
});

describe("Property 2d: PBT - workspace membership validation holds across many workspace IDs (Req 3.1, 3.11)", () => {
  beforeEach(resetMocks);

  it("PBT - workspace route always returns 403 for non-members across many workspace IDs", async () => {
    const workspaceIds = [
      "workspace-001", "workspace-abc-def-ghi", "ws_12345",
      "00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000099",
      "workspace-with-long-name-that-is-still-valid", "WORKSPACE-UPPERCASE",
    ];
    for (const workspaceId of workspaceIds) {
      mockResolveWorkspaceId.mockResolvedValue(workspaceId);
      mockDbSelect.mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      }));
      const req = makeWorkspaceRequest(`/api/workspace/${workspaceId}/meetings`, workspaceId);
      const res = await workspaceMeetingsGET(req, { params: Promise.resolve({ workspaceId }) });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body?.details?.error).toBe("forbidden");
    }
  });

  it("PBT - workspace route always returns 200 for valid members across many workspace IDs", async () => {
    const workspaceIds = [
      "workspace-001", "workspace-abc-def-ghi", "ws_12345",
      "00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000099",
    ];
    for (const workspaceId of workspaceIds) {
      mockResolveWorkspaceId.mockResolvedValue(workspaceId);
      let callCount = 0;
      mockDbSelect.mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount % 2 === 1) {
              return { limit: vi.fn().mockResolvedValue([{ role: "member", workspaceId }]) };
            }
            return {
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([]) }),
              }),
              limit: vi.fn().mockResolvedValue([]),
            };
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([]) }),
          }),
        }),
      }));
      const req = makeWorkspaceRequest(`/api/workspace/${workspaceId}/meetings`, workspaceId);
      const res = await workspaceMeetingsGET(req, { params: Promise.resolve({ workspaceId }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });

  it("PBT - personal routes with valid x-workspace-id always return 200 across many workspace IDs (Req 3.9)", async () => {
    const workspaceIds = [
      "workspace-001", "workspace-abc-def-ghi", "ws_12345",
      "00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000099",
    ];
    for (const workspaceId of workspaceIds) {
      mockResolveWorkspaceId.mockResolvedValue(workspaceId);
      mockListMeetingsByUser.mockResolvedValue([]);
      const req = makeWorkspaceRequest("/api/meetings", workspaceId);
      const res = await personalMeetingsGET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });
});
