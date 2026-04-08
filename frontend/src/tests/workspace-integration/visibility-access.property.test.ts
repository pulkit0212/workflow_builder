/**
 * Property-Based Tests: Visibility Access Control
 *
 * Feature: workspace-integration, Property 9: Private meeting access control
 * Feature: workspace-integration, Property 10: Workspace and shared meeting access
 *
 * **Validates: Requirements 4.2, 4.3, 4.4, 4.7**
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ── Types ─────────────────────────────────────────────────────────────────────

type Visibility = "private" | "workspace" | "shared";
type Role = "owner" | "admin" | "member" | "viewer";
type MemberStatus = "active" | "pending" | "removed";

type MeetingSession = {
  id: string;
  workspaceId: string;
  userId: string; // owner
  visibility: Visibility;
  sharedWithUserIds: string[];
};

type WorkspaceMembership = {
  userId: string;
  workspaceId: string;
  role: Role;
  status: MemberStatus;
};

// ── Access Control Logic ──────────────────────────────────────────────────────

/**
 * Pure implementation of the visibility access matrix.
 *
 * Returns true if `requesterId` is allowed to access `session`, given their
 * membership in the session's workspace.
 *
 * Mirrors the logic in getMeetingSessionByIdForUser:
 *   - private  → owner OR active member with role admin/owner
 *   - workspace → any active workspace member
 *   - shared   → owner OR admin/owner member OR active member (member role)
 *                OR viewer if in sharedWithUserIds
 */
function canAccess(
  session: MeetingSession,
  requesterId: string,
  membership: WorkspaceMembership | null
): boolean {
  // Owner always has access
  if (session.userId === requesterId) return true;

  const role = membership?.role ?? null;
  const isActive = membership?.status === "active";

  // Non-members (or inactive members) have no access
  if (!isActive || role === null) return false;

  const isAdminOrOwner = role === "admin" || role === "owner";
  const isMember = role === "member";

  switch (session.visibility) {
    case "private":
      // Only owner (handled above) and admin/owner members
      return isAdminOrOwner;

    case "workspace":
      // Any active workspace member
      return true;

    case "shared": {
      // Admin/owner always have access
      if (isAdminOrOwner) return true;
      // Members (member role) have access as workspace members
      if (isMember) return true;
      // Viewers only if explicitly in sharedWithUserIds
      return session.sharedWithUserIds.includes(requesterId);
    }
  }
}

// ── Generators ────────────────────────────────────────────────────────────────

const visibilityArb = fc.constantFrom<Visibility>("private", "workspace", "shared");
const roleArb = fc.constantFrom<Role>("owner", "admin", "member", "viewer");
const activeRoleArb = fc.constantFrom<Role>("owner", "admin", "member", "viewer");

const sessionArb = (workspaceId: string, ownerId: string, visibility: Visibility) =>
  fc.record({
    id: fc.uuid(),
    workspaceId: fc.constant(workspaceId),
    userId: fc.constant(ownerId),
    visibility: fc.constant(visibility),
    sharedWithUserIds: fc.array(fc.uuid(), { minLength: 0, maxLength: 5 }),
  });

const activeMembershipArb = (userId: string, workspaceId: string, role: Role) =>
  fc.constant<WorkspaceMembership>({
    userId,
    workspaceId,
    role,
    status: "active",
  });

// ── Property 9 ────────────────────────────────────────────────────────────────

