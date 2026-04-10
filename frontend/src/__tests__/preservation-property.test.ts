/**
 * Preservation Property Tests - Task 2
 * Property 2: Preservation - Workspace-Scoped Routes Unchanged
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.9, 3.11
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted so mock functions are available when vi.mock factories run
const {
  mockAuth, mockSyncUser, mockEnsureDb, mockGetSubscription,
  mockResolveWorkspaceId, mockListMeetingsByUser, mockListMeetingsPaginated, mockDbSelect,
  mockCanUseActionItems,
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
    mockCanUseActionItems: vi.fn().mockReturnValue(true),
  };
});

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/auth/current-user", () => ({ syncCurrentUserToDatabase: mockSyncUser }));
vi.mock("@/lib/db/bootstrap", () => ({ ensureDatabaseReady: mockEnsureDb }));
vi.mock("@/lib/subscription.server", () => ({ getUserSubscription: mockGetSubscription }));
vi.mock("@/lib/subscription", () => ({ canUseActionItems: mockCanUseActionItems }));
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
  mockCanUseActionItems.mockReturnValue(true);
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
            const result = Promise.resolve(countResults[idx] ?? [{ count: 0 }]);
            return result;
          }
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
    let callCount = 0;
    mockDbSelect.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return { limit: vi.fn().mockResolvedValue([{ role: "admin" }]) };
          }
          const directResult = Promise.resolve([{ count: 0 }]);
          return Object.assign(directResult, {
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([]) }),
            }),
            limit: vi.fn().mockResolvedValue([{ count: 0 }]),
          });
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

// ============================================================================
// Task 2: Preservation Property Tests for Action Items Route
// Property 2: Preservation - Non-Bug Requests Unchanged
// Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
// ============================================================================

/**
 * Set up the db mock for personal mode (no workspace) for action-items route.
 *
 * In personal mode the route makes these db.select() calls:
 *   1. participatedMeetingIds: .select().from(meetingSessions).where() → []
 *   2. main items query:       .select().from(actionItems).where().orderBy().limit().offset() → items
 *   3. count query:            .select({count}).from(actionItems).where() → [{ count: N }]
 *
 * Calls 2 & 3 are issued via Promise.all so they share the same mock invocation order.
 */
function setupActionItemsPersonalModeDb(items: Array<{ owner: string; priority?: string; source?: string; createdAt?: Date }>) {
  let callCount = 0;
  mockDbSelect.mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // participatedMeetingIds query — returns empty array
          return Promise.resolve([]);
        }
        // Main items query and count query (called via Promise.all)
        const countResult = Promise.resolve([{ count: items.length }]);
        return Object.assign(countResult, {
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(
                items.map((item, idx) => ({
                  id: `item-${idx}`,
                  task: `Task ${idx}`,
                  owner: item.owner,
                  dueDate: null,
                  priority: item.priority ?? "Medium",
                  completed: false,
                  status: "pending",
                  source: item.source ?? "meeting",
                  meetingId: null,
                  meetingTitle: null,
                  createdAt: item.createdAt ?? new Date("2024-06-01"),
                  userId: "db-user-1",
                  workspaceId: null,
                }))
              ),
            }),
          }),
        });
      }),
    }),
  }));
}

function makeActionItemsRequest(url: string): Request {
  return new Request(`http://localhost${url}`, {
    method: "GET",
    headers: { "content-type": "application/json" },
  });
}

function resetActionItemsMocks() {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: "clerk-user-1" });
  mockSyncUser.mockResolvedValue({
    id: "db-user-1",
    clerkUserId: "clerk-user-1",
    email: "test@example.com",
    fullName: "Test User",
    plan: "pro",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  });
  mockEnsureDb.mockResolvedValue(undefined);
  mockCanUseActionItems.mockReturnValue(true);
  mockGetSubscription.mockResolvedValue({ plan: "pro" });
  mockResolveWorkspaceId.mockResolvedValue(null);
}

