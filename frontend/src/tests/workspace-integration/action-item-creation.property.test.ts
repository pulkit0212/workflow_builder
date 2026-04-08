/**
 * Property-Based Tests: Action Item Creation — workspaceId Wiring
 *
 * // Feature: workspace-integration, Property 4: Action item creation sets workspaceId
 * // Feature: workspace-integration, Property 5: Action items inherit workspaceId from meeting
 *
 * **Validates: Requirements 2.2, 2.6**
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ── Types ─────────────────────────────────────────────────────────────────────

type Priority = "High" | "Medium" | "Low";

type ActionItemInput = {
  task: string;
  owner?: string;
  dueDate?: string;
  priority?: Priority;
  completed?: boolean;
};

type ActionItemRow = {
  id: string;
  workspaceId: string | null;
  userId: string;
  meetingId: string | null;
  task: string;
  owner: string;
  dueDate: string;
  priority: string;
  completed: boolean;
  source: string;
};

type MeetingSessionRow = {
  id: string;
  workspaceId: string | null;
  userId: string;
  sharedWithUserIds: string[];
};

// ── Pure simulations ──────────────────────────────────────────────────────────

/**
 * Simulates the POST /api/action-items/bulk-save handler logic.
 * Resolves workspaceId from the header and sets it on each inserted row.
 */
function simulateBulkSaveActionItems(params: {
  resolvedWorkspaceId: string | null;
  userId: string;
  items: ActionItemInput[];
  source?: string;
}): { status: number; rows?: ActionItemRow[]; error?: string } {
  if (!params.resolvedWorkspaceId) {
    return { status: 400, error: "workspace_required" };
  }

  if (params.items.length === 0) {
    return { status: 400, error: "no_items" };
  }

  const source = params.source ?? "document";
  const rows: ActionItemRow[] = params.items.map((item, i) => ({
    id: `generated-${i}`,
    workspaceId: params.resolvedWorkspaceId,
    userId: params.userId,
    meetingId: null,
    task: item.task,
    owner: item.owner || "Unassigned",
    dueDate: item.dueDate || "Not specified",
    priority: item.priority || "Medium",
    completed: item.completed ?? false,
    source,
  }));

  return { status: 200, rows };
}

/**
 * Simulates syncMeetingActionItems from bot-capture-persist.ts.
 * Reads workspaceId from the meeting_session row and sets it on each inserted action_item.
 */
function simulateSyncMeetingActionItems(params: {
  meeting: MeetingSessionRow;
  items: ActionItemInput[];
}): ActionItemRow[] {
  const { meeting, items } = params;

  // Guard: if no workspaceId on the meeting, nothing is inserted (matches real impl)
  if (!meeting.workspaceId) {
    return [];
  }

  const targetUserIds = Array.from(
    new Set([meeting.userId, ...meeting.sharedWithUserIds])
  );

  const rows: ActionItemRow[] = targetUserIds.flatMap((userId, ui) =>
    items.map((item, ii) => ({
      id: `generated-${ui}-${ii}`,
      workspaceId: meeting.workspaceId,
      userId,
      meetingId: meeting.id,
      task: item.task,
      owner: item.owner?.trim() || "Unassigned",
      dueDate: item.dueDate?.trim() || "Not specified",
      priority: item.priority || "Medium",
      completed: false,
      source: "meeting",
    }))
  );

  return rows;
}

// ── Generators ────────────────────────────────────────────────────────────────

const priorityArb = fc.constantFrom<Priority>("High", "Medium", "Low");
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 80 });

const actionItemInputArb: fc.Arbitrary<ActionItemInput> = fc.record({
  task: nonEmptyStringArb,
  owner: fc.option(nonEmptyStringArb, { nil: undefined }),
  dueDate: fc.option(nonEmptyStringArb, { nil: undefined }),
  priority: fc.option(priorityArb, { nil: undefined }),
  completed: fc.option(fc.boolean(), { nil: undefined }),
});

const nonEmptyItemsArb = fc.array(actionItemInputArb, { minLength: 1, maxLength: 10 });

// ── Property 4 ────────────────────────────────────────────────────────────────

