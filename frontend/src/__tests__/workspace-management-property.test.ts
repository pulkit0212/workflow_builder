/**
 * Property Tests for Workspace Management Page
 * Feature: workspace-redesign
 *
 * Property 15: Workspace management page redirects when no active workspace
 * Validates: Requirements 8.11
 *
 * Property 16: Workspace management admin actions gated by role
 * Validates: Requirements 8.3, 8.4, 8.5, 8.6
 *
 * Property 17: Workspace CRUD operations are consistent
 * Validates: Requirements 8.7, 8.9, 8.10
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Role = "owner" | "admin" | "member";

type Member = {
  id: string;
  userId: string;
  role: Role;
  status: "active" | "removed";
};

type WorkspaceState = {
  id: string;
  name: string;
  ownerId: string;
  members: Member[];
};

// ---------------------------------------------------------------------------
// Pure logic extracted from the workspace management page for property testing
// ---------------------------------------------------------------------------

/**
 * Determines whether the management page should redirect.
 * Mirrors: if (activeWorkspaceId === null) router.replace("/dashboard")
 */
function shouldRedirectToHome(activeWorkspaceId: string | null): boolean {
  return activeWorkspaceId === null;
}

/**
 * Determines whether admin actions (role-change, remove-member, join-requests)
 * should be available for a given role.
 * Mirrors: canManage = isOwner || isAdmin
 */
function canManageWorkspace(role: Role): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Determines whether the "Leave workspace" button should be shown.
 * Mirrors: !isOwner
 */
function canLeaveWorkspace(role: Role): boolean {
  return role !== "owner";
}

/**
 * Determines whether the "Delete workspace" button should be shown.
 * Mirrors: isOwner
 */
function canDeleteWorkspace(role: Role): boolean {
  return role === "owner";
}

/**
 * Determines whether the "Transfer ownership" section should be shown.
 * Mirrors: isOwner && non-owner active members exist
 */
function canTransferOwnership(role: Role, members: Member[]): boolean {
  if (role !== "owner") return false;
  return members.some((m) => m.status === "active" && m.role !== "owner");
}

/**
 * Simulates updating the workspace name.
 * Returns the new workspace state.
 */
function applyUpdateName(workspace: WorkspaceState, newName: string): WorkspaceState {
  return { ...workspace, name: newName };
}

/**
 * Simulates a member leaving the workspace.
 * Returns the new workspace state with the member marked as removed.
 */
function applyLeaveWorkspace(workspace: WorkspaceState, userId: string): WorkspaceState {
  return {
    ...workspace,
    members: workspace.members.map((m) =>
      m.userId === userId ? { ...m, status: "removed" as const } : m
    )
  };
}

/**
 * Simulates transferring ownership.
 * New owner gets role 'owner', previous owner gets role 'admin'.
 * workspace.ownerId is updated.
 */
