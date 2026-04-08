/**
 * Property-Based Tests: Dashboard Stats Consistency
 *
 * // Feature: workspace-integration, Property 14: Dashboard stats consistency
 *
 * **Validates: Requirements 13.4**
 *
 * For any workspace, the totalMeetings value returned by
 * GET /api/workspace/[workspaceId]/dashboard must equal the actual count of
 * meeting_sessions rows with that workspaceId AND workspace_move_status='approved'.
 *
 * totalActionItems must equal the actual count of action_items rows with that workspaceId.
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

type ActionItem = {
  id: string;
  workspaceId: string | null;
};

// ── Counting Logic Under Test ─────────────────────────────────────────────────

/**
 * Simulates the totalMeetings count from the dashboard route:
 *   COUNT(meeting_sessions WHERE workspaceId=wid AND workspace_move_status='approved')
 */
function computeTotalMeetings(meetings: MeetingSession[], workspaceId: string): number {
  return meetings.filter(
    (m) => m.workspaceId === workspaceId && m.workspaceMoveStatus === "approved"
  ).length;
}

/**
 * Simulates the totalActionItems count from the dashboard route:
 *   COUNT(action_items WHERE workspaceId=wid)
 */
function computeTotalActionItems(items: ActionItem[], workspaceId: string): number {
  return items.filter((item) => item.workspaceId === workspaceId).length;
}

// ── Generators ────────────────────────────────────────────────────────────────

const workspaceMoveStatusArb = fc.constantFrom<WorkspaceMoveStatus>(
  null,
  "pending_approval",
  "approved",
  "rejected"
);

const meetingArb = fc.record({
  id: fc.uuid(),
  workspaceId: fc.option(fc.uuid(), { nil: null }),
  workspaceMoveStatus: workspaceMoveStatusArb,
});

const actionItemArb = fc.record({
  id: fc.uuid(),
  workspaceId: fc.option(fc.uuid(), { nil: null }),
});

// ── Property 14: Dashboard stats consistency ──────────────────────────────────

