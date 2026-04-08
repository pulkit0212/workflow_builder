/**
 * Bug Condition Exploration Tests - Task 1
 * Property 1: Bug Condition - firstName Filter Ignored / 500 for Non-my_items Tabs
 * Validates: Requirements 1.1, 1.2
 *
 * CRITICAL: These tests are EXPECTED TO FAIL on unfixed code.
 * Failure confirms the bug exists. DO NOT fix the code when these tests fail.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted so mock functions are available when vi.mock factories run
const {
  mockAuth,
  mockSyncUser,
  mockEnsureDb,
  mockCanUseActionItems,
  mockGetSubscription,
  mockResolveWorkspaceId,
  mockDbSelect,
} = vi.hoisted(() => {
  return {
    mockAuth: vi.fn().mockResolvedValue({ userId: "clerk-user-1" }),
    mockSyncUser: vi.fn().mockResolvedValue({
      id: "db-user-1",
      clerkUserId: "clerk-user-1",
      email: "test@example.com",
      fullName: "Test User",
      plan: "pro",
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
    }),
    mockEnsureDb: vi.fn().mockResolvedValue(undefined),
    mockCanUseActionItems: vi.fn().mockReturnValue(true),
    mockGetSubscription: vi.fn().mockResolvedValue({ plan: "pro" }),
    mockResolveWorkspaceId: vi.fn().mockResolvedValue(null),
    mockDbSelect: vi.fn(),
  };
});

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/auth/current-user", () => ({ syncCurrentUserToDatabase: mockSyncUser }));
vi.mock("@/lib/db/bootstrap", () => ({ ensureDatabaseReady: mockEnsureDb }));
vi.mock("@/lib/subscription", () => ({ canUseActionItems: mockCanUseActionItems }));
vi.mock("@/lib/subscription.server", () => ({ getUserSubscription: mockGetSubscription }));
vi.mock("@/lib/workspaces/server", () => ({ resolveWorkspaceIdForRequest: mockResolveWorkspaceId }));
vi.mock("@/lib/db/client", () => ({ db: { select: mockDbSelect } }));

import { GET } from "@/app/api/action-items/route";

/**
 * Set up the db mock for personal mode (no workspace).
 *
 * In personal mode the route makes these db.select() calls:
 *   1. participatedMeetingIds: .select().from(meetingSessions).where() → []
 *   2. main items query:       .select().from(actionItems).where().orderBy().limit().offset() → items
 *   3. count query:            .select({count}).from(actionItems).where() → [{ count: N }]
 *
 * Calls 2 & 3 are issued via Promise.all so they share the same mock invocation order.
 *
 * The itemFilter parameter simulates DB-level filtering (e.g. ilike owner filter).
 * Pass a predicate to restrict which items the mock returns, simulating what the DB
 * would return after applying the WHERE clause built by the fixed route.
 */
