/**
 * Property-Based Tests: Account Deletion Cascade Invariant
 *
 * **Property 9: Account Deletion Cascade Invariant**
 * **Validates: Requirements 5.2, 5.3, 5.6**
 *
 * Tests that:
 * - All user data is deleted in correct order
 * - User is removed from Clerk after database cleanup
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fc from "fast-check";
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
  syncCurrentUserToDatabase: vi.fn(),
}));

async function setupAuthenticatedUser(userId: string, dbUserId: string) {
  const { auth } = await import("@clerk/nextjs/server");
  vi.mocked(auth).mockResolvedValue({ userId } as any);

  const { syncCurrentUserToDatabase } = await import("@/lib/auth/current-user");
  vi.mocked(syncCurrentUserToDatabase).mockResolvedValue({
    id: dbUserId,
    clerkUserId: userId,
    email: "test@example.com",
    createdAt: new Date("2024-01-01"),
  } as any);
}

function setupDbDeleteMock() {
  return import("@/lib/db/client").then(({ db }) => {
    const deletionOrder: string[] = [];
    const mockWhere = vi.fn().mockImplementation(() => {
      return Promise.resolve(undefined);
    });
    vi.mocked(db!.delete).mockImplementation((table: any) => {
      deletionOrder.push(table[Symbol.for("drizzle:Name")] ?? table?._.name ?? JSON.stringify(table));
      return { where: mockWhere } as any;
    });
    return { deletionOrder, mockWhere };
  });
}

async function setupClerkDeleteMock() {
  const { clerkClient } = await import("@clerk/nextjs/server");
  const mockDeleteUser = vi.fn().mockResolvedValue(undefined);
  vi.mocked(clerkClient).mockResolvedValue({
    users: { deleteUser: mockDeleteUser },
  } as any);
  return { mockDeleteUser };
}

describe("Property 9: Account Deletion Cascade Invariant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Clerk deleteUser is always called after all database deletions", async () => {
    /**
     * **Validates: Requirements 5.2, 5.3, 5.6**
     * Property: For any authenticated user, when DELETE /api/settings/account is called,
     * the Clerk user deletion MUST occur after all database table deletions.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.uuid(),
        async (clerkUserId, dbUserId) => {
          vi.clearAllMocks();
          await setupAuthenticatedUser(clerkUserId, dbUserId);

          const callOrder: string[] = [];

          const { db } = await import("@/lib/db/client");
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
          const clerkIndex = callOrder.lastIndexOf("clerk.deleteUser");
          const lastDbIndex = callOrder.lastIndexOf("db.delete");
          expect(clerkIndex).toBeGreaterThan(lastDbIndex);
        }
      ),
      { numRuns: 20 }
    );
  });

  it("exactly 6 database table deletions occur for any authenticated user", async () => {
    /**
     * **Validates: Requirements 5.2, 5.6**
     * Property: For any authenticated user, DELETE /api/settings/account
     * MUST perform exactly 6 database delete operations (one per table).
     */
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.uuid(),
        async (clerkUserId, dbUserId) => {
          vi.clearAllMocks();
          await setupAuthenticatedUser(clerkUserId, dbUserId);

          const { db } = await import("@/lib/db/client");
          let deleteCallCount = 0;
          const mockWhere = vi.fn().mockResolvedValue(undefined);
          vi.mocked(db!.delete).mockImplementation(() => {
            deleteCallCount++;
            return { where: mockWhere } as any;
          });

          const { clerkClient } = await import("@clerk/nextjs/server");
          vi.mocked(clerkClient).mockResolvedValue({
            users: { deleteUser: vi.fn().mockResolvedValue(undefined) },
          } as any);

          const response = await DELETE();

          expect(response.status).toBe(200);
          // Must delete from exactly 6 tables
          expect(deleteCallCount).toBe(6);
        }
      ),
      { numRuns: 20 }
    );
  });

  it("Clerk deleteUser is called exactly once per deletion request", async () => {
    /**
     * **Validates: Requirements 5.3**
     * Property: For any authenticated user, DELETE /api/settings/account
     * MUST call Clerk's deleteUser exactly once.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.uuid(),
        async (clerkUserId, dbUserId) => {
          vi.clearAllMocks();
          await setupAuthenticatedUser(clerkUserId, dbUserId);

          const { db } = await import("@/lib/db/client");
          const mockWhere = vi.fn().mockResolvedValue(undefined);
          vi.mocked(db!.delete).mockReturnValue({ where: mockWhere } as any);

          const { clerkClient } = await import("@clerk/nextjs/server");
          const mockDeleteUser = vi.fn().mockResolvedValue(undefined);
          vi.mocked(clerkClient).mockResolvedValue({
            users: { deleteUser: mockDeleteUser },
          } as any);

          const response = await DELETE();

          expect(response.status).toBe(200);
          expect(mockDeleteUser).toHaveBeenCalledTimes(1);
          expect(mockDeleteUser).toHaveBeenCalledWith(clerkUserId);
        }
      ),
      { numRuns: 20 }
    );
  });
});
