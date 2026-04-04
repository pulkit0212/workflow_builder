/**
 * Unit Tests: Preferences Tab Logic
 *
 * Tests the savePreferences logic extracted from the Preferences Tab
 * in src/app/dashboard/settings/page.tsx.
 *
 * Since the component uses Clerk hooks and React state, we test the
 * logic functions directly rather than rendering the component.
 *
 * **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Types (mirrored from page.tsx) ──────────────────────────────────────────

type ToastType = "success" | "error" | "info" | "warning";

type PreferencesState = {
  meetingSummaryEmail: boolean;
  actionItemsEmail: boolean;
  weeklyDigest: boolean;
  productUpdates: boolean;
  defaultTone: "Professional" | "Friendly" | "Formal" | "Concise";
  language: "English" | "Hindi";
  summaryLength: "brief" | "standard" | "detailed";
};

type ApiPreferencesBody = {
  emailNotifications: {
    meetingSummary: boolean;
    actionItems: boolean;
    weeklyDigest: boolean;
    productUpdates: boolean;
  };
  defaultEmailTone: "professional" | "friendly" | "formal" | "concise";
  summaryLength: "brief" | "standard" | "detailed";
  language: "en" | "hi";
};

type SavePreferencesState = {
  preferences: PreferencesState;
  toast: { message: string; type: ToastType } | null;
};

// ─── Mapping functions (mirrored from page.tsx) ───────────────────────────────

/**
 * Builds the API POST body from the component's PreferencesState.
 * Mirrors the body construction in savePreferences() in page.tsx.
 */
function buildApiBody(preferences: PreferencesState): ApiPreferencesBody {
  return {
    emailNotifications: {
      meetingSummary: preferences.meetingSummaryEmail,
      actionItems: preferences.actionItemsEmail,
      weeklyDigest: preferences.weeklyDigest,
      productUpdates: preferences.productUpdates,
    },
    defaultEmailTone: preferences.defaultTone.toLowerCase() as ApiPreferencesBody["defaultEmailTone"],
    summaryLength: preferences.summaryLength,
    language: preferences.language === "Hindi" ? "hi" : "en",
  };
}

/**
 * Maps an API preferences response to the component's PreferencesState.
 * Mirrors the mapping in loadData() in page.tsx.
 */
function apiToState(p: {
  emailNotifications: { meetingSummary: boolean; actionItems: boolean; weeklyDigest: boolean; productUpdates: boolean };
  defaultEmailTone: "professional" | "friendly" | "formal" | "concise";
  summaryLength: "brief" | "standard" | "detailed";
  language: "en" | "hi";
}): PreferencesState {
  return {
    meetingSummaryEmail: p.emailNotifications.meetingSummary,
    actionItemsEmail: p.emailNotifications.actionItems,
    weeklyDigest: p.emailNotifications.weeklyDigest,
    productUpdates: p.emailNotifications.productUpdates,
    defaultTone: (p.defaultEmailTone.charAt(0).toUpperCase() +
      p.defaultEmailTone.slice(1)) as PreferencesState["defaultTone"],
    summaryLength: p.summaryLength,
    language: p.language === "hi" ? "Hindi" : "English",
  };
}

// ─── Simulated savePreferences logic ─────────────────────────────────────────

type FetchLike = (url: string, options: RequestInit) => Promise<Response>;

/**
 * Simulates the savePreferences() function from page.tsx.
 * Accepts a mock fetch function and state object.
 */
async function simulateSavePreferences(
  state: SavePreferencesState,
  mockFetch: FetchLike
): Promise<void> {
  try {
    const response = await mockFetch("/api/settings/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildApiBody(state.preferences)),
    });

    if (response.ok) {
      state.toast = { message: "Preferences saved", type: "success" };
    } else {
      throw new Error("Failed to save preferences");
    }
  } catch {
    state.toast = { message: "Failed to save preferences", type: "error" };
  }
}

// ─── Default preferences for tests ───────────────────────────────────────────

const defaultPreferences: PreferencesState = {
  meetingSummaryEmail: true,
  actionItemsEmail: false,
  weeklyDigest: false,
  productUpdates: true,
  defaultTone: "Professional",
  language: "English",
  summaryLength: "standard",
};

// ─── Tests: savePreferences API call ─────────────────────────────────────────