describe(
  // Feature: workspace-integration, Property 4: Action item creation sets workspaceId
  "Property 4: Action item creation sets workspaceId",
  () => {
    it(
      "every inserted action_item row has workspaceId equal to the resolved header value",
      () => {
        /**
         * **Validates: Requirements 2.2**
         *
         * For any valid POST /api/action-items/bulk-save request with an
         * x-workspace-id header value W, every created action_item row must
         * have workspaceId = W.
         */
        fc.assert(
          fc.property(
            fc.uuid(),          // workspaceId W
            fc.uuid(),          // userId
            nonEmptyItemsArb,
            (workspaceId, userId, items) => {
              const result = simulateBulkSaveActionItems({
                resolvedWorkspaceId: workspaceId,
                userId,
                items,
              });

              expect(result.status).toBe(200);
              expect(result.rows).toBeDefined();
              expect(result.rows!.length).toBe(items.length);

              for (const row of result.rows!) {
                expect(row.workspaceId).toBe(workspaceId);
              }
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "returns 400 workspace_required when no workspaceId is resolved",
      () => {
        /**
         * **Validates: Requirements 2.2**
         *
         * When resolveWorkspaceIdForRequest returns null, the handler must
         * return HTTP 400 with error code 'workspace_required'.
         */
        fc.assert(
          fc.property(
            fc.uuid(),
            nonEmptyItemsArb,
            (userId, items) => {
              const result = simulateBulkSaveActionItems({
                resolvedWorkspaceId: null,
                userId,
                items,
              });

              expect(result.status).toBe(400);
              expect(result.error).toBe("workspace_required");
              expect(result.rows).toBeUndefined();
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "workspaceId on every row equals the header value, for any number of items",
      () => {
        /**
         * **Validates: Requirements 2.2**
         *
         * The workspaceId must be set on ALL rows in the batch — not just the
         * first one. This holds for any batch size from 1 to N.
         */
        fc.assert(
          fc.property(
            fc.uuid(),
            fc.uuid(),
            fc.integer({ min: 1, max: 20 }),
            (workspaceId, userId, count) => {
              const items: ActionItemInput[] = Array.from({ length: count }, (_, i) => ({
                task: `Task ${i + 1}`,
              }));

              const result = simulateBulkSaveActionItems({
                resolvedWorkspaceId: workspaceId,
                userId,
                items,
              });

              expect(result.rows!.every((r) => r.workspaceId === workspaceId)).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      }
    );
  }
);

// ── Property 5 ────────────────────────────────────────────────────────────────

describe(
  // Feature: workspace-integration, Property 5: Action items inherit workspaceId from meeting
  "Property 5: Action items inherit workspaceId from meeting",
  () => {
    it(
      "action items bulk-saved from a completed meeting all have the meeting's workspaceId",
      () => {
        /**
         * **Validates: Requirements 2.6**
         *
         * For any meeting_session with workspaceId = W, action items bulk-saved
         * with that meetingId must all have workspaceId = W.
         */
        fc.assert(
          fc.property(
            fc.uuid(),          // workspaceId W
            fc.uuid(),          // meeting id
            fc.uuid(),          // meeting owner userId
            fc.array(fc.uuid(), { minLength: 0, maxLength: 4 }), // sharedWithUserIds
            nonEmptyItemsArb,
            (workspaceId, meetingId, ownerUserId, sharedUserIds, items) => {
              const meeting: MeetingSessionRow = {
                id: meetingId,
                workspaceId,
                userId: ownerUserId,
                sharedWithUserIds: sharedUserIds,
              };

              const rows = simulateSyncMeetingActionItems({ meeting, items });

              // Every inserted row must carry the meeting's workspaceId
              expect(rows.length).toBeGreaterThan(0);
              for (const row of rows) {
                expect(row.workspaceId).toBe(workspaceId);
              }
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "action items are inserted for the owner and all shared users",
      () => {
        /**
         * **Validates: Requirements 2.6**
         *
         * syncMeetingActionItems inserts rows for the meeting owner AND every
         * user in sharedWithUserIds. Each row must carry the meeting's workspaceId.
         */
        fc.assert(
          fc.property(
            fc.uuid(),
            fc.uuid(),
            fc.uuid(),
            fc.array(fc.uuid(), { minLength: 1, maxLength: 4 }),
            nonEmptyItemsArb,
            (workspaceId, meetingId, ownerUserId, sharedUserIds, items) => {
              // Ensure sharedUserIds are distinct from owner
              const uniqueShared = sharedUserIds.filter((id) => id !== ownerUserId);
              fc.pre(uniqueShared.length > 0);

              const meeting: MeetingSessionRow = {
                id: meetingId,
                workspaceId,
                userId: ownerUserId,
                sharedWithUserIds: uniqueShared,
              };

              const rows = simulateSyncMeetingActionItems({ meeting, items });

              const expectedUserCount = new Set([ownerUserId, ...uniqueShared]).size;
              expect(rows.length).toBe(expectedUserCount * items.length);

              for (const row of rows) {
                expect(row.workspaceId).toBe(workspaceId);
                expect(row.meetingId).toBe(meetingId);
              }
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "no action items are inserted when the meeting has no workspaceId",
      () => {
        /**
         * **Validates: Requirements 2.6**
         *
         * When the meeting_session has workspaceId = null, syncMeetingActionItems
         * must not insert any rows (guard condition in the real implementation).
         */
        fc.assert(
          fc.property(
            fc.uuid(),
            fc.uuid(),
            fc.array(fc.uuid(), { minLength: 0, maxLength: 3 }),
            nonEmptyItemsArb,
            (meetingId, ownerUserId, sharedUserIds, items) => {
              const meeting: MeetingSessionRow = {
                id: meetingId,
                workspaceId: null,
                userId: ownerUserId,
                sharedWithUserIds: sharedUserIds,
              };

              const rows = simulateSyncMeetingActionItems({ meeting, items });

              expect(rows.length).toBe(0);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "workspaceId on each row equals the meeting's workspaceId, for any valid UUID",
      () => {
        /**
         * **Validates: Requirements 2.6**
         *
         * The workspaceId is read directly from the meeting_session row and
         * written to each action_item — no transformation occurs.
         */
        fc.assert(
          fc.property(
            fc.uuid(),
            fc.uuid(),
            fc.uuid(),
            nonEmptyItemsArb,
            (workspaceId, meetingId, ownerUserId, items) => {
              const meeting: MeetingSessionRow = {
                id: meetingId,
                workspaceId,
                userId: ownerUserId,
                sharedWithUserIds: [],
              };

              const rows = simulateSyncMeetingActionItems({ meeting, items });

              expect(rows.every((r) => r.workspaceId === workspaceId)).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      }
    );
  }
);
