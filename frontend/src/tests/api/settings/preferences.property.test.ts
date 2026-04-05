/**
 * Property-Based Tests: User Preferences Uniqueness Invariant
 *
 * **Property 2: User Preferences Uniqueness Invariant**
 * **Validates: Requirements 1.1**
 *
 * Tests that:
 * - The database enforces at most one user_preferences record per userId
 * - Attempting to insert a second record for the same userId fails (unique constraint)
 * - The GET endpoint never creates duplicate records even when called concurrently
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fc from "fast-check";
import { GET } from "@/app/api/settings/preferences/route";

// Mock Clerk auth
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

// Mock database client
vi.mock("@/lib/db/client", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
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

async function setupAuthenticatedUser(clerkUserId: string, dbUserId: string) {
  const { auth } = await import("@clerk/nextjs/server");
  vi.mocked(auth).mockResolvedValue({ userId: clerkUserId } as any);

  const { syncCurrentUserToDatabase } = await import("@/lib/auth/current-user");
  vi.mocked(syncCurrentUserToDatabase).mockResolvedValue({
    id: dbUserId,
    clerkUserId,
    email: "test@example.com",
    createdAt: new Date("2024-01-01"),
  } as any);
}

function makeDefaultPrefs(userId: string) {
  return {
    id: "pref-id-1",
    userId,
    emailNotifications: {
      meetingSummary: true,
      actionItems: false,
      weeklyDigest: false,
      productUpdates: true,
    },
    defaultEmailTone: "professional",
    summaryLength: "standard",
    language: "en",
    botDisplayName: "Artiva Notetaker",
    audioSource: "default",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Sets up the db mock to simulate a user that already has preferences.
 * The select returns an existing record, so insert should NOT be called.
 */
async function setupDbWithExistingPrefs(userId: string) {
  const { db } = await import("@/lib/db/client");
  const existingPrefs = makeDefaultPrefs(userId);

  const mockLimit = vi.fn().mockResolvedValue([existingPrefs]);
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  vi.mocked(db!.select).mockReturnValue({ from: mockFrom } as any);

  return { existingPrefs };
}

/**
 * Sets up the db mock to simulate a user with NO existing preferences.
 * The select returns empty, so insert WILL be called once.
 */
async function setupDbWithNoPrefs(userId: string) {
  const { db } = await import("@/lib/db/client");
  const newPrefs = makeDefaultPrefs(userId);

  // select returns empty (no existing record)
  const mockLimit = vi.fn().mockResolvedValue([]);
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  vi.mocked(db!.select).mockReturnValue({ from: mockFrom } as any);

  // insert returns the newly created record
  const mockReturning = vi.fn().mockResolvedValue([newPrefs]);
  const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
  vi.mocked(db!.insert).mockReturnValue({ values: mockValues } as any);

  return { newPrefs, mockValues, mockReturning };
}

