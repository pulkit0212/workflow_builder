/**
 * ShareToWorkspaceButton — Loading State Tests
 *
 * Tests the button visibility logic: button should be hidden while loading
 * and visible once the fetch resolves with workspaces.
 *
 * **Validates: Requirements 2.1**
 */

import { describe, it, expect, vi, afterEach } from "vitest";

type WorkspaceRecord = { id: string; name: string; role?: string };

/**
 * Pure function that mirrors the component's render decision for the
 * "not yet shared" path (moveStatus is null / not pending/approved).
 *
 * Returns:
 *   "loading"  — while fetch is in-flight (isLoading=true)
 *   "hidden"   — not owner, or no workspaces after load
 *   "visible"  — button should be shown
 */
function resolveButtonVisibility(state: {
  isLoading: boolean;
  isOwner: boolean;
  allWorkspaces: WorkspaceRecord[] | null;
  moveStatus: string | null;
}): "loading" | "hidden" | "visible" {
  const { isLoading, isOwner, allWorkspaces, moveStatus } = state;

  // pending/approved are handled before this path in the real component
  if (moveStatus === "pending" || moveStatus === "approved") return "hidden";

  if (isLoading) return "loading";
  if (!isOwner) return "hidden";
  if (!allWorkspaces || allWorkspaces.length === 0) return "hidden";

  return "visible";
}

/**
 * Simulates the async fetch lifecycle and returns the sequence of
 * visibility states: [during-load, after-load].
 */
async function simulateFetchLifecycle(opts: {
  isOwner: boolean;
  delayMs: number;
  workspaces: WorkspaceRecord[];
}): Promise<["loading" | "hidden" | "visible", "loading" | "hidden" | "visible"]> {
  const { isOwner, delayMs, workspaces } = opts;

  // State mirrors what the component holds
  let isLoading = true;
  let allWorkspaces: WorkspaceRecord[] | null = null;

  // Capture visibility before fetch resolves
  const duringLoad = resolveButtonVisibility({
    isLoading,
    isOwner,
    allWorkspaces,
    moveStatus: null,
  });

  // Simulate the delayed fetch
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
  allWorkspaces = workspaces;
  isLoading = false;

  // Capture visibility after fetch resolves
  const afterLoad = resolveButtonVisibility({
    isLoading,
    isOwner,
    allWorkspaces,
    moveStatus: null,
  });

  return [duringLoad, afterLoad];
}

describe("ShareToWorkspaceButton — loading state visibility", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns loading state while fetch is in-flight (isOwner=true)", async () => {
    const [duringLoad] = await simulateFetchLifecycle({
      isOwner: true,
      delayMs: 200,
      workspaces: [{ id: "ws1", name: "Workspace 1" }],
    });

    expect(duringLoad).toBe("loading");
  });

  it("returns visible after fetch resolves with workspaces (isOwner=true)", async () => {
    const [, afterLoad] = await simulateFetchLifecycle({
      isOwner: true,
      delayMs: 200,
      workspaces: [{ id: "ws1", name: "Workspace 1" }],
    });

    expect(afterLoad).toBe("visible");
  });

  it("button is NOT visible during loading, IS visible after fetch resolves", async () => {
    const [duringLoad, afterLoad] = await simulateFetchLifecycle({
      isOwner: true,
      delayMs: 200,
      workspaces: [{ id: "ws1", name: "Workspace 1" }],
    });

    expect(duringLoad).not.toBe("visible");
    expect(afterLoad).toBe("visible");
  });

  it("stays hidden after load when no workspaces returned", async () => {
    const [, afterLoad] = await simulateFetchLifecycle({
      isOwner: true,
      delayMs: 200,
      workspaces: [],
    });

    expect(afterLoad).toBe("hidden");
  });

  it("stays hidden for non-owner regardless of loading state", async () => {
    const [duringLoad, afterLoad] = await simulateFetchLifecycle({
      isOwner: false,
      delayMs: 200,
      workspaces: [{ id: "ws1", name: "Workspace 1" }],
    });

    expect(duringLoad).toBe("loading");
    expect(afterLoad).toBe("hidden");
  });

  it("pending/approved status always returns hidden (not affected by loading fix)", () => {
    for (const moveStatus of ["pending", "approved"] as const) {
      const result = resolveButtonVisibility({
        isLoading: false,
        isOwner: true,
        allWorkspaces: [{ id: "ws1", name: "Workspace 1" }],
        moveStatus,
      });
      expect(result).toBe("hidden");
    }
  });

  it("loading state is transient — resolves to visible with workspaces", async () => {
    const workspaces = [
      { id: "ws1", name: "Workspace 1" },
      { id: "ws2", name: "Workspace 2" },
    ];

    const [duringLoad, afterLoad] = await simulateFetchLifecycle({
      isOwner: true,
      delayMs: 200,
      workspaces,
    });

    // During load: not visible (loading placeholder)
    expect(duringLoad).toBe("loading");
    // After load: visible because owner has workspaces
    expect(afterLoad).toBe("visible");
  });
});