describe("Property 2 (Action Items): Preservation - Non-Bug Requests Unchanged (Req 3.1–3.6)", () => {
  beforeEach(resetActionItemsMocks);

  /**
   * Test 3.2: tab=all with NO firstName → returns all items (no owner filter)
   * isBugCondition is false because firstName is empty/absent
   */
  it("PRESERVE 3.2 - tab=all with no firstName returns all items without owner filter", async () => {
    const allItems = [
      { owner: "Alice Smith" },
      { owner: "Bob Williams" },
      { owner: "Carol Davis" },
    ];
    setupActionItemsPersonalModeDb(allItems);

    const req = makeActionItemsRequest("/api/action-items?tab=all");
    const res = await personalActionItemsGET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(3);
  });

  /**
   * Test 3.3: tab=high_priority with NO firstName → returns only high-priority items
   * isBugCondition is false because firstName is empty/absent
   */
  it("PRESERVE 3.3 - tab=high_priority with no firstName returns only high-priority items", async () => {
    const highPriorityItems = [
      { owner: "Alice Smith", priority: "High" },
      { owner: "Bob Williams", priority: "High" },
    ];
    setupActionItemsPersonalModeDb(highPriorityItems);

    const req = makeActionItemsRequest("/api/action-items?tab=high_priority");
    const res = await personalActionItemsGET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(2);
  });

  /**
   * Test 3.4: tab=this_week with NO firstName → returns only items from last 7 days
   * isBugCondition is false because firstName is empty/absent
   */
  it("PRESERVE 3.4 - tab=this_week with no firstName returns only recent items", async () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 2);
    const recentItems = [
      { owner: "Alice Smith", createdAt: recentDate },
      { owner: "Bob Williams", createdAt: recentDate },
    ];
    setupActionItemsPersonalModeDb(recentItems);

    const req = makeActionItemsRequest("/api/action-items?tab=this_week");
    const res = await personalActionItemsGET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(2);
  });

  /**
   * Test 3.1: tab=my_items with firstName=Alice → applies ilike owner filter (already works)
   * isBugCondition is false because tab === "my_items"
   */
  it("PRESERVE 3.1 - tab=my_items with firstName=Alice applies ilike owner filter", async () => {
    const aliceItems = [
      { owner: "Alice Smith" },
      { owner: "Alice Johnson" },
    ];
    setupActionItemsPersonalModeDb(aliceItems);

    const req = makeActionItemsRequest("/api/action-items?tab=my_items&firstName=Alice");
    const res = await personalActionItemsGET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.items)).toBe(true);
    for (const item of body.items) {
      expect(item.owner.toLowerCase()).toContain("alice");
    }
  });

  /**
   * Test 3.2: tab=all with whitespace-only firstName (e.g., "   ") → trimmed to empty, no owner filter
   * isBugCondition is false because firstName trims to empty string
   */
  it("PRESERVE 3.2 - tab=all with whitespace-only firstName is treated as no firstName (no owner filter)", async () => {
    const allItems = [
      { owner: "Alice Smith" },
      { owner: "Bob Williams" },
    ];
    setupActionItemsPersonalModeDb(allItems);

    const req = makeActionItemsRequest("/api/action-items?tab=all&firstName=   ");
    const res = await personalActionItemsGET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(2);
  });

  /**
   * Test 3.5: source=meeting with no firstName → source filter applies correctly
   * isBugCondition is false because firstName is absent
   */
  it("PRESERVE 3.5 - source=meeting with no firstName applies source filter correctly", async () => {
    const meetingItems = [
      { owner: "Alice Smith", source: "meeting" },
      { owner: "Bob Williams", source: "meeting" },
    ];
    setupActionItemsPersonalModeDb(meetingItems);

    const req = makeActionItemsRequest("/api/action-items?source=meeting");
    const res = await personalActionItemsGET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(2);
  });

  /**
   * Test 3.5: source=task-generator with no firstName → source filter applies correctly
   * isBugCondition is false because firstName is absent
   */
  it("PRESERVE 3.5 - source=task-generator with no firstName applies source filter correctly", async () => {
    const taskGenItems = [
      { owner: "Alice Smith", source: "task-generator" },
    ];
    setupActionItemsPersonalModeDb(taskGenItems);

    const req = makeActionItemsRequest("/api/action-items?source=task-generator");
    const res = await personalActionItemsGET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(1);
  });

  /**
   * PBT: For all non-bug-condition requests (no firstName, various tabs), route always returns 200
   * Validates: Requirements 3.2, 3.3, 3.4
   */
  it("PBT PRESERVE 3.2/3.3/3.4 - all tabs with no firstName always return 200", async () => {
    const tabs = ["all", "high_priority", "this_week", "my_items"];
    for (const tab of tabs) {
      resetActionItemsMocks();
      setupActionItemsPersonalModeDb([{ owner: "Alice Smith" }]);

      const req = makeActionItemsRequest(`/api/action-items?tab=${tab}`);
      const res = await personalActionItemsGET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.items)).toBe(true);
    }
  });
});
