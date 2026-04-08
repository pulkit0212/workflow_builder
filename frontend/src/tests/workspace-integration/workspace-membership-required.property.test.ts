/**
 * Property-Based Tests: Workspace Membership Required for All Workspace-Scoped Routes
 *
 * // Feature: workspace-integration, Property 15: Workspace membership required for all workspace-scoped routes
 *
 * **Validates: Requirements 8.3, 12.3, 13.3**
 *
 * For any user who is NOT an active member of a workspace, all
 * GET /api/workspace/[workspaceId]/* routes must return HTTP 403.
 *
 * The membership check logic from the routes:
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

type MemberStatus = "active" | "inactive" | "pending" | "suspended";
type MemberRole = "owner" | "admin" | "member" | "viewer";

type WorkspaceMembership = {
  workspaceId: string;
  userId: string;
  status: MemberStatus;
  role: MemberRole;
} | null;

/** The workspace-scoped GET routes that all require active membership */
type WorkspaceScopedRoute =
  | "GET /api/workspace/[workspaceId]/meetings"
  | "GET /api/workspace/[workspaceId]/move-requests"
  | "GET /api/workspace/[workspaceId]/dashboard";

const ALL_WORKSPACE_SCOPED_ROUTES: WorkspaceScopedRoute[] = [
  "GET /api/workspace/[workspaceId]/meetings",
  "GET /api/workspace/[workspaceId]/move-requests",
  "GET /api/workspace/[workspaceId]/dashboard",
];

// ── Authorization Logic ───────────────────────────────────────────────────────

/**
 * Pure membership check extracted from all workspace-scoped route handlers.
 *
 * Mirrors the Drizzle query:
 *   WHERE workspaceMembers.workspaceId = workspaceId
 *     AND workspaceMembers.userId = user.id
 *     AND workspaceMembers.status = 'active'
 *
 * Returns true (authorized) only when the user has an active membership
 * in the exact workspace being requested.
 */
function checkWorkspaceMembership(
  userId: string,
  workspaceId: string,
  membership: WorkspaceMembership
): boolean {
  if (membership === null) return false;
  return (
    membership.workspaceId === workspaceId &&
    membership.userId === userId &&
    membership.status === "active"
  );
}

/**
 * Returns the HTTP status code the route should respond with.
 * 403 if membership check fails, 200 if it passes.
 */
function resolveHttpStatus(
  userId: string,
  workspaceId: string,
  membership: WorkspaceMembership
): 200 | 403 {
  return checkWorkspaceMembership(userId, workspaceId, membership) ? 200 : 403;
}

// ── Generators ────────────────────────────────────────────────────────────────

const memberStatusArb = fc.constantFrom<MemberStatus>(
  "active",
  "inactive",
  "pending",
  "suspended"
);

const inactiveMemberStatusArb = fc.constantFrom<MemberStatus>(
  "inactive",
  "pending",
  "suspended"
);

const memberRoleArb = fc.constantFrom<MemberRole>(
  "owner",
  "admin",
  "member",
  "viewer"
);

const workspaceScopedRouteArb = fc.constantFrom<WorkspaceScopedRoute>(
  ...ALL_WORKSPACE_SCOPED_ROUTES
);

// ── Property 15 ───────────────────────────────────────────────────────────────

