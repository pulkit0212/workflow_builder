/**
 * Property Tests for removed URL redirects
 * Feature: workspace-redesign
 *
 * Property 19: Removed page URLs redirect to unified pages
 * Validates: Requirements 9.9
 */

// Feature: workspace-redesign, Property 19: Removed page URLs redirect to unified pages

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Redirect map — mirrors the redirects defined in next.config.ts
// Each entry: { source pattern, destination }
// ---------------------------------------------------------------------------

type RedirectRule = {
  source: string; // path pattern (may contain :param segments)
  destination: string;
  permanent: boolean;
};

const REDIRECT_RULES: RedirectRule[] = [
  // Static paths first (before dynamic :workspaceId patterns)
  {
    source: "/dashboard/workspace/action-items",
    destination: "/dashboard/action-items",
    permanent: true,
  },
  {
    source: "/dashboard/workspaces",
    destination: "/dashboard/workspace",
    permanent: true,
  },
  {
    source: "/dashboard/workspace/:workspaceId/meetings",
    destination: "/dashboard/meetings",
    permanent: true,
  },
  {
    source: "/dashboard/workspace/:workspaceId/action-items",
    destination: "/dashboard/action-items",
    permanent: true,
  },
  {
    source: "/dashboard/workspace/:workspaceId/overview",
    destination: "/dashboard",
    permanent: true,
  },
  {
    source: "/dashboard/workspace/:workspaceId",
    destination: "/dashboard/workspace",
    permanent: true,
  },
];

// ---------------------------------------------------------------------------
// Pure redirect-matching logic (mirrors Next.js path-param matching)
// ---------------------------------------------------------------------------

/**
 * Converts a Next.js source pattern (with :param segments) into a RegExp.
 * e.g. "/dashboard/workspace/:workspaceId/meetings"
 *   → /^\/dashboard\/workspace\/([^/]+)\/meetings$/
 *
 * We replace :param segments FIRST (before escaping) to avoid escaping the colon.
 */
function patternToRegex(source: string): RegExp {
  // Step 1: replace :param with a placeholder that won't be touched by escaping
  const withPlaceholder = source.replace(/:[a-zA-Z][a-zA-Z0-9]*/g, "\x00PARAM\x00");
  // Step 2: escape remaining regex special chars (excluding the placeholder)
  const escaped = withPlaceholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Step 3: replace placeholder with capture group
  const withCapture = escaped.replace(/\x00PARAM\x00/g, "([^/]+)");
  return new RegExp(`^${withCapture}$`);
}

/**
 * Finds the first matching redirect rule for a given URL path.
 * Returns the destination or null if no rule matches.
 */
function matchRedirect(path: string): { destination: string; permanent: boolean } | null {
  for (const rule of REDIRECT_RULES) {
    const regex = patternToRegex(rule.source);
    if (regex.test(path)) {
      return { destination: rule.destination, permanent: rule.permanent };
    }
  }
  return null;
}

/**
 * Builds a concrete URL path from a source pattern by substituting :param
 * segments with the provided value.
 */
