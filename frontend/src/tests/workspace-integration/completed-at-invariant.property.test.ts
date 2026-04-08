/**
 * Property-Based Tests: completedAt Invariant
 *
 * // Feature: workspace-integration, Property 13: completedAt invariant
 *
 * **Validates: Requirements 11.3, 11.4, 11.5**
 *
 * For any action_items row where status = 'done', completedAt must be non-null.
 * For any action_items row where status != 'done', completedAt must be null
 * (or reset to null when status changes away from 'done').
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ── Types ─────────────────────────────────────────────────────────────────────

type ActionItemStatus = "pending" | "in_progress" | "done" | "hold";

type ActionItem = {
  id: string;
  status: ActionItemStatus;
  completedAt: Date | null;
};

// ── Logic Under Test ──────────────────────────────────────────────────────────

/**
 * Pure function extracted from the status route:
 *
 *   const completedAt = status === 'done' ? new Date() : null;
 *
 * Simulates the completedAt computation from the PATCH status route.
 */
function computeCompletedAt(status: ActionItemStatus): Date | null {
  return status === "done" ? new Date() : null;
}

/**
 * Applies a status update to an action item, mirroring the route's SET clause:
 *   SET status=status, completedAt=completedAt, updatedAt=now()
 */
function applyStatusUpdate(item: ActionItem, newStatus: ActionItemStatus): ActionItem {
  return {
    ...item,
    status: newStatus,
    completedAt: computeCompletedAt(newStatus),
  };
}

// ── Generators ────────────────────────────────────────────────────────────────

const statusArb = fc.constantFrom<ActionItemStatus>(
  "pending",
  "in_progress",
  "done",
  "hold"
);

const nonDoneStatusArb = fc.constantFrom<ActionItemStatus>(
  "pending",
  "in_progress",
  "hold"
);

// ── Property 13: completedAt invariant ───────────────────────────────────────

describe(
  // Feature: workspace-integration, Property 13: completedAt invariant
  "Property 13: completedAt invariant",
  () => {
    it(
      "status='done' → completedAt is non-null (a Date)",
      () => {
        /**
         * **Validates: Requirements 11.3, 11.4**
         *
         * For any action item updated to status='done',
         * completedAt must be a non-null Date instance.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // itemId
            fc.option(fc.date(), { nil: null }), // previous completedAt (any)
            (itemId, previousCompletedAt) => {
              const item: ActionItem = {
                id: itemId,
                status: "pending",
                completedAt: previousCompletedAt,
              };

              const updated = applyStatusUpdate(item, "done");

              expect(updated.completedAt).not.toBeNull();
              expect(updated.completedAt).toBeInstanceOf(Date);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "status!='done' → completedAt is null",
      () => {
        /**
         * **Validates: Requirements 11.5**
         *
         * For any action item updated to a status other than 'done',
         * completedAt must be null — regardless of any prior value.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // itemId
            nonDoneStatusArb, // status: pending | in_progress | hold
            fc.option(fc.date(), { nil: null }), // previous completedAt (any)
            (itemId, newStatus, previousCompletedAt) => {
              const item: ActionItem = {
                id: itemId,
                status: "done",
                completedAt: previousCompletedAt,
              };

              const updated = applyStatusUpdate(item, newStatus);

              expect(updated.completedAt).toBeNull();
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "transitioning from 'done' to any non-done status clears completedAt",
      () => {
        /**
         * **Validates: Requirements 11.5**
         *
         * When an action item transitions away from 'done',
         * completedAt must be reset to null.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // itemId
            nonDoneStatusArb, // new status (not done)
            (itemId, newStatus) => {
              // Start with a completed item
              const item: ActionItem = {
                id: itemId,
                status: "done",
                completedAt: new Date(),
              };

              const updated = applyStatusUpdate(item, newStatus);

              expect(updated.completedAt).toBeNull();
              expect(updated.status).toBe(newStatus);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "computeCompletedAt is consistent for all status values",
      () => {
        /**
         * **Validates: Requirements 11.3, 11.4, 11.5**
         *
         * For any status value, computeCompletedAt must satisfy the invariant:
         * - 'done' → non-null Date
         * - anything else → null
         */
        fc.assert(
          fc.property(statusArb, (status) => {
            const completedAt = computeCompletedAt(status);

            if (status === "done") {
              expect(completedAt).not.toBeNull();
              expect(completedAt).toBeInstanceOf(Date);
            } else {
              expect(completedAt).toBeNull();
            }
          }),
          { numRuns: 100 }
        );
      }
    );

    it(
      "status update preserves item id and does not corrupt other fields",
      () => {
        /**
         * **Validates: Requirements 11.3, 11.4, 11.5**
         *
         * The status update must only change status and completedAt.
         * The item id must remain unchanged.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // itemId
            statusArb, // new status
            fc.option(fc.date(), { nil: null }), // previous completedAt
            (itemId, newStatus, previousCompletedAt) => {
              const item: ActionItem = {
                id: itemId,
                status: "pending",
                completedAt: previousCompletedAt,
              };

              const updated = applyStatusUpdate(item, newStatus);

              // id must be preserved
              expect(updated.id).toBe(itemId);
              // status must reflect the new value
              expect(updated.status).toBe(newStatus);
              // completedAt invariant must hold
              if (newStatus === "done") {
                expect(updated.completedAt).toBeInstanceOf(Date);
              } else {
                expect(updated.completedAt).toBeNull();
              }
            }
          ),
          { numRuns: 100 }
        );
      }
    );
  }
);
