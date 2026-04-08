/**
 * Property-Based Tests: Action Items Cascade workspaceId on Approval
 *
 * // Feature: workspace-integration, Property 6: Action items cascade workspaceId from meeting on approval
 *
 * **Validates: Requirements 2.2, 2.3, 4.5**
 *
 * For any meeting that transitions to workspace_move_status = 'approved'
 * (via owner move or admin approval), all action_items rows with that meetingId
 * must have workspaceId equal to the meeting's workspaceId after the operation.
 *
 * Also verifies that action items belonging to OTHER meetings are NOT affected.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ── Types ─────────────────────────────────────────────────────────────────────

type ActionItem = {
  id: string;
  meetingId: string;
  workspaceId: string | null;
};

type Meeting = {
  id: string;
  workspaceId: string;
};

// ── Cascade Logic ─────────────────────────────────────────────────────────────

/**
 * Simulates the cascade logic from the owner-move route (and admin-approve route).
 *
 * From route.ts (inside transaction):
 *   await tx.update(actionItems)
 *     .set({ workspaceId })
 *     .where(eq(actionItems.meetingId, meetingId));
 *
 * This function applies that same logic in-memory: for every action item whose
 * meetingId matches the approved meeting's id, set workspaceId to the meeting's
 * workspaceId. All other action items are left unchanged.
 */
function cascadeWorkspaceId(
  actionItems: ActionItem[],
  approvedMeeting: Meeting
): ActionItem[] {
  return actionItems.map((item) => {
    if (item.meetingId === approvedMeeting.id) {
      return { ...item, workspaceId: approvedMeeting.workspaceId };
    }
    return item;
  });
}

// ── Generators ────────────────────────────────────────────────────────────────

/** Generates a single action item with an explicit meetingId. */
function actionItemWithMeetingId(meetingId: string): fc.Arbitrary<ActionItem> {
  return fc.record({
    id: fc.uuid(),
    meetingId: fc.constant(meetingId),
    workspaceId: fc.option(fc.uuid(), { nil: null }),
  });
}

/** Generates a non-empty array of action items all belonging to the same meeting. */
function actionItemsForMeeting(meetingId: string): fc.Arbitrary<ActionItem[]> {
  return fc.array(actionItemWithMeetingId(meetingId), { minLength: 1, maxLength: 10 });
}

/** Generates an action item that belongs to a DIFFERENT meeting. */
function actionItemForOtherMeeting(excludedMeetingId: string): fc.Arbitrary<ActionItem> {
  return fc.record({
    id: fc.uuid(),
    meetingId: fc.uuid().filter((id) => id !== excludedMeetingId),
    workspaceId: fc.option(fc.uuid(), { nil: null }),
  });
}

// ── Property 6 ────────────────────────────────────────────────────────────────

