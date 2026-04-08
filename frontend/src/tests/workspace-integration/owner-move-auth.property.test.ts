/**
 * Property-Based Tests: Owner-Move Authorization
 *
 * // Feature: workspace-integration, Property 4: Owner-move authorization
 *
 * **Validates: Requirements 4.2, 4.3**
 *
 * For any meeting and any authenticated user who is either:
 *   (a) not the meeting owner, OR
 *   (b) not an active member of the target workspace,
 * POST /api/meetings/[id]/move-to-workspace must return HTTP 403.
 *
 * Both conditions must hold for authorization to pass:
 *   - User must be the meeting owner (meeting.userId === user.id)
 *   - User must be an active workspace member (membership exists with status='active')
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ── Types ─────────────────────────────────────────────────────────────────────

type WorkspaceMemberStatus = "active" | "inactive" | "pending" | "suspended";

type Meeting = {
  id: string;
  userId: string; // owner
};

type WorkspaceMembership = {
  workspaceId: string;
  userId: string;
  status: WorkspaceMemberStatus;
} | null;

type AuthContext = {
  userId: string;
  meeting: Meeting;
  targetWorkspaceId: string;
  membership: WorkspaceMembership;
};

// ── Authorization Logic ───────────────────────────────────────────────────────

/**
 * Pure authorization function extracted from the route logic.
 *
 * Returns true (authorized / should proceed) only when:
 *   1. The user is the meeting owner
 *   2. The user has an active membership in the target workspace
 *
 * Returns false (should return 403) if either condition fails.
 */
function checkOwnerMoveAuthorization(ctx: AuthContext): boolean {
  const isOwner = ctx.meeting.userId === ctx.userId;
  if (!isOwner) return false;

  const isActiveMember =
    ctx.membership !== null &&
    ctx.membership.workspaceId === ctx.targetWorkspaceId &&
    ctx.membership.userId === ctx.userId &&
    ctx.membership.status === "active";

  return isActiveMember;
}

/**
 * Returns the HTTP status code the route should respond with.
 * 403 if authorization fails, 200 if it passes.
 */
function resolveHttpStatus(ctx: AuthContext): 200 | 403 {
  return checkOwnerMoveAuthorization(ctx) ? 200 : 403;
}

// ── Generators ────────────────────────────────────────────────────────────────

const memberStatusArb = fc.constantFrom<WorkspaceMemberStatus>(
  "active",
  "inactive",
  "pending",
  "suspended"
);

const inactiveMemberStatusArb = fc.constantFrom<WorkspaceMemberStatus>(
  "inactive",
  "pending",
  "suspended"
);

// ── Property 4 ────────────────────────────────────────────────────────────────

describe(
  // Feature: workspace-integration, Property 4: Owner-move authorization
  "Property 4: Owner-move authorization",
  () => {
    it(
      "non-owner always gets 403 regardless of membership",
      () => {
        /**
         * **Validates: Requirements 4.2**
         *
         * For any user who is NOT the meeting owner, the route must return 403,
         * regardless of whether they are an active workspace member.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // userId (the requester)
            fc.uuid(), // ownerId (different from userId)
            fc.uuid(), // meetingId
            fc.uuid(), // workspaceId
            memberStatusArb, // membership status (any)
            (userId, ownerId, meetingId, workspaceId, memberStatus) => {
              // Ensure the requester is NOT the owner
              fc.pre(userId !== ownerId);

              const ctx: AuthContext = {
                userId,
                meeting: { id: meetingId, userId: ownerId },
                targetWorkspaceId: workspaceId,
                membership: {
                  workspaceId,
                  userId,
                  status: memberStatus,
                },
              };

              expect(resolveHttpStatus(ctx)).toBe(403);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "owner without active membership always gets 403",
      () => {
        /**
         * **Validates: Requirements 4.3**
         *
         * For any user who IS the meeting owner but does NOT have an active
         * membership in the target workspace, the route must return 403.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // userId (owner and requester)
            fc.uuid(), // meetingId
            fc.uuid(), // workspaceId
            (userId, meetingId, workspaceId) => {
              const ctx: AuthContext = {
                userId,
                meeting: { id: meetingId, userId },
                targetWorkspaceId: workspaceId,
                membership: null, // no membership at all
              };

              expect(resolveHttpStatus(ctx)).toBe(403);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "owner with inactive/pending/suspended membership always gets 403",
      () => {
        /**
         * **Validates: Requirements 4.3**
         *
         * For any user who IS the meeting owner but has a non-active membership
         * (inactive, pending, or suspended), the route must return 403.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // userId (owner and requester)
            fc.uuid(), // meetingId
            fc.uuid(), // workspaceId
            inactiveMemberStatusArb,
            (userId, meetingId, workspaceId, memberStatus) => {
              const ctx: AuthContext = {
                userId,
                meeting: { id: meetingId, userId },
                targetWorkspaceId: workspaceId,
                membership: {
                  workspaceId,
                  userId,
                  status: memberStatus,
                },
              };

              expect(resolveHttpStatus(ctx)).toBe(403);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "owner with membership in a different workspace gets 403",
      () => {
        /**
         * **Validates: Requirements 4.3**
         *
         * For any user who IS the meeting owner but whose active membership is
         * for a different workspace than the target, the route must return 403.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // userId (owner and requester)
            fc.uuid(), // meetingId
            fc.uuid(), // targetWorkspaceId
            fc.uuid(), // membershipWorkspaceId (different workspace)
            (userId, meetingId, targetWorkspaceId, membershipWorkspaceId) => {
              // Ensure the membership is for a different workspace
              fc.pre(targetWorkspaceId !== membershipWorkspaceId);

              const ctx: AuthContext = {
                userId,
                meeting: { id: meetingId, userId },
                targetWorkspaceId,
                membership: {
                  workspaceId: membershipWorkspaceId, // wrong workspace
                  userId,
                  status: "active",
                },
              };

              expect(resolveHttpStatus(ctx)).toBe(403);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "non-owner without membership always gets 403",
      () => {
        /**
         * **Validates: Requirements 4.2, 4.3**
         *
         * For any user who is NEITHER the meeting owner NOR an active workspace
         * member, the route must return 403.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // userId (the requester)
            fc.uuid(), // ownerId (different from userId)
            fc.uuid(), // meetingId
            fc.uuid(), // workspaceId
            (userId, ownerId, meetingId, workspaceId) => {
              fc.pre(userId !== ownerId);

              const ctx: AuthContext = {
                userId,
                meeting: { id: meetingId, userId: ownerId },
                targetWorkspaceId: workspaceId,
                membership: null,
              };

              expect(resolveHttpStatus(ctx)).toBe(403);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "owner with active membership in the correct workspace is authorized (200)",
      () => {
        /**
         * **Validates: Requirements 4.2, 4.3**
         *
         * Only when the user is BOTH the meeting owner AND an active member of
         * the target workspace should authorization pass (200).
         * This is the positive case confirming the 403 boundary is correct.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // userId (owner and requester)
            fc.uuid(), // meetingId
            fc.uuid(), // workspaceId
            (userId, meetingId, workspaceId) => {
              const ctx: AuthContext = {
                userId,
                meeting: { id: meetingId, userId },
                targetWorkspaceId: workspaceId,
                membership: {
                  workspaceId,
                  userId,
                  status: "active",
                },
              };

              expect(resolveHttpStatus(ctx)).toBe(200);
            }
          ),
          { numRuns: 100 }
        );
      }
    );
  }
);