describe(
  // Feature: workspace-integration, Property 9: Private meeting access control
  "Property 9: Private meeting access control",
  () => {
    it(
      "owner can always access their own private meeting",
      () => {
        /**
         * **Validates: Requirements 4.2, 4.7**
         *
         * The session owner must always be able to access a private meeting,
         * regardless of their workspace role.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // workspaceId
            fc.uuid(), // ownerId
            roleArb,   // owner's role in the workspace
            (workspaceId, ownerId, role) => {
              const session: MeetingSession = {
                id: fc.sample(fc.uuid(), 1)[0],
                workspaceId,
                userId: ownerId,
                visibility: "private",
                sharedWithUserIds: [],
              };

              const membership: WorkspaceMembership = {
                userId: ownerId,
                workspaceId,
                role,
                status: "active",
              };

              expect(canAccess(session, ownerId, membership)).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "admin and owner members can access private meetings they do not own",
      () => {
        /**
         * **Validates: Requirements 4.2, 4.7**
         *
         * Workspace members with role 'admin' or 'owner' must be able to access
         * private meetings created by other users.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // workspaceId
            fc.uuid(), // sessionOwnerId
            fc.uuid(), // requesterId (different from owner)
            fc.constantFrom<Role>("admin", "owner"),
            (workspaceId, sessionOwnerId, requesterId, adminRole) => {
              fc.pre(sessionOwnerId !== requesterId);

              const session: MeetingSession = {
                id: fc.sample(fc.uuid(), 1)[0],
                workspaceId,
                userId: sessionOwnerId,
                visibility: "private",
                sharedWithUserIds: [],
              };

              const membership: WorkspaceMembership = {
                userId: requesterId,
                workspaceId,
                role: adminRole,
                status: "active",
              };

              expect(canAccess(session, requesterId, membership)).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "member and viewer roles cannot access private meetings they do not own",
      () => {
        /**
         * **Validates: Requirements 4.2, 4.7**
         *
         * For any meeting_session with visibility = 'private', members and viewers
         * who are not the owner must receive access denied (HTTP 403).
         */
        fc.assert(
          fc.property(
            fc.uuid(), // workspaceId
            fc.uuid(), // sessionOwnerId
            fc.uuid(), // requesterId (different from owner)
            fc.constantFrom<Role>("member", "viewer"),
            (workspaceId, sessionOwnerId, requesterId, restrictedRole) => {
              fc.pre(sessionOwnerId !== requesterId);

              const session: MeetingSession = {
                id: fc.sample(fc.uuid(), 1)[0],
                workspaceId,
                userId: sessionOwnerId,
                visibility: "private",
                sharedWithUserIds: [],
              };

              const membership: WorkspaceMembership = {
                userId: requesterId,
                workspaceId,
                role: restrictedRole,
                status: "active",
              };

              expect(canAccess(session, requesterId, membership)).toBe(false);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "non-members cannot access private meetings",
      () => {
        /**
         * **Validates: Requirements 4.2, 4.7**
         *
         * Users with no active membership in the workspace must be denied access
         * to private meetings.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // workspaceId
            fc.uuid(), // sessionOwnerId
            fc.uuid(), // requesterId (not a member)
            (workspaceId, sessionOwnerId, requesterId) => {
              fc.pre(sessionOwnerId !== requesterId);

              const session: MeetingSession = {
                id: fc.sample(fc.uuid(), 1)[0],
                workspaceId,
                userId: sessionOwnerId,
                visibility: "private",
                sharedWithUserIds: [],
              };

              // No membership
              expect(canAccess(session, requesterId, null)).toBe(false);
            }
          ),
          { numRuns: 100 }
        );
      }
    );
  }
);

// ── Property 10 ───────────────────────────────────────────────────────────────

describe(
  // Feature: workspace-integration, Property 10: Workspace and shared meeting access
  "Property 10: Workspace and shared meeting access",
  () => {
    it(
      "any active workspace member can access a workspace-visibility meeting",
      () => {
        /**
         * **Validates: Requirements 4.3**
         *
         * For any meeting_session with visibility = 'workspace', any active member
         * of the session's workspace must be able to retrieve it.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // workspaceId
            fc.uuid(), // sessionOwnerId
            fc.uuid(), // requesterId
            activeRoleArb,
            (workspaceId, sessionOwnerId, requesterId, role) => {
              const session: MeetingSession = {
                id: fc.sample(fc.uuid(), 1)[0],
                workspaceId,
                userId: sessionOwnerId,
                visibility: "workspace",
                sharedWithUserIds: [],
              };

              const membership: WorkspaceMembership = {
                userId: requesterId,
                workspaceId,
                role,
                status: "active",
              };

              expect(canAccess(session, requesterId, membership)).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "non-members cannot access workspace-visibility meetings",
      () => {
        /**
         * **Validates: Requirements 4.3**
         *
         * Users with no active membership must be denied access to workspace meetings.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // workspaceId
            fc.uuid(), // sessionOwnerId
            fc.uuid(), // requesterId (not a member)
            (workspaceId, sessionOwnerId, requesterId) => {
              fc.pre(sessionOwnerId !== requesterId);

              const session: MeetingSession = {
                id: fc.sample(fc.uuid(), 1)[0],
                workspaceId,
                userId: sessionOwnerId,
                visibility: "workspace",
                sharedWithUserIds: [],
              };

              expect(canAccess(session, requesterId, null)).toBe(false);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "shared meeting: owner, admin/owner members, and active members can access",
      () => {
        /**
         * **Validates: Requirements 4.4**
         *
         * For any session with visibility = 'shared', any active workspace member
         * (owner, admin, member) must be able to retrieve it.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // workspaceId
            fc.uuid(), // sessionOwnerId
            fc.uuid(), // requesterId
            fc.constantFrom<Role>("owner", "admin", "member"),
            (workspaceId, sessionOwnerId, requesterId, role) => {
              const session: MeetingSession = {
                id: fc.sample(fc.uuid(), 1)[0],
                workspaceId,
                userId: sessionOwnerId,
                visibility: "shared",
                sharedWithUserIds: [],
              };

              const membership: WorkspaceMembership = {
                userId: requesterId,
                workspaceId,
                role,
                status: "active",
              };

              expect(canAccess(session, requesterId, membership)).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "shared meeting: viewer in sharedWithUserIds can access",
      () => {
        /**
         * **Validates: Requirements 4.4**
         *
         * For any session with visibility = 'shared', a viewer whose userId is in
         * sharedWithUserIds must be able to retrieve it.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // workspaceId
            fc.uuid(), // sessionOwnerId
            fc.uuid(), // viewerId
            fc.array(fc.uuid(), { minLength: 0, maxLength: 4 }),
            (workspaceId, sessionOwnerId, viewerId, otherSharedIds) => {
              fc.pre(sessionOwnerId !== viewerId);

              const sharedWithUserIds = [...otherSharedIds, viewerId];

              const session: MeetingSession = {
                id: fc.sample(fc.uuid(), 1)[0],
                workspaceId,
                userId: sessionOwnerId,
                visibility: "shared",
                sharedWithUserIds,
              };

              const membership: WorkspaceMembership = {
                userId: viewerId,
                workspaceId,
                role: "viewer",
                status: "active",
              };

              expect(canAccess(session, viewerId, membership)).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "shared meeting: viewer NOT in sharedWithUserIds cannot access",
      () => {
        /**
         * **Validates: Requirements 4.4**
         *
         * For any session with visibility = 'shared', a viewer whose userId is NOT
         * in sharedWithUserIds must be denied access.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // workspaceId
            fc.uuid(), // sessionOwnerId
            fc.uuid(), // viewerId (not in sharedWithUserIds)
            fc.array(fc.uuid(), { minLength: 0, maxLength: 4 }),
            (workspaceId, sessionOwnerId, viewerId, sharedWithUserIds) => {
              fc.pre(sessionOwnerId !== viewerId);
              fc.pre(!sharedWithUserIds.includes(viewerId));

              const session: MeetingSession = {
                id: fc.sample(fc.uuid(), 1)[0],
                workspaceId,
                userId: sessionOwnerId,
                visibility: "shared",
                sharedWithUserIds,
              };

              const membership: WorkspaceMembership = {
                userId: viewerId,
                workspaceId,
                role: "viewer",
                status: "active",
              };

              expect(canAccess(session, viewerId, membership)).toBe(false);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "shared meeting: non-member cannot access even if in sharedWithUserIds",
      () => {
        /**
         * **Validates: Requirements 4.4**
         *
         * A user with no active workspace membership cannot access a shared meeting,
         * even if their userId appears in sharedWithUserIds (they must be an active member).
         */
        fc.assert(
          fc.property(
            fc.uuid(), // workspaceId
            fc.uuid(), // sessionOwnerId
            fc.uuid(), // requesterId (not a member)
            fc.array(fc.uuid(), { minLength: 0, maxLength: 4 }),
            (workspaceId, sessionOwnerId, requesterId, otherSharedIds) => {
              fc.pre(sessionOwnerId !== requesterId);

              const sharedWithUserIds = [...otherSharedIds, requesterId];

              const session: MeetingSession = {
                id: fc.sample(fc.uuid(), 1)[0],
                workspaceId,
                userId: sessionOwnerId,
                visibility: "shared",
                sharedWithUserIds,
              };

              // No membership at all
              expect(canAccess(session, requesterId, null)).toBe(false);
            }
          ),
          { numRuns: 100 }
        );
      }
    );
  }
);
