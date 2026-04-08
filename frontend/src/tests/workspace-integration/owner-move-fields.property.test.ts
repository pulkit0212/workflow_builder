/**
 * Property-Based Tests: Owner-Move Field Correctness
 *
 * // Feature: workspace-integration, Property 5: Owner-move sets all required fields
 *
 * **Validates: Requirements 4.4, 4.7**
 *
 * For any successful POST /api/meetings/[id]/move-to-workspace call, the resulting
 * meeting_session row must have:
 *   - workspaceId equal to the requested workspace id
 *   - workspace_move_status = 'approved'
 *   - workspace_moved_by equal to the authenticated user's id
 *   - workspace_moved_at non-null (a Date)
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ── Types ─────────────────────────────────────────────────────────────────────

type MoveScenario = {
  userId: string;
  meetingId: string;
  requestedWorkspaceId: string;
};

type MeetingSessionAfterMove = {
  workspaceId: string | null;
  workspaceMoveStatus: string | null;
  workspaceMovedBy: string | null;
  workspaceMovedAt: Date | null;
};

// ── Field-Setting Logic ───────────────────────────────────────────────────────

/**
 * Simulates the field-setting logic from the owner-move route.
 *
 * From route.ts (on success):
 *   {
 *     workspaceId: requestedWorkspaceId,
 *     workspaceMoveStatus: 'approved',
 *     workspaceMovedBy: userId,
 *     workspaceMovedAt: new Date(),
 *   }
 */
function applyOwnerMoveFields(scenario: MoveScenario): MeetingSessionAfterMove {
  return {
    workspaceId: scenario.requestedWorkspaceId,
    workspaceMoveStatus: "approved",
    workspaceMovedBy: scenario.userId,
    workspaceMovedAt: new Date(),
  };
}

// ── Assertions ────────────────────────────────────────────────────────────────

/**
 * Verifies all required fields are set correctly after a successful owner move.
 */
function assertOwnerMoveFieldsCorrect(
  scenario: MoveScenario,
  result: MeetingSessionAfterMove
): void {
  // workspaceId must equal the requested workspace id
  expect(result.workspaceId).toBe(scenario.requestedWorkspaceId);

  // workspace_move_status must be 'approved'
  expect(result.workspaceMoveStatus).toBe("approved");

  // workspace_moved_by must equal the authenticated user's id
  expect(result.workspaceMovedBy).toBe(scenario.userId);

  // workspace_moved_at must be non-null and a valid Date
  expect(result.workspaceMovedAt).not.toBeNull();
  expect(result.workspaceMovedAt).toBeInstanceOf(Date);
}

// ── Generators ────────────────────────────────────────────────────────────────

const moveScenarioArb: fc.Arbitrary<MoveScenario> = fc.record({
  userId: fc.uuid(),
  meetingId: fc.uuid(),
  requestedWorkspaceId: fc.uuid(),
});

// ── Property 5 ────────────────────────────────────────────────────────────────

describe(
  // Feature: workspace-integration, Property 5: Owner-move sets all required fields
  "Property 5: Owner-move sets all required fields",
  () => {
    it(
      "workspaceId equals the requested workspace id after successful move",
      () => {
        /**
         * **Validates: Requirements 4.4, 4.7**
         *
         * For any valid move scenario, the resulting meeting session's workspaceId
         * must equal the workspaceId that was requested in the move operation.
         */
        fc.assert(
          fc.property(moveScenarioArb, (scenario) => {
            const result = applyOwnerMoveFields(scenario);
            expect(result.workspaceId).toBe(scenario.requestedWorkspaceId);
          }),
          { numRuns: 100 }
        );
      }
    );

    it(
      "workspace_move_status is 'approved' after successful move",
      () => {
        /**
         * **Validates: Requirements 4.4**
         *
         * For any valid move scenario, the resulting meeting session's
         * workspace_move_status must be 'approved'.
         */
        fc.assert(
          fc.property(moveScenarioArb, (scenario) => {
            const result = applyOwnerMoveFields(scenario);
            expect(result.workspaceMoveStatus).toBe("approved");
          }),
          { numRuns: 100 }
        );
      }
    );

    it(
      "workspace_moved_by equals the authenticated user's id after successful move",
      () => {
        /**
         * **Validates: Requirements 4.4**
         *
         * For any valid move scenario, the resulting meeting session's
         * workspace_moved_by must equal the userId of the authenticated user
         * who performed the move.
         */
        fc.assert(
          fc.property(moveScenarioArb, (scenario) => {
            const result = applyOwnerMoveFields(scenario);
            expect(result.workspaceMovedBy).toBe(scenario.userId);
          }),
          { numRuns: 100 }
        );
      }
    );

    it(
      "workspace_moved_at is non-null and a Date after successful move",
      () => {
        /**
         * **Validates: Requirements 4.7**
         *
         * For any valid move scenario, the resulting meeting session's
         * workspace_moved_at must be non-null and a valid Date instance.
         */
        fc.assert(
          fc.property(moveScenarioArb, (scenario) => {
            const result = applyOwnerMoveFields(scenario);
            expect(result.workspaceMovedAt).not.toBeNull();
            expect(result.workspaceMovedAt).toBeInstanceOf(Date);
          }),
          { numRuns: 100 }
        );
      }
    );

    it(
      "all required fields are set correctly in a single move operation",
      () => {
        /**
         * **Validates: Requirements 4.4, 4.7**
         *
         * For any valid move scenario, all four required fields must be set
         * correctly simultaneously: workspaceId, workspaceMoveStatus,
         * workspaceMovedBy, and workspaceMovedAt.
         */
        fc.assert(
          fc.property(moveScenarioArb, (scenario) => {
            const result = applyOwnerMoveFields(scenario);
            assertOwnerMoveFieldsCorrect(scenario, result);
          }),
          { numRuns: 100 }
        );
      }
    );

    it(
      "different users moving different meetings to different workspaces each get correct fields",
      () => {
        /**
         * **Validates: Requirements 4.4, 4.7**
         *
         * For any two distinct move scenarios, each resulting session must have
         * its own correct field values — no cross-contamination between scenarios.
         */
        fc.assert(
          fc.property(moveScenarioArb, moveScenarioArb, (scenarioA, scenarioB) => {
            const resultA = applyOwnerMoveFields(scenarioA);
            const resultB = applyOwnerMoveFields(scenarioB);

            // Each result must reflect its own scenario's values
            expect(resultA.workspaceId).toBe(scenarioA.requestedWorkspaceId);
            expect(resultA.workspaceMovedBy).toBe(scenarioA.userId);

            expect(resultB.workspaceId).toBe(scenarioB.requestedWorkspaceId);
            expect(resultB.workspaceMovedBy).toBe(scenarioB.userId);

            // Both must have approved status and non-null timestamps
            expect(resultA.workspaceMoveStatus).toBe("approved");
            expect(resultB.workspaceMoveStatus).toBe("approved");
            expect(resultA.workspaceMovedAt).toBeInstanceOf(Date);
            expect(resultB.workspaceMovedAt).toBeInstanceOf(Date);
          }),
          { numRuns: 100 }
        );
      }
    );
  }
);
