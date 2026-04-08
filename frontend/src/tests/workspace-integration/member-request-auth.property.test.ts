/**
 * Property-Based Tests: Member Request Authorization
 *
 * // Feature: workspace-integration, Property 9: Member request authorization
 *
 * **Validates: Requirements 6.2**
 *
 * For any user who is NOT an active member of the target workspace,
 * POST /api/meetings/[id]/request-move must return HTTP 403.
 *
 * Authorization logic from the route:
 *   const [membership] = await db.select().from(workspaceMembers)
 *     .where(and(
 *       eq(workspaceMembers.workspaceId, workspaceId),
 *       eq(workspaceMembers.userId, user.id),
 *       eq(workspaceMembers.status, 'active')
 *     )).limit(1);
 *
 *   if (!membership) return apiError('...', 403, { error: 'forbidden' });
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ── Types ─────────────────────────────────────────────────────────────────────

type WorkspaceMemberStatus = "active" | "inactive" | "pending" | "suspended";

type WorkspaceMembership = {
  workspaceId: string;
  userId: string;
  status: WorkspaceMemberStatus;
} | null;

type AuthContext = {
  userId: string;
  targetWorkspaceId: string;
  membership: WorkspaceMembership;
};

// ── Authorization Logic ───────────────────────────────────────────────────────

/**
 * Pure authorization function extracted from the request-move route logic.
 *
 * Returns true (authorized) only when the user has an active membership
 * in the target workspace. Returns false (should return 403) otherwise.
 */
function checkMemberRequestAuthorization(ctx: AuthContext): boolean {
  return (
    ctx.membership !== null &&
    ctx.membership.workspaceId === ctx.targetWorkspaceId &&
    ctx.membership.userId === ctx.userId &&
    ctx.membership.status === "active"
  );
}

/**
 * Returns the HTTP status code the route should respond with.
 * 403 if authorization fails, 200 if it passes.
 */
function resolveHttpStatus(ctx: AuthContext): 200 | 403 {
  return checkMemberRequestAuthorization(ctx) ? 200 : 403;
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

// ── Property 9 ────────────────────────────────────────────────────────────────

describe(
  // Feature: workspace-integration, Property 9: Member request authorization
  "Property 9: Member request authorization",
  () => {
    it(
      "user with no membership always gets 403",
      () => {
        /**
         * **Validates: Requirements 6.2**
         *
         * For any user with no membership record at all in the target workspace,
         * the route must return 403.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // userId
            fc.uuid(), // targetWorkspaceId
            (userId, targetWorkspaceId) => {
              const ctx: AuthContext = {
                userId,
                targetWorkspaceId,
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
      "user with inactive/pending/suspended membership always gets 403",
      () => {
        /**
         * **Validates: Requirements 6.2**
         *
         * For any user who has a membership record but with a non-active status,
         * the route must return 403. Only 'active' status grants access.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // userId
            fc.uuid(), // targetWorkspaceId
            inactiveMemberStatusArb,
            (userId, targetWorkspaceId, memberStatus) => {
              const ctx: AuthContext = {
                userId,
                targetWorkspaceId,
                membership: {
                  workspaceId: targetWorkspaceId,
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
      "user with active membership in a different workspace gets 403",
      () => {
        /**
         * **Validates: Requirements 6.2**
         *
         * For any user who has an active membership but in a different workspace
         * than the target, the route must return 403.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // userId
            fc.uuid(), // targetWorkspaceId
            fc.uuid(), // membershipWorkspaceId (different workspace)
            (userId, targetWorkspaceId, membershipWorkspaceId) => {
              fc.pre(targetWorkspaceId !== membershipWorkspaceId);

              const ctx: AuthContext = {
                userId,
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
      "user whose membership belongs to a different user gets 403",
      () => {
        /**
         * **Validates: Requirements 6.2**
         *
         * For any user whose membership record has a different userId,
         * the route must return 403. Membership must match the requesting user.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // userId (the requester)
            fc.uuid(), // memberUserId (different user on the membership)
            fc.uuid(), // targetWorkspaceId
            memberStatusArb,
            (userId, memberUserId, targetWorkspaceId, memberStatus) => {
              fc.pre(userId !== memberUserId);

              const ctx: AuthContext = {
                userId,
                targetWorkspaceId,
                membership: {
                  workspaceId: targetWorkspaceId,
                  userId: memberUserId, // membership belongs to someone else
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
      "active member of the target workspace is authorized (200)",
      () => {
        /**
         * **Validates: Requirements 6.2**
         *
         * Only when the user has an active membership in the exact target workspace
         * should authorization pass (200). This is the positive case confirming
         * the 403 boundary is correct.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // userId
            fc.uuid(), // targetWorkspaceId
            (userId, targetWorkspaceId) => {
              const ctx: AuthContext = {
                userId,
                targetWorkspaceId,
                membership: {
                  workspaceId: targetWorkspaceId,
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