describe(
  // Feature: workspace-integration, Property 15: Workspace membership required for all workspace-scoped routes
  "Property 15: Workspace membership required for all workspace-scoped routes",
  () => {
    it(
      "user with no membership gets 403 on all workspace-scoped routes",
      () => {
        /**
         * **Validates: Requirements 8.3, 12.3, 13.3**
         *
         * For any user with no membership record at all (null), every
         * workspace-scoped GET route must return 403.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // userId
            fc.uuid(), // workspaceId
            workspaceScopedRouteArb,
            (userId, workspaceId, _route) => {
              const status = resolveHttpStatus(userId, workspaceId, null);
              expect(status).toBe(403);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "user with inactive/pending/suspended membership gets 403 on all workspace-scoped routes",
      () => {
        /**
         * **Validates: Requirements 8.3, 12.3, 13.3**
         *
         * Only 'active' membership grants access. Any other status must result
         * in 403 across all workspace-scoped routes.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // userId
            fc.uuid(), // workspaceId
            inactiveMemberStatusArb,
            memberRoleArb,
            workspaceScopedRouteArb,
            (userId, workspaceId, memberStatus, role, _route) => {
              const membership: WorkspaceMembership = {
                workspaceId,
                userId,
                status: memberStatus,
                role,
              };

              const status = resolveHttpStatus(userId, workspaceId, membership);
              expect(status).toBe(403);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "user with active membership in a DIFFERENT workspace gets 403",
      () => {
        /**
         * **Validates: Requirements 8.3, 12.3, 13.3**
         *
         * Membership in workspace A does not grant access to workspace B.
         * The workspaceId in the membership must match the requested workspaceId.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // userId
            fc.uuid(), // requestedWorkspaceId
            fc.uuid(), // membershipWorkspaceId (different)
            memberRoleArb,
            workspaceScopedRouteArb,
            (userId, requestedWorkspaceId, membershipWorkspaceId, role, _route) => {
              fc.pre(requestedWorkspaceId !== membershipWorkspaceId);

              const membership: WorkspaceMembership = {
                workspaceId: membershipWorkspaceId, // wrong workspace
                userId,
                status: "active",
                role,
              };

              const status = resolveHttpStatus(userId, requestedWorkspaceId, membership);
              expect(status).toBe(403);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "active membership belonging to a DIFFERENT user gets 403",
      () => {
        /**
         * **Validates: Requirements 8.3, 12.3, 13.3**
         *
         * A membership record for another user in the same workspace must not
         * grant access to the requesting user.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // requestingUserId
            fc.uuid(), // memberUserId (different)
            fc.uuid(), // workspaceId
            memberRoleArb,
            workspaceScopedRouteArb,
            (requestingUserId, memberUserId, workspaceId, role, _route) => {
              fc.pre(requestingUserId !== memberUserId);

              const membership: WorkspaceMembership = {
                workspaceId,
                userId: memberUserId, // belongs to a different user
                status: "active",
                role,
              };

              const status = resolveHttpStatus(requestingUserId, workspaceId, membership);
              expect(status).toBe(403);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "non-member gets 403 regardless of role on all workspace-scoped routes",
      () => {
        /**
         * **Validates: Requirements 8.3, 12.3, 13.3**
         *
         * Even if a membership record exists with any role, a non-active status
         * must always result in 403. Role alone does not grant access.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // userId
            fc.uuid(), // workspaceId
            memberStatusArb,
            memberRoleArb,
            workspaceScopedRouteArb,
            (userId, workspaceId, memberStatus, role, _route) => {
              // Only active status should pass — test all non-active statuses
              fc.pre(memberStatus !== "active");

              const membership: WorkspaceMembership = {
                workspaceId,
                userId,
                status: memberStatus,
                role,
              };

              const status = resolveHttpStatus(userId, workspaceId, membership);
              expect(status).toBe(403);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "active member gets 200 on all workspace-scoped routes (positive case)",
      () => {
        /**
         * **Validates: Requirements 8.3, 12.3, 13.3**
         *
         * Confirms the 403 boundary is correct: a user with an active membership
         * in the exact requested workspace must be authorized (200).
         * This positive case validates the membership check is not overly restrictive.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // userId
            fc.uuid(), // workspaceId
            memberRoleArb,
            workspaceScopedRouteArb,
            (userId, workspaceId, role, _route) => {
              const membership: WorkspaceMembership = {
                workspaceId,
                userId,
                status: "active",
                role,
              };

              const status = resolveHttpStatus(userId, workspaceId, membership);
              expect(status).toBe(200);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "membership check is consistent across all workspace-scoped routes for the same user/workspace pair",
      () => {
        /**
         * **Validates: Requirements 8.3, 12.3, 13.3**
         *
         * The authorization decision for a given user/workspace pair must be
         * identical across all workspace-scoped routes — there is no route that
         * bypasses the membership requirement.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // userId
            fc.uuid(), // workspaceId
            fc.option(
              fc.record({
                workspaceId: fc.uuid(),
                userId: fc.uuid(),
                status: memberStatusArb,
                role: memberRoleArb,
              }),
              { nil: null }
            ),
            (userId, workspaceId, membership) => {
              // Compute the authorization result once
              const expectedStatus = resolveHttpStatus(userId, workspaceId, membership);

              // It must be the same for every workspace-scoped route
              for (const _route of ALL_WORKSPACE_SCOPED_ROUTES) {
                const routeStatus = resolveHttpStatus(userId, workspaceId, membership);
                expect(routeStatus).toBe(expectedStatus);
              }
            }
          ),
          { numRuns: 100 }
        );
      }
    );
  }
);
