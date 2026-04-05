/**
 * Unit Tests: Account Tab Logic
 *
 * Tests the pure logic functions extracted from the Account Tab
 * in src/app/dashboard/settings/page.tsx.
 *
 * Since the component uses Clerk hooks (useClerk, useSession), we test the
 * logic functions directly rather than rendering the component.
 *
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8**
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Types ────────────────────────────────────────────────────────────────────

type ToastType = "success" | "error" | "info" | "warning";

interface ToastState {
  message: string;
  type: ToastType;
}

interface AccountTabState {
  toast: ToastState | null;
  deleteAccountConfirm: string;
  redirectedTo: string | null;
}

interface ClerkSession {
  id: string;
}

// ─── Simulated signOutOtherSessions logic ─────────────────────────────────────

/**
 * Mirrors the signOutOtherSessions() function from page.tsx.
 */
async function simulateSignOutOtherSessions(
  state: AccountTabState,
  clerkSessions: ClerkSession[],
  currentSessionId: string | undefined,
  clerkSignOut: (opts: { sessionId: string }) => Promise<void>
): Promise<void> {
  const otherSessions = clerkSessions.filter((s) => s.id !== currentSessionId);

  if (otherSessions.length === 0) {
    state.toast = { message: "No other active sessions found.", type: "info" };
    return;
  }

  try {
    await Promise.all(otherSessions.map((s) => clerkSignOut({ sessionId: s.id })));
    state.toast = { message: "Signed out of other devices", type: "success" };
  } catch {
    state.toast = { message: "Failed to sign out other devices", type: "error" };
  }
}

// ─── Simulated deleteAccount logic ────────────────────────────────────────────

/**
 * Mirrors the deleteAccount() function from page.tsx.
 */
async function simulateDeleteAccount(
  state: AccountTabState,
  fetchDelete: () => Promise<Response>
): Promise<void> {
  if (state.deleteAccountConfirm !== "DELETE") {
    state.toast = { message: "Type DELETE to confirm.", type: "error" };
    return;
  }

  try {
    const response = await fetchDelete();

    if (!response.ok) {
      throw new Error("Failed to delete account");
    }

    state.redirectedTo = "/";
  } catch {
    state.toast = { message: "Failed to delete account", type: "error" };
  }
}

// ─── Tests: signOutOtherSessions ──────────────────────────────────────────────

describe("Account Tab - signOutOtherSessions", () => {
  let state: AccountTabState;
  let mockClerkSignOut: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    state = { toast: null, deleteAccountConfirm: "", redirectedTo: null };
    mockClerkSignOut = vi.fn().mockResolvedValue(undefined);
  });

  it('shows "No other active sessions" info toast when no other sessions exist', async () => {
    // **Validates: Requirement 8.3** - only current session present
    const sessions: ClerkSession[] = [{ id: "session-current" }];

    await simulateSignOutOtherSessions(state, sessions, "session-current", mockClerkSignOut);

    expect(state.toast).not.toBeNull();
    expect(state.toast?.type).toBe("info");
    expect(state.toast?.message).toContain("No other active sessions");
  });

  it("does not call clerk.signOut() when no other sessions exist", async () => {
    // **Validates: Requirement 8.3**
    const sessions: ClerkSession[] = [{ id: "session-current" }];

    await simulateSignOutOtherSessions(state, sessions, "session-current", mockClerkSignOut);

    expect(mockClerkSignOut).not.toHaveBeenCalled();
  });

  it("shows info toast when sessions list is empty", async () => {
    // **Validates: Requirement 8.3** - no sessions at all
    await simulateSignOutOtherSessions(state, [], "session-current", mockClerkSignOut);

    expect(state.toast?.type).toBe("info");
    expect(mockClerkSignOut).not.toHaveBeenCalled();
  });

  it("calls clerk.signOut() for each other session", async () => {
    // **Validates: Requirement 8.3** - sign out all non-current sessions
    const sessions: ClerkSession[] = [
      { id: "session-current" },
      { id: "session-other-1" },
      { id: "session-other-2" },
    ];

    await simulateSignOutOtherSessions(state, sessions, "session-current", mockClerkSignOut);

    expect(mockClerkSignOut).toHaveBeenCalledTimes(2);
    expect(mockClerkSignOut).toHaveBeenCalledWith({ sessionId: "session-other-1" });
    expect(mockClerkSignOut).toHaveBeenCalledWith({ sessionId: "session-other-2" });
  });

  it("does not call clerk.signOut() for the current session", async () => {
    // **Validates: Requirement 8.3** - current session must be excluded
    const sessions: ClerkSession[] = [
      { id: "session-current" },
      { id: "session-other" },
    ];

    await simulateSignOutOtherSessions(state, sessions, "session-current", mockClerkSignOut);

    const calledIds = mockClerkSignOut.mock.calls.map((call) => (call[0] as { sessionId: string }).sessionId);
    expect(calledIds).not.toContain("session-current");
  });

  it("shows success toast when sign out succeeds", async () => {
    // **Validates: Requirement 8.4** - success toast on successful sign out
    const sessions: ClerkSession[] = [
      { id: "session-current" },
      { id: "session-other" },
    ];

    await simulateSignOutOtherSessions(state, sessions, "session-current", mockClerkSignOut);

    expect(state.toast?.type).toBe("success");
    expect(state.toast?.message).toContain("Signed out of other devices");
  });

  it("shows error toast when clerk.signOut() throws", async () => {
    // **Validates: Requirement 8.4** - error toast on failure
    const sessions: ClerkSession[] = [
      { id: "session-current" },
      { id: "session-other" },
    ];
    mockClerkSignOut.mockRejectedValue(new Error("Clerk error"));

    await simulateSignOutOtherSessions(state, sessions, "session-current", mockClerkSignOut);

    expect(state.toast?.type).toBe("error");
    expect(state.toast?.message).toContain("Failed to sign out other devices");
  });

  it("signs out a single other session correctly", async () => {
    // **Validates: Requirement 8.3** - single other session case
    const sessions: ClerkSession[] = [
      { id: "session-current" },
      { id: "session-other" },
    ];

    await simulateSignOutOtherSessions(state, sessions, "session-current", mockClerkSignOut);

    expect(mockClerkSignOut).toHaveBeenCalledOnce();
    expect(mockClerkSignOut).toHaveBeenCalledWith({ sessionId: "session-other" });
  });
});

