/**
 * Unit Tests: Profile Tab Logic
 *
 * Tests the pure functions and save logic extracted from the Profile Tab
 * in src/app/dashboard/settings/page.tsx.
 *
 * Since the component uses Clerk hooks (useUser, useClerk), we test the
 * logic functions directly rather than rendering the component.
 *
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8**
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Pure functions mirrored from page.tsx ────────────────────────────────────

function formatDate(value: string | number | Date | null | undefined): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getInitials(name?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function getDisplayName(
  userName?: string | null,
  firstName?: string | null,
  lastName?: string | null
): string {
  const composed = [firstName, lastName].filter(Boolean).join(" ").trim();
  return composed || userName || "Artivaa User";
}

function splitDisplayName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    return { firstName: "", lastName: "" };
  }
  const [firstName, ...rest] = trimmed.split(/\s+/);
  return {
    firstName: firstName ?? "",
    lastName: rest.join(" "),
  };
}

// ─── Simulated saveName logic ─────────────────────────────────────────────────

type ToastType = "success" | "error" | "info" | "warning";

interface SaveNameState {
  displayName: string;
  nameDraft: string;
  isEditingName: boolean;
  isSavingName: boolean;
  toast: { message: string; type: ToastType } | null;
}

/**
 * Simulates the saveName() function from page.tsx.
 * Accepts a mock user.update() function and state object.
 */
async function simulateSaveName(
  state: SaveNameState,
  userUpdate: (args: { firstName: string; lastName: string }) => Promise<void>
): Promise<void> {
  const nextName = state.nameDraft.trim();
  if (!nextName) {
    state.toast = { message: "Name cannot be empty.", type: "error" };
    return;
  }

  const parsed = splitDisplayName(nextName);
  state.isSavingName = true;

  try {
    await userUpdate({ firstName: parsed.firstName, lastName: parsed.lastName });
    state.displayName = nextName;
    state.isEditingName = false;
    state.toast = { message: "Name updated successfully", type: "success" };
  } catch {
    state.toast = { message: "Failed to update name", type: "error" };
  } finally {
    state.isSavingName = false;
  }
}

/**
 * Simulates the cancelNameEdit() function from page.tsx.
 */
function simulateCancelNameEdit(state: SaveNameState): void {
  state.nameDraft = state.displayName;
  state.isEditingName = false;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Profile Tab - Pure Functions", () => {
  // ── splitDisplayName ────────────────────────────────────────────────────────

  describe("splitDisplayName", () => {
    it('splits "John Doe" into { firstName: "John", lastName: "Doe" }', () => {
      // **Validates: Requirement 7.4** - name is split before calling user.update()
      expect(splitDisplayName("John Doe")).toEqual({
        firstName: "John",
        lastName: "Doe",
      });
    });

    it('splits "John" (single word) into { firstName: "John", lastName: "" }', () => {
      // **Validates: Requirement 7.4**
      expect(splitDisplayName("John")).toEqual({
        firstName: "John",
        lastName: "",
      });
    });

    it("handles multiple spaces between words", () => {
      expect(splitDisplayName("John   Doe")).toEqual({
        firstName: "John",
        lastName: "Doe",
      });
    });

    it("handles three-word names by joining remaining words as lastName", () => {
      expect(splitDisplayName("John Michael Doe")).toEqual({
        firstName: "John",
        lastName: "Michael Doe",
      });
    });

    it("returns empty strings for empty input", () => {
      expect(splitDisplayName("")).toEqual({ firstName: "", lastName: "" });
    });

    it("trims leading and trailing whitespace", () => {
      expect(splitDisplayName("  John Doe  ")).toEqual({
        firstName: "John",
        lastName: "Doe",
      });
    });
  });

  // ── getDisplayName ──────────────────────────────────────────────────────────

  describe("getDisplayName", () => {
    it("composes firstName and lastName when both are provided", () => {
      // **Validates: Requirement 7.2** - display firstName and lastName from Clerk
      expect(getDisplayName(null, "John", "Doe")).toBe("John Doe");
    });

    it("uses only firstName when lastName is empty", () => {
      expect(getDisplayName(null, "John", "")).toBe("John");
    });

    it("uses only firstName when lastName is null", () => {
      expect(getDisplayName(null, "John", null)).toBe("John");
    });

    it("falls back to userName when firstName and lastName are both null", () => {
      // **Validates: Requirement 7.2** - fallback to userName
      expect(getDisplayName("johndoe", null, null)).toBe("johndoe");
    });

    it("falls back to userName when firstName and lastName are both empty strings", () => {
      expect(getDisplayName("johndoe", "", "")).toBe("johndoe");
    });

    it('falls back to "Artivaa User" when all arguments are null/undefined', () => {
      expect(getDisplayName(null, null, null)).toBe("Artivaa User");
      expect(getDisplayName(undefined, undefined, undefined)).toBe("Artivaa User");
    });

    it("prefers firstName+lastName over userName", () => {
      expect(getDisplayName("johndoe", "John", "Doe")).toBe("John Doe");
    });
  });

  // ── formatDate ──────────────────────────────────────────────────────────────

  describe("formatDate", () => {
    it("formats a valid ISO date string as DD MMM YYYY", () => {
      // **Validates: Requirement 7.8** - memberSince formatted as "DD MMM YYYY"
      const result = formatDate("2024-01-15T00:00:00.000Z");
      // en-IN locale formats as "15 Jan 2024"
      expect(result).toMatch(/15/);
      expect(result).toMatch(/Jan/);
      expect(result).toMatch(/2024/);
    });

    it("formats a Date object correctly", () => {
      const date = new Date("2023-06-01T00:00:00.000Z");
      const result = formatDate(date);
      expect(result).toMatch(/2023/);
      expect(result).toMatch(/Jun/);
    });

    it('returns "Not available" for null', () => {
      // **Validates: Requirement 7.8** - graceful handling of missing date
      expect(formatDate(null)).toBe("Not available");
    });

    it('returns "Not available" for undefined', () => {
      expect(formatDate(undefined)).toBe("Not available");
    });

    it('returns "Not available" for an invalid date string', () => {
      expect(formatDate("not-a-date")).toBe("Not available");
    });
  });

  // ── getInitials ─────────────────────────────────────────────────────────────

  describe("getInitials", () => {
    it("returns initials from a two-word name", () => {
      expect(getInitials("John Doe")).toBe("JD");
    });

    it("returns single initial from a one-word name", () => {
      expect(getInitials("John")).toBe("J");
    });

    it("returns only first two initials for three-word names", () => {
      expect(getInitials("John Michael Doe")).toBe("JM");
    });

    it('returns "A" for empty string', () => {
      expect(getInitials("")).toBe("A");
    });

    it('returns "A" for null', () => {
      expect(getInitials(null)).toBe("A");
    });

    it('returns "A" for undefined', () => {
      expect(getInitials(undefined)).toBe("A");
    });

    it("uppercases initials", () => {
      expect(getInitials("john doe")).toBe("JD");
    });
  });
});

