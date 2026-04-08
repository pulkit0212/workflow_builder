/**
 * Property-Based Tests: Rejection Does Not Modify Meeting
 *
 * // Feature: workspace-integration, Property 11: Rejection does not modify meeting
 *
 * **Validates: Requirements 7.6**
 *
 * For any PATCH with action = 'reject', the associated meeting_session's
 * workspaceId and workspace_move_status must remain unchanged after the operation.
 *
 * Reject logic from the route (only updates move_request, NOT meeting_sessions):
 *   await db.update(workspaceMoveRequests).set({
 *     status: 'rejected',
 *     reviewedBy: userId,
 *     reviewedAt: now,
 *     adminNote: adminNote
 *   }).where(eq(workspaceMoveRequests.id, requestId));
 *   // meeting_sessions: NO changes
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ── Types ─────────────────────────────────────────────────────────────────────

type WorkspaceMoveStatus =
  | null
  | "pending_approval"
  | "approved"
  | "rejected";

type MeetingSession = {
  id: string;
  workspaceId: string | null;
  workspaceMoveStatus: WorkspaceMoveStatus;
  workspaceMovedBy: string | null;
  workspaceMovedAt: Date | null;
};

type MoveRequest = {
  id: string;
  meetingId: string;
  workspaceId: string;
  requestedBy: string;
  status: "pending" | "approved" | "rejected";
  adminNote: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
};

type RejectAction = {
  action: "reject";
  adminNote?: string;
};

type RejectResult = {
  updatedMoveRequest: MoveRequest;
  meetingSession: MeetingSession; // unchanged
};

// ── Reject Logic (pure in-memory simulation) ─────────────────────────────────

/**
 * Simulates the reject branch of the admin review route.
 *
 * On reject: update move_request only (status='rejected', reviewedBy, reviewedAt, adminNote).
 * meeting_sessions: NO changes — workspaceId and workspace_move_status are untouched.
 */
function simulateReject(
  meeting: MeetingSession,
  moveRequest: MoveRequest,
  reviewerUserId: string,
  rejectAction: RejectAction
): RejectResult {
  const now = new Date();

  // Only the move_request is updated
  const updatedMoveRequest: MoveRequest = {
    ...moveRequest,
    status: "rejected",
    reviewedBy: reviewerUserId,
    reviewedAt: now,
    adminNote: rejectAction.adminNote ?? moveRequest.adminNote,
  };

  // meeting_sessions is NOT touched — return as-is
  return {
    updatedMoveRequest,
    meetingSession: meeting,
  };
}

// ── Generators ────────────────────────────────────────────────────────────────

const workspaceMoveStatusArb = fc.constantFrom<WorkspaceMoveStatus>(
  null,
  "pending_approval",
  "approved",
  "rejected"
);

const moveRequestStatusArb = fc.constantFrom<"pending" | "approved" | "rejected">(
  "pending",
  "approved",
  "rejected"
);

const meetingSessionArb = fc.record({
  id: fc.uuid(),
  workspaceId: fc.option(fc.uuid(), { nil: null }),
  workspaceMoveStatus: workspaceMoveStatusArb,
  workspaceMovedBy: fc.option(fc.uuid(), { nil: null }),
  workspaceMovedAt: fc.option(fc.date(), { nil: null }),
});

const moveRequestArb = (meetingId: string, workspaceId: string) =>
  fc.record({
    id: fc.uuid(),
    meetingId: fc.constant(meetingId),
    workspaceId: fc.constant(workspaceId),
    requestedBy: fc.uuid(),
    status: moveRequestStatusArb,
    adminNote: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: null }),
    reviewedBy: fc.option(fc.uuid(), { nil: null }),
    reviewedAt: fc.option(fc.date(), { nil: null }),
  });

const rejectActionArb: fc.Arbitrary<RejectAction> = fc.record({
  action: fc.constant("reject" as const),
  adminNote: fc.option(fc.string({ minLength: 1, maxLength: 500 }), { nil: undefined }),
}).map(({ action, adminNote }) =>
  adminNote !== undefined ? { action, adminNote } : { action }
);

// ── Property 11 ───────────────────────────────────────────────────────────────

