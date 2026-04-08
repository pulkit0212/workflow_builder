/**
 * Property-Based Tests: Bulk-Assign Action Items
 *
 * Feature: workspace-integration, Property 14: Bulk-assign updates owner field
 *
 * **Validates: Requirements 6.8**
 *
 * For any set of action item IDs and any assignee name, after a successful
 * bulk-assign operation every selected action item must have owner = assignee.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ── Types ─────────────────────────────────────────────────────────────────────

type ActionItem = {
  id: string;
  workspaceId: string;
  owner: string;
  task: string;
  priority: string;
  status: string;
  meetingId: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Simulates the server-side bulk-assign logic for PATCH /api/workspace/action-items/bulk-assign.
 * Updates the owner field on all items whose id is in itemIds and workspaceId matches.
 */
function applyBulkAssign(
  items: ActionItem[],
  workspaceId: string,
  itemIds: string[],
  assignee: string
): ActionItem[] {
  const idSet = new Set(itemIds);
  return items.map((item) => {
    if (item.workspaceId === workspaceId && idSet.has(item.id)) {
      return { ...item, owner: assignee };
    }
    return item;
  });
}

// ── Generators ────────────────────────────────────────────────────────────────

const priorityArb = fc.constantFrom("Low", "Medium", "High");
const statusArb = fc.constantFrom("pending", "in_progress", "completed");

// ── Property 14 ───────────────────────────────────────────────────────────────

describe(
  // Feature: workspace-integration, Property 14: Bulk-assign updates owner field
  "Property 14: Bulk-assign — every selected action item has owner = assignee after the operation",
  () => {
    it(
      "all targeted action items have owner equal to the assignee after bulk-assign",
      () => {
        /**
         * **Validates: Requirements 6.8**
         *
         * For any set of action item IDs and any assignee name, after a successful
         * bulk-assign operation every selected action item must have owner = assignee.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // workspaceId
            fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0), // assignee
            fc.array(
              fc.record({
                id: fc.uuid(),
                owner: fc.string({ minLength: 1, maxLength: 32 }),
                task: fc.string({ minLength: 1, maxLength: 64 }),
                priority: priorityArb,
                status: statusArb,
                meetingId: fc.option(fc.uuid(), { nil: null }),
              }),
              { minLength: 1, maxLength: 20 }
            ),
            (workspaceId, assignee, rawItems) => {
              const items: ActionItem[] = rawItems.map((item) => ({ ...item, workspaceId }));

              // Select a subset of item IDs to bulk-assign
              const itemIds = items.slice(0, Math.ceil(items.length / 2)).map((item) => item.id);

              const result = applyBulkAssign(items, workspaceId, itemIds, assignee);

              // Every targeted item must now have owner = assignee
              const idSet = new Set(itemIds);
              for (const item of result) {
                if (idSet.has(item.id)) {
                  expect(item.owner).toBe(assignee);
                }
              }
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "non-targeted action items retain their original owner after bulk-assign",
      () => {
        /**
         * **Validates: Requirements 6.8**
         *
         * Items not in the itemIds set must not have their owner changed.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // workspaceId
            fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0),
            fc.array(
              fc.record({
                id: fc.uuid(),
                owner: fc.string({ minLength: 1, maxLength: 32 }),
                task: fc.string({ minLength: 1, maxLength: 64 }),
                priority: priorityArb,
                status: statusArb,
                meetingId: fc.option(fc.uuid(), { nil: null }),
              }),
              { minLength: 2, maxLength: 20 }
            ),
            (workspaceId, assignee, rawItems) => {
              const items: ActionItem[] = rawItems.map((item) => ({ ...item, workspaceId }));

              // Only target the first item
              const itemIds = [items[0].id];
              const originalOwners = new Map(items.map((item) => [item.id, item.owner]));

              const result = applyBulkAssign(items, workspaceId, itemIds, assignee);

              // Non-targeted items must keep their original owner
              for (const item of result) {
                if (!itemIds.includes(item.id)) {
                  expect(item.owner).toBe(originalOwners.get(item.id));
                }
              }
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "bulk-assign with empty itemIds changes no owners",
      () => {
        /**
         * **Validates: Requirements 6.8**
         *
         * When itemIds is empty, no action item owner should be changed.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // workspaceId
            fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0),
            fc.array(
              fc.record({
                id: fc.uuid(),
                owner: fc.string({ minLength: 1, maxLength: 32 }),
                task: fc.string({ minLength: 1, maxLength: 64 }),
                priority: priorityArb,
                status: statusArb,
                meetingId: fc.option(fc.uuid(), { nil: null }),
              }),
              { minLength: 0, maxLength: 20 }
            ),
            (workspaceId, assignee, rawItems) => {
              const items: ActionItem[] = rawItems.map((item) => ({ ...item, workspaceId }));
              const originalOwners = new Map(items.map((item) => [item.id, item.owner]));

              const result = applyBulkAssign(items, workspaceId, [], assignee);

              for (const item of result) {
                expect(item.owner).toBe(originalOwners.get(item.id));
              }
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "bulk-assign only affects items in the target workspace",
      () => {
        /**
         * **Validates: Requirements 6.8**
         *
         * Items from a different workspace must not be affected even if their IDs are in itemIds.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // workspaceId A (target)
            fc.uuid(), // workspaceId B (other)
            fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0),
            fc.array(
              fc.record({
                id: fc.uuid(),
                owner: fc.string({ minLength: 1, maxLength: 32 }),
                task: fc.string({ minLength: 1, maxLength: 64 }),
                priority: priorityArb,
                status: statusArb,
                meetingId: fc.option(fc.uuid(), { nil: null }),
              }),
              { minLength: 1, maxLength: 10 }
            ),
            (workspaceA, workspaceB, assignee, rawItems) => {
              fc.pre(workspaceA !== workspaceB);

              // All items belong to workspace B
              const items: ActionItem[] = rawItems.map((item) => ({
                ...item,
                workspaceId: workspaceB,
              }));

              const originalOwners = new Map(items.map((item) => [item.id, item.owner]));
              const itemIds = items.map((item) => item.id);

              // Bulk-assign targeting workspace A — should not affect workspace B items
              const result = applyBulkAssign(items, workspaceA, itemIds, assignee);

              for (const item of result) {
                expect(item.owner).toBe(originalOwners.get(item.id));
              }
            }
          ),
          { numRuns: 100 }
        );
      }
    );
  }
);
