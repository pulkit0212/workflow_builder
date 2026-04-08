/**
 * Property-Based Tests: Move Request Status Invariant
 *
 * // Feature: workspace-integration, Property 7: Move request status invariant
 *
 * **Validates: Requirements 3.3**
 *
 * For any workspace_move_requests row, status must be one of:
 *   'pending', 'approved', or 'rejected'
 * No other value is permitted.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ── Types ─────────────────────────────────────────────────────────────────────

type MoveRequestStatus = "pending" | "approved" | "rejected";

type WorkspaceMoveRequest = {
  id: string;
  meetingId: string;
  workspaceId: string;
  requestedBy: string;
  status: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const ALLOWED_STATUSES: ReadonlySet<string> = new Set(["pending", "approved", "rejected"]);

/**
 * Validates the move request status invariant for a single row.
 * Returns true if status is one of the three allowed values.
 */
function checkMoveRequestStatusInvariant(request: WorkspaceMoveRequest): boolean {
  return ALLOWED_STATUSES.has(request.status);
}

// ── Generators ────────────────────────────────────────────────────────────────

const validStatusArb = fc.constantFrom<MoveRequestStatus>("pending", "approved", "rejected");

const validMoveRequestArb: fc.Arbitrary<WorkspaceMoveRequest> = fc.record({
  id: fc.uuid(),
  meetingId: fc.uuid(),
  workspaceId: fc.uuid(),
  requestedBy: fc.uuid(),
  status: validStatusArb,
});

// ── Property 7 ────────────────────────────────────────────────────────────────

describe(
  // Feature: workspace-integration, Property 7: Move request status invariant
  "Property 7: Move request status invariant",
  () => {
    it(
      "valid statuses always satisfy the invariant",
      () => {
        /**
         * **Validates: Requirements 3.3**
         *
         * For any workspace_move_requests row with a valid status
         * ('pending', 'approved', 'rejected'), the invariant check must pass.
         */
        fc.assert(
          fc.property(validMoveRequestArb, (request) => {
            expect(checkMoveRequestStatusInvariant(request)).toBe(true);
          }),
          { numRuns: 100 }
        );
      }
    );

    it(
      "each allowed status individually satisfies the invariant",
      () => {
        /**
         * **Validates: Requirements 3.3**
         *
         * Each of the three allowed status values must pass the invariant check.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // id
            fc.uuid(), // meetingId
            fc.uuid(), // workspaceId
            fc.uuid(), // requestedBy
            validStatusArb,
            (id, meetingId, workspaceId, requestedBy, status) => {
              const request: WorkspaceMoveRequest = {
                id,
                meetingId,
                workspaceId,
                requestedBy,
                status,
              };
              expect(checkMoveRequestStatusInvariant(request)).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "invalid statuses fail the invariant",
      () => {
        /**
         * **Validates: Requirements 3.3**
         *
         * Any status value that is not one of the three allowed values must fail
         * the invariant check.
         */
        const invalidStatusArb = fc
          .string()
          .filter((s) => !ALLOWED_STATUSES.has(s));

        fc.assert(
          fc.property(
            fc.uuid(),
            fc.uuid(),
            fc.uuid(),
            fc.uuid(),
            invalidStatusArb,
            (id, meetingId, workspaceId, requestedBy, status) => {
              const request: WorkspaceMoveRequest = {
                id,
                meetingId,
                workspaceId,
                requestedBy,
                status,
              };
              expect(checkMoveRequestStatusInvariant(request)).toBe(false);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "empty string status fails the invariant",
      () => {
        /**
         * **Validates: Requirements 3.3**
         *
         * An empty string is not a valid status and must fail the invariant.
         */
        fc.assert(
          fc.property(fc.uuid(), fc.uuid(), fc.uuid(), fc.uuid(), (id, meetingId, workspaceId, requestedBy) => {
            const request: WorkspaceMoveRequest = {
              id,
              meetingId,
              workspaceId,
              requestedBy,
              status: "",
            };
            expect(checkMoveRequestStatusInvariant(request)).toBe(false);
          }),
          { numRuns: 100 }
        );
      }
    );
  }
);
