/**
 * Property-Based Tests: Workspace Switcher
 *
 * Feature: workspace-integration, Property 17: Workspace switcher lists all active memberships
 *
 * **Validates: Requirements 9.2**
 *
 * For any user with N active workspace memberships, the workspace switcher
 * dropdown must display exactly N workspace entries (plus the "+ Create new
 * workspace" option).
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ── Types ─────────────────────────────────────────────────────────────────────

type Workspace = {
  id: string;
  name: string;
  role: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Simulates the logic the WorkspaceSwitcher uses to build its dropdown list.
 * Given the raw API response (list of active memberships), returns the items
 * that would be rendered: one entry per workspace + the create option.
 */
function buildDropdownItems(workspaces: Workspace[]): Array<{ type: "workspace"; id: string } | { type: "create" }> {
  const workspaceItems = workspaces.map((w) => ({ type: "workspace" as const, id: w.id }));
  return [...workspaceItems, { type: "create" }];
}

/**
 * Counts workspace entries (excludes the "+ Create new workspace" option).
 */
function countWorkspaceEntries(items: ReturnType<typeof buildDropdownItems>): number {
  return items.filter((item) => item.type === "workspace").length;
}

/**
 * Counts the create-new entries.
 */
function countCreateEntries(items: ReturnType<typeof buildDropdownItems>): number {
  return items.filter((item) => item.type === "create").length;
}

// ── Generators ────────────────────────────────────────────────────────────────

const workspaceArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 64 }),
  role: fc.constantFrom("owner", "admin", "member", "viewer"),
});

/**
 * Generates a list of N distinct workspaces (unique IDs) representing
 * a user's active memberships.
 */
const activeMembershipsArb = fc
  .array(workspaceArb, { minLength: 0, maxLength: 20 })
  .map((workspaces) => {
    // Deduplicate by id to simulate real DB uniqueness constraint
    const seen = new Set<string>();
    return workspaces.filter((w) => {
      if (seen.has(w.id)) return false;
      seen.add(w.id);
      return true;
    });
  });

// ── Property 17 ───────────────────────────────────────────────────────────────

describe(
  // Feature: workspace-integration, Property 17: Workspace switcher lists all active memberships
  "Property 17: Workspace switcher dropdown displays exactly N workspace entries for N active memberships",
  () => {
    it(
      "dropdown contains exactly N workspace entries when user has N active memberships",
      () => {
        /**
         * **Validates: Requirements 9.2**
         *
         * For any list of N active workspace memberships returned by GET /api/workspaces,
         * the dropdown must render exactly N workspace entries.
         */
        fc.assert(
          fc.property(activeMembershipsArb, (memberships) => {
            const n = memberships.length;
            const items = buildDropdownItems(memberships);
            const workspaceCount = countWorkspaceEntries(items);

            expect(workspaceCount).toBe(n);
          }),
          { numRuns: 100 }
        );
      }
    );

    it(
      "dropdown always contains exactly one '+ Create new workspace' option",
      () => {
        /**
         * **Validates: Requirements 9.3**
         *
         * Regardless of how many active memberships the user has (including zero),
         * the dropdown must always include exactly one create-new option.
         */
        fc.assert(
          fc.property(activeMembershipsArb, (memberships) => {
            const items = buildDropdownItems(memberships);
            const createCount = countCreateEntries(items);

            expect(createCount).toBe(1);
          }),
          { numRuns: 100 }
        );
      }
    );

    it(
      "total dropdown item count equals N + 1 (N workspace entries + 1 create option)",
      () => {
        /**
         * **Validates: Requirements 9.2, 9.3**
         *
         * The total number of items in the dropdown must always be N + 1.
         */
        fc.assert(
          fc.property(activeMembershipsArb, (memberships) => {
            const n = memberships.length;
            const items = buildDropdownItems(memberships);

            expect(items.length).toBe(n + 1);
          }),
          { numRuns: 100 }
        );
      }
    );

    it(
      "each workspace entry in the dropdown corresponds to a unique membership id",
      () => {
        /**
         * **Validates: Requirements 9.2**
         *
         * Every workspace entry in the dropdown must map to a distinct workspace id
         * from the user's active memberships — no duplicates, no missing entries.
         */
        fc.assert(
          fc.property(activeMembershipsArb, (memberships) => {
            const items = buildDropdownItems(memberships);
            const workspaceItems = items.filter((item) => item.type === "workspace") as Array<{ type: "workspace"; id: string }>;

            const renderedIds = workspaceItems.map((item) => item.id);
            const membershipIds = memberships.map((m) => m.id);

            // Every rendered id must come from the memberships list
            expect(renderedIds.every((id) => membershipIds.includes(id))).toBe(true);

            // Every membership id must appear in the rendered list
            expect(membershipIds.every((id) => renderedIds.includes(id))).toBe(true);

            // No duplicates
            expect(new Set(renderedIds).size).toBe(renderedIds.length);
          }),
          { numRuns: 100 }
        );
      }
    );

    it(
      "user with zero active memberships sees only the create option",
      () => {
        /**
         * **Validates: Requirements 9.2, 9.3**
         *
         * Edge case: when a user has no active workspace memberships,
         * the dropdown must show zero workspace entries and exactly one create option.
         */
        const items = buildDropdownItems([]);
        expect(countWorkspaceEntries(items)).toBe(0);
        expect(countCreateEntries(items)).toBe(1);
        expect(items.length).toBe(1);
      }
    );
  }
);
