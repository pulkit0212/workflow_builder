/**
 * Property-Based Tests: Workspace Meetings API Returns Only Approved Meetings
 *
 * // Feature: workspace-integration, Property 3: Workspace meetings API returns only approved meetings
 *
 * **Validates: Requirements 8.4, 8.5**
 *
 * For any workspace, all rows returned by GET /api/workspace/[workspaceId]/meetings
 * must have workspace_move_status = 'approved' and workspaceId equal to the requested
 * workspace id. No row with any other status or different workspaceId may appear.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ── Types ─────────────────────────────────────────────────────────────────────

type WorkspaceMoveStatus = null | "pending_approval" | "approved" | "rejected";

type MeetingSession = {
  id: string;
  workspaceId: string | null;
  workspaceMoveStatus: WorkspaceMoveStatus;
  title: string;
};

// ── Filter Logic ──────────────────────────────────────────────────────────────

/**
 * Simulates the filtering logic from GET /api/workspace/[workspaceId]/meetings:
 *   WHERE workspaceId = wid AND workspace_move_status = 'approved'
 *
 * This mirrors the Drizzle query conditions in route.ts:
 *   eq(meetingSessions.workspaceId, workspaceId),
 *   eq(meetingSessions.workspaceMoveStatus, "approved"),
 */
function filterWorkspaceMeetings(
  pool: MeetingSession[],
  requestedWorkspaceId: string
): MeetingSession[] {
  return pool.filter(
    (m) =>
      m.workspaceId === requestedWorkspaceId &&
      m.workspaceMoveStatus === "approved"
  );
}

// ── Generators ────────────────────────────────────────────────────────────────

const workspaceMoveStatusArb = fc.constantFrom<WorkspaceMoveStatus>(
  null,
  "pending_approval",
  "approved",
  "rejected"
);

/**
 * Generates a meeting session with an arbitrary status and workspaceId.
 * The workspaceId is drawn from a small pool so we get realistic overlap.
 */
function meetingSessionArb(workspaceIds: string[]): fc.Arbitrary<MeetingSession> {
  return fc.record({
    id: fc.uuid(),
    workspaceId: fc.option(fc.constantFrom(...workspaceIds), { nil: null }),
    workspaceMoveStatus: workspaceMoveStatusArb,
    title: fc.string({ minLength: 1, maxLength: 50 }),
  });
}

// ── Property 3 ────────────────────────────────────────────────────────────────