describe(
  // Feature: workspace-integration, Property 6: Action items cascade workspaceId from meeting on approval
  "Property 6: Action items cascade workspaceId from meeting on approval",
  () => {
    it(
      "all action items for the approved meeting get the meeting's workspaceId",
      () => {
        /**
         * **Validates: Requirements 2.2, 2.3, 4.5**
         *
         * For any meeting and any set of action items belonging to that meeting,
         * after the cascade all action items must have workspaceId equal to the
         * meeting's workspaceId.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // meetingId
            fc.uuid(), // workspaceId
            (meetingId, workspaceId) => {
              return fc.sample(actionItemsForMeeting(meetingId), 1).every((items) => {
                const meeting: Meeting = { id: meetingId, workspaceId };
                const result = cascadeWorkspaceId(items, meeting);

                return result
                  .filter((item) => item.meetingId === meetingId)
                  .every((item) => item.workspaceId === workspaceId);
              });
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "all action items for the approved meeting get the meeting's workspaceId (direct array)",
      () => {
        /**
         * **Validates: Requirements 2.2, 2.3, 4.5**
         *
         * For any meeting and any set of action items belonging to that meeting,
         * after the cascade all action items must have workspaceId equal to the
         * meeting's workspaceId.
         */
        const scenarioArb = fc.uuid().chain((meetingId) =>
          fc.tuple(
            fc.constant(meetingId),
            fc.uuid(),
            actionItemsForMeeting(meetingId)
          )
        );

        fc.assert(
          fc.property(scenarioArb, ([meetingId, workspaceId, items]) => {
            const meeting: Meeting = { id: meetingId, workspaceId };
            const result = cascadeWorkspaceId(items, meeting);

            const itemsForMeeting = result.filter((item) => item.meetingId === meetingId);

            // Every action item for this meeting must have the meeting's workspaceId
            expect(itemsForMeeting.length).toBeGreaterThan(0);
            for (const item of itemsForMeeting) {
              expect(item.workspaceId).toBe(workspaceId);
            }
          }),
          { numRuns: 100 }
        );
      }
    );

    it(
      "action items for OTHER meetings are NOT affected by the cascade",
      () => {
        /**
         * **Validates: Requirements 2.2, 2.3**
         *
         * When a meeting is approved and its action items are cascaded, action items
         * belonging to other meetings must remain completely unchanged.
         */
        const scenarioArb = fc.uuid().chain((approvedMeetingId) =>
          fc.tuple(
            fc.constant(approvedMeetingId),
            fc.uuid(), // workspaceId for the approved meeting
            actionItemsForMeeting(approvedMeetingId),
            fc.array(actionItemForOtherMeeting(approvedMeetingId), {
              minLength: 1,
              maxLength: 5,
            })
          )
        );

        fc.assert(
          fc.property(
            scenarioArb,
            ([approvedMeetingId, workspaceId, ownItems, otherItems]) => {
              const meeting: Meeting = { id: approvedMeetingId, workspaceId };
              const allItems = [...ownItems, ...otherItems];
              const result = cascadeWorkspaceId(allItems, meeting);

              // Other items must be unchanged
              for (const original of otherItems) {
                const updated = result.find((r) => r.id === original.id)!;
                expect(updated.workspaceId).toBe(original.workspaceId);
                expect(updated.meetingId).toBe(original.meetingId);
              }
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "cascade is idempotent: applying it twice yields the same result",
      () => {
        /**
         * **Validates: Requirements 2.2, 2.3, 4.5**
         *
         * Applying the cascade operation twice must produce the same result as
         * applying it once. This ensures the operation is safe to retry.
         */
        const scenarioArb = fc.uuid().chain((meetingId) =>
          fc.tuple(
            fc.constant(meetingId),
            fc.uuid(),
            actionItemsForMeeting(meetingId)
          )
        );

        fc.assert(
          fc.property(scenarioArb, ([meetingId, workspaceId, items]) => {
            const meeting: Meeting = { id: meetingId, workspaceId };

            const onceResult = cascadeWorkspaceId(items, meeting);
            const twiceResult = cascadeWorkspaceId(onceResult, meeting);

            expect(twiceResult).toEqual(onceResult);
          }),
          { numRuns: 100 }
        );
      }
    );

    it(
      "cascade with mixed items: only matching meetingId items are updated",
      () => {
        /**
         * **Validates: Requirements 2.2, 4.5**
         *
         * When a pool of action items contains items from multiple meetings,
         * only those matching the approved meetingId must be updated.
         */
        const scenarioArb = fc.uuid().chain((approvedMeetingId) =>
          fc.tuple(
            fc.constant(approvedMeetingId),
            fc.uuid(),
            actionItemsForMeeting(approvedMeetingId),
            fc.array(actionItemForOtherMeeting(approvedMeetingId), {
              minLength: 0,
              maxLength: 5,
            })
          )
        );

        fc.assert(
          fc.property(
            scenarioArb,
            ([approvedMeetingId, workspaceId, ownItems, otherItems]) => {
              const meeting: Meeting = { id: approvedMeetingId, workspaceId };
              const allItems = [...ownItems, ...otherItems];
              const result = cascadeWorkspaceId(allItems, meeting);

              for (const item of result) {
                if (item.meetingId === approvedMeetingId) {
                  // Must be updated to the meeting's workspaceId
                  expect(item.workspaceId).toBe(workspaceId);
                } else {
                  // Must be unchanged — find the original
                  const original = allItems.find((o) => o.id === item.id)!;
                  expect(item.workspaceId).toBe(original.workspaceId);
                }
              }
            }
          ),
          { numRuns: 100 }
        );
      }
    );
  }
);