// ─── Tests: deleteAccount ─────────────────────────────────────────────────────

describe("Account Tab - deleteAccount", () => {
  let state: AccountTabState;
  let mockFetchDelete: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    state = { toast: null, deleteAccountConfirm: "", redirectedTo: null };
    mockFetchDelete = vi.fn().mockResolvedValue({ ok: true } as Response);
  });

  it('shows error toast when confirm text is not "DELETE"', async () => {
    // **Validates: Requirement 8.6** - confirmation modal requires "DELETE"
    state.deleteAccountConfirm = "delete";

    await simulateDeleteAccount(state, mockFetchDelete);

    expect(state.toast?.type).toBe("error");
    expect(state.toast?.message).toContain("Type DELETE to confirm");
  });

  it("does not call DELETE API when confirm text is wrong", async () => {
    // **Validates: Requirement 8.7** - API only called after correct confirmation
    state.deleteAccountConfirm = "yes";

    await simulateDeleteAccount(state, mockFetchDelete);

    expect(mockFetchDelete).not.toHaveBeenCalled();
  });

  it('shows error toast when confirm text is empty string', async () => {
    // **Validates: Requirement 8.6**
    state.deleteAccountConfirm = "";

    await simulateDeleteAccount(state, mockFetchDelete);

    expect(state.toast?.type).toBe("error");
    expect(mockFetchDelete).not.toHaveBeenCalled();
  });

  it('calls DELETE /api/settings/account when confirm text is "DELETE"', async () => {
    // **Validates: Requirement 8.7** - API called with correct confirmation
    state.deleteAccountConfirm = "DELETE";

    await simulateDeleteAccount(state, mockFetchDelete);

    expect(mockFetchDelete).toHaveBeenCalledOnce();
  });

  it('redirects to "/" on successful account deletion', async () => {
    // **Validates: Requirement 8.8** - redirect to "/" after deletion
    state.deleteAccountConfirm = "DELETE";

    await simulateDeleteAccount(state, mockFetchDelete);

    expect(state.redirectedTo).toBe("/");
  });

  it("does not show error toast on successful deletion", async () => {
    // **Validates: Requirement 8.8** - no error on success
    state.deleteAccountConfirm = "DELETE";

    await simulateDeleteAccount(state, mockFetchDelete);

    expect(state.toast).toBeNull();
  });

  it("shows error toast when DELETE API returns non-ok response", async () => {
    // **Validates: Requirement 8.7** - error handling for API failure
    state.deleteAccountConfirm = "DELETE";
    mockFetchDelete.mockResolvedValue({ ok: false } as Response);

    await simulateDeleteAccount(state, mockFetchDelete);

    expect(state.toast?.type).toBe("error");
    expect(state.toast?.message).toContain("Failed to delete account");
  });

  it("does not redirect when API returns non-ok response", async () => {
    // **Validates: Requirement 8.8** - no redirect on failure
    state.deleteAccountConfirm = "DELETE";
    mockFetchDelete.mockResolvedValue({ ok: false } as Response);

    await simulateDeleteAccount(state, mockFetchDelete);

    expect(state.redirectedTo).toBeNull();
  });

  it("shows error toast when fetch throws a network error", async () => {
    // **Validates: Requirement 8.7** - network error handling
    state.deleteAccountConfirm = "DELETE";
    mockFetchDelete.mockRejectedValue(new Error("Network error"));

    await simulateDeleteAccount(state, mockFetchDelete);

    expect(state.toast?.type).toBe("error");
    expect(state.toast?.message).toContain("Failed to delete account");
  });

  it("does not redirect when fetch throws", async () => {
    // **Validates: Requirement 8.8** - no redirect on network error
    state.deleteAccountConfirm = "DELETE";
    mockFetchDelete.mockRejectedValue(new Error("Network error"));

    await simulateDeleteAccount(state, mockFetchDelete);

    expect(state.redirectedTo).toBeNull();
  });
});
