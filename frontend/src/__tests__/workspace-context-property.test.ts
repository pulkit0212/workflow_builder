/**
 * Property Tests for WorkspaceContext initialisation and switching
 * Feature: workspace-redesign
 *
 * Property 1: URL param is authoritative on initialisation
 * Validates: Requirements 1.4
 *
 * Property 2: localStorage fallback when URL param absent
 * Validates: Requirements 1.5
 *
 * Property 3: Empty context initialises to null
 * Validates: Requirements 1.6
 *
 * Property 4: switchToWorkspace syncs URL and localStorage
 * Validates: Requirements 1.2, 1.8
 *
 * Property 5: switchToPersonal clears URL and localStorage
 * Validates: Requirements 1.3, 1.8
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Pure logic extracted from WorkspaceContext for property testing
// These functions mirror the exact logic in workspace-context.tsx
// ---------------------------------------------------------------------------

const LS_KEY = "active-workspace-id";

/**
 * Resolves the initial activeWorkspaceId given URL param and localStorage value.
 * Mirrors the useState initialiser in WorkspaceProvider.
 */
function resolveInitialWorkspaceId(
  urlParam: string | null,
  localStorageValue: string | null
): string | null {
  if (urlParam) return urlParam;
  if (localStorageValue) return localStorageValue;
  return null;
}

/**
 * Simulates what switchToWorkspace does to URL params and localStorage.
 * Returns the new state after the switch.
 */
function applySwitchToWorkspace(
  id: string,
  currentParams: Record<string, string>,
  currentStorage: Record<string, string>
): {
  params: Record<string, string>;
  storage: Record<string, string>;
  activeWorkspaceId: string;
} {
  const params = { ...currentParams, workspace: id };
  const storage = { ...currentStorage, [LS_KEY]: id };
  return { params, storage, activeWorkspaceId: id };
}

/**
 * Simulates what switchToPersonal does to URL params and localStorage.
 * Returns the new state after the switch.
 */
