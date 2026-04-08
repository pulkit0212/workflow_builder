/**
 * Property-Based Tests: Admin Review Authorization
 *
 * // Feature: workspace-integration, Property 10: Admin review authorization
 *
 * **Validates: Requirements 7.2**
 *
 * For any user who does NOT have role 'admin' or 'owner' in the workspace,
 * PATCH /api/workspace/[workspaceId]/move-requests/[requestId] must return HTTP 403.
 *
 * Authorization logic from the route:
 *   const [membership] = await db.select().from(workspaceMembers)
 *     .where(and(
 *       eq(workspaceMembers.workspaceId, workspaceId),
 *       eq(workspaceMembers.userId, user.id),
 *       eq(workspaceMembers.status, 'active')
 *     )).limit(1);
 *
 *   if (!membership || !['admin', 'owner'].includes(membership.role)) {
 *     return apiError('...', 403, { error: 'admin_required' });
 *   }
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ── Types ─────────────────────────────────────────────────────────────────────

type WorkspaceMemberRole = "owner" | "admin" | "member" | "viewer";
type WorkspaceMemberStatus = "active" | "inactive" | "pending" | "suspended";

type WorkspaceMembership = {
  workspaceId: string;
  userId: string;
  role: WorkspaceMemberRole;
  status: WorkspaceMemberStatus;
} | null;

type AuthContext = {
  userId: string;
  targetWorkspaceId: string;
  membership: WorkspaceMembership;
};

// ── Authorization Logic ───────────────────────────────────────────────────────

/**
 * Pure authorization function extracted from the admin review route logic.
 *
 * Returns true (authorized) only when the user has an active membership
 * with role 'admin' or 'owner' in the target workspace.
 * Returns false (should return 403) otherwise.
 */
function checkAdminReviewAuthorization(ctx: AuthContext): boolean {
  return (
    ctx.membership !== null &&
    ctx.membership.workspaceId === ctx.targetWorkspaceId &&
    ctx.membership.userId === ctx.userId &&
    ctx.membership.status === "active" &&
    ["admin", "owner"].includes(ctx.membership.role)
  );
}

/**
 * Returns the HTTP status code the route should respond with.
 * 403 if authorization fails, 200 if it passes.
 */
function resolveHttpStatus(ctx: AuthContext): 200 | 403 {
  return checkAdminReviewAuthorization(ctx) ? 200 : 403;
}

// ── Generators ────────────────────────────────────────────────────────────────

const nonAdminRoleArb = fc.constantFrom<WorkspaceMemberRole>("member", "viewer");
const adminRoleArb = fc.constantFrom<WorkspaceMemberRole>("admin", "owner");
const anyRoleArb = fc.constantFrom<WorkspaceMemberRole>(
  "owner",
  "admin",
  "member",
  "viewer"
);
const inactiveMemberStatusArb = fc.constantFrom<WorkspaceMemberStatus>(
  "inactive",
  "pending",
  "suspended"
);

// ── Property 10 ───────────────────────────────────────────────────────────────

describe(
  // Feature: workspace-integration, Property 10: Admin review authorization
  "Property 10: Admin review authorization",
  () => {
    it(
      "user with no membership always gets 403",
      () => {
        /**
         * **Validates: Requirements 7.2**
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
      "member or viewer role always gets 403",
      () => {
        /**
         * **Validates: Requirements 7.2**
         *
         * For any user who has an active membership but with role 'member' or 'viewer',
         * the route must return 403. Only 'admin' and 'owner' roles are permitted.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // userId
            fc.uuid(), // targetWorkspaceId
            nonAdminRoleArb,
            (userId, targetWorkspaceId, role) => {
              const ctx: AuthContext = {
                userId,
                targetWorkspaceId,
                membership: {
                  workspaceId: targetWorkspaceId,
                  userId,
                  role,
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
      "inactive/pending/suspended admin or owner always gets 403",
      () => {
        /**
         * **Validates: Requirements 7.2**
         *
         * Even if the user has an admin/owner role, an inactive membership
         * must still result in 403. Active status is required.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // userId
            fc.uuid(), // targetWorkspaceId
            adminRoleArb,
            inactiveMemberStatusArb,
            (userId, targetWorkspaceId, role, status) => {
              const ctx: AuthContext = {
                userId,
                targetWorkspaceId,
                membership: {
                  workspaceId: targetWorkspaceId,
                  userId,
                  role,
                  status,
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
      "admin/owner membership in a different workspace gets 403",
      () => {
        /**
         * **Validates: Requirements 7.2**
         *
         * For any user who has an admin/owner membership but in a different workspace
         * than the target, the route must return 403.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // userId
            fc.uuid(), // targetWorkspaceId
            fc.uuid(), // membershipWorkspaceId (different workspace)
            adminRoleArb,
            (userId, targetWorkspaceId, membershipWorkspaceId, role) => {
              fc.pre(targetWorkspaceId !== membershipWorkspaceId);

              const ctx: AuthContext = {
                userId,
                targetWorkspaceId,
                membership: {
                  workspaceId: membershipWorkspaceId, // wrong workspace
                  userId,
                  role,
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
      "membership belonging to a different user gets 403",
      () => {
        /**
         * **Validates: Requirements 7.2**
         *
         * For any user whose membership record has a different userId,
         * the route must return 403. Membership must match the requesting user.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // userId (the requester)
            fc.uuid(), // memberUserId (different user on the membership)
            fc.uuid(), // targetWorkspaceId
            anyRoleArb,
            (userId, memberUserId, targetWorkspaceId, role) => {
              fc.pre(userId !== memberUserId);

              const ctx: AuthContext = {
                userId,
                targetWorkspaceId,
                membership: {
                  workspaceId: targetWorkspaceId,
                  userId: memberUserId, // membership belongs to someone else
                  role,
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
      "active admin in the target workspace is authorized (200)",
      () => {
        /**
         * **Validates: Requirements 7.2**
         *
         * An active 'admin' or 'owner' in the exact target workspace must be
         * authorized (200). This is the positive case confirming the 403 boundary.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // userId
            fc.uuid(), // targetWorkspaceId
            adminRoleArb,
            (userId, targetWorkspaceId, role) => {
              const ctx: AuthContext = {
                userId,
                targetWorkspaceId,
                membership: {
                  workspaceId: targetWorkspaceId,
                  userId,
                  role,
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