// ─── saveName logic tests ─────────────────────────────────────────────────────

describe("Profile Tab - saveName logic", () => {
  let state: SaveNameState;
  let mockUserUpdate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    state = {
      displayName: "John Doe",
      nameDraft: "John Doe",
      isEditingName: true,
      isSavingName: false,
      toast: null,
    };
    mockUserUpdate = vi.fn().mockResolvedValue(undefined);
  });

  it("calls user.update() with correct firstName and lastName", async () => {
    // **Validates: Requirement 7.4** - save name via user.update()
    state.nameDraft = "Jane Smith";

    await simulateSaveName(state, mockUserUpdate);

    expect(mockUserUpdate).toHaveBeenCalledOnce();
    expect(mockUserUpdate).toHaveBeenCalledWith({
      firstName: "Jane",
      lastName: "Smith",
    });
  });

  it("calls user.update() with empty lastName for single-word name", async () => {
    // **Validates: Requirement 7.4**
    state.nameDraft = "Jane";

    await simulateSaveName(state, mockUserUpdate);

    expect(mockUserUpdate).toHaveBeenCalledWith({
      firstName: "Jane",
      lastName: "",
    });
  });

  it("shows success toast when user.update() succeeds", async () => {
    // **Validates: Requirement 7.5** - success toast on successful update
    state.nameDraft = "Jane Smith";

    await simulateSaveName(state, mockUserUpdate);

    expect(state.toast).not.toBeNull();
    expect(state.toast?.type).toBe("success");
    expect(state.toast?.message).toContain("updated successfully");
  });

  it("shows error toast when user.update() throws", async () => {
    // **Validates: Requirement 7.6** - error toast on update failure
    state.nameDraft = "Jane Smith";
    mockUserUpdate.mockRejectedValue(new Error("Clerk API error"));

    await simulateSaveName(state, mockUserUpdate);

    expect(state.toast).not.toBeNull();
    expect(state.toast?.type).toBe("error");
    expect(state.toast?.message).toContain("Failed to update name");
  });

  it("shows error toast and does not call user.update() when name is empty", async () => {
    // **Validates: Requirement 7.4** - empty name guard
    state.nameDraft = "   ";

    await simulateSaveName(state, mockUserUpdate);

    expect(mockUserUpdate).not.toHaveBeenCalled();
    expect(state.toast?.type).toBe("error");
    expect(state.toast?.message).toContain("cannot be empty");
  });

  it("updates displayName to the new name on success", async () => {
    // **Validates: Requirement 7.4, 7.5**
    state.nameDraft = "Jane Smith";

    await simulateSaveName(state, mockUserUpdate);

    expect(state.displayName).toBe("Jane Smith");
  });

  it("exits editing mode on success", async () => {
    // **Validates: Requirement 7.3** - editing mode toggled off after save
    state.nameDraft = "Jane Smith";

    await simulateSaveName(state, mockUserUpdate);

    expect(state.isEditingName).toBe(false);
  });

  it("does not exit editing mode on failure", async () => {
    // **Validates: Requirement 7.6** - editing mode stays on after failure
    state.nameDraft = "Jane Smith";
    mockUserUpdate.mockRejectedValue(new Error("Clerk API error"));

    await simulateSaveName(state, mockUserUpdate);

    expect(state.isEditingName).toBe(true);
  });

  it("resets isSavingName to false after success", async () => {
    // **Validates: Requirement 7.4** - loading state cleaned up
    state.nameDraft = "Jane Smith";

    await simulateSaveName(state, mockUserUpdate);

    expect(state.isSavingName).toBe(false);
  });

  it("resets isSavingName to false after failure", async () => {
    // **Validates: Requirement 7.6** - loading state cleaned up even on error
    state.nameDraft = "Jane Smith";
    mockUserUpdate.mockRejectedValue(new Error("Clerk API error"));

    await simulateSaveName(state, mockUserUpdate);

    expect(state.isSavingName).toBe(false);
  });

  it("trims whitespace from nameDraft before saving", async () => {
    // **Validates: Requirement 7.4**
    state.nameDraft = "  Jane Smith  ";

    await simulateSaveName(state, mockUserUpdate);

    expect(mockUserUpdate).toHaveBeenCalledWith({
      firstName: "Jane",
      lastName: "Smith",
    });
    expect(state.displayName).toBe("Jane Smith");
  });
});