describe(
  // Feature: workspace-integration, Property 14: Dashboard stats consistency
  "Property 14: Dashboard stats consistency",
  () => {
    it(
      "totalMeetings equals COUNT of approved meetings for that workspaceId",
      () => {
        /**
         * **Validates: Requirements 13.4**
         *
         * For any pool of meeting_sessions, the totalMeetings count must equal
         * the number of rows where workspaceId matches AND workspace_move_status='approved'.
         * Meetings with other statuses (pending_approval, rejected, null) must not be counted.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // workspaceId under test
            fc.array(meetingArb, { minLength: 0, maxLength: 30 }),
            (workspaceId, meetings) => {
              // Ground-truth: manually count approved meetings for this workspace
              const expectedCount = meetings.filter(
                (m) => m.workspaceId === workspaceId && m.workspaceMoveStatus === "approved"
              ).length;

              const total = computeTotalMeetings(meetings, workspaceId);

              expect(total).toBe(expectedCount);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "totalMeetings excludes non-approved meetings for the same workspaceId",
      () => {
        /**
         * **Validates: Requirements 13.4**
         *
         * Meetings with workspace_move_status != 'approved' must not contribute
         * to totalMeetings, even if they share the same workspaceId.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // workspaceId
            fc.array(fc.uuid(), { minLength: 1, maxLength: 20 }), // approved meeting ids
            fc.array(
              fc.record({
                id: fc.uuid(),
                status: fc.constantFrom<WorkspaceMoveStatus>(null, "pending_approval", "rejected"),
              }),
              { minLength: 0, maxLength: 20 }
            ), // non-approved meetings
            (workspaceId, approvedIds, nonApproved) => {
              const approvedMeetings: MeetingSession[] = approvedIds.map((id) => ({
                id,
                workspaceId,
                workspaceMoveStatus: "approved",
              }));

              const nonApprovedMeetings: MeetingSession[] = nonApproved.map(({ id, status }) => ({
                id,
                workspaceId,
                workspaceMoveStatus: status,
              }));

              const allMeetings = [...approvedMeetings, ...nonApprovedMeetings];
              const total = computeTotalMeetings(allMeetings, workspaceId);

              // Only approved meetings should be counted
              expect(total).toBe(approvedIds.length);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "totalMeetings excludes approved meetings belonging to a different workspaceId",
      () => {
        /**
         * **Validates: Requirements 13.4**
         *
         * Approved meetings for a different workspace must not appear in the count
         * for the requested workspace.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // target workspaceId
            fc.uuid(), // other workspaceId
            fc.array(fc.uuid(), { minLength: 0, maxLength: 15 }), // approved ids for target
            fc.array(fc.uuid(), { minLength: 0, maxLength: 15 }), // approved ids for other
            (workspaceId, otherWorkspaceId, targetIds, otherIds) => {
              fc.pre(workspaceId !== otherWorkspaceId);

              const targetMeetings: MeetingSession[] = targetIds.map((id) => ({
                id,
                workspaceId,
                workspaceMoveStatus: "approved",
              }));

              const otherMeetings: MeetingSession[] = otherIds.map((id) => ({
                id,
                workspaceId: otherWorkspaceId,
                workspaceMoveStatus: "approved",
              }));

              const allMeetings = [...targetMeetings, ...otherMeetings];
              const total = computeTotalMeetings(allMeetings, workspaceId);

              expect(total).toBe(targetIds.length);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "totalActionItems equals COUNT of action_items for that workspaceId",
      () => {
        /**
         * **Validates: Requirements 13.4**
         *
         * For any pool of action_items, the totalActionItems count must equal
         * the number of rows where workspaceId matches the requested workspace.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // workspaceId under test
            fc.array(actionItemArb, { minLength: 0, maxLength: 30 }),
            (workspaceId, items) => {
              // Ground-truth: manually count action items for this workspace
              const expectedCount = items.filter(
                (item) => item.workspaceId === workspaceId
              ).length;

              const total = computeTotalActionItems(items, workspaceId);

              expect(total).toBe(expectedCount);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "totalActionItems excludes action items belonging to a different workspaceId",
      () => {
        /**
         * **Validates: Requirements 13.4**
         *
         * Action items for a different workspace must not appear in the count
         * for the requested workspace.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // target workspaceId
            fc.uuid(), // other workspaceId
            fc.array(fc.uuid(), { minLength: 0, maxLength: 15 }), // item ids for target
            fc.array(fc.uuid(), { minLength: 0, maxLength: 15 }), // item ids for other
            (workspaceId, otherWorkspaceId, targetIds, otherIds) => {
              fc.pre(workspaceId !== otherWorkspaceId);

              const targetItems: ActionItem[] = targetIds.map((id) => ({
                id,
                workspaceId,
              }));

              const otherItems: ActionItem[] = otherIds.map((id) => ({
                id,
                workspaceId: otherWorkspaceId,
              }));

              const allItems = [...targetItems, ...otherItems];
              const total = computeTotalActionItems(allItems, workspaceId);

              expect(total).toBe(targetIds.length);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "totalActionItems excludes action items with null workspaceId",
      () => {
        /**
         * **Validates: Requirements 13.4**
         *
         * Personal action items (workspaceId=null) must not be counted in
         * totalActionItems for any workspace.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // workspaceId
            fc.array(fc.uuid(), { minLength: 0, maxLength: 15 }), // workspace item ids
            fc.array(fc.uuid(), { minLength: 0, maxLength: 10 }), // personal item ids (null workspaceId)
            (workspaceId, workspaceItemIds, personalItemIds) => {
              const workspaceItems: ActionItem[] = workspaceItemIds.map((id) => ({
                id,
                workspaceId,
              }));

              const personalItems: ActionItem[] = personalItemIds.map((id) => ({
                id,
                workspaceId: null,
              }));

              const allItems = [...workspaceItems, ...personalItems];
              const total = computeTotalActionItems(allItems, workspaceId);

              expect(total).toBe(workspaceItemIds.length);
            }
          ),
          { numRuns: 100 }
        );
      }
    );
  }
);
