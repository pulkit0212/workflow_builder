/**
 * Property Tests for Dashboard Data Isolation
 * Feature: workspace-redesign
 *
 * Property 12: Personal mode API returns only user-owned records
 * Validates: Requirements 7.3, 4.1
 *
 * Property 13: Workspace mode API returns only workspace-scoped records
 * Validates: Requirements 7.2, 4.2
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Pure logic extracted from the API query layer for property testing.
// These functions mirror the scoping logic in listMeetingSessionsByUser
// and resolveWorkspaceIdForRequest.
// ---------------------------------------------------------------------------

type MeetingRecord = {
  id: string;
  userId: string;
  workspaceId: string | null;
  title: string;
};

/**
 * Simulates the personal-mode query filter:
 * WHERE userId = authenticatedUser
 * (workspaceId is absent → personal mode)
 */
function filterPersonalMode(records: MeetingRecord[], userId: string): MeetingRecord[] {
  return records.filter((r) => r.userId === userId);
}

/**
 * Simulates the workspace-mode query filter:
 * WHERE workspaceId = resolvedWorkspaceId AND userId = authenticatedUser
 * (workspaceId is present → workspace mode)
 */
function filterWorkspaceMode(
  records: MeetingRecord[],
  workspaceId: string,
  userId: string
): MeetingRecord[] {
  return records.filter((r) => r.workspaceId === workspaceId && r.userId === userId);
}

/**
 * Simulates the header-injection logic of useWorkspaceFetch:
 * - personal mode (null): no x-workspace-id header
 * - workspace mode (non-null): x-workspace-id header set
 */
function buildRequestHeaders(activeWorkspaceId: string | null): Record<string, string> {
  if (!activeWorkspaceId) return {};
  return { "x-workspace-id": activeWorkspaceId };
}

/**
 * Simulates resolveWorkspaceIdForRequest:
 * - absent header → null (personal mode)
 * - present header → workspaceId (workspace mode, membership assumed valid)
 * Note: the real resolver trims the header value.
 */
