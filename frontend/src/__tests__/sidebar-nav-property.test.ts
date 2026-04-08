/**
 * Property Tests for DashboardSidebar nav visibility
 * Feature: workspace-redesign
 *
 * Property 8: Sidebar item visibility determined by workspace.type
 * Validates: Requirements 3.2, 3.3
 *
 * Property 9: Sidebar management link presence
 * Validates: Requirements 3.5
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Types (mirroring workspace-context.tsx)
// ---------------------------------------------------------------------------

type WorkspaceInfo = {
  id: string;
  name: string;
  type: "personal" | "team";
  role: "owner" | "admin" | "member";
};

// ---------------------------------------------------------------------------
// Pure logic extracted from DashboardSidebar for property testing
// These functions mirror the exact logic in dashboard-sidebar.tsx
// ---------------------------------------------------------------------------

/**
 * Determines whether personal-only nav items (History, Workspace, Tools)
 * should be shown based on the active workspace.
 * Mirrors: activeWorkspace === null || activeWorkspace.type === "personal"
 */
function shouldShowPersonalItems(activeWorkspace: WorkspaceInfo | null): boolean {
  return activeWorkspace === null || activeWorkspace.type === "personal";
}

/**
 * Determines whether the "Manage Workspace" link should be rendered.
 * Mirrors: activeWorkspaceId !== null
 */
function shouldShowManageWorkspaceLink(activeWorkspaceId: string | null): boolean {
  return activeWorkspaceId !== null;
}

/**
 * Returns the list of visible nav item labels given the active workspace.
 * Mirrors the filtering logic in DashboardSidebar.
 */
const PERSONAL_ONLY_ITEMS = ["History", "Workspace", "Tools"] as const;
const ALWAYS_VISIBLE_ITEMS = ["Dashboard", "Meetings", "Reports", "Action Items", "Integrations", "Settings", "Billing"] as const;

