/**
 * Property-Based Tests: Personal Meetings Excluded from Workspace Responses
 *
 * // Feature: workspace-integration, Property 2: Personal meetings excluded from workspace responses
 *
 * **Validates: Requirements 15.4**
 *
 * For any meeting_session with workspaceId = null, a request to
 * GET /api/workspace/[workspaceId]/meetings for ANY workspace must return
 * zero rows matching that session's id.
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

/** Generates a personal meeting (workspaceId = null) with any status. */
const personalMeetingArb: fc.Arbitrary<MeetingSession> = fc.record({
  id: fc.uuid(),
  workspaceId: fc.constant(null),
  workspaceMoveStatus: workspaceMoveStatusArb,
  title: fc.string({ minLength: 1, maxLength: 50 }),
});

/** Generates a workspace meeting (workspaceId non-null). */
const workspaceMeetingArb: fc.Arbitrary<MeetingSession> = fc.record({
  id: fc.uuid(),
  workspaceId: fc.uuid(),
  workspaceMoveStatus: workspaceMoveStatusArb,
  title: fc.string({ minLength: 1, maxLength: 50 }),
});

// ── Property 2 ────────────────────────────────────────────────────────────────

describe(
  // Feature: workspace-integration, Property 2: Personal meetings excluded from workspace responses
  "Property 2: Personal meetings excluded from workspace responses",
  () => {
    it(
      "a personal meeting (workspaceId=null) never appears in any workspace response",
      () => {
        /**
         * **Validates: Requirements 15.4**
         *
         * For any personal meeting and any requested workspaceId, the meeting
         * must not appear in the filtered workspace response.
         */
        fc.assert(
          fc.property(
            personalMeetingArb,
            fc.uuid(), // any requested workspaceId
            (personalMeeting, requestedWorkspaceId) => {
              const result = filterWorkspaceMeetings(
                [personalMeeting],
                requestedWorkspaceId
              );

              expect(result.find((r) => r.id === personalMeeting.id)).toBeUndefined();
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "personal meetings are excluded even when mixed with workspace meetings",
      () => {
        /**
         * **Validates: Requirements 15.4**
         *
         * In a mixed pool of personal and workspace meetings, no personal
         * meeting (workspaceId=null) should appear in the workspace response
         * for any requested workspaceId.
         */
        fc.assert(
          fc.property(
            fc.array(personalMeetingArb, { minLength: 1, maxLength: 10 }),
            fc.array(workspaceMeetingArb, { minLength: 0, maxLength: 10 }),
            fc.uuid(), // requested workspaceId
            (personalMeetings, workspaceMeetings, requestedWorkspaceId) => {
              const pool: MeetingSession[] = [...personalMeetings, ...workspaceMeetings];
              const result = filterWorkspaceMeetings(pool, requestedWorkspaceId);

              const personalIds = new Set(personalMeetings.map((m) => m.id));
              for (const row of result) {
                expect(personalIds.has(row.id)).toBe(false);
              }
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "personal meeting with approved status still never appears in workspace response",
      () => {
        /**
         * **Validates: Requirements 15.4**
         *
         * Even if a personal meeting somehow has workspace_move_status='approved'
         * (which violates the invariant but tests the filter robustness),
         * it must not appear in any workspace response because workspaceId=null
         * cannot match any non-null workspaceId.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // meeting id
            fc.uuid(), // any requested workspaceId
            (meetingId, requestedWorkspaceId) => {
              const personalApproved: MeetingSession = {
                id: meetingId,
                workspaceId: null,
                workspaceMoveStatus: "approved",
                title: "Personal approved meeting",
              };

              const result = filterWorkspaceMeetings(
                [personalApproved],
                requestedWorkspaceId
              );

              expect(result.find((r) => r.id === meetingId)).toBeUndefined();
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "all personal meetings in a large pool are absent from any workspace response",
      () => {
        /**
         * **Validates: Requirements 15.4**
         *
         * For a large pool containing only personal meetings, the workspace
         * response must always be empty regardless of the requested workspaceId.
         */
        fc.assert(
          fc.property(
            fc.array(personalMeetingArb, { minLength: 1, maxLength: 50 }),
            fc.uuid(),
            (personalMeetings, requestedWorkspaceId) => {
              const result = filterWorkspaceMeetings(personalMeetings, requestedWorkspaceId);
              expect(result).toHaveLength(0);
            }
          ),
          { numRuns: 100 }
        );
      }
    );
  }
);
