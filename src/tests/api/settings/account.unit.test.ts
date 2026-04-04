/**
 * Unit Tests: DELETE /api/settings/account
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { DELETE } from "@/app/api/settings/account/route";

// Mock Clerk auth and clerkClient
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

// Mock database client
vi.mock("@/lib/db/client", () => ({
  db: {
    delete: vi.fn(),
  },
}));

// Mock database bootstrap
vi.mock("@/lib/db/bootstrap", () => ({
  ensureDatabaseReady: vi.fn().mockResolvedValue(undefined),
}));

// Mock current user sync
vi.mock("@/lib/auth/current-user", () => ({
  syncCurrentUserToDatabase: vi.fn().mockResolvedValue({
    id: "test-db-user-id",
    clerkUserId: "test-clerk-id",
    email: "test@example.com",
    createdAt: new Date("2024-01-01"),
  }),
}));

async function setupAuthenticatedUser() {
  const { auth } = await import("@clerk/nextjs/server");
  vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);
}

async function setupUnauthenticatedUser() {
  const { auth } = await import("@clerk/nextjs/server");
  vi.mocked(auth).mockResolvedValue({ userId: null } as any);
}

async function setupDbDeleteMock() {
  const { db } = await import("@/lib/db/client");
  const mockWhere = vi.fn().mockResolvedValue(undefined);
  vi.mocked(db!.delete).mockReturnValue({ where: mockWhere } as any);
  return { mockWhere };
}

async function setupClerkDeleteMock() {
  const { clerkClient } = await import("@clerk/nextjs/server");
  const mockDeleteUser = vi.fn().mockResolvedValue(undefined);
  vi.mocked(clerkClient).mockResolvedValue({
    users: { deleteUser: mockDeleteUser },
  } as any);
  return { mockDeleteUser };
}

describe("DELETE /api/settings/account - Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated requests", async () => {
    // Requirement 5.5
    await setupUnauthenticatedUser();

    const response = await DELETE();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it("returns 200 with success on successful account deletion", async () => {
    // Requirements 5.1, 5.4
    await setupAuthenticatedUser();
    await setupDbDeleteMock();
    await setupClerkDeleteMock();

    const response = await DELETE();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("deletes from all 6 tables in correct order", async () => {
    // Requirements 5.2, 5.6
    await setupAuthenticatedUser();

    const { db } = await import("@/lib/db/client");
    const deletedTables: any[] = [];
    const mockWhere = vi.fn().mockResolvedValue(undefined);

    vi.mocked(db!.delete).mockImplementation((table: any) => {
      deletedTables.push(table);
      return { where: mockWhere } as any;
    });

    await setupClerkDeleteMock();

    const response = await DELETE();

    expect(response.status).toBe(200);
    expect(db!.delete).toHaveBeenCalledTimes(6);

    // Import the actual schema tables to verify correct tables were passed
    const {
      actionItems,
      meetingSessions,
      userPreferences,
      userIntegrations,
      subscriptions,
      users,
    } = await import("@/db/schema");

    expect(deletedTables[0]).toBe(actionItems);
    expect(deletedTables[1]).toBe(meetingSessions);
    expect(deletedTables[2]).toBe(userPreferences);
    expect(deletedTables[3]).toBe(userIntegrations);
    expect(deletedTables[4]).toBe(subscriptions);
    expect(deletedTables[5]).toBe(users);
  });

  it("deletes user from Clerk after database cleanup", async () => {
    // Requirement 5.3
    await setupAuthenticatedUser();

    const { db } = await import("@/lib/db/client");
    const callOrder: string[] = [];
    const mockWhere = vi.fn().mockImplementation(() => {
      callOrder.push("db.delete");
      return Promise.resolve(undefined);
    });
    vi.mocked(db!.delete).mockReturnValue({ where: mockWhere } as any);

    const { clerkClient } = await import("@clerk/nextjs/server");
    const mockDeleteUser = vi.fn().mockImplementation(async () => {
      callOrder.push("clerk.deleteUser");
    });
    vi.mocked(clerkClient).mockResolvedValue({
      users: { deleteUser: mockDeleteUser },
    } as any);

    const response = await DELETE();

    expect(response.status).toBe(200);
    // Clerk deletion must come after all DB deletions
    expect(callOrder[callOrder.length - 1]).toBe("clerk.deleteUser");
    expect(mockDeleteUser).toHaveBeenCalledWith("test-clerk-id");
  });

  it("returns 500 when database throws an error", async () => {
    // Requirement 5.4 (error handling)
    await setupAuthenticatedUser();

    const { db } = await import("@/lib/db/client");
    vi.mocked(db!.delete).mockImplementation(() => {
      throw new Error("DB connection failed");
    });

    const response = await DELETE();

    expect(response.status).toBe(500);
  });

  it("returns 500 when Clerk deletion throws an error", async () => {
    // Requirement 5.4 (error handling)
    await setupAuthenticatedUser();
    await setupDbDeleteMock();

    const { clerkClient } = await import("@clerk/nextjs/server");
    vi.mocked(clerkClient).mockResolvedValue({
      users: {
        deleteUser: vi.fn().mockRejectedValue(new Error("Clerk API error")),
      },
    } as any);

    const response = await DELETE();

    expect(response.status).toBe(500);
  });

  it("does not call Clerk when unauthenticated", async () => {
    // Requirement 5.5 - no operations should occur for unauthenticated requests
    await setupUnauthenticatedUser();

    const { clerkClient } = await import("@clerk/nextjs/server");

    await DELETE();

    expect(clerkClient).not.toHaveBeenCalled();
  });

  it("does not perform database operations when unauthenticated", async () => {
    // Requirement 5.5 - no DB operations for unauthenticated requests
    await setupUnauthenticatedUser();

    const { db } = await import("@/lib/db/client");

    await DELETE();

    expect(db!.delete).not.toHaveBeenCalled();
  });
});
