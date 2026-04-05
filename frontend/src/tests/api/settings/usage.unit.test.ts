/**
 * Unit Tests: GET /api/settings/usage
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
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
    createdAt: new Date("2024-01-15T10:00:00.000Z"),
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

async function setupUnauthenticatedUser() {
  const { auth } = await import("@clerk/nextjs/server");
  vi.mocked(auth).mockResolvedValue({ userId: null } as any);
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

describe("GET /api/settings/usage - Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated requests", async () => {
    // Requirement 4.7
    await setupUnauthenticatedUser();

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it("returns 200 with aggregated usage statistics for authenticated user", async () => {
    // Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
    await setupAuthenticatedUser();
    const { getUserSubscription } = await import("@/lib/subscription.server");
    vi.mocked(getUserSubscription).mockResolvedValue({ plan: "pro" } as any);

    await setupDbSelectMock({
      meetingsThisMonth: 3,
      meetingsAllTime: 10,
      transcriptsGenerated: 8,
      actionItemsCreated: 25,
      documentsAnalyzed: 5,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.meetingsThisMonth).toBe(3);
    expect(body.meetingsAllTime).toBe(10);
    expect(body.transcriptsGenerated).toBe(8);
    expect(body.actionItemsCreated).toBe(25);
    expect(body.documentsAnalyzed).toBe(5);
  });

  it("returns correct aggregation of counts from database", async () => {
    // Requirements 4.2, 4.3, 4.4
    await setupAuthenticatedUser();
    const { getUserSubscription } = await import("@/lib/subscription.server");
    vi.mocked(getUserSubscription).mockResolvedValue({ plan: "elite" } as any);

    await setupDbSelectMock({
      meetingsThisMonth: 7,
      meetingsAllTime: 42,
      transcriptsGenerated: 40,
      actionItemsCreated: 120,
      documentsAnalyzed: 15,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.meetingsThisMonth).toBe(7);
    expect(body.meetingsAllTime).toBe(42);
    expect(body.transcriptsGenerated).toBe(40);
    expect(body.actionItemsCreated).toBe(120);
    expect(body.documentsAnalyzed).toBe(15);
  });

  it("returns memberSince as ISO 8601 date string", async () => {
    // Requirement 4.6
    await setupAuthenticatedUser();
    const { getUserSubscription } = await import("@/lib/subscription.server");
    vi.mocked(getUserSubscription).mockResolvedValue({ plan: "free" } as any);

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
    expect(body.memberSince).toBe("2024-01-15T10:00:00.000Z");
    // Verify it's a valid ISO 8601 date
    expect(() => new Date(body.memberSince)).not.toThrow();
    expect(new Date(body.memberSince).toISOString()).toBe(body.memberSince);
  });

  it("returns subscription limits from plan", async () => {
    // Requirement 4.5
    await setupAuthenticatedUser();
    const { getUserSubscription } = await import("@/lib/subscription.server");
    vi.mocked(getUserSubscription).mockResolvedValue({ plan: "pro" } as any);

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
    expect(body.limits).toBeDefined();
    expect(body.limits.meetingBot).toBe(true);
    expect(body.limits.transcription).toBe(true);
    expect(body.limits.meetingsPerMonth).toBe(10);
    expect(body.limits.unlimited).toBe(false);
  });

  it("returns free plan limits for free plan users", async () => {
    // Requirement 4.5
    await setupAuthenticatedUser();
    const { getUserSubscription } = await import("@/lib/subscription.server");
    vi.mocked(getUserSubscription).mockResolvedValue({ plan: "free" } as any);

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
    expect(body.limits.meetingBot).toBe(false);
    expect(body.limits.meetingsPerMonth).toBe(3);
    expect(body.limits.unlimited).toBe(false);
  });

  it("returns zero counts for new user with no activity", async () => {
    // Requirements 4.2, 4.3, 4.4
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
  });

  it("returns 500 when database throws an error", async () => {
    // Requirement 4.1 (error handling)
    await setupAuthenticatedUser();
    const { getUserSubscription } = await import("@/lib/subscription.server");
    vi.mocked(getUserSubscription).mockResolvedValue({ plan: "free" } as any);

    const { db } = await import("@/lib/db/client");
    vi.mocked(db!.select).mockImplementation(() => {
      throw new Error("DB connection failed");
    });

    const response = await GET();

    expect(response.status).toBe(500);
  });
});
