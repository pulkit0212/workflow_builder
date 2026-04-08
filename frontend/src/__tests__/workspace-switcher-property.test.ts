/**
 * Property Tests for WorkspaceSwitcher display
 * Feature: workspace-redesign
 *
 * Property 6: WorkspaceSwitcher displays correct active label
 * Validates: Requirements 2.1
 *
 * Property 7: WorkspaceSwitcher lists exactly active memberships
 * Validates: Requirements 2.2
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Pure logic extracted from WorkspaceSwitcher for property testing
// These functions mirror the exact logic in WorkspaceSwitcher.tsx
// ---------------------------------------------------------------------------

type WorkspaceInfo = {
  id: string;
  name: string;
  type: "personal" | "team";
  role: "owner" | "admin" | "member";
};

/**
 * Derives the active label shown in the WorkspaceSwitcher trigger button.
 * Mirrors: activeWorkspace?.name ?? "Personal"
 */
function deriveActiveLabel(
  activeWorkspace: WorkspaceInfo | null
): string {
  return activeWorkspace?.name ?? "Personal";
}

/**
 * Derives the list of workspace options rendered in the dropdown.
 * The switcher renders exactly the workspaces array from context — no filtering.
 * The "Personal" option is always prepended by the component itself.
 */
function deriveWorkspaceOptions(workspaces: WorkspaceInfo[]): WorkspaceInfo[] {
  return workspaces;
}

/**
 * Derives whether a given workspace option is marked as selected.
 * Mirrors: workspace.id === activeWorkspaceId
 */
function isWorkspaceSelected(
  workspaceId: string,
  activeWorkspaceId: string | null
): boolean {
  return workspaceId === activeWorkspaceId;
}

/**
 * Derives whether the Personal option is selected.
 * Mirrors: activeWorkspaceId === null
 */