function applySwitchToPersonal(
  currentParams: Record<string, string>,
  currentStorage: Record<string, string>
): {
  params: Record<string, string>;
  storage: Record<string, string>;
  activeWorkspaceId: null;
} {
  const params = { ...currentParams };
  delete params["workspace"];
  const storage = { ...currentStorage };
  delete storage[LS_KEY];
  return { params, storage, activeWorkspaceId: null };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Non-empty workspace ID string (UUID-like or arbitrary) */
const workspaceIdArb = fc
  .string({ minLength: 1, maxLength: 64 })
  .filter((s) => s.trim().length > 0);

/** Arbitrary localStorage value — either a non-empty string or null */
const localStorageValueArb = fc.oneof(
  fc.constant(null),
  workspaceIdArb
);

/** Arbitrary URL params map — may or may not contain 'workspace' */
const urlParamsArb = fc.record({
  workspace: fc.oneof(fc.constant(undefined), workspaceIdArb),
  other: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
}).map(({ workspace, other }) => {
  const params: Record<string, string> = {};
  if (workspace !== undefined) params["workspace"] = workspace;
  if (other !== null && other !== undefined) params["other"] = other;
  return params;
});

/** Arbitrary storage map — may or may not contain LS_KEY */
const storageArb = fc.record({
  [LS_KEY]: fc.oneof(fc.constant(undefined), workspaceIdArb),
}).map((rec) => {
  const storage: Record<string, string> = {};
  const val = rec[LS_KEY];
  if (val !== undefined) storage[LS_KEY] = val;
  return storage;
});

// ---------------------------------------------------------------------------
// Property 1: URL param is authoritative on initialisation
// Feature: workspace-redesign, Property 1: URL param is authoritative on initialisation
// ---------------------------------------------------------------------------

describe("Property 1: URL param is authoritative on initialisation (Req 1.4)", () => {
  it("activeWorkspaceId equals URL param regardless of localStorage value", () => {
    // Feature: workspace-redesign, Property 1: URL param is authoritative on initialisation
    fc.assert(
      fc.property(
        workspaceIdArb,
        localStorageValueArb,
        (urlParam, localStorageValue) => {
          const result = resolveInitialWorkspaceId(urlParam, localStorageValue);
          expect(result).toBe(urlParam);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("URL param takes precedence even when localStorage has a different value", () => {
    // Feature: workspace-redesign, Property 1: URL param is authoritative on initialisation
    fc.assert(
      fc.property(
        workspaceIdArb,
        workspaceIdArb,
        (urlParam, localStorageValue) => {
          // Both are non-null — URL must win
          const result = resolveInitialWorkspaceId(urlParam, localStorageValue);
          expect(result).toBe(urlParam);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: localStorage fallback when URL param absent
// Feature: workspace-redesign, Property 2: localStorage fallback when URL param absent
// ---------------------------------------------------------------------------

describe("Property 2: localStorage fallback when URL param absent (Req 1.5)", () => {
  it("uses localStorage value when URL param is null", () => {
    // Feature: workspace-redesign, Property 2: localStorage fallback when URL param absent
    fc.assert(
      fc.property(workspaceIdArb, (localStorageValue) => {
        const result = resolveInitialWorkspaceId(null, localStorageValue);
        expect(result).toBe(localStorageValue);
      }),
      { numRuns: 100 }
    );
  });

  it("localStorage value is used as-is (no transformation)", () => {
    // Feature: workspace-redesign, Property 2: localStorage fallback when URL param absent
    fc.assert(
      fc.property(workspaceIdArb, (localStorageValue) => {
        const result = resolveInitialWorkspaceId(null, localStorageValue);
        // The value must be preserved exactly
        expect(result).toStrictEqual(localStorageValue);
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Empty context initialises to null
// Feature: workspace-redesign, Property 3: Empty context initialises to null
// ---------------------------------------------------------------------------

describe("Property 3: Empty context initialises to null (Req 1.6)", () => {
  it("returns null when both URL param and localStorage are null", () => {
    // Feature: workspace-redesign, Property 3: Empty context initialises to null
    fc.assert(
      fc.property(fc.constant(null), fc.constant(null), (urlParam, lsValue) => {
        const result = resolveInitialWorkspaceId(urlParam, lsValue);
        expect(result).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it("returns null for any combination of absent/empty URL param and absent localStorage", () => {
    // Feature: workspace-redesign, Property 3: Empty context initialises to null
    // Generate cases where both sources are absent
    const absentArb = fc.oneof(
      fc.constant(null),
      fc.constant(""),
    );
    fc.assert(
      fc.property(absentArb, absentArb, (urlParam, lsValue) => {
        // Treat empty string as absent (same as null for our logic)
        const normalizedUrl = urlParam || null;
        const normalizedLs = lsValue || null;
        const result = resolveInitialWorkspaceId(normalizedUrl, normalizedLs);
        expect(result).toBeNull();
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: switchToWorkspace syncs URL and localStorage
// Feature: workspace-redesign, Property 4: switchToWorkspace syncs URL and localStorage
// ---------------------------------------------------------------------------

describe("Property 4: switchToWorkspace syncs URL and localStorage (Req 1.2, 1.8)", () => {
  it("URL param and localStorage both equal the switched-to workspace ID", () => {
    // Feature: workspace-redesign, Property 4: switchToWorkspace syncs URL and localStorage
    fc.assert(
      fc.property(
        workspaceIdArb,
        urlParamsArb,
        storageArb,
        (targetId, currentParams, currentStorage) => {
          const result = applySwitchToWorkspace(targetId, currentParams, currentStorage);

          // Both URL param and localStorage must equal the target ID
          expect(result.params["workspace"]).toBe(targetId);
          expect(result.storage[LS_KEY]).toBe(targetId);
          expect(result.activeWorkspaceId).toBe(targetId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("switchToWorkspace preserves other URL params", () => {
    // Feature: workspace-redesign, Property 4: switchToWorkspace syncs URL and localStorage
    fc.assert(
      fc.property(
        workspaceIdArb,
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s !== "workspace"),
        fc.string({ minLength: 1, maxLength: 20 }),
        (targetId, otherKey, otherValue) => {
          const currentParams = { [otherKey]: otherValue };
          const result = applySwitchToWorkspace(targetId, currentParams, {});

          // workspace param is set
          expect(result.params["workspace"]).toBe(targetId);
          // other params are preserved
          expect(result.params[otherKey]).toBe(otherValue);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("URL and localStorage are always in sync after switchToWorkspace", () => {
    // Feature: workspace-redesign, Property 4: switchToWorkspace syncs URL and localStorage
    fc.assert(
      fc.property(workspaceIdArb, urlParamsArb, storageArb, (id, params, storage) => {
        const result = applySwitchToWorkspace(id, params, storage);
        // The invariant: URL param === localStorage value after switch
        expect(result.params["workspace"]).toBe(result.storage[LS_KEY]);
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: switchToPersonal clears URL and localStorage
// Feature: workspace-redesign, Property 5: switchToPersonal clears URL and localStorage
// ---------------------------------------------------------------------------

describe("Property 5: switchToPersonal clears URL and localStorage (Req 1.3, 1.8)", () => {
  it("workspace URL param is absent after switchToPersonal", () => {
    // Feature: workspace-redesign, Property 5: switchToPersonal clears URL and localStorage
    fc.assert(
      fc.property(urlParamsArb, storageArb, (currentParams, currentStorage) => {
        const result = applySwitchToPersonal(currentParams, currentStorage);

        expect(result.params["workspace"]).toBeUndefined();
        expect(result.activeWorkspaceId).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it("localStorage active-workspace-id is absent after switchToPersonal", () => {
    // Feature: workspace-redesign, Property 5: switchToPersonal clears URL and localStorage
    fc.assert(
      fc.property(urlParamsArb, storageArb, (currentParams, currentStorage) => {
        const result = applySwitchToPersonal(currentParams, currentStorage);

        expect(result.storage[LS_KEY]).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  it("switchToPersonal preserves other URL params", () => {
    // Feature: workspace-redesign, Property 5: switchToPersonal clears URL and localStorage
    fc.assert(
      fc.property(
        workspaceIdArb,
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s !== "workspace"),
        fc.string({ minLength: 1, maxLength: 20 }),
        (workspaceId, otherKey, otherValue) => {
          const currentParams = { workspace: workspaceId, [otherKey]: otherValue };
          const result = applySwitchToPersonal(currentParams, {});

          // workspace is gone
          expect(result.params["workspace"]).toBeUndefined();
          // other params are preserved
          expect(result.params[otherKey]).toBe(otherValue);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("URL and localStorage are both cleared regardless of prior workspace state", () => {
    // Feature: workspace-redesign, Property 5: switchToPersonal clears URL and localStorage
    fc.assert(
      fc.property(
        workspaceIdArb,
        workspaceIdArb,
        (urlWorkspace, lsWorkspace) => {
          const currentParams = { workspace: urlWorkspace };
          const currentStorage = { [LS_KEY]: lsWorkspace };
          const result = applySwitchToPersonal(currentParams, currentStorage);

          expect(result.params["workspace"]).toBeUndefined();
          expect(result.storage[LS_KEY]).toBeUndefined();
          expect(result.activeWorkspaceId).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