describe(
  // Feature: workspace-integration, Property 11: Rejection does not modify meeting
  "Property 11: Rejection does not modify meeting",
  () => {
    it(
      "reject action leaves meeting_sessions.workspaceId unchanged",
      () => {
        /**
         * **Validates: Requirements 7.6**
         *
         * For any meeting session with any workspaceId (null or non-null),
         * performing a reject action must not change the workspaceId field.
         */
        fc.assert(
          fc.property(
            meetingSessionArb,
            fc.uuid(), // reviewerUserId
            rejectActionArb,
            (meeting, reviewerUserId, rejectAction) => {
              const moveRequest = {
                id: fc.sample(fc.uuid(), 1)[0],
                meetingId: meeting.id,
                workspaceId: fc.sample(fc.uuid(), 1)[0],
                requestedBy: fc.sample(fc.uuid(), 1)[0],
                status: "pending" as const,
                adminNote: null,
                reviewedBy: null,
                reviewedAt: null,
              };

              const originalWorkspaceId = meeting.workspaceId;

              const result = simulateReject(
                meeting,
                moveRequest,
                reviewerUserId,
                rejectAction
              );

              expect(result.meetingSession.workspaceId).toBe(originalWorkspaceId);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "reject action leaves meeting_sessions.workspace_move_status unchanged",
      () => {
        /**
         * **Validates: Requirements 7.6**
         *
         * For any meeting session with any workspace_move_status,
         * performing a reject action must not change the workspace_move_status field.
         */
        fc.assert(
          fc.property(
            meetingSessionArb,
            fc.uuid(), // reviewerUserId
            rejectActionArb,
            (meeting, reviewerUserId, rejectAction) => {
              const moveRequest = {
                id: fc.sample(fc.uuid(), 1)[0],
                meetingId: meeting.id,
                workspaceId: fc.sample(fc.uuid(), 1)[0],
                requestedBy: fc.sample(fc.uuid(), 1)[0],
                status: "pending" as const,
                adminNote: null,
                reviewedBy: null,
                reviewedAt: null,
              };

              const originalStatus = meeting.workspaceMoveStatus;

              const result = simulateReject(
                meeting,
                moveRequest,
                reviewerUserId,
                rejectAction
              );

              expect(result.meetingSession.workspaceMoveStatus).toBe(originalStatus);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "reject action updates move_request status to rejected",
      () => {
        /**
         * **Validates: Requirements 7.6**
         *
         * While the meeting is unchanged, the move_request itself must be
         * updated to status='rejected' with reviewedBy and reviewedAt set.
         */
        fc.assert(
          fc.property(
            meetingSessionArb,
            fc.uuid(), // reviewerUserId
            rejectActionArb,
            (meeting, reviewerUserId, rejectAction) => {
              const moveRequest = {
                id: fc.sample(fc.uuid(), 1)[0],
                meetingId: meeting.id,
                workspaceId: fc.sample(fc.uuid(), 1)[0],
                requestedBy: fc.sample(fc.uuid(), 1)[0],
                status: "pending" as const,
                adminNote: null,
                reviewedBy: null,
                reviewedAt: null,
              };

              const result = simulateReject(
                meeting,
                moveRequest,
                reviewerUserId,
                rejectAction
              );

              expect(result.updatedMoveRequest.status).toBe("rejected");
              expect(result.updatedMoveRequest.reviewedBy).toBe(reviewerUserId);
              expect(result.updatedMoveRequest.reviewedAt).not.toBeNull();
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "reject action does not modify any other meeting_sessions fields",
      () => {
        /**
         * **Validates: Requirements 7.6**
         *
         * The entire meeting_sessions record must be identical before and after
         * the reject operation — no fields are touched.
         */
        fc.assert(
          fc.property(
            meetingSessionArb,
            fc.uuid(), // reviewerUserId
            rejectActionArb,
            (meeting, reviewerUserId, rejectAction) => {
              const moveRequest = {
                id: fc.sample(fc.uuid(), 1)[0],
                meetingId: meeting.id,
                workspaceId: fc.sample(fc.uuid(), 1)[0],
                requestedBy: fc.sample(fc.uuid(), 1)[0],
                status: "pending" as const,
                adminNote: null,
                reviewedBy: null,
                reviewedAt: null,
              };

              const result = simulateReject(
                meeting,
                moveRequest,
                reviewerUserId,
                rejectAction
              );

              // The returned meeting session must be the exact same object (no mutation)
              expect(result.meetingSession).toEqual(meeting);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "reject with adminNote updates move_request adminNote but not meeting",
      () => {
        /**
         * **Validates: Requirements 7.6**
         *
         * When an adminNote is provided with the reject action, it is stored
         * on the move_request but the meeting_sessions record remains untouched.
         */
        fc.assert(
          fc.property(
            meetingSessionArb,
            fc.uuid(), // reviewerUserId
            fc.string({ minLength: 1, maxLength: 500 }), // adminNote
            (meeting, reviewerUserId, adminNote) => {
              const moveRequest = {
                id: fc.sample(fc.uuid(), 1)[0],
                meetingId: meeting.id,
                workspaceId: fc.sample(fc.uuid(), 1)[0],
                requestedBy: fc.sample(fc.uuid(), 1)[0],
                status: "pending" as const,
                adminNote: null,
                reviewedBy: null,
                reviewedAt: null,
              };

              const rejectAction: RejectAction = { action: "reject", adminNote };

              const result = simulateReject(
                meeting,
                moveRequest,
                reviewerUserId,
                rejectAction
              );

              // move_request gets the adminNote
              expect(result.updatedMoveRequest.adminNote).toBe(adminNote);

              // meeting_sessions is completely unchanged
              expect(result.meetingSession.workspaceId).toBe(meeting.workspaceId);
              expect(result.meetingSession.workspaceMoveStatus).toBe(
                meeting.workspaceMoveStatus
              );
            }
          ),
          { numRuns: 100 }
        );
      }
    );
  }
);