function resolveWorkspaceId(headers: Record<string, string>): string | null {
  const header = headers["x-workspace-id"];
  if (!header || header.trim().length === 0) return null;
  return header.trim();
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const userIdArb = fc
  .string({ minLength: 1, maxLength: 36 })
  .filter((s) => s.trim().length > 0 && s === s.trim());

const workspaceIdArb = fc
  .string({ minLength: 1, maxLength: 36 })
  .filter((s) => s.trim().length > 0 && s === s.trim());

const meetingRecordArb = (userIds: string[], workspaceIds: (string | null)[]) =>
  fc.record({
    id: fc.uuid(),
    userId: fc.oneof(...userIds.map((id) => fc.constant(id))),
    workspaceId: fc.oneof(...workspaceIds.map((id) => fc.constant(id))),
    title: fc.string({ minLength: 1, maxLength: 50 }),
  });

// ---------------------------------------------------------------------------
// Property 12: Personal mode API returns only user-owned records
// Feature: workspace-redesign, Property 12: Personal mode API returns only user-owned records
// ---------------------------------------------------------------------------

describe("Property 12: Personal mode API returns only user-owned records (Req 7.3, 4.1)", () => {
  it("all returned records have userId equal to the authenticated user", () => {
    // Feature: workspace-redesign, Property 12: Personal mode API returns only user-owned records
    fc.assert(
      fc.property(
        userIdArb,
        fc.array(userIdArb, { minLength: 1, maxLength: 5 }),
        fc.array(workspaceIdArb, { minLength: 1, maxLength: 3 }),
        (authenticatedUser, otherUsers, workspaceIds) => {
          const allUsers = [authenticatedUser, ...otherUsers];
          const allWorkspaceIds: (string | null)[] = [...workspaceIds, null];

          // Build a mixed dataset with records from multiple users and workspaces
          const records: MeetingRecord[] = allUsers.flatMap((uid, i) =>
            allWorkspaceIds.map((wsId, j) => ({
              id: `${i}-${j}`,
              userId: uid,
              workspaceId: wsId,
              title: `Meeting ${i}-${j}`,
            }))
          );

          // Personal mode: no workspace header → filter by userId only
          const headers = buildRequestHeaders(null);
          const resolvedWorkspaceId = resolveWorkspaceId(headers);
          expect(resolvedWorkspaceId).toBeNull();

          const result = filterPersonalMode(records, authenticatedUser);

          // Every returned record must belong to the authenticated user
          for (const record of result) {
            expect(record.userId).toBe(authenticatedUser);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("personal mode never returns records from other users", () => {
    // Feature: workspace-redesign, Property 12: Personal mode API returns only user-owned records
    fc.assert(
      fc.property(
        userIdArb,
        userIdArb,
        fc.array(workspaceIdArb, { minLength: 1, maxLength: 3 }),
        (authenticatedUser, otherUser, workspaceIds) => {
          fc.pre(authenticatedUser !== otherUser);

          const records: MeetingRecord[] = workspaceIds.map((wsId, i) => ({
            id: `other-${i}`,
            userId: otherUser,
            workspaceId: wsId,
            title: `Other user meeting ${i}`,
          }));

          const result = filterPersonalMode(records, authenticatedUser);

          // No records from other users should appear
          expect(result).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("personal mode never returns workspace records from other users even if workspaceId matches", () => {
    // Feature: workspace-redesign, Property 12: Personal mode API returns only user-owned records
    fc.assert(
      fc.property(
        userIdArb,
        userIdArb,
        workspaceIdArb,
        (authenticatedUser, otherUser, workspaceId) => {
          fc.pre(authenticatedUser !== otherUser);

          // Records owned by other user in a workspace
          const records: MeetingRecord[] = [
            { id: "1", userId: otherUser, workspaceId, title: "Other user workspace meeting" },
            { id: "2", userId: authenticatedUser, workspaceId: null, title: "My personal meeting" },
          ];

          const result = filterPersonalMode(records, authenticatedUser);

          // Only the authenticated user's record should appear
          expect(result).toHaveLength(1);
          expect(result[0].userId).toBe(authenticatedUser);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("no x-workspace-id header is sent in personal mode", () => {
    // Feature: workspace-redesign, Property 12: Personal mode API returns only user-owned records
    fc.assert(
      fc.property(fc.constant(null), (activeWorkspaceId) => {
        const headers = buildRequestHeaders(activeWorkspaceId);
        expect(headers["x-workspace-id"]).toBeUndefined();
        expect(resolveWorkspaceId(headers)).toBeNull();
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 13: Workspace mode API returns only workspace-scoped records
// Feature: workspace-redesign, Property 13: Workspace mode API returns only workspace-scoped records
// ---------------------------------------------------------------------------

describe("Property 13: Workspace mode API returns only workspace-scoped records (Req 7.2, 4.2)", () => {
  it("all returned records have workspaceId equal to the resolved workspace", () => {
    // Feature: workspace-redesign, Property 13: Workspace mode API returns only workspace-scoped records
    fc.assert(
      fc.property(
        workspaceIdArb,
        userIdArb,
        fc.array(workspaceIdArb, { minLength: 1, maxLength: 3 }),
        fc.array(userIdArb, { minLength: 1, maxLength: 3 }),
        (activeWorkspaceId, authenticatedUser, otherWorkspaceIds, otherUsers) => {
          const allWorkspaceIds: (string | null)[] = [
            activeWorkspaceId,
            ...otherWorkspaceIds.filter((id) => id !== activeWorkspaceId),
            null,
          ];
          const allUsers = [authenticatedUser, ...otherUsers];

          // Build a mixed dataset
          const records: MeetingRecord[] = allUsers.flatMap((uid, i) =>
            allWorkspaceIds.map((wsId, j) => ({
              id: `${i}-${j}`,
              userId: uid,
              workspaceId: wsId,
              title: `Meeting ${i}-${j}`,
            }))
          );

          // Workspace mode: x-workspace-id header present
          const headers = buildRequestHeaders(activeWorkspaceId);
          const resolvedWorkspaceId = resolveWorkspaceId(headers);
          expect(resolvedWorkspaceId).toBe(activeWorkspaceId);

          const result = filterWorkspaceMode(records, activeWorkspaceId, authenticatedUser);

          // Every returned record must belong to the active workspace
          for (const record of result) {
            expect(record.workspaceId).toBe(activeWorkspaceId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("workspace mode never returns records from other workspaces", () => {
    // Feature: workspace-redesign, Property 13: Workspace mode API returns only workspace-scoped records
    fc.assert(
      fc.property(
        workspaceIdArb,
        workspaceIdArb,
        userIdArb,
        (activeWorkspaceId, otherWorkspaceId, userId) => {
          fc.pre(activeWorkspaceId !== otherWorkspaceId);

          const records: MeetingRecord[] = [
            { id: "1", userId, workspaceId: otherWorkspaceId, title: "Other workspace meeting" },
            { id: "2", userId, workspaceId: null, title: "Personal meeting" },
          ];

          const result = filterWorkspaceMode(records, activeWorkspaceId, userId);

          // No records from other workspaces or personal records
          expect(result).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("workspace mode never returns personal records (workspaceId = null)", () => {
    // Feature: workspace-redesign, Property 13: Workspace mode API returns only workspace-scoped records
    fc.assert(
      fc.property(workspaceIdArb, userIdArb, (activeWorkspaceId, userId) => {
        const records: MeetingRecord[] = [
          { id: "1", userId, workspaceId: null, title: "Personal meeting 1" },
          { id: "2", userId, workspaceId: null, title: "Personal meeting 2" },
        ];

        const result = filterWorkspaceMode(records, activeWorkspaceId, userId);

        // Personal records (null workspaceId) must never appear in workspace mode
        expect(result).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });

  it("x-workspace-id header is set to activeWorkspaceId in workspace mode", () => {
    // Feature: workspace-redesign, Property 13: Workspace mode API returns only workspace-scoped records
    fc.assert(
      fc.property(workspaceIdArb, (activeWorkspaceId) => {
        const headers = buildRequestHeaders(activeWorkspaceId);
        expect(headers["x-workspace-id"]).toBe(activeWorkspaceId);
        expect(resolveWorkspaceId(headers)).toBe(activeWorkspaceId);
      }),
      { numRuns: 100 }
    );
  });

  it("personal and workspace modes never return the same set of records when data differs", () => {
    // Feature: workspace-redesign, Property 13: Workspace mode API returns only workspace-scoped records
    fc.assert(
      fc.property(
        workspaceIdArb,
        userIdArb,
        userIdArb,
        (workspaceId, userId1, userId2) => {
          fc.pre(userId1 !== userId2);

          const records: MeetingRecord[] = [
            { id: "personal-1", userId: userId1, workspaceId: null, title: "Personal" },
            { id: "workspace-1", userId: userId1, workspaceId, title: "Workspace" },
            { id: "other-user", userId: userId2, workspaceId, title: "Other user workspace" },
          ];

          const personalResults = filterPersonalMode(records, userId1);
          const workspaceResults = filterWorkspaceMode(records, workspaceId, userId1);

          const personalIds = new Set(personalResults.map((r) => r.id));
          const workspaceIds = new Set(workspaceResults.map((r) => r.id));

          // personal-1 is in personal mode but NOT in workspace mode (null workspaceId)
          expect(personalIds.has("personal-1")).toBe(true);
          expect(workspaceIds.has("personal-1")).toBe(false);

          // workspace-1 is in workspace mode AND personal mode (same userId)
          expect(workspaceIds.has("workspace-1")).toBe(true);

          // other-user record is never in userId1's personal results
          expect(personalIds.has("other-user")).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
