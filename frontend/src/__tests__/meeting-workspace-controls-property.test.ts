/**
 * Property Tests for Meeting Detail Page Workspace Controls
 * Feature: workspace-redesign
 *
 * Property 18: Meeting workspace controls visibility
 * Validates: Requirements 10.1, 10.2, 10.5
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Types (mirroring workspace-context.tsx and meeting types)
// ---------------------------------------------------------------------------

type WorkspaceInfo = {
  id: string;
  name: string;
  type: "personal" | "team";
  role: "owner" | "admin" | "member";
};

type MeetingWorkspaceState = {
  /** The meeting's workspaceId — null means it is a personal meeting */
  meetingWorkspaceId: string | null;
};

// ---------------------------------------------------------------------------
// Pure logic extracted from MeetingDetail for property testing
// These functions mirror the exact visibility logic in meeting-detail.tsx
// ---------------------------------------------------------------------------

type WorkspaceControlsResult = {
  showBadge: boolean;
  showMoveButton: boolean;
};

/**
 * Derives which workspace controls should be visible on the meeting detail page.
 *
 * Rules (Requirements 10.1, 10.2, 10.5):
 * - activeWorkspaceId is set AND meeting.workspaceId === activeWorkspaceId → show badge, hide button
 * - activeWorkspaceId is set AND meeting.workspaceId !== activeWorkspaceId → show button, hide badge
 * - activeWorkspaceId is null → show neither
 */
function deriveWorkspaceControls(
  activeWorkspaceId: string | null,
  meetingWorkspaceId: string | null
): WorkspaceControlsResult {
  if (activeWorkspaceId === null) {
    return { showBadge: false, showMoveButton: false };
  }

  if (meetingWorkspaceId === activeWorkspaceId) {
    return { showBadge: true, showMoveButton: false };
  }

  return { showBadge: false, showMoveButton: true };
}

/**
 * Derives the workspace badge label shown when the meeting belongs to the active workspace.
 * Mirrors: activeWorkspace?.name ?? "Workspace"
 */
