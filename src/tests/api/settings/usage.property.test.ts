/**
 * Property-Based Tests: Usage Statistics Non-Negative Invariant
 *
 * **Property 7: Usage Statistics Non-Negative Invariant**
 * **Validates: Requirements 4.2, 4.3, 4.4**
 *
 * Tests that:
 * - All usage counts are non-negative
 * - meetingsThisMonth <= meetingsAllTime
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fc from "fast-check";
import { GET } from "@/app/api/settings/usage/route";

// Mock Clerk auth
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

// Mock database client
vi.mock("@/lib/db/client", () => ({
  db: {
    select: vi.fn(),
  },
}));

// Mock database bootstrap
vi.mock("@/lib/db/bootstrap", () => ({
  ensureDatabaseReady: vi.fn().mockResolvedValue(undefined),
}));

// Mock current user sync
vi.mock("@/lib/auth/current-user", () => ({
  syncCurrentUserToDatabase: vi.fn().mockResolvedValue({
    id: "test-user-id",
    clerkUserId: "test-clerk-id",
    email: "test@example.com",
    createdAt: new Date("2024-01-01"),
  }),
}));

// Mock subscription server (has "server-only" import)
vi.mock("@/lib/subscription.server", () => ({
  getUserSubscription: vi.fn(),
}));

async function setupAuthenticatedUser() {
  const { auth } = await import("@clerk/nextjs/server");
  vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);
}

function setupDbSelectMock(counts: {
  meetingsThisMonth: number;
  meetingsAllTime: number;
  transcriptsGenerated: number;
  actionItemsCreated: number;
  documentsAnalyzed: number;
}) {
  return import("@/lib/db/client").then(({ db }) => {
    let callIndex = 0;
    const countValues = [
      counts.meetingsThisMonth,
      counts.meetingsAllTime,
      counts.transcriptsGenerated,
      counts.actionItemsCreated,
      counts.documentsAnalyzed,
    ];

    vi.mocked(db!.select).mockImplementation(() => {
      const value = countValues[callIndex++] ?? 0;
      const mockWhere = vi.fn().mockResolvedValue([{ value }]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      return { from: mockFrom } as any;
    });
  });
}

describe("Property 7: Usage Statistics Non-Negative Invariant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("all usage counts are non-negative for any valid database state", async () => {
    /**
     * **Validates: Requirements 4.2, 4.3, 4.4**
     * Property: For any non-negative counts returned by the database,
     * the API response MUST contain non-negative values for all usage fields.
     */
    const { getUserSubscription } = await import("@/lib/subscription.server");
    vi.mocked(getUserSubscription).mockResolvedValue({
      plan: "free",
    } as any);

    await fc.assert(
      fc.asyncProperty(
        // meetingsThisMonth must be <= meetingsAllTime
        fc.nat({ max: 1000 }),
        fc.nat({ max: 1000 }),
        fc.nat({ max: 1000 }),
        fc.nat({ max: 1000 }),
        fc.nat({ max: 1000 }),
        async (thisMonth, extra, transcripts, actionItemsCount, documents) => {
          vi.clearAllMocks();
          await setupAuthenticatedUser();
          vi.mocked(getUserSubscription).mockResolvedValue({
            plan: "free",
          } as any);

          const meetingsAllTime = thisMonth + extra; // ensures allTime >= thisMonth
          await setupDbSelectMock({
            meetingsThisMonth: thisMonth,
            meetingsAllTime,
            transcriptsGenerated: transcripts,
            actionItemsCreated: actionItemsCount,
            documentsAnalyzed: documents,
          });

          const response = await GET();
          const body = await response.json();

          expect(response.status).toBe(200);
          expect(body.meetingsThisMonth).toBeGreaterThanOrEqual(0);
          expect(body.meetingsAllTime).toBeGreaterThanOrEqual(0);
          expect(body.transcriptsGenerated).toBeGreaterThanOrEqual(0);
          expect(body.actionItemsCreated).toBeGreaterThanOrEqual(0);
          expect(body.documentsAnalyzed).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 30 }
    );
  });

  it("meetingsThisMonth <= meetingsAllTime for any valid database state", async () => {
    /**
     * **Validates: Requirements 4.2, 4.3, 4.4**
     * Property: meetingsThisMonth must always be <= meetingsAllTime
     * since this-month meetings are a subset of all-time meetings.
     */
    const { getUserSubscription } = await import("@/lib/subscription.server");

    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: 500 }),
        fc.nat({ max: 500 }),
        async (thisMonth, extra) => {
          vi.clearAllMocks();
          await setupAuthenticatedUser();
          vi.mocked(getUserSubscription).mockResolvedValue({
            plan: "pro",
          } as any);

          const meetingsAllTime = thisMonth + extra;
          await setupDbSelectMock({
            meetingsThisMonth: thisMonth,
            meetingsAllTime,
            transcriptsGenerated: 0,
            actionItemsCreated: 0,
            documentsAnalyzed: 0,
          });

          const response = await GET();
          const body = await response.json();

          expect(response.status).toBe(200);
          expect(body.meetingsThisMonth).toBeLessThanOrEqual(body.meetingsAllTime);
        }
      ),
      { numRuns: 30 }
    );
  });

  it("zero counts are valid and non-negative", async () => {
    /**
     * **Validates: Requirements 4.2, 4.3, 4.4**
     * Edge case: A new user with no activity should return all zeros,
     * which satisfies the non-negative invariant.
     */
    await setupAuthenticatedUser();
    const { getUserSubscription } = await import("@/lib/subscription.server");
    vi.mocked(getUserSubscription).mockResolvedValue({ plan: "trial" } as any);

    await setupDbSelectMock({
      meetingsThisMonth: 0,
      meetingsAllTime: 0,
      transcriptsGenerated: 0,
      actionItemsCreated: 0,
      documentsAnalyzed: 0,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.meetingsThisMonth).toBe(0);
    expect(body.meetingsAllTime).toBe(0);
    expect(body.transcriptsGenerated).toBe(0);
    expect(body.actionItemsCreated).toBe(0);
    expect(body.documentsAnalyzed).toBe(0);
    expect(body.meetingsThisMonth).toBeLessThanOrEqual(body.meetingsAllTime);
  });
});