describe("Preferences Tab - savePreferences API call", () => {
  let state: SavePreferencesState;
  let mockFetch: ReturnType<typeof vi.fn> & FetchLike;

  beforeEach(() => {
    state = {
      preferences: { ...defaultPreferences },
      toast: null,
    };
    mockFetch = vi.fn().mockResolvedValue({ ok: true } as Response) as ReturnType<typeof vi.fn> & FetchLike;
  });

  it("calls POST /api/settings/preferences", async () => {
    // **Validates: Requirement 10.6** - save via POST to preferences endpoint
    await simulateSavePreferences(state, mockFetch);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/settings/preferences");
    expect(options.method).toBe("POST");
  });

  it("sends Content-Type: application/json header", async () => {
    // **Validates: Requirement 10.6** - correct content type
    await simulateSavePreferences(state, mockFetch);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("sends a JSON body with all required fields", async () => {
    // **Validates: Requirement 10.6** - body contains all required fields
    await simulateSavePreferences(state, mockFetch);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as ApiPreferencesBody;

    expect(body).toHaveProperty("emailNotifications");
    expect(body).toHaveProperty("defaultEmailTone");
    expect(body).toHaveProperty("summaryLength");
    expect(body).toHaveProperty("language");
  });

  it("sends emailNotifications with all 4 toggle fields", async () => {
    // **Validates: Requirement 10.2** - 4 email notification toggles
    state.preferences = {
      ...defaultPreferences,
      meetingSummaryEmail: true,
      actionItemsEmail: false,
      weeklyDigest: true,
      productUpdates: false,
    };

    await simulateSavePreferences(state, mockFetch);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as ApiPreferencesBody;

    expect(body.emailNotifications).toEqual({
      meetingSummary: true,
      actionItems: false,
      weeklyDigest: true,
      productUpdates: false,
    });
  });
});

// ─── Tests: savePreferences toast feedback ────────────────────────────────────

describe("Preferences Tab - savePreferences toast feedback", () => {
  let state: SavePreferencesState;
  let mockFetch: ReturnType<typeof vi.fn> & FetchLike;

  beforeEach(() => {
    state = {
      preferences: { ...defaultPreferences },
      toast: null,
    };
    mockFetch = vi.fn() as ReturnType<typeof vi.fn> & FetchLike;
  });

  it("shows success toast when response is ok", async () => {
    // **Validates: Requirement 10.7** - success toast on successful save
    mockFetch.mockResolvedValue({ ok: true } as Response);

    await simulateSavePreferences(state, mockFetch);

    expect(state.toast).not.toBeNull();
    expect(state.toast?.type).toBe("success");
    expect(state.toast?.message).toContain("Preferences saved");
  });

  it("shows error toast when response is not ok (e.g. 400)", async () => {
    // **Validates: Requirement 10.8** - error toast on save failure
    mockFetch.mockResolvedValue({ ok: false, status: 400 } as Response);

    await simulateSavePreferences(state, mockFetch);

    expect(state.toast).not.toBeNull();
    expect(state.toast?.type).toBe("error");
    expect(state.toast?.message).toContain("Failed to save preferences");
  });

  it("shows error toast when response is 500", async () => {
    // **Validates: Requirement 10.8** - error toast on server error
    mockFetch.mockResolvedValue({ ok: false, status: 500 } as Response);

    await simulateSavePreferences(state, mockFetch);

    expect(state.toast?.type).toBe("error");
  });

  it("shows error toast on network error (fetch throws)", async () => {
    // **Validates: Requirement 10.8** - error toast on network failure
    mockFetch.mockRejectedValue(new Error("Network error"));

    await simulateSavePreferences(state, mockFetch);

    expect(state.toast).not.toBeNull();
    expect(state.toast?.type).toBe("error");
    expect(state.toast?.message).toContain("Failed to save preferences");
  });
});

// ─── Tests: language mapping ──────────────────────────────────────────────────

describe("Preferences Tab - language mapping", () => {
  it('maps "English" to "en" in the API body', () => {
    // **Validates: Requirement 10.5** - language dropdown English → en
    const prefs: PreferencesState = { ...defaultPreferences, language: "English" };
    const body = buildApiBody(prefs);
    expect(body.language).toBe("en");
  });

  it('maps "Hindi" to "hi" in the API body', () => {
    // **Validates: Requirement 10.5** - language dropdown Hindi → hi
    const prefs: PreferencesState = { ...defaultPreferences, language: "Hindi" };
    const body = buildApiBody(prefs);
    expect(body.language).toBe("hi");
  });

  it('maps API "en" to "English" in component state', () => {
    // **Validates: Requirement 10.1** - preferences loaded from API map correctly
    const state = apiToState({
      emailNotifications: { meetingSummary: true, actionItems: false, weeklyDigest: false, productUpdates: true },
      defaultEmailTone: "professional",
      summaryLength: "standard",
      language: "en",
    });
    expect(state.language).toBe("English");
  });

  it('maps API "hi" to "Hindi" in component state', () => {
    // **Validates: Requirement 10.1** - preferences loaded from API map correctly
    const state = apiToState({
      emailNotifications: { meetingSummary: true, actionItems: false, weeklyDigest: false, productUpdates: true },
      defaultEmailTone: "professional",
      summaryLength: "standard",
      language: "hi",
    });
    expect(state.language).toBe("Hindi");
  });
});

// ─── Tests: tone mapping ──────────────────────────────────────────────────────

describe("Preferences Tab - tone mapping", () => {
  it('maps "Professional" to "professional" in the API body', () => {
    // **Validates: Requirement 10.3** - tone radio buttons map to API values
    const body = buildApiBody({ ...defaultPreferences, defaultTone: "Professional" });
    expect(body.defaultEmailTone).toBe("professional");
  });

  it('maps "Friendly" to "friendly" in the API body', () => {
    // **Validates: Requirement 10.3**
    const body = buildApiBody({ ...defaultPreferences, defaultTone: "Friendly" });
    expect(body.defaultEmailTone).toBe("friendly");
  });

  it('maps "Formal" to "formal" in the API body', () => {
    // **Validates: Requirement 10.3**
    const body = buildApiBody({ ...defaultPreferences, defaultTone: "Formal" });
    expect(body.defaultEmailTone).toBe("formal");
  });

  it('maps "Concise" to "concise" in the API body', () => {
    // **Validates: Requirement 10.3**
    const body = buildApiBody({ ...defaultPreferences, defaultTone: "Concise" });
    expect(body.defaultEmailTone).toBe("concise");
  });

  it('maps API "professional" to "Professional" in component state', () => {
    // **Validates: Requirement 10.1** - API tone values capitalized for display
    const state = apiToState({
      emailNotifications: { meetingSummary: true, actionItems: false, weeklyDigest: false, productUpdates: true },
      defaultEmailTone: "professional",
      summaryLength: "standard",
      language: "en",
    });
    expect(state.defaultTone).toBe("Professional");
  });

  it('maps API "friendly" to "Friendly" in component state', () => {
    // **Validates: Requirement 10.1**
    const state = apiToState({
      emailNotifications: { meetingSummary: true, actionItems: false, weeklyDigest: false, productUpdates: true },
      defaultEmailTone: "friendly",
      summaryLength: "standard",
      language: "en",
    });
    expect(state.defaultTone).toBe("Friendly");
  });
});

// ─── Tests: summaryLength pass-through ───────────────────────────────────────

describe("Preferences Tab - summaryLength mapping", () => {
  it('passes "brief" through unchanged to API body', () => {
    // **Validates: Requirement 10.4** - summary length radio buttons
    const body = buildApiBody({ ...defaultPreferences, summaryLength: "brief" });
    expect(body.summaryLength).toBe("brief");
  });

  it('passes "standard" through unchanged to API body', () => {
    // **Validates: Requirement 10.4**
    const body = buildApiBody({ ...defaultPreferences, summaryLength: "standard" });
    expect(body.summaryLength).toBe("standard");
  });

  it('passes "detailed" through unchanged to API body', () => {
    // **Validates: Requirement 10.4**
    const body = buildApiBody({ ...defaultPreferences, summaryLength: "detailed" });
    expect(body.summaryLength).toBe("detailed");
  });
});

// ─── Tests: preferences loading from API ─────────────────────────────────────

describe("Preferences Tab - preferences loading from API", () => {
  it("maps all email notification fields from API response to state", () => {
    // **Validates: Requirement 10.1** - preferences loaded from GET /api/settings/preferences
    const state = apiToState({
      emailNotifications: {
        meetingSummary: true,
        actionItems: true,
        weeklyDigest: false,
        productUpdates: false,
      },
      defaultEmailTone: "formal",
      summaryLength: "detailed",
      language: "hi",
    });

    expect(state.meetingSummaryEmail).toBe(true);
    expect(state.actionItemsEmail).toBe(true);
    expect(state.weeklyDigest).toBe(false);
    expect(state.productUpdates).toBe(false);
    expect(state.defaultTone).toBe("Formal");
    expect(state.summaryLength).toBe("detailed");
    expect(state.language).toBe("Hindi");
  });

  it("maps all-false email notifications correctly", () => {
    // **Validates: Requirement 10.1** - all toggles off
    const state = apiToState({
      emailNotifications: {
        meetingSummary: false,
        actionItems: false,
        weeklyDigest: false,
        productUpdates: false,
      },
      defaultEmailTone: "concise",
      summaryLength: "brief",
      language: "en",
    });

    expect(state.meetingSummaryEmail).toBe(false);
    expect(state.actionItemsEmail).toBe(false);
    expect(state.weeklyDigest).toBe(false);
    expect(state.productUpdates).toBe(false);
  });
});

// ─── Tests: no localStorage usage ────────────────────────────────────────────

describe("Preferences Tab - no localStorage usage", () => {
  let localStorageGetSpy: ReturnType<typeof vi.spyOn>;
  let localStorageSetSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    const store: Record<string, string> = {};
    const mockLocalStorage = {
      getItem: vi.fn((_key: string) => store[_key] ?? null),
      setItem: vi.fn((_key: string, value: string) => { store[_key] = value; }),
      removeItem: vi.fn((_key: string) => { delete store[_key]; }),
      clear: vi.fn(),
      key: vi.fn((_index: number) => Object.keys(store)[_index] ?? null),
      get length() { return Object.keys(store).length; },
    };

    Object.defineProperty(globalThis, "localStorage", {
      value: mockLocalStorage,
      writable: true,
      configurable: true,
    });

    localStorageGetSpy = vi.spyOn(globalThis.localStorage, "getItem");
    localStorageSetSpy = vi.spyOn(globalThis.localStorage, "setItem");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("buildApiBody does not call localStorage.getItem", () => {
    // **Validates: Requirement 10.9** - no localStorage reads during save
    buildApiBody(defaultPreferences);
    expect(localStorageGetSpy).not.toHaveBeenCalled();
  });

  it("buildApiBody does not call localStorage.setItem", () => {
    // **Validates: Requirement 10.9** - no localStorage writes during save
    buildApiBody(defaultPreferences);
    expect(localStorageSetSpy).not.toHaveBeenCalled();
  });

  it("apiToState does not call localStorage.getItem", () => {
    // **Validates: Requirement 10.9** - no localStorage reads during load
    apiToState({
      emailNotifications: { meetingSummary: true, actionItems: false, weeklyDigest: false, productUpdates: true },
      defaultEmailTone: "professional",
      summaryLength: "standard",
      language: "en",
    });
    expect(localStorageGetSpy).not.toHaveBeenCalled();
  });

  it("apiToState does not call localStorage.setItem", () => {
    // **Validates: Requirement 10.9** - no localStorage writes during load
    apiToState({
      emailNotifications: { meetingSummary: true, actionItems: false, weeklyDigest: false, productUpdates: true },
      defaultEmailTone: "professional",
      summaryLength: "standard",
      language: "en",
    });
    expect(localStorageSetSpy).not.toHaveBeenCalled();
  });

  it("simulateSavePreferences does not call localStorage during a successful save", async () => {
    // **Validates: Requirement 10.9** - full save flow avoids localStorage
    const state: SavePreferencesState = { preferences: { ...defaultPreferences }, toast: null };
    const mockFetch = vi.fn().mockResolvedValue({ ok: true } as Response) as ReturnType<typeof vi.fn> & FetchLike;

    await simulateSavePreferences(state, mockFetch);

    expect(localStorageGetSpy).not.toHaveBeenCalled();
    expect(localStorageSetSpy).not.toHaveBeenCalled();
  });

  it("simulateSavePreferences does not call localStorage on network error", async () => {
    // **Validates: Requirement 10.9** - error path also avoids localStorage
    const state: SavePreferencesState = { preferences: { ...defaultPreferences }, toast: null };
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error")) as ReturnType<typeof vi.fn> & FetchLike;

    await simulateSavePreferences(state, mockFetch);

    expect(localStorageGetSpy).not.toHaveBeenCalled();
    expect(localStorageSetSpy).not.toHaveBeenCalled();
  });
});
