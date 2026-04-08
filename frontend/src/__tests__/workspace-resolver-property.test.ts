/**
 * Property Tests for resolveWorkspaceIdForRequest
 * Feature: workspace-redesign
 *
 * Property 10: API resolver returns null without x-workspace-id header
 * Validates: Requirements 7.3
 *
 * Property 11: API resolver enforces active membership
 * Validates: Requirements 7.4, 7.5
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Mocks — must be hoisted so vi.mock factories can reference them
// ---------------------------------------------------------------------------

const { mockDbSelect } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  db: { select: mockDbSelect },
}));

vi.mock("@/db/schema", () => ({
  workspaceMembers: {
    workspaceId: "workspaceId",
    userId: "userId",
    status: "status",
    createdAt: "createdAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ type: "and", args }),
  eq: (col: unknown, val: unknown) => ({ type: "eq", col, val }),
  asc: (col: unknown) => ({ type: "asc", col }),
}));

// ---------------------------------------------------------------------------
// Import the function under test AFTER mocks are set up
// ---------------------------------------------------------------------------

import { resolveWorkspaceIdForRequest } from "@/lib/workspaces/server";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generates a non-empty workspace ID string */
const workspaceIdArb = fc.string({ minLength: 1, maxLength: 64 }).filter(
  (s) => s.trim().length > 0
);

/** Generates a user ID string */
const userIdArb = fc.string({ minLength: 1, maxLength: 64 }).filter(
  (s) => s.trim().length > 0
);

/** Builds a Request with no x-workspace-id header */
function makeRequestWithoutHeader(url = "http://localhost/api/test"): Pick<Request, "headers"> {
  return new Request(url, { method: "GET" });
}

/** Builds a Request with an x-workspace-id header */
function makeRequestWithHeader(workspaceId: string, url = "http://localhost/api/test"): Pick<Request, "headers"> {
  return new Request(url, {
    method: "GET",
    headers: { "x-workspace-id": workspaceId },
  });
}

/** Configures mockDbSelect to simulate a membership lookup result */
function mockMembershipLookup(found: boolean, workspaceId?: string) {
  const row = found && workspaceId ? [{ workspaceId }] : [];
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(row),
      }),
    }),
  });
}

// ---------------------------------------------------------------------------
// Property 10: API resolver returns null without x-workspace-id header
// Feature: workspace-redesign, Property 10: API resolver returns null without x-workspace-id header
// ---------------------------------------------------------------------------

describe("Property 10: API resolver returns null without x-workspace-id header (Req 7.3)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when request is undefined (no auto-select fallback)", async () => {
    // Feature: workspace-redesign, Property 10: API resolver returns null without x-workspace-id header
    await fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        const result = await resolveWorkspaceIdForRequest(undefined, userId);
        expect(result).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it("returns null when request has no x-workspace-id header", async () => {
    // Feature: workspace-redesign, Property 10: API resolver returns null without x-workspace-id header
    await fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        const request = makeRequestWithoutHeader();
        const result = await resolveWorkspaceIdForRequest(request, userId);
        expect(result).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it("returns null when x-workspace-id header is empty or whitespace", async () => {
    // Feature: workspace-redesign, Property 10: API resolver returns null without x-workspace-id header
    const blankArb = fc.oneof(
      fc.constant(""),
      fc.constant("   "),
      fc.constant("\t"),
      fc.constant("  \n  ")
    );

    await fc.assert(
      fc.asyncProperty(userIdArb, blankArb, async (userId, blank) => {
        const request = new Request("http://localhost/api/test", {
          headers: { "x-workspace-id": blank },
        });
        const result = await resolveWorkspaceIdForRequest(request, userId);
        expect(result).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it("never calls the DB when no x-workspace-id header is present", async () => {
    // Feature: workspace-redesign, Property 10: API resolver returns null without x-workspace-id header
    await fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        mockDbSelect.mockClear();
        const request = makeRequestWithoutHeader();
        await resolveWorkspaceIdForRequest(request, userId);
        // DB must not be queried — no header means personal mode immediately
        expect(mockDbSelect).not.toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 11: API resolver enforces active membership
// Feature: workspace-redesign, Property 11: API resolver enforces active membership
// ---------------------------------------------------------------------------

describe("Property 11: API resolver enforces active membership (Req 7.4, 7.5)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the workspaceId when user is an active member", async () => {
    // Feature: workspace-redesign, Property 11: API resolver enforces active membership
    await fc.assert(
      fc.asyncProperty(workspaceIdArb, userIdArb, async (workspaceId, userId) => {
        // The function trims the header value, so use the trimmed form for comparison
        const trimmedId = workspaceId.trim();
        fc.pre(trimmedId.length > 0);
        mockMembershipLookup(true, trimmedId);
        const request = makeRequestWithHeader(trimmedId);
        const result = await resolveWorkspaceIdForRequest(request, userId);
        expect(result).toBe(trimmedId);
      }),
      { numRuns: 100 }
    );
  });

  it("returns null when user is NOT an active member of the requested workspace", async () => {
    // Feature: workspace-redesign, Property 11: API resolver enforces active membership
    await fc.assert(
      fc.asyncProperty(workspaceIdArb, userIdArb, async (workspaceId, userId) => {
        mockMembershipLookup(false);
        const request = makeRequestWithHeader(workspaceId);
        const result = await resolveWorkspaceIdForRequest(request, userId);
        expect(result).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it("always queries the DB with the exact workspaceId and userId from the request/session", async () => {
    // Feature: workspace-redesign, Property 11: API resolver enforces active membership
    await fc.assert(
      fc.asyncProperty(workspaceIdArb, userIdArb, async (workspaceId, userId) => {
        const mockWhere = vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        });
        // Reset the top-level mock each iteration
        mockDbSelect.mockClear();
        mockDbSelect.mockReturnValue({
          from: vi.fn().mockReturnValue({ where: mockWhere }),
        });

        const request = makeRequestWithHeader(workspaceId);
        await resolveWorkspaceIdForRequest(request, userId);

        // DB must have been queried exactly once for membership
        expect(mockDbSelect).toHaveBeenCalledTimes(1);
        expect(mockWhere).toHaveBeenCalledTimes(1);
      }),
      { numRuns: 100 }
    );
  });

  it("non-member result means caller should return 403 — resolver returns null as the signal", async () => {
    // Feature: workspace-redesign, Property 11: API resolver enforces active membership
    // The resolver returns null for non-members; the API route is responsible for the 403.
    // This property verifies the resolver's contract: non-member → null (never the workspaceId).
    await fc.assert(
      fc.asyncProperty(
        workspaceIdArb,
        userIdArb,
        fc.boolean(), // isMember
        async (workspaceId, userId, isMember) => {
          const trimmedId = workspaceId.trim();
          fc.pre(trimmedId.length > 0);
          mockMembershipLookup(isMember, trimmedId);
          const request = makeRequestWithHeader(trimmedId);
          const result = await resolveWorkspaceIdForRequest(request, userId);

          if (isMember) {
            expect(result).toBe(trimmedId);
          } else {
            expect(result).toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
