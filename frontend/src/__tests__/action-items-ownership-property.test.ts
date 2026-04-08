/**
 * Property Tests for Action Items Ownership Filter
 * Feature: workspace-redesign
 *
 * Property 14: Personal action items ownership filter
 * Validates: Requirements 6.1
 */

// Feature: workspace-redesign, Property 14: Personal action items ownership filter

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Types mirroring the action items data model
// ---------------------------------------------------------------------------

type ActionItem = {
  id: string;
  userId: string;
  meetingId: string | null;
  workspaceId: string | null;
  task: string;
};

type MeetingSession = {
  id: string;
  userId: string;
};

// ---------------------------------------------------------------------------
// Pure logic extracted from the API query layer for property testing.
// These functions mirror the ownership scoping logic in the action items API.
// ---------------------------------------------------------------------------

/**
 * Simulates personal mode ownership filter:
 * Returns items where:
 *   - userId = currentUser (own items), OR
 *   - meetingId IN (meetings where userId = currentUser)
 *
 * Validates: Requirements 6.1
 */
function filterPersonalModeOwnership(
  items: ActionItem[],
  meetings: MeetingSession[],
  currentUserId: string
): ActionItem[] {
  const userMeetingIds = new Set(
    meetings.filter((m) => m.userId === currentUserId).map((m) => m.id)
  );

  return items.filter(
    (item) =>
      item.userId === currentUserId ||
      (item.meetingId !== null && userMeetingIds.has(item.meetingId))
  );
}

/**
 * Simulates workspace mode for members:
 * Returns items where:
 *   workspaceId = currentWorkspace AND (userId = currentUser OR meetingId IN user's meetings)
 */
function filterWorkspaceMemberOwnership(
  items: ActionItem[],
  meetings: MeetingSession[],
  workspaceId: string,
  currentUserId: string
): ActionItem[] {
  const userMeetingIds = new Set(
    meetings.filter((m) => m.userId === currentUserId).map((m) => m.id)
  );

  return items.filter(
    (item) =>
      item.workspaceId === workspaceId &&
      (item.userId === currentUserId ||
        (item.meetingId !== null && userMeetingIds.has(item.meetingId)))
  );
}

/**
 * Simulates workspace mode for admin/owner:
 * Returns all items in the workspace.
 */