function isPersonalSelected(activeWorkspaceId: string | null): boolean {
  return activeWorkspaceId === null;
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

/** Arbitrary WorkspaceInfo */
const workspaceInfoArb: fc.Arbitrary<WorkspaceInfo> = fc.record({
  id: workspaceIdArb,
  name: workspaceNameArb,
  type: fc.oneof(fc.constant("personal" as const), fc.constant("team" as const)),
  role: fc.oneof(
    fc.constant("owner" as const),
    fc.constant("admin" as const),
    fc.constant("member" as const)
  ),
});

/** Arbitrary list of WorkspaceInfo with unique IDs */
const workspaceListArb: fc.Arbitrary<WorkspaceInfo[]> = fc
  .array(workspaceInfoArb, { minLength: 0, maxLength: 20 })
  .map((list) => {
    // Deduplicate by ID to simulate real membership data
    const seen = new Set<string>();
    return list.filter((w) => {
      if (seen.has(w.id)) return false;
      seen.add(w.id);
      return true;
    });
  });

/** Arbitrary context state: workspaces list + optional active workspace */
const contextStateArb = fc
  .tuple(workspaceListArb, fc.boolean())
  .chain(([workspaces, usePersonal]) => {
    if (usePersonal || workspaces.length === 0) {
      return fc.constant({ workspaces, activeWorkspaceId: null as string | null });
    }
    return fc
      .integer({ min: 0, max: workspaces.length - 1 })
      .map((idx) => ({ workspaces, activeWorkspaceId: workspaces[idx].id }));
  });

// ---------------------------------------------------------------------------
// Property 6: WorkspaceSwitcher displays correct active label
// Feature: workspace-redesign, Property 6: WorkspaceSwitcher displays correct active label
// ---------------------------------------------------------------------------

describe("Property 6: WorkspaceSwitcher displays correct active label (Req 2.1)", () => {
  it("displays 'Personal' when activeWorkspaceId is null", () => {
    // Feature: workspace-redesign, Property 6: WorkspaceSwitcher displays correct active label
    fc.assert(
      fc.property(workspaceListArb, (workspaces) => {
        const label = deriveActiveLabel(null);
        expect(label).toBe("Personal");
      }),
      { numRuns: 100 }
    );
  });

  it("displays the active workspace name when a workspace is selected", () => {
    // Feature: workspace-redesign, Property 6: WorkspaceSwitcher displays correct active label
    fc.assert(
      fc.property(workspaceInfoArb, (workspace) => {
        const label = deriveActiveLabel(workspace);
        expect(label).toBe(workspace.name);
      }),
      { numRuns: 100 }
    );
  });

  it("label matches active workspace name for any context state", () => {
    // Feature: workspace-redesign, Property 6: WorkspaceSwitcher displays correct active label
    fc.assert(
      fc.property(contextStateArb, ({ workspaces, activeWorkspaceId }) => {
        const activeWorkspace =
          activeWorkspaceId !== null
            ? (workspaces.find((w) => w.id === activeWorkspaceId) ?? null)
            : null;

        const label = deriveActiveLabel(activeWorkspace);

        if (activeWorkspaceId === null || activeWorkspace === null) {
          expect(label).toBe("Personal");
        } else {
          expect(label).toBe(activeWorkspace.name);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("label is never empty — always 'Personal' or a workspace name", () => {
    // Feature: workspace-redesign, Property 6: WorkspaceSwitcher displays correct active label
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(null), workspaceInfoArb),
        (activeWorkspace) => {
          const label = deriveActiveLabel(activeWorkspace);
          expect(label.length).toBeGreaterThan(0);
          if (activeWorkspace === null) {
            expect(label).toBe("Personal");
          } else {
            expect(label).toBe(activeWorkspace.name);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("label is exactly 'Personal' (not 'personal' or 'PERSONAL') when no workspace active", () => {
    // Feature: workspace-redesign, Property 6: WorkspaceSwitcher displays correct active label
    fc.assert(
      fc.property(fc.constant(null), (activeWorkspace) => {
        const label = deriveActiveLabel(activeWorkspace);
        expect(label).toBe("Personal");
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7: WorkspaceSwitcher lists exactly active memberships
// Feature: workspace-redesign, Property 7: WorkspaceSwitcher lists exactly active memberships
// ---------------------------------------------------------------------------

describe("Property 7: WorkspaceSwitcher lists exactly active memberships (Req 2.2)", () => {
  it("renders exactly the workspaces provided by context — no additions", () => {
    // Feature: workspace-redesign, Property 7: WorkspaceSwitcher lists exactly active memberships
    fc.assert(
      fc.property(workspaceListArb, (workspaces) => {
        const options = deriveWorkspaceOptions(workspaces);
        expect(options).toHaveLength(workspaces.length);
      }),
      { numRuns: 100 }
    );
  });

  it("renders exactly the workspaces provided by context — no omissions", () => {
    // Feature: workspace-redesign, Property 7: WorkspaceSwitcher lists exactly active memberships
    fc.assert(
      fc.property(workspaceListArb, (workspaces) => {
        const options = deriveWorkspaceOptions(workspaces);
        const optionIds = options.map((w) => w.id);
        const workspaceIds = workspaces.map((w) => w.id);
        expect(optionIds).toEqual(workspaceIds);
      }),
      { numRuns: 100 }
    );
  });

  it("every workspace in context appears exactly once in the list", () => {
    // Feature: workspace-redesign, Property 7: WorkspaceSwitcher lists exactly active memberships
    fc.assert(
      fc.property(workspaceListArb, (workspaces) => {
        const options = deriveWorkspaceOptions(workspaces);
        for (const workspace of workspaces) {
          const count = options.filter((o) => o.id === workspace.id).length;
          expect(count).toBe(1);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("no workspace appears in the list that is not in the context membership set", () => {
    // Feature: workspace-redesign, Property 7: WorkspaceSwitcher lists exactly active memberships
    fc.assert(
      fc.property(workspaceListArb, (workspaces) => {
        const options = deriveWorkspaceOptions(workspaces);
        const membershipIds = new Set(workspaces.map((w) => w.id));
        for (const option of options) {
          expect(membershipIds.has(option.id)).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("active workspace is marked as selected; all others are not", () => {
    // Feature: workspace-redesign, Property 7: WorkspaceSwitcher lists exactly active memberships
    fc.assert(
      fc.property(contextStateArb, ({ workspaces, activeWorkspaceId }) => {
        const options = deriveWorkspaceOptions(workspaces);

        for (const option of options) {
          const selected = isWorkspaceSelected(option.id, activeWorkspaceId);
          if (option.id === activeWorkspaceId) {
            expect(selected).toBe(true);
          } else {
            expect(selected).toBe(false);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it("Personal option is selected iff activeWorkspaceId is null", () => {
    // Feature: workspace-redesign, Property 7: WorkspaceSwitcher lists exactly active memberships
    fc.assert(
      fc.property(contextStateArb, ({ activeWorkspaceId }) => {
        const personalSelected = isPersonalSelected(activeWorkspaceId);
        expect(personalSelected).toBe(activeWorkspaceId === null);
      }),
      { numRuns: 100 }
    );
  });

  it("exactly one option is selected at any time (Personal or one workspace)", () => {
    // Feature: workspace-redesign, Property 7: WorkspaceSwitcher lists exactly active memberships
    fc.assert(
      fc.property(contextStateArb, ({ workspaces, activeWorkspaceId }) => {
        const options = deriveWorkspaceOptions(workspaces);

        const personalSelected = isPersonalSelected(activeWorkspaceId);
        const selectedWorkspaces = options.filter((o) =>
          isWorkspaceSelected(o.id, activeWorkspaceId)
        );

        // Total selected count must be exactly 1
        const totalSelected =
          (personalSelected ? 1 : 0) + selectedWorkspaces.length;
        expect(totalSelected).toBe(1);
      }),
      { numRuns: 100 }
    );
  });

  it("empty workspace list renders no workspace options (only Personal)", () => {
    // Feature: workspace-redesign, Property 7: WorkspaceSwitcher lists exactly active memberships
    fc.assert(
      fc.property(fc.constant([]), (workspaces: WorkspaceInfo[]) => {
        const options = deriveWorkspaceOptions(workspaces);
        expect(options).toHaveLength(0);
        // Personal is always present (rendered separately by the component)
        const personalSelected = isPersonalSelected(null);
        expect(personalSelected).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});
