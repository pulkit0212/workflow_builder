/**
 * Property-Based Tests: workspace_move_status / workspaceId Consistency Invariant
 *
 * Feature: workspace-integration, Property 1: workspace_move_status / workspaceId consistency invariant
 *
 * **Validates: Requirements 1.5, 1.6**
 *
 * For any meeting_session row:
 *   - if workspace_move_status is null, then workspaceId must also be null
 *   - if workspace_move_status is 'approved', then workspaceId must be non-null
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ── Types ─────────────────────────────────────────────────────────────────────

type WorkspaceMoveStatus = null | "pending_approval" | "approved" | "rejected";

type MeetingSession = {
  id: string;
  workspaceId: string | null;
  workspaceMoveStatus: WorkspaceMoveStatus;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Validates the workspace_move_status / workspaceId consistency invariant
 * for a single meeting session row.
 *
 * Returns true if the invariant holds, false otherwise.
 */
function checkMoveStatusInvariant(session: MeetingSession): boolean {
  if (session.workspaceMoveStatus === null) {
    return session.workspaceId === null;
  }
  if (session.workspaceMoveStatus === "approved") {
    return session.workspaceId !== null;
  }
  // 'pending_approval' and 'rejected' may have workspaceId null or non-null
  return true;
}

// ── Generators ────────────────────────────────────────────────────────────────

const moveStatusArb = fc.constantFrom<WorkspaceMoveStatus>(
  null,
  "pending_approval",
  "approved",
  "rejected"
);

/**
 * Generates a valid meeting session that satisfies the invariant.
 * - status=null → workspaceId=null
 * - status='approved' → workspaceId is a uuid
 * - status='pending_approval' | 'rejected' → workspaceId may be null or uuid
 */
const validMeetingSessionArb: fc.Arbitrary<MeetingSession> = moveStatusArb.chain(
  (status) => {
    if (status === null) {
      return fc.record({
        id: fc.uuid(),
        workspaceId: fc.constant(null),
        workspaceMoveStatus: fc.constant(null),
      });
    }
    if (status === "approved") {
      return fc.record({
        id: fc.uuid(),
        workspaceId: fc.uuid(),
        workspaceMoveStatus: fc.constant("approved" as const),
      });
    }
    // 'pending_approval' | 'rejected' — workspaceId may be null or a uuid
    return fc.record({
      id: fc.uuid(),
      workspaceId: fc.option(fc.uuid(), { nil: null }),
      workspaceMoveStatus: fc.constant(status),
    });
  }
);

// ── Property 1 ────────────────────────────────────────────────────────────────

describe(
  // Feature: workspace-integration, Property 1: workspace_move_status / workspaceId consistency invariant
  "Property 1: workspace_move_status / workspaceId consistency invariant",
  () => {
    it(
      "status=null implies workspaceId is null",
      () => {
        /**
         * **Validates: Requirements 1.5**
         *
         * For any meeting_session where workspace_move_status is null,
         * workspaceId must also be null.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // id
            fc.option(fc.uuid(), { nil: null }), // workspaceId (any value)
            (id, workspaceId) => {
              const session: MeetingSession = {
                id,
                workspaceId,
                workspaceMoveStatus: null,
              };

              // The invariant requires workspaceId to be null when status is null
              expect(checkMoveStatusInvariant(session)).toBe(workspaceId === null);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "status='approved' implies workspaceId is non-null",
      () => {
        /**
         * **Validates: Requirements 1.6**
         *
         * For any meeting_session where workspace_move_status is 'approved',
         * workspaceId must be non-null.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // id
            fc.option(fc.uuid(), { nil: null }), // workspaceId (any value)
            (id, workspaceId) => {
              const session: MeetingSession = {
                id,
                workspaceId,
                workspaceMoveStatus: "approved",
              };

              // The invariant requires workspaceId to be non-null when status is 'approved'
              expect(checkMoveStatusInvariant(session)).toBe(workspaceId !== null);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "valid sessions always satisfy the invariant",
      () => {
        /**
         * **Validates: Requirements 1.5, 1.6**
         *
         * For any meeting_session generated with the correct invariant constraints,
         * checkMoveStatusInvariant must return true.
         */
        fc.assert(
          fc.property(validMeetingSessionArb, (session) => {
            expect(checkMoveStatusInvariant(session)).toBe(true);
          }),
          { numRuns: 100 }
        );
      }
    );

    it(
      "status=null with non-null workspaceId violates the invariant",
      () => {
        /**
         * **Validates: Requirements 1.5**
         *
         * A session with status=null but a non-null workspaceId must fail the invariant check.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // id
            fc.uuid(), // workspaceId (always non-null)
            (id, workspaceId) => {
              const session: MeetingSession = {
                id,
                workspaceId,
                workspaceMoveStatus: null,
              };

              expect(checkMoveStatusInvariant(session)).toBe(false);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "status='approved' with null workspaceId violates the invariant",
      () => {
        /**
         * **Validates: Requirements 1.6**
         *
         * A session with status='approved' but a null workspaceId must fail the invariant check.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // id
            (id) => {
              const session: MeetingSession = {
                id,
                workspaceId: null,
                workspaceMoveStatus: "approved",
              };

              expect(checkMoveStatusInvariant(session)).toBe(false);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "status='pending_approval' or 'rejected' allows any workspaceId value",
      () => {
        /**
         * **Validates: Requirements 1.5, 1.6**
         *
         * For 'pending_approval' and 'rejected' statuses, workspaceId may be
         * null or non-null — the invariant does not constrain these states.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // id
            fc.constantFrom<"pending_approval" | "rejected">("pending_approval", "rejected"),
            fc.option(fc.uuid(), { nil: null }), // workspaceId (any value)
            (id, status, workspaceId) => {
              const session: MeetingSession = {
                id,
                workspaceId,
                workspaceMoveStatus: status,
              };

              // Both null and non-null workspaceId are valid for these statuses
              expect(checkMoveStatusInvariant(session)).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      }
    );
  }
);