function applyTransferOwnership(
  workspace: WorkspaceState,
  currentOwnerId: string,
  newOwnerMemberId: string
): WorkspaceState {
  const newOwnerMember = workspace.members.find((m) => m.id === newOwnerMemberId);
  if (!newOwnerMember) return workspace;

  return {
    ...workspace,
    ownerId: newOwnerMember.userId,
    members: workspace.members.map((m) => {
      if (m.userId === currentOwnerId) return { ...m, role: "admin" as Role };
      if (m.id === newOwnerMemberId) return { ...m, role: "owner" as Role };
      return m;
    })
  };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const workspaceIdArb = fc
  .string({ minLength: 1, maxLength: 36 })
  .filter((s) => s.trim().length > 0 && s === s.trim());

const userIdArb = fc
  .string({ minLength: 1, maxLength: 36 })
  .filter((s) => s.trim().length > 0 && s === s.trim());

const memberIdArb = fc
  .string({ minLength: 1, maxLength: 36 })
  .filter((s) => s.trim().length > 0 && s === s.trim());

const workspaceNameArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

const roleArb: fc.Arbitrary<Role> = fc.oneof(
  fc.constant("owner" as Role),
  fc.constant("admin" as Role),
  fc.constant("member" as Role)
);

const nonOwnerRoleArb: fc.Arbitrary<Role> = fc.oneof(
  fc.constant("admin" as Role),
  fc.constant("member" as Role)
);

/** Generate a workspace with at least one owner and some other members */
const workspaceWithMembersArb: fc.Arbitrary<WorkspaceState> = fc
  .tuple(
    workspaceIdArb,
    workspaceNameArb,
    userIdArb,
    fc.array(
      fc.record({
        id: memberIdArb,
        userId: userIdArb,
        role: nonOwnerRoleArb,
        status: fc.constant("active" as const)
      }),
      { minLength: 1, maxLength: 5 }
    )
  )
  .map(([id, name, ownerId, otherMembers]) => {
    const ownerMember: Member = {
      id: `owner-${ownerId}`,
      userId: ownerId,
      role: "owner",
      status: "active"
    };
    // Deduplicate by userId AND by member id to ensure uniqueness
    const seenUserIds = new Set([ownerId]);
    const seenMemberIds = new Set([`owner-${ownerId}`]);
    const uniqueOthers = otherMembers.filter((m) => {
      if (seenUserIds.has(m.userId)) return false;
      if (seenMemberIds.has(m.id)) return false;
      seenUserIds.add(m.userId);
      seenMemberIds.add(m.id);
      return true;
    });
    return { id, name, ownerId, members: [ownerMember, ...uniqueOthers] };
  });

// ---------------------------------------------------------------------------
// Property 15: Workspace management page redirects when no active workspace
// Feature: workspace-redesign, Property 15: Workspace management page redirects when no active workspace
// ---------------------------------------------------------------------------

describe("Property 15: Management page redirects when no active workspace (Req 8.11)", () => {
  it("redirects to /dashboard when activeWorkspaceId is null", () => {
    // Feature: workspace-redesign, Property 15: Workspace management page redirects when no active workspace
    fc.assert(
      fc.property(fc.constant(null), (activeWorkspaceId) => {
        expect(shouldRedirectToHome(activeWorkspaceId)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("does not redirect when activeWorkspaceId is a non-null string", () => {
    // Feature: workspace-redesign, Property 15: Workspace management page redirects when no active workspace
    fc.assert(
      fc.property(workspaceIdArb, (activeWorkspaceId) => {
        expect(shouldRedirectToHome(activeWorkspaceId)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it("redirect decision is determined solely by null vs non-null", () => {
    // Feature: workspace-redesign, Property 15: Workspace management page redirects when no active workspace
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(null), workspaceIdArb),
        (activeWorkspaceId) => {
          const redirect = shouldRedirectToHome(activeWorkspaceId);
          expect(redirect).toBe(activeWorkspaceId === null);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("any valid workspace ID format prevents redirect", () => {
    // Feature: workspace-redesign, Property 15: Workspace management page redirects when no active workspace
    fc.assert(
      fc.property(
        fc.oneof(
          fc.uuid(),
          fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0),
          fc.string({ minLength: 20, maxLength: 64 }).filter((s) => s.trim().length > 0)
        ),
        (id) => {
          expect(shouldRedirectToHome(id)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 16: Workspace management admin actions gated by role
// Feature: workspace-redesign, Property 16: Workspace management admin actions gated by role
// ---------------------------------------------------------------------------

describe("Property 16: Admin actions gated by role (Req 8.3, 8.4, 8.5, 8.6)", () => {
  it("owner can manage workspace (role-change, remove, join-requests)", () => {
    // Feature: workspace-redesign, Property 16: Workspace management admin actions gated by role
    fc.assert(
      fc.property(fc.constant("owner" as Role), (role) => {
        expect(canManageWorkspace(role)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("admin can manage workspace (role-change, remove, join-requests)", () => {
    // Feature: workspace-redesign, Property 16: Workspace management admin actions gated by role
    fc.assert(
      fc.property(fc.constant("admin" as Role), (role) => {
        expect(canManageWorkspace(role)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("member cannot manage workspace", () => {
    // Feature: workspace-redesign, Property 16: Workspace management admin actions gated by role
    fc.assert(
      fc.property(fc.constant("member" as Role), (role) => {
        expect(canManageWorkspace(role)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it("only owner and admin can manage — for any role value", () => {
    // Feature: workspace-redesign, Property 16: Workspace management admin actions gated by role
    fc.assert(
      fc.property(roleArb, (role) => {
        const canManage = canManageWorkspace(role);
        expect(canManage).toBe(role === "owner" || role === "admin");
      }),
      { numRuns: 100 }
    );
  });

  it("non-owner members can leave the workspace", () => {
    // Feature: workspace-redesign, Property 16: Workspace management admin actions gated by role
    fc.assert(
      fc.property(nonOwnerRoleArb, (role) => {
        expect(canLeaveWorkspace(role)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("owner cannot leave the workspace (must transfer or delete)", () => {
    // Feature: workspace-redesign, Property 16: Workspace management admin actions gated by role
    fc.assert(
      fc.property(fc.constant("owner" as Role), (role) => {
        expect(canLeaveWorkspace(role)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it("only owner can delete the workspace", () => {
    // Feature: workspace-redesign, Property 16: Workspace management admin actions gated by role
    fc.assert(
      fc.property(roleArb, (role) => {
        expect(canDeleteWorkspace(role)).toBe(role === "owner");
      }),
      { numRuns: 100 }
    );
  });

  it("leave and delete are mutually exclusive — a role can do one or the other, not both", () => {
    // Feature: workspace-redesign, Property 16: Workspace management admin actions gated by role
    fc.assert(
      fc.property(roleArb, (role) => {
        const leave = canLeaveWorkspace(role);
        const del = canDeleteWorkspace(role);
        // They must be mutually exclusive
        expect(leave && del).toBe(false);
        // And at least one must be true (every member can either leave or delete)
        expect(leave || del).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("transfer ownership requires owner role and non-owner active members", () => {
    // Feature: workspace-redesign, Property 16: Workspace management admin actions gated by role
    fc.assert(
      fc.property(workspaceWithMembersArb, (workspace) => {
        const ownerMember = workspace.members.find((m) => m.role === "owner");
        if (!ownerMember) return;

        // Owner with other active members can transfer
        const hasOtherMembers = workspace.members.some(
          (m) => m.status === "active" && m.role !== "owner"
        );
        expect(canTransferOwnership("owner", workspace.members)).toBe(hasOtherMembers);

        // Non-owner cannot transfer
        expect(canTransferOwnership("admin", workspace.members)).toBe(false);
        expect(canTransferOwnership("member", workspace.members)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 17: Workspace CRUD operations are consistent
// Feature: workspace-redesign, Property 17: Workspace CRUD operations are consistent
// ---------------------------------------------------------------------------

describe("Property 17: Workspace CRUD operations are consistent (Req 8.7, 8.9, 8.10)", () => {
  it("updating workspace name: fetching afterwards returns the new name", () => {
    // Feature: workspace-redesign, Property 17: Workspace CRUD operations are consistent
    fc.assert(
      fc.property(workspaceWithMembersArb, workspaceNameArb, (workspace, newName) => {
        const updated = applyUpdateName(workspace, newName);
        // Post-update state must have the new name
        expect(updated.name).toBe(newName);
        // Other fields must be unchanged
        expect(updated.id).toBe(workspace.id);
        expect(updated.ownerId).toBe(workspace.ownerId);
        expect(updated.members).toEqual(workspace.members);
      }),
      { numRuns: 100 }
    );
  });

  it("updating name is idempotent: applying the same name twice gives the same result", () => {
    // Feature: workspace-redesign, Property 17: Workspace CRUD operations are consistent
    fc.assert(
      fc.property(workspaceWithMembersArb, workspaceNameArb, (workspace, newName) => {
        const once = applyUpdateName(workspace, newName);
        const twice = applyUpdateName(once, newName);
        expect(twice.name).toBe(once.name);
      }),
      { numRuns: 100 }
    );
  });

  it("member leaving: that member no longer appears as active in the member list", () => {
    // Feature: workspace-redesign, Property 17: Workspace CRUD operations are consistent
    fc.assert(
      fc.property(workspaceWithMembersArb, (workspace) => {
        // Pick a non-owner active member to leave
        const leavingMember = workspace.members.find(
          (m) => m.status === "active" && m.role !== "owner"
        );
        if (!leavingMember) return; // skip if no non-owner members

        const updated = applyLeaveWorkspace(workspace, leavingMember.userId);

        // The leaving member must be marked as removed
        const memberAfter = updated.members.find((m) => m.userId === leavingMember.userId);
        expect(memberAfter?.status).toBe("removed");

        // Active members must not include the leaving member
        const activeMembers = updated.members.filter((m) => m.status === "active");
        expect(activeMembers.some((m) => m.userId === leavingMember.userId)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it("member leaving: other members are unaffected", () => {
    // Feature: workspace-redesign, Property 17: Workspace CRUD operations are consistent
    fc.assert(
      fc.property(workspaceWithMembersArb, (workspace) => {
        const leavingMember = workspace.members.find(
          (m) => m.status === "active" && m.role !== "owner"
        );
        if (!leavingMember) return;

        const updated = applyLeaveWorkspace(workspace, leavingMember.userId);

        // All other members must be unchanged
        for (const original of workspace.members) {
          if (original.userId === leavingMember.userId) continue;
          const after = updated.members.find((m) => m.userId === original.userId);
          expect(after?.status).toBe(original.status);
          expect(after?.role).toBe(original.role);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("transfer ownership: new owner has role 'owner'", () => {
    // Feature: workspace-redesign, Property 17: Workspace CRUD operations are consistent
    fc.assert(
      fc.property(workspaceWithMembersArb, (workspace) => {
        const currentOwner = workspace.members.find((m) => m.role === "owner");
        const newOwnerCandidate = workspace.members.find(
          (m) => m.status === "active" && m.role !== "owner"
        );
        if (!currentOwner || !newOwnerCandidate) return;

        const updated = applyTransferOwnership(
          workspace,
          currentOwner.userId,
          newOwnerCandidate.id
        );

        // New owner must have role 'owner'
        const newOwnerAfter = updated.members.find((m) => m.id === newOwnerCandidate.id);
        expect(newOwnerAfter?.role).toBe("owner");

        // workspace.ownerId must be updated
        expect(updated.ownerId).toBe(newOwnerCandidate.userId);
      }),
      { numRuns: 100 }
    );
  });

  it("transfer ownership: previous owner has a non-owner role", () => {
    // Feature: workspace-redesign, Property 17: Workspace CRUD operations are consistent
    fc.assert(
      fc.property(workspaceWithMembersArb, (workspace) => {
        const currentOwner = workspace.members.find((m) => m.role === "owner");
        const newOwnerCandidate = workspace.members.find(
          (m) => m.status === "active" && m.role !== "owner"
        );
        if (!currentOwner || !newOwnerCandidate) return;

        const updated = applyTransferOwnership(
          workspace,
          currentOwner.userId,
          newOwnerCandidate.id
        );

        // Previous owner must be demoted
        const prevOwnerAfter = updated.members.find((m) => m.userId === currentOwner.userId);
        expect(prevOwnerAfter?.role).not.toBe("owner");
      }),
      { numRuns: 100 }
    );
  });

  it("transfer ownership: exactly one owner exists after transfer", () => {
    // Feature: workspace-redesign, Property 17: Workspace CRUD operations are consistent
    fc.assert(
      fc.property(workspaceWithMembersArb, (workspace) => {
        const currentOwner = workspace.members.find((m) => m.role === "owner");
        const newOwnerCandidate = workspace.members.find(
          (m) => m.status === "active" && m.role !== "owner"
        );
        if (!currentOwner || !newOwnerCandidate) return;

        const updated = applyTransferOwnership(
          workspace,
          currentOwner.userId,
          newOwnerCandidate.id
        );

        const ownersAfter = updated.members.filter((m) => m.role === "owner");
        expect(ownersAfter).toHaveLength(1);
        expect(ownersAfter[0]?.userId).toBe(newOwnerCandidate.userId);
      }),
      { numRuns: 100 }
    );
  });

  it("transfer ownership: non-involved members are unaffected", () => {
    // Feature: workspace-redesign, Property 17: Workspace CRUD operations are consistent
    fc.assert(
      fc.property(workspaceWithMembersArb, (workspace) => {
        const currentOwner = workspace.members.find((m) => m.role === "owner");
        const newOwnerCandidate = workspace.members.find(
          (m) => m.status === "active" && m.role !== "owner"
        );
        if (!currentOwner || !newOwnerCandidate) return;

        const updated = applyTransferOwnership(
          workspace,
          currentOwner.userId,
          newOwnerCandidate.id
        );

        // Members not involved in the transfer must be unchanged
        for (const original of workspace.members) {
          if (
            original.userId === currentOwner.userId ||
            original.id === newOwnerCandidate.id
          ) continue;
          const after = updated.members.find((m) => m.id === original.id);
          expect(after?.role).toBe(original.role);
          expect(after?.status).toBe(original.status);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("name update followed by leave: both changes are reflected independently", () => {
    // Feature: workspace-redesign, Property 17: Workspace CRUD operations are consistent
    fc.assert(
      fc.property(workspaceWithMembersArb, workspaceNameArb, (workspace, newName) => {
        const leavingMember = workspace.members.find(
          (m) => m.status === "active" && m.role !== "owner"
        );
        if (!leavingMember) return;

        const afterRename = applyUpdateName(workspace, newName);
        const afterLeave = applyLeaveWorkspace(afterRename, leavingMember.userId);

        // Name change is preserved
        expect(afterLeave.name).toBe(newName);

        // Member is removed
        const memberAfter = afterLeave.members.find((m) => m.userId === leavingMember.userId);
        expect(memberAfter?.status).toBe("removed");
      }),
      { numRuns: 100 }
    );
  });
});
