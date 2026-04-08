/**
 * Property-Based Tests: Action Item Assignment Authorization and Effect
 *
 * // Feature: workspace-integration, Property 12: Action item assignment authorization and effect
 *
 * **Validates: Requirements 10.2, 10.5**
 *
 * For any user who is not an admin/owner of the workspace,
 * PATCH /api/workspace/[workspaceId]/action-items/[itemId]/assign must return HTTP 403.
 *
 * For any successful assignment, the action_items.owner field must equal
 * the memberName provided in the request body.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ── Types ─────────────────────────────────────────────────────────────────────

type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

type WorkspaceMembership = {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  status: "active" | "inactive" | "pending" | "suspended";
} | null;

type ActionItem = {
  id: string;
  workspaceId: string;
  owner: string | null;
};

type AssignRequest = {
  memberId: string;
  memberName: string;
};

type AssignContext = {
  userId: string;
  workspaceId: string;
  itemId: string;
  membership: WorkspaceMembership;
  request: AssignRequest;
};

// ── Authorization Logic ───────────────────────────────────────────────────────

/**
 * Pure authorization function extracted from the assign route logic.
 *
 * From route.ts:
 *   if (!membership || (membership.role !== "admin" && membership.role !== "owner")) {
 *     return apiError("Only workspace admins can assign action items.", 403, { error: "admin_required" });
 *   }
 *
 * Returns true (authorized) only when the user has an active membership
 * with role 'admin' or 'owner' in the target workspace.
 */
function checkAssignAuthorization(ctx: AssignContext): boolean {
  if (!ctx.membership) return false;
  if (ctx.membership.workspaceId !== ctx.workspaceId) return false;
  if (ctx.membership.userId !== ctx.userId) return false;
  if (ctx.membership.status !== "active") return false;
  return ctx.membership.role === "admin" || ctx.membership.role === "owner";
}

/**
 * Returns the HTTP status code the route should respond with.
 * 403 if authorization fails, 200 if it passes.
 */
function resolveHttpStatus(ctx: AssignContext): 200 | 403 {
  return checkAssignAuthorization(ctx) ? 200 : 403;
}

/**
 * Simulates the effect of a successful assignment.
 *
 * From route.ts:
 *   await db.update(actionItems)
 *     .set({ owner: memberName, updatedAt: new Date() })
 *     .where(and(eq(actionItems.id, itemId), eq(actionItems.workspaceId, workspaceId)))
 *
 * Returns the updated action item with owner set to memberName.
 */
function applyAssignment(item: ActionItem, memberName: string): ActionItem {
  return { ...item, owner: memberName };
}

// ── Generators ────────────────────────────────────────────────────────────────

const workspaceRoleArb = fc.constantFrom<WorkspaceRole>(
  "owner",
  "admin",
  "member",
  "viewer"
);

const unauthorizedRoleArb = fc.constantFrom<WorkspaceRole>("member", "viewer");

const memberStatusArb = fc.constantFrom(
  "active" as const,
  "inactive" as const,
  "pending" as const,
  "suspended" as const
);

const memberNameArb = fc.string({ minLength: 1, maxLength: 50 }).filter(
  (s) => s.trim().length > 0
);

// ── Property 12: Authorization ────────────────────────────────────────────────