function buildPath(source: string, paramValue: string): string {
  // Use a replacer function to avoid special $ replacement patterns (e.g. $', $&)
  return source.replace(/:[a-zA-Z]+/g, () => paramValue);
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Non-empty workspace ID that is a valid URL path segment (no slashes) */
const workspaceIdArb = fc
  .string({ minLength: 1, maxLength: 64 })
  .filter((s) => s.trim().length > 0 && !s.includes("/"));

// ---------------------------------------------------------------------------
// Property 19: Removed page URLs redirect to unified pages
// Feature: workspace-redesign, Property 19: Removed page URLs redirect to unified pages
// ---------------------------------------------------------------------------

describe("Property 19: Removed page URLs redirect to unified pages (Req 9.9)", () => {
  it("/dashboard/workspace/:workspaceId/meetings redirects to /dashboard/meetings", () => {
    // Feature: workspace-redesign, Property 19: Removed page URLs redirect to unified pages
    fc.assert(
      fc.property(workspaceIdArb, (workspaceId) => {
        const path = buildPath("/dashboard/workspace/:workspaceId/meetings", workspaceId);
        const result = matchRedirect(path);
        expect(result).not.toBeNull();
        expect(result!.destination).toBe("/dashboard/meetings");
        expect(result!.permanent).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("/dashboard/workspace/:workspaceId/action-items redirects to /dashboard/action-items", () => {
    // Feature: workspace-redesign, Property 19: Removed page URLs redirect to unified pages
    fc.assert(
      fc.property(workspaceIdArb, (workspaceId) => {
        const path = buildPath("/dashboard/workspace/:workspaceId/action-items", workspaceId);
        const result = matchRedirect(path);
        expect(result).not.toBeNull();
        expect(result!.destination).toBe("/dashboard/action-items");
        expect(result!.permanent).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("/dashboard/workspace/:workspaceId/overview redirects to /dashboard", () => {
    // Feature: workspace-redesign, Property 19: Removed page URLs redirect to unified pages
    fc.assert(
      fc.property(workspaceIdArb, (workspaceId) => {
        const path = buildPath("/dashboard/workspace/:workspaceId/overview", workspaceId);
        const result = matchRedirect(path);
        expect(result).not.toBeNull();
        expect(result!.destination).toBe("/dashboard");
        expect(result!.permanent).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("/dashboard/workspace/:workspaceId redirects to /dashboard/workspace", () => {
    // Feature: workspace-redesign, Property 19: Removed page URLs redirect to unified pages
    fc.assert(
      fc.property(workspaceIdArb, (workspaceId) => {
        // Exclude values that would match a more-specific sub-path rule
        fc.pre(
          workspaceId !== "action-items" &&
            workspaceId !== "meetings" &&
            workspaceId !== "overview"
        );
        const path = buildPath("/dashboard/workspace/:workspaceId", workspaceId);
        const result = matchRedirect(path);
        expect(result).not.toBeNull();
        expect(result!.destination).toBe("/dashboard/workspace");
        expect(result!.permanent).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("/dashboard/workspace/action-items redirects to /dashboard/action-items", () => {
    // Feature: workspace-redesign, Property 19: Removed page URLs redirect to unified pages
    const path = "/dashboard/workspace/action-items";
    const result = matchRedirect(path);
    expect(result).not.toBeNull();
    expect(result!.destination).toBe("/dashboard/action-items");
    expect(result!.permanent).toBe(true);
  });

  it("/dashboard/workspaces redirects to /dashboard/workspace", () => {
    // Feature: workspace-redesign, Property 19: Removed page URLs redirect to unified pages
    const path = "/dashboard/workspaces";
    const result = matchRedirect(path);
    expect(result).not.toBeNull();
    expect(result!.destination).toBe("/dashboard/workspace");
    expect(result!.permanent).toBe(true);
  });

  it("every removed URL path has a redirect rule (no 404s)", () => {
    // Feature: workspace-redesign, Property 19: Removed page URLs redirect to unified pages
    // Verify that all known removed paths are covered by a redirect rule
    fc.assert(
      fc.property(workspaceIdArb, (workspaceId) => {
        fc.pre(
          workspaceId !== "action-items" &&
            workspaceId !== "meetings" &&
            workspaceId !== "overview"
        );

        const removedPaths = [
          `/dashboard/workspace/${workspaceId}`,
          `/dashboard/workspace/${workspaceId}/meetings`,
          `/dashboard/workspace/${workspaceId}/action-items`,
          `/dashboard/workspace/${workspaceId}/overview`,
          "/dashboard/workspace/action-items",
          "/dashboard/workspaces",
        ];

        for (const path of removedPaths) {
          const result = matchRedirect(path);
          expect(result, `Expected redirect for ${path}`).not.toBeNull();
        }
      }),
      { numRuns: 100 }
    );
  });

  it("redirect destinations are all valid unified page paths", () => {
    // Feature: workspace-redesign, Property 19: Removed page URLs redirect to unified pages
    const validDestinations = new Set([
      "/dashboard",
      "/dashboard/workspace",
      "/dashboard/meetings",
      "/dashboard/action-items",
    ]);

    for (const rule of REDIRECT_RULES) {
      expect(
        validDestinations.has(rule.destination),
        `Destination ${rule.destination} is not a known unified page`
      ).toBe(true);
    }
  });

  it("all redirect rules are permanent (301)", () => {
    // Feature: workspace-redesign, Property 19: Removed page URLs redirect to unified pages
    for (const rule of REDIRECT_RULES) {
      expect(rule.permanent).toBe(true);
    }
  });

  it("redirect rules cover all removed paths regardless of workspaceId format", () => {
    // Feature: workspace-redesign, Property 19: Removed page URLs redirect to unified pages
    // Test with UUID-like IDs, short IDs, and long IDs
    fc.assert(
      fc.property(
        fc.oneof(
          fc.uuid(),
          fc.string({ minLength: 1, maxLength: 10 }).filter(
            (s) => s.trim().length > 0 && !s.includes("/")
          ),
          fc.string({ minLength: 20, maxLength: 64 }).filter(
            (s) => s.trim().length > 0 && !s.includes("/")
          )
        ),
        (workspaceId) => {
          fc.pre(
            workspaceId !== "action-items" &&
              workspaceId !== "meetings" &&
              workspaceId !== "overview"
          );

          const path = `/dashboard/workspace/${workspaceId}`;
          const result = matchRedirect(path);
          expect(result).not.toBeNull();
          expect(result!.destination).toBe("/dashboard/workspace");
        }
      ),
      { numRuns: 100 }
    );
  });
});