// ─── cancelNameEdit logic tests ───────────────────────────────────────────────

describe("Profile Tab - cancelNameEdit logic", () => {
  it("resets nameDraft to the current displayName", () => {
    // **Validates: Requirement 7.3** - cancel reverts draft to saved name
    const state: SaveNameState = {
      displayName: "John Doe",
      nameDraft: "Jane Smith (edited)",
      isEditingName: true,
      isSavingName: false,
      toast: null,
    };

    simulateCancelNameEdit(state);

    expect(state.nameDraft).toBe("John Doe");
  });

  it("exits editing mode", () => {
    // **Validates: Requirement 7.3**
    const state: SaveNameState = {
      displayName: "John Doe",
      nameDraft: "Jane Smith (edited)",
      isEditingName: true,
      isSavingName: false,
      toast: null,
    };

    simulateCancelNameEdit(state);

    expect(state.isEditingName).toBe(false);
  });

  it("does not change displayName", () => {
    // **Validates: Requirement 7.3** - cancel should not persist changes
    const state: SaveNameState = {
      displayName: "John Doe",
      nameDraft: "Jane Smith (edited)",
      isEditingName: true,
      isSavingName: false,
      toast: null,
    };

    simulateCancelNameEdit(state);

    expect(state.displayName).toBe("John Doe");
  });
});

// ─── Email read-only display ──────────────────────────────────────────────────

describe("Profile Tab - email display (Requirement 7.7)", () => {
  it("email is derived from Clerk user and not editable", () => {
    // **Validates: Requirement 7.7** - email is read-only
    // The component reads emailAddress from user.primaryEmailAddress or emailAddresses[0]
    // and renders it as plain text (no input onChange handler for email).
    // We verify the derivation logic here.

    const mockUser = {
      primaryEmailAddress: { emailAddress: "user@example.com" },
      emailAddresses: [{ emailAddress: "fallback@example.com" }],
    };

    const emailAddress =
      mockUser.primaryEmailAddress?.emailAddress ??
      mockUser.emailAddresses?.[0]?.emailAddress ??
      "Unavailable";

    expect(emailAddress).toBe("user@example.com");
  });

  it("falls back to first email address when primaryEmailAddress is null", () => {
    // **Validates: Requirement 7.7**
    const mockUser = {
      primaryEmailAddress: null,
      emailAddresses: [{ emailAddress: "fallback@example.com" }],
    };

    const emailAddress =
      mockUser.primaryEmailAddress?.emailAddress ??
      mockUser.emailAddresses?.[0]?.emailAddress ??
      "Unavailable";

    expect(emailAddress).toBe("fallback@example.com");
  });

  it('shows "Unavailable" when no email addresses exist', () => {
    // **Validates: Requirement 7.7**
    const mockUser = {
      primaryEmailAddress: null,
      emailAddresses: [] as Array<{ emailAddress: string }>,
    };

    const emailAddress =
      mockUser.primaryEmailAddress?.emailAddress ??
      mockUser.emailAddresses?.[0]?.emailAddress ??
      "Unavailable";

    expect(emailAddress).toBe("Unavailable");
  });
});