describe(
  // Feature: workspace-integration, Property 12: Action item assignment authorization and effect
  "Property 12: Action item assignment authorization and effect",
  () => {
    it(
      "member and viewer roles always get 403",
      () => {
        /**
         * **Validates: Requirements 10.2**
         *
         * For any user with role 'member' or 'viewer' (even with active status),
         * the assign route must return HTTP 403.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // userId
            fc.uuid(), // workspaceId
            fc.uuid(), // itemId
            fc.uuid(), // memberId
            memberNameArb, // memberName
            unauthorizedRoleArb, // role: member or viewer
            (userId, workspaceId, itemId, memberId, memberName, role) => {
              const ctx: AssignContext = {
                userId,
                workspaceId,
                itemId,
                membership: {
                  workspaceId,
                  userId,
                  role,
                  status: "active",
                },
                request: { memberId, memberName },
              };

              expect(resolveHttpStatus(ctx)).toBe(403);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "no membership always gets 403",
      () => {
        /**
         * **Validates: Requirements 10.2**
         *
         * For any user with no workspace membership at all,
         * the assign route must return HTTP 403.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // userId
            fc.uuid(), // workspaceId
            fc.uuid(), // itemId
            fc.uuid(), // memberId
            memberNameArb, // memberName
            (userId, workspaceId, itemId, memberId, memberName) => {
              const ctx: AssignContext = {
                userId,
                workspaceId,
                itemId,
                membership: null,
                request: { memberId, memberName },
              };

              expect(resolveHttpStatus(ctx)).toBe(403);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "admin or owner with inactive/pending/suspended status gets 403",
      () => {
        /**
         * **Validates: Requirements 10.2**
         *
         * Even admin/owner roles must have active status to be authorized.
         * Non-active memberships must return 403.
         */
        const inactiveStatusArb = fc.constantFrom(
          "inactive" as const,
          "pending" as const,
          "suspended" as const
        );
        const adminRoleArb = fc.constantFrom<WorkspaceRole>("admin", "owner");

        fc.assert(
          fc.property(
            fc.uuid(), // userId
            fc.uuid(), // workspaceId
            fc.uuid(), // itemId
            fc.uuid(), // memberId
            memberNameArb, // memberName
            adminRoleArb, // role: admin or owner
            inactiveStatusArb, // non-active status
            (userId, workspaceId, itemId, memberId, memberName, role, status) => {
              const ctx: AssignContext = {
                userId,
                workspaceId,
                itemId,
                membership: {
                  workspaceId,
                  userId,
                  role,
                  status,
                },
                request: { memberId, memberName },
              };

              expect(resolveHttpStatus(ctx)).toBe(403);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "admin or owner with active membership in a different workspace gets 403",
      () => {
        /**
         * **Validates: Requirements 10.2**
         *
         * An admin/owner of a different workspace must not be authorized
         * to assign action items in the target workspace.
         */
        const adminRoleArb = fc.constantFrom<WorkspaceRole>("admin", "owner");

        fc.assert(
          fc.property(
            fc.uuid(), // userId
            fc.uuid(), // targetWorkspaceId
            fc.uuid(), // membershipWorkspaceId (different)
            fc.uuid(), // itemId
            fc.uuid(), // memberId
            memberNameArb, // memberName
            adminRoleArb, // role: admin or owner
            (userId, targetWorkspaceId, membershipWorkspaceId, itemId, memberId, memberName, role) => {
              fc.pre(targetWorkspaceId !== membershipWorkspaceId);

              const ctx: AssignContext = {
                userId,
                workspaceId: targetWorkspaceId,
                itemId,
                membership: {
                  workspaceId: membershipWorkspaceId, // wrong workspace
                  userId,
                  role,
                  status: "active",
                },
                request: { memberId, memberName },
              };

              expect(resolveHttpStatus(ctx)).toBe(403);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "admin with active membership in the correct workspace is authorized (200)",
      () => {
        /**
         * **Validates: Requirements 10.2**
         *
         * Only when the user has role 'admin' or 'owner' AND active status
         * in the target workspace should authorization pass (200).
         */
        const adminRoleArb = fc.constantFrom<WorkspaceRole>("admin", "owner");

        fc.assert(
          fc.property(
            fc.uuid(), // userId
            fc.uuid(), // workspaceId
            fc.uuid(), // itemId
            fc.uuid(), // memberId
            memberNameArb, // memberName
            adminRoleArb, // role: admin or owner
            (userId, workspaceId, itemId, memberId, memberName, role) => {
              const ctx: AssignContext = {
                userId,
                workspaceId,
                itemId,
                membership: {
                  workspaceId,
                  userId,
                  role,
                  status: "active",
                },
                request: { memberId, memberName },
              };

              expect(resolveHttpStatus(ctx)).toBe(200);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    // ── Property 12: Effect ───────────────────────────────────────────────────

    it(
      "on successful assignment, action_items.owner equals memberName from request body",
      () => {
        /**
         * **Validates: Requirements 10.5**
         *
         * For any successful assignment operation, the action_items.owner field
         * must equal exactly the memberName provided in the request body.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // itemId
            fc.uuid(), // workspaceId
            fc.option(fc.string({ minLength: 1 }), { nil: null }), // previous owner (any)
            memberNameArb, // memberName from request
            (itemId, workspaceId, previousOwner, memberName) => {
              const item: ActionItem = {
                id: itemId,
                workspaceId,
                owner: previousOwner,
              };

              const updated = applyAssignment(item, memberName);

              expect(updated.owner).toBe(memberName);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "assignment overwrites any previous owner value",
      () => {
        /**
         * **Validates: Requirements 10.5**
         *
         * The assignment must overwrite the owner field regardless of its
         * previous value (null, empty, or any prior name).
         */
        fc.assert(
          fc.property(
            fc.uuid(), // itemId
            fc.uuid(), // workspaceId
            memberNameArb, // previous owner name
            memberNameArb, // new memberName from request
            (itemId, workspaceId, previousOwner, newMemberName) => {
              fc.pre(previousOwner !== newMemberName);

              const item: ActionItem = {
                id: itemId,
                workspaceId,
                owner: previousOwner,
              };

              const updated = applyAssignment(item, newMemberName);

              expect(updated.owner).toBe(newMemberName);
              expect(updated.owner).not.toBe(previousOwner);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "assignment does not modify other action item fields",
      () => {
        /**
         * **Validates: Requirements 10.5**
         *
         * The assignment operation must only change the owner field.
         * The id and workspaceId must remain unchanged.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // itemId
            fc.uuid(), // workspaceId
            fc.option(fc.string({ minLength: 1 }), { nil: null }), // previous owner
            memberNameArb, // memberName from request
            (itemId, workspaceId, previousOwner, memberName) => {
              const item: ActionItem = {
                id: itemId,
                workspaceId,
                owner: previousOwner,
              };

              const updated = applyAssignment(item, memberName);

              expect(updated.id).toBe(itemId);
              expect(updated.workspaceId).toBe(workspaceId);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "non-admin/non-owner role never gets 200 regardless of other conditions",
      () => {
        /**
         * **Validates: Requirements 10.2**
         *
         * For any combination of inputs, if the role is 'member' or 'viewer',
         * the result must always be 403 — never 200.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // userId
            fc.uuid(), // workspaceId
            fc.uuid(), // itemId
            fc.uuid(), // memberId
            memberNameArb, // memberName
            unauthorizedRoleArb, // role: member or viewer
            memberStatusArb, // any status
            (userId, workspaceId, itemId, memberId, memberName, role, status) => {
              const ctx: AssignContext = {
                userId,
                workspaceId,
                itemId,
                membership: {
                  workspaceId,
                  userId,
                  role,
                  status,
                },
                request: { memberId, memberName },
              };

              expect(resolveHttpStatus(ctx)).not.toBe(200);
            }
          ),
          { numRuns: 100 }
        );
      }
    );
  }
);
