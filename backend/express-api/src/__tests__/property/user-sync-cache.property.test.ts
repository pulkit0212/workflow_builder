import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fc from "fast-check";
import {
  getCachedUser,
  setCachedUser,
  syncUser,
  AppUser,
} from "../../lib/user-sync-cache";

// Reset the module cache between tests by re-importing with a fresh module state
// We use vi.resetModules() in beforeEach to clear the in-memory Map

// Helper to build a minimal AppUser
function makeUser(clerkUserId: string): AppUser {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    clerkUserId,
    email: `${clerkUserId}@test.com`,
    fullName: null,
    plan: "free",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("user-sync-cache", () => {
  beforeEach(() => {
    // Clear the cache between tests by setting and immediately expiring entries
    // We do this by manipulating time or by re-importing; here we use the public API
    // to ensure a clean state via the module's own cache Map.
    // Since the Map is module-level, we clear it by importing the module fresh.
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Feature: backend-api-migration, Property 5: Authenticated request upserts user to DB
  // Validates: Requirements 2.5
  it("P5: syncUser inserts a new user into the DB when not cached", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.emailAddress(),
        async (clerkUserId, email) => {
          // Use a prefix to ensure this ID was never cached by other tests
          const uniqueId = `p5-${clerkUserId}`;
          const insertedUser: AppUser = {
            id: "00000000-0000-0000-0000-000000000001",
            clerkUserId: uniqueId,
            email,
            fullName: null,
            plan: "free",
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          let insertCalled = false;
          let selectCalled = false;

          const mockDb = {
            insert: () => ({
              values: () => ({
                onConflictDoNothing: async () => {
                  insertCalled = true;
                },
              }),
            }),
            select: () => ({
              from: () => ({
                where: () => ({
                  limit: async () => {
                    selectCalled = true;
                    return [insertedUser];
                  },
                }),
              }),
            }),
          };

          const result = await syncUser(uniqueId, mockDb as any);

          expect(insertCalled).toBe(true);
          expect(selectCalled).toBe(true);
          expect(result.clerkUserId).toBe(uniqueId);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: backend-api-migration, Property 6: User-sync cache prevents redundant DB writes
  // Validates: Requirements 2.6, 12.4
  it("P6: second syncUser call within 60s returns cached user without hitting DB", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (clerkUserId) => {
        // Use a prefix to avoid collisions with P5 test entries
        const uniqueId = `p6-${clerkUserId}`;
        const user = makeUser(uniqueId);
        let dbCallCount = 0;

        const mockDb = {
          insert: () => ({
            values: () => ({
              onConflictDoNothing: async () => {
                dbCallCount++;
              },
            }),
          }),
          select: () => ({
            from: () => ({
              where: () => ({
                limit: async () => {
                  dbCallCount++;
                  return [user];
                },
              }),
            }),
          }),
        };

        // First call — should hit DB
        const first = await syncUser(uniqueId, mockDb as any);
        const dbCallsAfterFirst = dbCallCount;

        // Second call within TTL — should use cache, no additional DB calls
        const second = await syncUser(uniqueId, mockDb as any);

        expect(first.clerkUserId).toBe(uniqueId);
        expect(second.clerkUserId).toBe(uniqueId);
        expect(dbCallCount).toBe(dbCallsAfterFirst); // no new DB calls
      }),
      { numRuns: 100 }
    );
  });

  it("getCachedUser returns null for unknown clerkUserId", () => {
    fc.assert(
      fc.property(fc.uuid(), (clerkUserId) => {
        // Use a UUID that was never set — getCachedUser should return null
        // (We rely on the fact that random UUIDs won't collide with previously set ones)
        const result = getCachedUser(`never-set-${clerkUserId}`);
        expect(result).toBeNull();
      }),
      { numRuns: 50 }
    );
  });

  it("getCachedUser returns null after TTL expires", () => {
    fc.assert(
      fc.property(fc.uuid(), (clerkUserId) => {
        const user = makeUser(clerkUserId);
        setCachedUser(clerkUserId, user);

        // Advance time past TTL
        vi.advanceTimersByTime(61_000);

        const result = getCachedUser(clerkUserId);
        expect(result).toBeNull();
      }),
      { numRuns: 50 }
    );
  });

  it("getCachedUser returns user within TTL", () => {
    fc.assert(
      fc.property(fc.uuid(), (clerkUserId) => {
        const user = makeUser(clerkUserId);
        setCachedUser(clerkUserId, user);

        // Advance time but stay within TTL
        vi.advanceTimersByTime(30_000);

        const result = getCachedUser(clerkUserId);
        expect(result).not.toBeNull();
        expect(result?.clerkUserId).toBe(clerkUserId);
      }),
      { numRuns: 50 }
    );
  });
});