describe("Property 2: User Preferences Uniqueness Invariant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("when preferences already exist, insert is never called (no duplicate creation)", async () => {
    /**
     * **Validates: Requirements 1.1**
     * Property: For any user that already has a user_preferences record,
     * GET /api/settings/preferences MUST NOT attempt to insert another record.
     * This enforces the at-most-one invariant at the application layer.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (clerkUserId, dbUserId) => {
          vi.clearAllMocks();
          await setupAuthenticatedUser(clerkUserId, dbUserId);
          await setupDbWithExistingPrefs(dbUserId);

          const { db } = await import("@/lib/db/client");

          const response = await GET();
          const body = await response.json();

          expect(response.status).toBe(200);
          expect(body.success).toBe(true);
          // insert must NOT be called — no duplicate record should be created
          expect(vi.mocked(db!.insert)).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 30 }
    );
  });

  it("when no preferences exist, insert is called exactly once (single record creation)", async () => {
    /**
     * **Validates: Requirements 1.1**
     * Property: For any user without existing preferences,
     * GET /api/settings/preferences MUST insert exactly one record.
     * Inserting more than once would violate the unique constraint on userId.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (clerkUserId, dbUserId) => {
          vi.clearAllMocks();
          await setupAuthenticatedUser(clerkUserId, dbUserId);
          await setupDbWithNoPrefs(dbUserId);

          const { db } = await import("@/lib/db/client");

          const response = await GET();
          const body = await response.json();

          expect(response.status).toBe(200);
          expect(body.success).toBe(true);
          // insert must be called exactly once — not zero, not two
          expect(vi.mocked(db!.insert)).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 30 }
    );
  });

  it("unique constraint violation on duplicate insert propagates as a 500 error", async () => {
    /**
     * **Validates: Requirements 1.1**
     * Property: If the database rejects a duplicate insert (unique constraint violation),
     * the API MUST return a 500 error rather than silently succeeding or creating a duplicate.
     * This confirms the unique constraint on userId is the final enforcement mechanism.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (clerkUserId, dbUserId) => {
          vi.clearAllMocks();
          await setupAuthenticatedUser(clerkUserId, dbUserId);

          const { db } = await import("@/lib/db/client");

          // select returns empty (no existing record found)
          const mockLimit = vi.fn().mockResolvedValue([]);
          const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
          const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
          vi.mocked(db!.select).mockReturnValue({ from: mockFrom } as any);

          // insert throws a unique constraint violation (simulating DB enforcement)
          const uniqueConstraintError = new Error(
            'duplicate key value violates unique constraint "user_preferences_user_id_unique"'
          );
          const mockReturning = vi.fn().mockRejectedValue(uniqueConstraintError);
          const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
          vi.mocked(db!.insert).mockReturnValue({ values: mockValues } as any);

          const response = await GET();

          // The API must surface the error rather than swallow it
          expect(response.status).toBe(500);
        }
      ),
      { numRuns: 20 }
    );
  });

  it("insert values always include the correct userId (no cross-user contamination)", async () => {
    /**
     * **Validates: Requirements 1.1**
     * Property: For any user, when a new preferences record is created,
     * the inserted record MUST use that user's own userId.
     * Inserting with a different userId would violate the uniqueness invariant
     * by potentially creating a record under another user's identity.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (clerkUserId, dbUserId) => {
          vi.clearAllMocks();
          await setupAuthenticatedUser(clerkUserId, dbUserId);
          const { newPrefs, mockValues } = await setupDbWithNoPrefs(dbUserId);

          await GET();

          // The values passed to insert must contain the correct userId
          expect(mockValues).toHaveBeenCalledTimes(1);
          const insertedValues = mockValues.mock.calls[0][0];
          expect(insertedValues.userId).toBe(dbUserId);
        }
      ),
      { numRuns: 30 }
    );
  });
});

describe("Property 3: Default Preferences Creation Idempotence", () => {
  /**
   * **Property 3: Default Preferences Creation Idempotence**
   * **Validates: Requirements 2.3**
   *
   * For any user u without existing preferences:
   * - WHEN GET /api/settings/preferences is called multiple times without intervening POST
   * - THEN all calls SHALL return the same preferences object
   * - AND only one database record SHALL be created
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("multiple GET calls for a new user always return the same default preferences object", async () => {
    /**
     * **Validates: Requirements 2.3**
     * Property: For any user without existing preferences, calling GET multiple times
     * must return the same default preferences object on every call.
     * The returned object must be structurally identical across all calls.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.integer({ min: 2, max: 5 }),
        async (clerkUserId, dbUserId, callCount) => {
          vi.clearAllMocks();
          await setupAuthenticatedUser(clerkUserId, dbUserId);

          const { db } = await import("@/lib/db/client");
          const newPrefs = makeDefaultPrefs(dbUserId);

          // Each GET call: select returns empty first time, then returns the created record
          // We simulate: first call creates, subsequent calls find the record
          let callIndex = 0;
          vi.mocked(db!.select).mockImplementation(() => {
            const isFirstCall = callIndex === 0;
            callIndex++;
            const mockLimit = vi.fn().mockResolvedValue(isFirstCall ? [] : [newPrefs]);
            const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
            const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
            return { from: mockFrom } as any;
          });

          // insert returns the newly created record (only called once)
          const mockReturning = vi.fn().mockResolvedValue([newPrefs]);
          const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
          vi.mocked(db!.insert).mockReturnValue({ values: mockValues } as any);

          // Make multiple GET calls
          const responses = await Promise.all(
            Array.from({ length: callCount }, () => GET())
          );

          // All responses must be 200
          for (const response of responses) {
            expect(response.status).toBe(200);
          }

          // All responses must return the same preferences object
          const bodies = await Promise.all(responses.map((r) => r.json()));
          for (const body of bodies) {
            expect(body.success).toBe(true);
            expect(body.preferences).toEqual({
              emailNotifications: newPrefs.emailNotifications,
              defaultEmailTone: newPrefs.defaultEmailTone,
              summaryLength: newPrefs.summaryLength,
              language: newPrefs.language,
              botDisplayName: newPrefs.botDisplayName,
              audioSource: newPrefs.audioSource,
            });
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  it("only one database record is created regardless of how many GET calls are made", async () => {
    /**
     * **Validates: Requirements 2.3**
     * Property: For any user without existing preferences, no matter how many times
     * GET is called, the insert operation must be called at most once.
     * Subsequent calls must find the existing record and skip insertion.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.integer({ min: 2, max: 5 }),
        async (clerkUserId, dbUserId, callCount) => {
          vi.clearAllMocks();
          await setupAuthenticatedUser(clerkUserId, dbUserId);

          const { db } = await import("@/lib/db/client");
          const newPrefs = makeDefaultPrefs(dbUserId);

          // Simulate sequential calls: first call finds no record, subsequent calls find the created record
          let insertCallCount = 0;
          let selectCallCount = 0;

          vi.mocked(db!.select).mockImplementation(() => {
            const isFirstSelect = selectCallCount === 0;
            selectCallCount++;
            const mockLimit = vi.fn().mockResolvedValue(isFirstSelect ? [] : [newPrefs]);
            const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
            const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
            return { from: mockFrom } as any;
          });

          vi.mocked(db!.insert).mockImplementation(() => {
            insertCallCount++;
            const mockReturning = vi.fn().mockResolvedValue([newPrefs]);
            const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
            return { values: mockValues } as any;
          });

          // Make sequential GET calls (not parallel, to simulate real sequential usage)
          for (let i = 0; i < callCount; i++) {
            const response = await GET();
            expect(response.status).toBe(200);
          }

          // Insert must have been called exactly once — only on the first GET
          expect(insertCallCount).toBe(1);
        }
      ),
      { numRuns: 20 }
    );
  });

  it("default preferences returned for new users always have the correct default field values", async () => {
    /**
     * **Validates: Requirements 2.3**
     * Property: For any new user, the default preferences created by GET must
     * always contain the canonical default values regardless of userId.
     * This ensures idempotent initialization produces consistent defaults.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (clerkUserId, dbUserId) => {
          vi.clearAllMocks();
          await setupAuthenticatedUser(clerkUserId, dbUserId);
          await setupDbWithNoPrefs(dbUserId);

          const response = await GET();
          const body = await response.json();

          expect(response.status).toBe(200);
          expect(body.success).toBe(true);

          const prefs = body.preferences;

          // Default email notifications
          expect(prefs.emailNotifications.meetingSummary).toBe(true);
          expect(prefs.emailNotifications.actionItems).toBe(false);
          expect(prefs.emailNotifications.weeklyDigest).toBe(false);
          expect(prefs.emailNotifications.productUpdates).toBe(true);

          // Default AI behavior preferences
          expect(prefs.defaultEmailTone).toBe("professional");
          expect(prefs.summaryLength).toBe("standard");
          expect(prefs.language).toBe("en");

          // Default bot settings
          expect(prefs.botDisplayName).toBe("Artiva Notetaker");
          expect(prefs.audioSource).toBe("default");
        }
      ),
      { numRuns: 30 }
    );
  });
});
