/**
 * Property-Based Tests: Bot Settings Validation
 *
 * **Property 6: Bot Settings Validation**
 * **Validates: Requirements 3.5**
 *
 * Tests that:
 * - Empty botDisplayName returns 400 and no database update occurs
 * - Null/undefined botDisplayName returns 400 and no database update occurs
 * - Valid botDisplayName proceeds without 400
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fc from "fast-check";
import { POST } from "@/app/api/settings/bot/route";

// Mock Clerk auth
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

// Mock database client
vi.mock("@/lib/db/client", () => ({
  db: {
    update: vi.fn(),
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

async function setupAuthenticatedUser() {
  const { auth } = await import("@clerk/nextjs/server");
  vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/settings/bot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Property 6: Bot Settings Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("empty botDisplayName always returns 400 and no DB update occurs", async () => {
    /**
     * **Validates: Requirements 3.5**
     * Property: For any request where botDisplayName is empty string,
     * the API MUST return 400 and MUST NOT call db.update.
     */
    await setupAuthenticatedUser();

    const { db } = await import("@/lib/db/client");

    await fc.assert(
      fc.asyncProperty(
        // audioSource can be anything (optional field)
        fc.option(fc.string(), { nil: undefined }),
        async (audioSource) => {
          vi.clearAllMocks();
          await setupAuthenticatedUser();

          const body: Record<string, unknown> = { botDisplayName: "" };
          if (audioSource !== undefined) body.audioSource = audioSource;

          const request = makeRequest(body);
          const response = await POST(request);

          expect(response.status).toBe(400);
          expect(vi.mocked(db.update)).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 20 }
    );
  });

  it("null botDisplayName always returns 400 and no DB update occurs", async () => {
    /**
     * **Validates: Requirements 3.5**
     * Property: For any request where botDisplayName is null,
     * the API MUST return 400 and MUST NOT call db.update.
     */
    await setupAuthenticatedUser();

    const { db } = await import("@/lib/db/client");

    await fc.assert(
      fc.asyncProperty(
        fc.option(fc.string(), { nil: undefined }),
        async (audioSource) => {
          vi.clearAllMocks();
          await setupAuthenticatedUser();

          const body: Record<string, unknown> = { botDisplayName: null };
          if (audioSource !== undefined) body.audioSource = audioSource;

          const request = makeRequest(body);
          const response = await POST(request);

          expect(response.status).toBe(400);
          expect(vi.mocked(db.update)).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 20 }
    );
  });

  it("undefined botDisplayName always returns 400 and no DB update occurs", async () => {
    /**
     * **Validates: Requirements 3.5**
     * Property: For any request where botDisplayName is absent/undefined,
     * the API MUST return 400 and MUST NOT call db.update.
     */
    await setupAuthenticatedUser();

    const { db } = await import("@/lib/db/client");

    await fc.assert(
      fc.asyncProperty(
        fc.option(fc.string(), { nil: undefined }),
        async (audioSource) => {
          vi.clearAllMocks();
          await setupAuthenticatedUser();

          const body: Record<string, unknown> = {};
          if (audioSource !== undefined) body.audioSource = audioSource;

          const request = makeRequest(body);
          const response = await POST(request);

          expect(response.status).toBe(400);
          expect(vi.mocked(db.update)).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 20 }
    );
  });

  it("valid non-empty botDisplayName never returns 400", async () => {
    /**
     * **Validates: Requirements 3.5**
     * Property: For any request where botDisplayName is a non-empty string,
     * the API MUST NOT return 400 (validation passes).
     */
    const { db } = await import("@/lib/db/client");

    await fc.assert(
      fc.asyncProperty(
        // Non-empty strings only
        fc.string({ minLength: 1 }),
        fc.option(fc.string(), { nil: undefined }),
        async (botDisplayName, audioSource) => {
          vi.clearAllMocks();
          await setupAuthenticatedUser();

          // Setup db.update mock to succeed
          const mockWhere = vi.fn().mockResolvedValue(undefined);
          const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
          vi.mocked(db.update).mockReturnValue({ set: mockSet } as any);

          const body: Record<string, unknown> = { botDisplayName };
          if (audioSource !== undefined) body.audioSource = audioSource;

          const request = makeRequest(body);
          const response = await POST(request);

          // Should not be a validation error
          expect(response.status).not.toBe(400);
        }
      ),
      { numRuns: 50 }
    );
  });
});