function filterWorkspaceAdminOwnership(
  items: ActionItem[],
  workspaceId: string
): ActionItem[] {
  return items.filter((item) => item.workspaceId === workspaceId);
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const userIdArb = fc
  .string({ minLength: 1, maxLength: 36 })
  .filter((s) => s.trim().length > 0 && s === s.trim());

const workspaceIdArb = fc
  .string({ minLength: 1, maxLength: 36 })
  .filter((s) => s.trim().length > 0 && s === s.trim());

const meetingIdArb = fc
  .string({ minLength: 1, maxLength: 36 })
  .filter((s) => s.trim().length > 0 && s === s.trim());

function actionItemArb(
  userIds: string[],
  meetingIds: string[],
  workspaceIds: (string | null)[]
): fc.Arbitrary<ActionItem> {
  return fc.record({
    id: fc.uuid(),
    userId: fc.oneof(...userIds.map((id) => fc.constant(id))),
    meetingId: fc.oneof(...[...meetingIds.map((id) => fc.constant<string | null>(id)), fc.constant<string | null>(null)]),
    workspaceId: fc.oneof(...workspaceIds.map((id) => fc.constant(id))),
    task: fc.string({ minLength: 1, maxLength: 50 }),
  });
}

function meetingSessionArb(userIds: string[]): fc.Arbitrary<MeetingSession> {
  return fc.record({
    id: fc.uuid(),
    userId: fc.oneof(...userIds.map((id) => fc.constant(id))),
  });
}

// ---------------------------------------------------------------------------
// Property 14: Personal action items ownership filter
// Feature: workspace-redesign, Property 14: Personal action items ownership filter
// ---------------------------------------------------------------------------

describe("Property 14: Personal action items ownership filter (Req 6.1)", () => {
  it("personal mode returns only items owned by or related to the current user", () => {
    // Feature: workspace-redesign, Property 14: Personal action items ownership filter
    fc.assert(
      fc.property(
        userIdArb,
        fc.array(userIdArb, { minLength: 1, maxLength: 4 }),
        fc.array(meetingIdArb, { minLength: 1, maxLength: 5 }),
        fc.array(workspaceIdArb, { minLength: 1, maxLength: 3 }),
        (currentUser, otherUsers, meetingIds, workspaceIds) => {
          const allUsers = [currentUser, ...otherUsers];
          const allWorkspaceIds: (string | null)[] = [...workspaceIds, null];

          const items: ActionItem[] = allUsers.flatMap((uid, i) =>
            meetingIds.map((mid, j) => ({
              id: `${i}-${j}`,
              userId: uid,
              meetingId: mid,
              workspaceId: allWorkspaceIds[j % allWorkspaceIds.length] ?? null,
              task: `Task ${i}-${j}`,
            }))
          );

          // Meetings owned by the current user
          const meetings: MeetingSession[] = meetingIds.map((mid, i) => ({
            id: mid,
            userId: allUsers[i % allUsers.length],
          }));

          const result = filterPersonalModeOwnership(items, meetings, currentUser);

          // Every returned item must be owned by the user OR from a meeting they own
          const userMeetingIds = new Set(
            meetings.filter((m) => m.userId === currentUser).map((m) => m.id)
          );

          for (const item of result) {
            const isOwner = item.userId === currentUser;
            const isFromUserMeeting = item.meetingId !== null && userMeetingIds.has(item.meetingId);
            expect(isOwner || isFromUserMeeting).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("personal mode never returns items from other users with no relationship to current user", () => {
    // Feature: workspace-redesign, Property 14: Personal action items ownership filter
    fc.assert(
      fc.property(
        userIdArb,
        userIdArb,
        fc.array(meetingIdArb, { minLength: 1, maxLength: 5 }),
        (currentUser, otherUser, meetingIds) => {
          fc.pre(currentUser !== otherUser);

          // Items owned by other user, from meetings owned by other user
          const otherUserMeetings: MeetingSession[] = meetingIds.map((mid) => ({
            id: mid,
            userId: otherUser,
          }));

          const items: ActionItem[] = meetingIds.map((mid, i) => ({
            id: `other-${i}`,
            userId: otherUser,
            meetingId: mid,
            workspaceId: null,
            task: `Other user task ${i}`,
          }));

          const result = filterPersonalModeOwnership(items, otherUserMeetings, currentUser);

          // No items from other user's meetings (current user didn't participate)
          expect(result).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("personal mode includes items from meetings the user participated in even if item userId differs", () => {
    // Feature: workspace-redesign, Property 14: Personal action items ownership filter
    fc.assert(
      fc.property(
        userIdArb,
        userIdArb,
        meetingIdArb,
        (currentUser, itemOwner, meetingId) => {
          fc.pre(currentUser !== itemOwner);

          // Meeting is owned by currentUser (they participated)
          const meetings: MeetingSession[] = [{ id: meetingId, userId: currentUser }];

          // Item was created by itemOwner but linked to the meeting
          const items: ActionItem[] = [
            {
              id: "item-1",
              userId: itemOwner,
              meetingId,
              workspaceId: null,
              task: "Task from shared meeting",
            },
          ];

          const result = filterPersonalModeOwnership(items, meetings, currentUser);

          // Item should be included because the meeting belongs to currentUser
          expect(result).toHaveLength(1);
          expect(result[0].id).toBe("item-1");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("personal mode always includes items directly owned by the current user", () => {
    // Feature: workspace-redesign, Property 14: Personal action items ownership filter
    fc.assert(
      fc.property(
        userIdArb,
        fc.array(meetingIdArb, { minLength: 0, maxLength: 3 }),
        fc.array(workspaceIdArb, { minLength: 1, maxLength: 3 }),
        (currentUser, meetingIds, workspaceIds) => {
          const allWorkspaceIds: (string | null)[] = [...workspaceIds, null];

          // Items owned by current user with various meetingIds and workspaceIds
          const ownedItems: ActionItem[] = allWorkspaceIds.map((wsId, i) => ({
            id: `owned-${i}`,
            userId: currentUser,
            meetingId: meetingIds[i % (meetingIds.length || 1)] ?? null,
            workspaceId: wsId,
            task: `My task ${i}`,
          }));

          const meetings: MeetingSession[] = meetingIds.map((mid) => ({
            id: mid,
            userId: currentUser,
          }));

          const result = filterPersonalModeOwnership(ownedItems, meetings, currentUser);

          // All owned items must be returned
          expect(result).toHaveLength(ownedItems.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("workspace member mode returns only workspace items with ownership relationship", () => {
    // Feature: workspace-redesign, Property 14: Personal action items ownership filter
    fc.assert(
      fc.property(
        workspaceIdArb,
        userIdArb,
        fc.array(userIdArb, { minLength: 1, maxLength: 3 }),
        fc.array(meetingIdArb, { minLength: 1, maxLength: 4 }),
        (workspaceId, currentUser, otherUsers, meetingIds) => {
          const allUsers = [currentUser, ...otherUsers];

          const items: ActionItem[] = allUsers.flatMap((uid, i) =>
            meetingIds.map((mid, j) => ({
              id: `${i}-${j}`,
              userId: uid,
              meetingId: mid,
              workspaceId: j % 2 === 0 ? workspaceId : null,
              task: `Task ${i}-${j}`,
            }))
          );

          const meetings: MeetingSession[] = meetingIds.map((mid, i) => ({
            id: mid,
            userId: allUsers[i % allUsers.length],
          }));

          const result = filterWorkspaceMemberOwnership(items, meetings, workspaceId, currentUser);

          const userMeetingIds = new Set(
            meetings.filter((m) => m.userId === currentUser).map((m) => m.id)
          );

          for (const item of result) {
            // Must be in the workspace
            expect(item.workspaceId).toBe(workspaceId);
            // Must have ownership relationship
            const isOwner = item.userId === currentUser;
            const isFromUserMeeting = item.meetingId !== null && userMeetingIds.has(item.meetingId);
            expect(isOwner || isFromUserMeeting).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("workspace admin/owner mode returns all items in the workspace regardless of ownership", () => {
    // Feature: workspace-redesign, Property 14: Personal action items ownership filter
    fc.assert(
      fc.property(
        workspaceIdArb,
        workspaceIdArb,
        fc.array(userIdArb, { minLength: 1, maxLength: 4 }),
        fc.array(meetingIdArb, { minLength: 1, maxLength: 4 }),
        (workspaceId, otherWorkspaceId, userIds, meetingIds) => {
          fc.pre(workspaceId !== otherWorkspaceId);

          const items: ActionItem[] = userIds.flatMap((uid, i) =>
            meetingIds.map((mid, j) => ({
              id: `${i}-${j}`,
              userId: uid,
              meetingId: mid,
              workspaceId: j % 2 === 0 ? workspaceId : otherWorkspaceId,
              task: `Task ${i}-${j}`,
            }))
          );

          const result = filterWorkspaceAdminOwnership(items, workspaceId);

          // All returned items must be in the workspace
          for (const item of result) {
            expect(item.workspaceId).toBe(workspaceId);
          }

          // Count of workspace items must match
          const expectedCount = items.filter((i) => i.workspaceId === workspaceId).length;
          expect(result).toHaveLength(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("personal mode items with null meetingId are only included if userId matches", () => {
    // Feature: workspace-redesign, Property 14: Personal action items ownership filter
    fc.assert(
      fc.property(
        userIdArb,
        userIdArb,
        (currentUser, otherUser) => {
          fc.pre(currentUser !== otherUser);

          const items: ActionItem[] = [
            { id: "mine", userId: currentUser, meetingId: null, workspaceId: null, task: "My task" },
            { id: "theirs", userId: otherUser, meetingId: null, workspaceId: null, task: "Their task" },
          ];

          const result = filterPersonalModeOwnership(items, [], currentUser);

          expect(result).toHaveLength(1);
          expect(result[0].id).toBe("mine");
        }
      ),
      { numRuns: 100 }
    );
  });
});
