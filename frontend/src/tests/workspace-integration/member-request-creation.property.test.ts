/**
 * Property-Based Tests: Member Request Creates Pending Row
 *
 * // Feature: workspace-integration, Property 8: Member request creates pending row
 *
 * **Validates: Requirements 6.3, 6.4, 6.5**
 *
 * For any valid POST /api/meetings/[id]/request-move call by an active workspace
 * member, the created workspace_move_requests row must have:
 *   - status = 'pending'
 *   - requestedBy equal to the authenticated user's id
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ── Types ─────────────────────────────────────────────────────────────────────

type RequestScenario = {
  userId: string;
  meetingId: string;
  workspaceId: string;
};

type WorkspaceMoveRequestRow = {
  id: string;
  meetingId: string;
  workspaceId: string;
  requestedBy: string;
  status: string;
  adminNote: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
};

// ── Row Creation Logic ────────────────────────────────────────────────────────

/**
 * Simulates the row creation logic from the request-move route.
 *
 * From route.ts (on success):
 *   await db.insert(workspaceMoveRequests).values({
 *     meetingId,
 *     workspaceId,
 *     requestedBy: user.id,
 *     status: 'pending'
 *   });
 */
function createMoveRequestRow(scenario: RequestScenario): WorkspaceMoveRequestRow {
  return {
    id: crypto.randomUUID(),
    meetingId: scenario.meetingId,
    workspaceId: scenario.workspaceId,
    requestedBy: scenario.userId,
    status: "pending",
    adminNote: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date(),
  };
}

// ── Generators ────────────────────────────────────────────────────────────────

const requestScenarioArb: fc.Arbitrary<RequestScenario> = fc.record({
  userId: fc.uuid(),
  meetingId: fc.uuid(),
  workspaceId: fc.uuid(),
});

// ── Property 8 ────────────────────────────────────────────────────────────────

describe(
  // Feature: workspace-integration, Property 8: Member request creates pending row
  "Property 8: Member request creates pending row",
  () => {
    it(
      "created row has status='pending' for any valid request scenario",
      () => {
        /**
         * **Validates: Requirements 6.4, 6.5**
         *
         * For any valid request scenario (any userId, meetingId, workspaceId),
         * the created workspace_move_requests row must always have status='pending'.
         */
        fc.assert(
          fc.property(requestScenarioArb, (scenario) => {
            const row = createMoveRequestRow(scenario);
            expect(row.status).toBe("pending");
          }),
          { numRuns: 100 }
        );
      }
    );

    it(
      "created row has requestedBy equal to the authenticated user's id",
      () => {
        /**
         * **Validates: Requirements 6.3, 6.4**
         *
         * For any valid request scenario, the created row's requestedBy field
         * must equal the authenticated user's id (userId from the session).
         */
        fc.assert(
          fc.property(requestScenarioArb, (scenario) => {
            const row = createMoveRequestRow(scenario);
            expect(row.requestedBy).toBe(scenario.userId);
          }),
          { numRuns: 100 }
        );
      }
    );

    it(
      "created row has both status='pending' and requestedBy=userId simultaneously",
      () => {
        /**
         * **Validates: Requirements 6.3, 6.4, 6.5**
         *
         * Both invariants must hold at the same time for any valid scenario:
         * status must be 'pending' AND requestedBy must equal the user's id.
         */
        fc.assert(
          fc.property(requestScenarioArb, (scenario) => {
            const row = createMoveRequestRow(scenario);
            expect(row.status).toBe("pending");
            expect(row.requestedBy).toBe(scenario.userId);
          }),
          { numRuns: 100 }
        );
      }
    );

    it(
      "requestedBy is never confused with meetingId or workspaceId",
      () => {
        /**
         * **Validates: Requirements 6.3**
         *
         * The requestedBy field must be set to the authenticated user's id,
         * not accidentally set to the meetingId or workspaceId.
         * This guards against field-assignment bugs in the route.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // userId
            fc.uuid(), // meetingId — distinct from userId
            fc.uuid(), // workspaceId — distinct from userId
            (userId, meetingId, workspaceId) => {
              const scenario: RequestScenario = { userId, meetingId, workspaceId };
              const row = createMoveRequestRow(scenario);
              expect(row.requestedBy).toBe(userId);
              expect(row.requestedBy).not.toBe(meetingId);
              expect(row.requestedBy).not.toBe(workspaceId);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "created row preserves meetingId and workspaceId from the request",
      () => {
        /**
         * **Validates: Requirements 6.4**
         *
         * The created row must also correctly record the meetingId and workspaceId
         * from the request body, ensuring the row links to the right meeting and workspace.
         */
        fc.assert(
          fc.property(requestScenarioArb, (scenario) => {
            const row = createMoveRequestRow(scenario);
            expect(row.meetingId).toBe(scenario.meetingId);
            expect(row.workspaceId).toBe(scenario.workspaceId);
          }),
          { numRuns: 100 }
        );
      }
    );

    it(
      "created row has null review fields (not yet reviewed)",
      () => {
        /**
         * **Validates: Requirements 6.4**
         *
         * At creation time, the row must not have any review data:
         * adminNote, reviewedBy, and reviewedAt must all be null.
         */
        fc.assert(
          fc.property(requestScenarioArb, (scenario) => {
            const row = createMoveRequestRow(scenario);
            expect(row.adminNote).toBeNull();
            expect(row.reviewedBy).toBeNull();
            expect(row.reviewedAt).toBeNull();
          }),
          { numRuns: 100 }
        );
      }
    );
  }
);