describe(
  // Feature: workspace-integration, Property 3: Workspace meetings API returns only approved meetings
  "Property 3: Workspace meetings API returns only approved meetings",
  () => {
    it(
      "every row in the filtered result has workspace_move_status='approved'",
      () => {
        /**
         * **Validates: Requirements 8.4**
         *
         * For any pool of meeting sessions with various statuses, the filter
         * must only return rows where workspace_move_status is 'approved'.
         */
        fc.assert(
          fc.property(
            fc.array(fc.uuid(), { minLength: 1, maxLength: 3 }),
            fc.uuid(),
            fc.array(
              fc.record({
                id: fc.uuid(),
                workspaceId: fc.option(fc.uuid(), { nil: null }),
                workspaceMoveStatus: workspaceMoveStatusArb,
                title: fc.string({ minLength: 1, maxLength: 50 }),
              }),
              { minLength: 0, maxLength: 20 }
            ),
            (_workspaceIds, requestedWorkspaceId, pool) => {
              const result = filterWorkspaceMeetings(pool, requestedWorkspaceId);

              for (const row of result) {
                expect(row.workspaceMoveStatus).toBe("approved");
              }
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "every row in the filtered result has workspaceId equal to the requested workspace id",
      () => {
        /**
         * **Validates: Requirements 8.5**
         *
         * For any pool of meeting sessions belonging to various workspaces,
         * the filter must only return rows whose workspaceId matches the
         * requested workspace id.
         */
        fc.assert(
          fc.property(
            fc.array(fc.uuid(), { minLength: 1, maxLength: 3 }),
            fc.uuid(),
            fc.array(
              fc.record({
                id: fc.uuid(),
                workspaceId: fc.option(fc.uuid(), { nil: null }),
                workspaceMoveStatus: workspaceMoveStatusArb,
                title: fc.string({ minLength: 1, maxLength: 50 }),
              }),
              { minLength: 0, maxLength: 20 }
            ),
            (_workspaceIds, requestedWorkspaceId, pool) => {
              const result = filterWorkspaceMeetings(pool, requestedWorkspaceId);

              for (const row of result) {
                expect(row.workspaceId).toBe(requestedWorkspaceId);
              }
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "no meeting with a non-approved status appears in the result",
      () => {
        /**
         * **Validates: Requirements 8.5**
         *
         * Meetings with status null, 'pending_approval', or 'rejected' must
         * never appear in the filtered result, regardless of their workspaceId.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // requested workspace id
            fc.array(
              fc.record({
                id: fc.uuid(),
                workspaceId: fc.uuid(), // always matches to isolate the status check
                workspaceMoveStatus: fc.constantFrom<WorkspaceMoveStatus>(
                  null,
                  "pending_approval",
                  "rejected"
                ),
                title: fc.string({ minLength: 1, maxLength: 50 }),
              }),
              { minLength: 1, maxLength: 20 }
            ),
            (requestedWorkspaceId, nonApprovedMeetings) => {
              // Force all meetings to belong to the requested workspace
              const pool: MeetingSession[] = nonApprovedMeetings.map((m) => ({
                ...m,
                workspaceId: requestedWorkspaceId,
              }));

              const result = filterWorkspaceMeetings(pool, requestedWorkspaceId);

              // None of the non-approved meetings should appear
              expect(result).toHaveLength(0);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "no meeting with a different workspaceId appears in the result",
      () => {
        /**
         * **Validates: Requirements 8.4, 8.5**
         *
         * Meetings belonging to a different workspace must never appear in the
         * result, even if they have workspace_move_status='approved'.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // requested workspace id
            fc.uuid(), // a different workspace id
            fc.array(
              fc.record({
                id: fc.uuid(),
                workspaceMoveStatus: fc.constant<WorkspaceMoveStatus>("approved"),
                title: fc.string({ minLength: 1, maxLength: 50 }),
              }),
              { minLength: 1, maxLength: 20 }
            ),
            (requestedWorkspaceId, otherWorkspaceId, approvedMeetings) => {
              // Ensure the two workspace ids are distinct
              fc.pre(requestedWorkspaceId !== otherWorkspaceId);

              // All meetings belong to the OTHER workspace
              const pool: MeetingSession[] = approvedMeetings.map((m) => ({
                ...m,
                workspaceId: otherWorkspaceId,
              }));

              const result = filterWorkspaceMeetings(pool, requestedWorkspaceId);

              // No meetings from the other workspace should appear
              expect(result).toHaveLength(0);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "approved meetings for the requested workspace are all included in the result",
      () => {
        /**
         * **Validates: Requirements 8.4**
         *
         * Every meeting that has workspace_move_status='approved' AND
         * workspaceId equal to the requested workspace id must appear in the result.
         * The filter must not drop valid meetings.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // requested workspace id
            fc.array(fc.uuid(), { minLength: 1, maxLength: 10 }),
            (requestedWorkspaceId, meetingIds) => {
              // Build a pool of approved meetings for the requested workspace
              const approvedPool: MeetingSession[] = meetingIds.map((id) => ({
                id,
                workspaceId: requestedWorkspaceId,
                workspaceMoveStatus: "approved",
                title: `Meeting ${id}`,
              }));

              const result = filterWorkspaceMeetings(approvedPool, requestedWorkspaceId);

              // All approved meetings for this workspace must be returned
              expect(result).toHaveLength(approvedPool.length);
              for (const meeting of approvedPool) {
                expect(result.some((r) => r.id === meeting.id)).toBe(true);
              }
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "mixed pool: only approved meetings for the requested workspace are returned",
      () => {
        /**
         * **Validates: Requirements 8.4, 8.5**
         *
         * Given a realistic mixed pool (various statuses, various workspaceIds),
         * the filter returns exactly the meetings that satisfy BOTH conditions:
         * workspaceId = requestedWorkspaceId AND workspace_move_status = 'approved'.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // requested workspace id
            fc.array(fc.uuid(), { minLength: 1, maxLength: 3 }),
            fc.array(
              fc.record({
                id: fc.uuid(),
                workspaceId: fc.option(fc.uuid(), { nil: null }),
                workspaceMoveStatus: workspaceMoveStatusArb,
                title: fc.string({ minLength: 1, maxLength: 50 }),
              }),
              { minLength: 0, maxLength: 30 }
            ),
            (requestedWorkspaceId, _otherWorkspaceIds, pool) => {
              const result = filterWorkspaceMeetings(pool, requestedWorkspaceId);

              // Compute expected result independently
              const expected = pool.filter(
                (m) =>
                  m.workspaceId === requestedWorkspaceId &&
                  m.workspaceMoveStatus === "approved"
              );

              expect(result).toHaveLength(expected.length);

              // Every result row satisfies both conditions
              for (const row of result) {
                expect(row.workspaceId).toBe(requestedWorkspaceId);
                expect(row.workspaceMoveStatus).toBe("approved");
              }
            }
          ),
          { numRuns: 100 }
        );
      }
    );
  }
);