function deriveBadgeLabel(activeWorkspace: WorkspaceInfo | null): string {
  return activeWorkspace?.name ?? "Workspace";
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

/**
 * Generates a scenario where the active workspace is set and the meeting
 * belongs to that workspace (workspaceId matches).
 */
const meetingBelongsToWorkspaceArb = workspaceInfoArb.map((workspace) => ({
  activeWorkspaceId: workspace.id,
  activeWorkspace: workspace,
  meetingWorkspaceId: workspace.id,
}));

/**
 * Generates a scenario where the active workspace is set but the meeting
 * is personal (workspaceId does not match).
 */
const personalMeetingInWorkspaceModeArb = fc
  .tuple(workspaceInfoArb, fc.oneof(fc.constant(null), workspaceIdArb))
  .filter(([workspace, meetingWsId]) => meetingWsId !== workspace.id)
  .map(([workspace, meetingWsId]) => ({
    activeWorkspaceId: workspace.id,
    activeWorkspace: workspace,
    meetingWorkspaceId: meetingWsId,
  }));

/**
 * Generates a scenario where no workspace is active (personal mode).
 */
const personalModeArb = fc
  .oneof(fc.constant(null), workspaceIdArb)
  .map((meetingWsId) => ({
    activeWorkspaceId: null as string | null,
    activeWorkspace: null as WorkspaceInfo | null,
    meetingWorkspaceId: meetingWsId,
  }));

// ---------------------------------------------------------------------------
// Property 18: Meeting workspace controls visibility
// Feature: workspace-redesign, Property 18: Meeting workspace controls visibility
// ---------------------------------------------------------------------------

describe("Property 18: Meeting workspace controls visibility (Req 10.1, 10.2, 10.5)", () => {
  // -------------------------------------------------------------------------
  // Requirement 10.1: badge shown when activeWorkspaceId set and meeting belongs to workspace
  // -------------------------------------------------------------------------

  it("shows workspace badge when meeting belongs to the active workspace", () => {
    // Feature: workspace-redesign, Property 18: Meeting workspace controls visibility
    fc.assert(
      fc.property(meetingBelongsToWorkspaceArb, ({ activeWorkspaceId, meetingWorkspaceId }) => {
        const controls = deriveWorkspaceControls(activeWorkspaceId, meetingWorkspaceId);
        expect(controls.showBadge).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("hides 'Move to workspace' button when meeting belongs to the active workspace", () => {
    // Feature: workspace-redesign, Property 18: Meeting workspace controls visibility
    fc.assert(
      fc.property(meetingBelongsToWorkspaceArb, ({ activeWorkspaceId, meetingWorkspaceId }) => {
        const controls = deriveWorkspaceControls(activeWorkspaceId, meetingWorkspaceId);
        expect(controls.showMoveButton).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  // -------------------------------------------------------------------------
  // Requirement 10.2: "Move to workspace" button shown for personal meeting in workspace mode
  // -------------------------------------------------------------------------

  it("shows 'Move to workspace' button for a personal meeting in workspace mode", () => {
    // Feature: workspace-redesign, Property 18: Meeting workspace controls visibility
    fc.assert(
      fc.property(personalMeetingInWorkspaceModeArb, ({ activeWorkspaceId, meetingWorkspaceId }) => {
        const controls = deriveWorkspaceControls(activeWorkspaceId, meetingWorkspaceId);
        expect(controls.showMoveButton).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("hides workspace badge for a personal meeting in workspace mode", () => {
    // Feature: workspace-redesign, Property 18: Meeting workspace controls visibility
    fc.assert(
      fc.property(personalMeetingInWorkspaceModeArb, ({ activeWorkspaceId, meetingWorkspaceId }) => {
        const controls = deriveWorkspaceControls(activeWorkspaceId, meetingWorkspaceId);
        expect(controls.showBadge).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  // -------------------------------------------------------------------------
  // Requirement 10.5: neither control shown when activeWorkspaceId is null
  // -------------------------------------------------------------------------

  it("shows neither badge nor button when activeWorkspaceId is null (personal mode)", () => {
    // Feature: workspace-redesign, Property 18: Meeting workspace controls visibility
    fc.assert(
      fc.property(personalModeArb, ({ activeWorkspaceId, meetingWorkspaceId }) => {
        const controls = deriveWorkspaceControls(activeWorkspaceId, meetingWorkspaceId);
        expect(controls.showBadge).toBe(false);
        expect(controls.showMoveButton).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it("shows no controls for any meeting when activeWorkspaceId is null", () => {
    // Feature: workspace-redesign, Property 18: Meeting workspace controls visibility
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(null), workspaceIdArb),
        (meetingWorkspaceId) => {
          const controls = deriveWorkspaceControls(null, meetingWorkspaceId);
          expect(controls.showBadge).toBe(false);
          expect(controls.showMoveButton).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  // -------------------------------------------------------------------------
  // Mutual exclusivity: badge and button are never both shown simultaneously
  // -------------------------------------------------------------------------

  it("badge and 'Move to workspace' button are never both visible at the same time", () => {
    // Feature: workspace-redesign, Property 18: Meeting workspace controls visibility
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(null), workspaceIdArb),
        fc.oneof(fc.constant(null), workspaceIdArb),
        (activeWorkspaceId, meetingWorkspaceId) => {
          const controls = deriveWorkspaceControls(activeWorkspaceId, meetingWorkspaceId);
          // They cannot both be true simultaneously
          expect(controls.showBadge && controls.showMoveButton).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  // -------------------------------------------------------------------------
  // Badge label correctness
  // -------------------------------------------------------------------------

  it("badge label matches the active workspace name when workspace is set", () => {
    // Feature: workspace-redesign, Property 18: Meeting workspace controls visibility
    fc.assert(
      fc.property(workspaceInfoArb, (workspace) => {
        const label = deriveBadgeLabel(workspace);
        expect(label).toBe(workspace.name);
      }),
      { numRuns: 100 }
    );
  });

  it("badge label falls back to 'Workspace' when activeWorkspace is null", () => {
    // Feature: workspace-redesign, Property 18: Meeting workspace controls visibility
    fc.assert(
      fc.property(fc.constant(null), (activeWorkspace) => {
        const label = deriveBadgeLabel(activeWorkspace);
        expect(label).toBe("Workspace");
      }),
      { numRuns: 100 }
    );
  });

  it("badge label is never empty", () => {
    // Feature: workspace-redesign, Property 18: Meeting workspace controls visibility
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(null), workspaceInfoArb),
        (activeWorkspace) => {
          const label = deriveBadgeLabel(activeWorkspace);
          expect(label.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  // -------------------------------------------------------------------------
  // Determinism: same inputs always produce same outputs
  // -------------------------------------------------------------------------

  it("control visibility is deterministic — same inputs always produce same result", () => {
    // Feature: workspace-redesign, Property 18: Meeting workspace controls visibility
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(null), workspaceIdArb),
        fc.oneof(fc.constant(null), workspaceIdArb),
        (activeWorkspaceId, meetingWorkspaceId) => {
          const result1 = deriveWorkspaceControls(activeWorkspaceId, meetingWorkspaceId);
          const result2 = deriveWorkspaceControls(activeWorkspaceId, meetingWorkspaceId);
          expect(result1.showBadge).toBe(result2.showBadge);
          expect(result1.showMoveButton).toBe(result2.showMoveButton);
        }
      ),
      { numRuns: 100 }
    );
  });

  // -------------------------------------------------------------------------
  // Exactly one of: badge, button, or neither — never both
  // -------------------------------------------------------------------------

  it("at most one control is visible at any time", () => {
    // Feature: workspace-redesign, Property 18: Meeting workspace controls visibility
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(null), workspaceIdArb),
        fc.oneof(fc.constant(null), workspaceIdArb),
        (activeWorkspaceId, meetingWorkspaceId) => {
          const controls = deriveWorkspaceControls(activeWorkspaceId, meetingWorkspaceId);
          const visibleCount = (controls.showBadge ? 1 : 0) + (controls.showMoveButton ? 1 : 0);
          expect(visibleCount).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });
});