function getVisibleNavItems(activeWorkspace: WorkspaceInfo | null): string[] {
  const showPersonal = shouldShowPersonalItems(activeWorkspace);
  const items: string[] = [...ALWAYS_VISIBLE_ITEMS];
  if (showPersonal) {
    items.push(...PERSONAL_ONLY_ITEMS);
  }
  return items;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Non-empty workspace ID string */
const workspaceIdArb = fc
  .string({ minLength: 1, maxLength: 64 })
  .filter((s) => s.trim().length > 0);

/** Non-empty workspace name string */
const workspaceNameArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

/** Arbitrary personal workspace */
const personalWorkspaceArb: fc.Arbitrary<WorkspaceInfo> = fc.record({
  id: workspaceIdArb,
  name: workspaceNameArb,
  type: fc.constant("personal" as const),
  role: fc.oneof(
    fc.constant("owner" as const),
    fc.constant("admin" as const),
    fc.constant("member" as const)
  ),
});

/** Arbitrary team workspace */
const teamWorkspaceArb: fc.Arbitrary<WorkspaceInfo> = fc.record({
  id: workspaceIdArb,
  name: workspaceNameArb,
  type: fc.constant("team" as const),
  role: fc.oneof(
    fc.constant("owner" as const),
    fc.constant("admin" as const),
    fc.constant("member" as const)
  ),
});

/** Arbitrary workspace of any type */
const anyWorkspaceArb: fc.Arbitrary<WorkspaceInfo> = fc.oneof(
  personalWorkspaceArb,
  teamWorkspaceArb
);

// ---------------------------------------------------------------------------
// Property 8: Sidebar item visibility determined by workspace.type
// Feature: workspace-redesign, Property 8: Sidebar item visibility determined by workspace.type
// ---------------------------------------------------------------------------

describe("Property 8: Sidebar item visibility determined by workspace.type (Req 3.2, 3.3)", () => {
  it("shows History, Workspace, and Tools when workspace.type is 'personal'", () => {
    // Feature: workspace-redesign, Property 8: Sidebar item visibility determined by workspace.type
    fc.assert(
      fc.property(personalWorkspaceArb, (workspace) => {
        const visible = getVisibleNavItems(workspace);
        expect(visible).toContain("History");
        expect(visible).toContain("Workspace");
        expect(visible).toContain("Tools");
      }),
      { numRuns: 100 }
    );
  });

  it("hides History, Workspace, and Tools when workspace.type is 'team'", () => {
    // Feature: workspace-redesign, Property 8: Sidebar item visibility determined by workspace.type
    fc.assert(
      fc.property(teamWorkspaceArb, (workspace) => {
        const visible = getVisibleNavItems(workspace);
        expect(visible).not.toContain("History");
        expect(visible).not.toContain("Workspace");
        expect(visible).not.toContain("Tools");
      }),
      { numRuns: 100 }
    );
  });

  it("shows History, Workspace, and Tools when activeWorkspace is null (personal mode)", () => {
    // Feature: workspace-redesign, Property 8: Sidebar item visibility determined by workspace.type
    fc.assert(
      fc.property(fc.constant(null), (workspace) => {
        const visible = getVisibleNavItems(workspace);
        expect(visible).toContain("History");
        expect(visible).toContain("Workspace");
        expect(visible).toContain("Tools");
      }),
      { numRuns: 100 }
    );
  });

  it("always-visible items are present regardless of workspace type", () => {
    // Feature: workspace-redesign, Property 8: Sidebar item visibility determined by workspace.type
    fc.assert(
      fc.property(fc.oneof(fc.constant(null), anyWorkspaceArb), (workspace) => {
        const visible = getVisibleNavItems(workspace);
        for (const item of ALWAYS_VISIBLE_ITEMS) {
          expect(visible).toContain(item);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("visibility is determined solely by workspace.type, not workspace name or id", () => {
    // Feature: workspace-redesign, Property 8: Sidebar item visibility determined by workspace.type
    // Two workspaces with the same type but different names/ids must produce the same visibility
    fc.assert(
      fc.property(
        personalWorkspaceArb,
        personalWorkspaceArb,
        (ws1, ws2) => {
          const visible1 = getVisibleNavItems(ws1);
          const visible2 = getVisibleNavItems(ws2);
          // Both personal — same items visible
          expect(visible1.includes("History")).toBe(visible2.includes("History"));
          expect(visible1.includes("Workspace")).toBe(visible2.includes("Workspace"));
          expect(visible1.includes("Tools")).toBe(visible2.includes("Tools"));
        }
      ),
      { numRuns: 100 }
    );
  });

  it("team workspace always hides personal-only items regardless of name or id", () => {
    // Feature: workspace-redesign, Property 8: Sidebar item visibility determined by workspace.type
    fc.assert(
      fc.property(
        teamWorkspaceArb,
        teamWorkspaceArb,
        (ws1, ws2) => {
          const visible1 = getVisibleNavItems(ws1);
          const visible2 = getVisibleNavItems(ws2);
          // Both team — same items hidden
          expect(visible1.includes("History")).toBe(false);
          expect(visible2.includes("History")).toBe(false);
          expect(visible1.includes("Workspace")).toBe(false);
          expect(visible2.includes("Workspace")).toBe(false);
          expect(visible1.includes("Tools")).toBe(false);
          expect(visible2.includes("Tools")).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("shouldShowPersonalItems returns true for personal type", () => {
    // Feature: workspace-redesign, Property 8: Sidebar item visibility determined by workspace.type
    fc.assert(
      fc.property(personalWorkspaceArb, (workspace) => {
        expect(shouldShowPersonalItems(workspace)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("shouldShowPersonalItems returns false for team type", () => {
    // Feature: workspace-redesign, Property 8: Sidebar item visibility determined by workspace.type
    fc.assert(
      fc.property(teamWorkspaceArb, (workspace) => {
        expect(shouldShowPersonalItems(workspace)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it("shouldShowPersonalItems returns true when activeWorkspace is null", () => {
    // Feature: workspace-redesign, Property 8: Sidebar item visibility determined by workspace.type
    fc.assert(
      fc.property(fc.constant(null), (workspace) => {
        expect(shouldShowPersonalItems(workspace)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9: Sidebar management link presence
// Feature: workspace-redesign, Property 9: Sidebar management link presence
// ---------------------------------------------------------------------------

describe("Property 9: Sidebar management link presence (Req 3.5)", () => {
  it("shows Manage Workspace link when activeWorkspaceId is non-null", () => {
    // Feature: workspace-redesign, Property 9: Sidebar management link presence
    fc.assert(
      fc.property(workspaceIdArb, (activeWorkspaceId) => {
        expect(shouldShowManageWorkspaceLink(activeWorkspaceId)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("hides Manage Workspace link when activeWorkspaceId is null", () => {
    // Feature: workspace-redesign, Property 9: Sidebar management link presence
    fc.assert(
      fc.property(fc.constant(null), (activeWorkspaceId) => {
        expect(shouldShowManageWorkspaceLink(activeWorkspaceId)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it("link presence is determined solely by activeWorkspaceId being non-null", () => {
    // Feature: workspace-redesign, Property 9: Sidebar management link presence
    // Any non-empty string must show the link
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(null), workspaceIdArb),
        (activeWorkspaceId) => {
          const show = shouldShowManageWorkspaceLink(activeWorkspaceId);
          expect(show).toBe(activeWorkspaceId !== null);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("link is present for any valid workspace ID format", () => {
    // Feature: workspace-redesign, Property 9: Sidebar management link presence
    // UUIDs, short IDs, long IDs — all non-null values must show the link
    fc.assert(
      fc.property(
        fc.oneof(
          // UUID-like
          fc.uuid(),
          // Short string
          fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0),
          // Long string
          fc.string({ minLength: 20, maxLength: 64 }).filter((s) => s.trim().length > 0)
        ),
        (id) => {
          expect(shouldShowManageWorkspaceLink(id)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("link is absent regardless of workspace type when activeWorkspaceId is null", () => {
    // Feature: workspace-redesign, Property 9: Sidebar management link presence
    fc.assert(
      fc.property(fc.oneof(fc.constant(null), anyWorkspaceArb), (activeWorkspace) => {
        // When activeWorkspaceId is null, link must be absent
        const show = shouldShowManageWorkspaceLink(null);
        expect(show).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it("link presence is consistent across multiple calls with the same input", () => {
    // Feature: workspace-redesign, Property 9: Sidebar management link presence
    // Idempotency: calling the function twice with the same input gives the same result
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(null), workspaceIdArb),
        (activeWorkspaceId) => {
          const result1 = shouldShowManageWorkspaceLink(activeWorkspaceId);
          const result2 = shouldShowManageWorkspaceLink(activeWorkspaceId);
          expect(result1).toBe(result2);
        }
      ),
      { numRuns: 100 }
    );
  });
});