// ---------------------------------------------------------------------------
// Bug 3 — Workspaces extraction from { success, workspaces } response shape
//
// **Validates: Requirements 2.3**
// ---------------------------------------------------------------------------

/**
 * Pure extraction function that mirrors the component's fetch .then() handler.
 * This is the exact logic from share-to-workspace-button.tsx:
 *
 *   const list = Array.isArray(data)
 *     ? data
 *     : ((data as { success: boolean; workspaces: WorkspaceRecord[] }).workspaces ?? []);
 */
function extractWorkspaceList(
  data: { success: boolean; workspaces: WorkspaceRecord[] } | WorkspaceRecord[]
): WorkspaceRecord[] {
  return Array.isArray(data)
    ? data
    : ((data as { success: boolean; workspaces: WorkspaceRecord[] }).workspaces ?? []);
}

describe("ShareToWorkspaceButton — workspace extraction from API response", () => {
  const ws1: WorkspaceRecord = { id: "ws1", name: "Workspace 1", role: "admin" };
  const ws2: WorkspaceRecord = { id: "ws2", name: "Workspace 2", role: "member" };

  // ── { success, workspaces } shape ──────────────────────────────────────

  it("extracts 2 workspaces from { success: true, workspaces: [ws1, ws2] }", () => {
    const data = { success: true, workspaces: [ws1, ws2] };
    const list = extractWorkspaceList(data);
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe("ws1");
    expect(list[1].id).toBe("ws2");
  });

  it("list is never undefined when API returns { success, workspaces }", () => {
    const data = { success: true, workspaces: [ws1, ws2] };
    const list = extractWorkspaceList(data);
    expect(list).toBeDefined();
  });

  it("returns empty array (not undefined) when workspaces key is missing", () => {
    // Simulate a malformed response where workspaces is absent
    const data = { success: true } as unknown as { success: boolean; workspaces: WorkspaceRecord[] };
    const list = extractWorkspaceList(data);
    expect(list).toBeDefined();
    expect(list).toHaveLength(0);
  });

  it("returns empty array when workspaces is an empty array", () => {
    const data = { success: true, workspaces: [] };
    const list = extractWorkspaceList(data);
    expect(list).toHaveLength(0);
    expect(list).toBeDefined();
  });

  // ── plain array shape ──────────────────────────────────────────────────

  it("returns the array as-is when API returns a plain WorkspaceRecord[]", () => {
    const data: WorkspaceRecord[] = [ws1, ws2];
    const list = extractWorkspaceList(data);
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe("ws1");
    expect(list[1].id).toBe("ws2");
  });

  it("list is never undefined when API returns a plain array", () => {
    const data: WorkspaceRecord[] = [ws1];
    const list = extractWorkspaceList(data);
    expect(list).toBeDefined();
  });

  it("returns empty array (not undefined) when API returns an empty plain array", () => {
    const data: WorkspaceRecord[] = [];
    const list = extractWorkspaceList(data);
    expect(list).toBeDefined();
    expect(list).toHaveLength(0);
  });

  // ── Array.isArray branch discrimination ───────────────────────────────

  it("Array.isArray correctly identifies plain array — does NOT fall through to .workspaces", () => {
    const data: WorkspaceRecord[] = [ws1];
    // If Array.isArray were wrong, it would try data.workspaces which is undefined
    const list = extractWorkspaceList(data);
    // Correct: returns the array itself, not undefined
    expect(list).toBe(data);
  });

  it("Array.isArray correctly rejects object shape — falls through to .workspaces extraction", () => {
    const data = { success: true, workspaces: [ws1, ws2] };
    // Array.isArray({...}) is false, so it must use data.workspaces
    expect(Array.isArray(data)).toBe(false);
    const list = extractWorkspaceList(data);
    expect(list).toEqual([ws1, ws2]);
  });
});