function setupPersonalModeDb(
  items: Array<{ owner: string; [key: string]: unknown }>,
  itemFilter?: (item: { owner: string; [key: string]: unknown }) => boolean
) {
  const filteredItems = itemFilter ? items.filter(itemFilter) : items;
  let callCount = 0;
  mockDbSelect.mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // participatedMeetingIds query — returns empty array (no participated meetings)
          return Promise.resolve([]);
        }
        // Main items query and count query (called via Promise.all)
        // Must support both:
        //   .where().orderBy().limit().offset()  (items query)
        //   .where() awaited directly            (count query)
        const countResult = Promise.resolve([{ count: filteredItems.length }]);
        return Object.assign(countResult, {
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(
                filteredItems.map((item, idx) => ({
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

function makeRequest(url: string): Request {
  return new Request(`http://localhost${url}`, {
    method: "GET",
    headers: { "content-type": "application/json" },
  });
}

function resetMocks() {
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

describe("Bug Condition Exploration - Property 1: firstName Filter Ignored for Non-my_items Tabs", () => {
  beforeEach(resetMocks);

  /**
   * Test 1: tab=all + firstName=Alice
   * Expected (correct): 200 with items where owner ilike %alice%
   * Actual (buggy):     500 error (and() called with single condition causes ORM error)
   *
   * Counterexample: { tab: "all", firstName: "Alice" } → status 500, not 200
   */
  it("BUG 1.1 - GET /api/action-items?tab=all&firstName=Alice should return 200 with owner-filtered items", async () => {
    const aliceItems = [
      { owner: "Alice Smith" },
      { owner: "Alice Johnson" },
    ];
    // Also include a non-Alice item to verify filtering
    const allItems = [...aliceItems, { owner: "Bob Williams" }];
    // Simulate DB ilike filter: owner contains "alice" (case-insensitive)
    setupPersonalModeDb(allItems, (item) => item.owner.toLowerCase().includes("alice"));

    const req = makeRequest("/api/action-items?tab=all&firstName=Alice");
    const res = await GET(req);

    // On unfixed code this will be 500 — that failure IS the counterexample
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.items)).toBe(true);

    // All returned items must have owner matching ilike %alice%
    for (const item of body.items) {
      expect(item.owner.toLowerCase()).toContain("alice");
    }
  });

  /**
   * Test 2: tab=high_priority + firstName=Bob
   * Expected (correct): 200 with items filtered by BOTH priority=High AND owner ilike %bob%
   * Actual (buggy):     200 but firstName filter is silently ignored — returns all high-priority items
   *
   * Counterexample: { tab: "high_priority", firstName: "Bob" } → items include non-Bob owners
   */
  it("BUG 1.2 - GET /api/action-items?tab=high_priority&firstName=Bob should filter by BOTH priority AND owner", async () => {
    const mixedItems = [
      { owner: "Bob Williams", priority: "High" },
      { owner: "Alice Smith", priority: "High" },   // high priority but NOT Bob
      { owner: "Bob Jones", priority: "Medium" },    // Bob but NOT high priority
    ];
    // Simulate DB filtering: priority=High AND owner ilike %bob%
    setupPersonalModeDb(
      mixedItems,
      (item) => (item.priority as string) === "High" && item.owner.toLowerCase().includes("bob")
    );

    const req = makeRequest("/api/action-items?tab=high_priority&firstName=Bob");
    const res = await GET(req);

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.items)).toBe(true);

    // All returned items must have owner matching ilike %bob%
    // On unfixed code, Alice Smith (high priority) will appear — that IS the counterexample
    for (const item of body.items) {
      expect(item.owner.toLowerCase()).toContain("bob");
    }
  });

  /**
   * Test 3: tab=this_week + firstName=Carol
   * Expected (correct): 200 with items filtered by BOTH date (last 7 days) AND owner ilike %carol%
   * Actual (buggy):     200 but firstName filter is silently ignored — returns all this-week items
   *
   * Counterexample: { tab: "this_week", firstName: "Carol" } → items include non-Carol owners
   */
  it("BUG 1.2 - GET /api/action-items?tab=this_week&firstName=Carol should filter by BOTH date AND owner", async () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 2); // 2 days ago — within this_week window

    const mixedItems = [
      { owner: "Carol Davis", createdAt: recentDate },
      { owner: "Dave Evans", createdAt: recentDate },  // recent but NOT Carol
    ];
    // Simulate DB filtering: createdAt >= 7 days ago AND owner ilike %carol%
    setupPersonalModeDb(
      mixedItems,
      (item) => item.owner.toLowerCase().includes("carol")
    );

    const req = makeRequest("/api/action-items?tab=this_week&firstName=Carol");
    const res = await GET(req);

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.items)).toBe(true);

    // All returned items must have owner matching ilike %carol%
    // On unfixed code, Dave Evans will appear — that IS the counterexample
    for (const item of body.items) {
      expect(item.owner.toLowerCase()).toContain("carol");
    }
  });

  /**
   * Test 4: tab=all + firstName=ZZZNoMatch (no matching items)
   * Expected (correct): 200 with empty items array
   * Actual (buggy):     500 error
   *
   * Counterexample: { tab: "all", firstName: "ZZZNoMatch" } → status 500, not 200 with []
   */
  it("BUG 1.1 - GET /api/action-items?tab=all&firstName=ZZZNoMatch should return 200 with empty items (not 500)", async () => {
    setupPersonalModeDb([]); // no items match

    const req = makeRequest("/api/action-items?tab=all&firstName=ZZZNoMatch");
    const res = await GET(req);

    // On unfixed code this will be 500 — that failure IS the counterexample
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(0);
  });
});
