/**
 * Property-Based Tests: Invite Token Utility
 *
 * Feature: workspace-invite-flow, Property 1: Token uniqueness and entropy
 * Feature: workspace-invite-flow, Property 2: Expiry invariant
 *
 * **Validates: Requirements 1.4, 1.5, 9.1**
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { generateInviteToken, getInviteExpiresAt } from "@/lib/invites/token";

// Feature: workspace-invite-flow, Property 1: Token uniqueness and entropy
describe("Property 1: Token uniqueness and entropy", () => {
  it("generates tokens that are at least 64 characters of valid hex", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), (_n) => {
        const token = generateInviteToken();
        // Must be at least 64 chars (32 bytes hex-encoded)
        expect(token.length).toBeGreaterThanOrEqual(64);
        // Must be valid hex characters only
        expect(token).toMatch(/^[0-9a-f]+$/);
      }),
      { numRuns: 100 }
    );
  });

  it("generates unique tokens across multiple calls", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 20 }), (n) => {
        const tokens = Array.from({ length: n }, () => generateInviteToken());
        const unique = new Set(tokens);
        expect(unique.size).toBe(tokens.length);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: workspace-invite-flow, Property 2: Expiry invariant
describe("Property 2: Expiry invariant", () => {
  it("expiresAt is exactly 7 days (604800000 ms) after createdAt for any date", () => {
    // Constrain dates to a reasonable range (year 2000–2100) to avoid JS Date overflow
    const reasonableDateArb = fc.date({
      min: new Date("2000-01-01T00:00:00.000Z"),
      max: new Date("2100-01-01T00:00:00.000Z")
    });
    fc.assert(
      fc.property(reasonableDateArb, (createdAt) => {
        const expiresAt = getInviteExpiresAt(createdAt);
        const diff = expiresAt.getTime() - createdAt.getTime();
        expect(diff).toBe(604800000);
      }),
      { numRuns: 100 }
    );
  });
});
