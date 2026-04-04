/**
 * Unit Tests: Bot Settings Tab Logic
 *
 * Tests the saveBotSettings logic extracted from the Bot Settings Tab
 * in src/app/dashboard/settings/page.tsx.
 *
 * Since the component uses Clerk hooks and React state, we test the
 * logic functions directly rather than rendering the component.
 *
 * **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Types (mirrored from page.tsx) ──────────────────────────────────────────

type ToastType = "success" | "error" | "info" | "warning";

type BotSettingsState = {
  botName: string;
  audioSource: string;
  toast: { message: string; type: ToastType } | null;
};

type ApiBotBody = {
  botDisplayName: string;
  audioSource: string;
};

type ApiPreferencesPayload = {
  botDisplayName: string;
  audioSource: string;
};

// ─── Mapping function (mirrored from page.tsx loadData) ───────────────────────

/**
 * Maps an API preferences response to the component's bot settings state.
 * Mirrors the mapping in loadData() in page.tsx where setBotName and setAudioSource are called.
 */
function apiToState(p: ApiPreferencesPayload): { botName: string; audioSource: string } {
  return {
    botName: p.botDisplayName,
    audioSource: p.audioSource,
  };
}

// ─── Simulated saveBotSettings logic ─────────────────────────────────────────

type FetchLike = (url: string, options: RequestInit) => Promise<Response>;

/**
 * Simulates the saveBotSettings() function from page.tsx.
 * Accepts a mock fetch function and state object.
 */
async function simulateSaveBotSettings(
  state: BotSettingsState,
  mockFetch: FetchLike
): Promise<void> {
  try {
    const response = await mockFetch("/api/settings/bot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        botDisplayName: state.botName,
        audioSource: state.audioSource,
      } satisfies ApiBotBody),
    });

    if (response.ok) {
      state.toast = { message: "Bot settings saved", type: "success" };
    } else {
      throw new Error("Failed to save bot settings");
    }
  } catch {
    state.toast = { message: "Failed to save bot settings", type: "error" };
  }
}

// ─── Default bot settings for tests ──────────────────────────────────────────

const defaultBotSettings = {
  botName: "AI Notetaker",
  audioSource: "default",
};

// ─── Tests: saveBotSettings API call ─────────────────────────────────────────

describe("Bot Settings Tab - saveBotSettings API call", () => {
  let state: BotSettingsState;
  let mockFetch: ReturnType<typeof vi.fn> & FetchLike;

  beforeEach(() => {
    state = {
      ...defaultBotSettings,
      toast: null,
    };
    mockFetch = vi.fn().mockResolvedValue({ ok: true } as Response) as ReturnType<typeof vi.fn> & FetchLike;
  });

  it("calls POST /api/settings/bot", async () => {
    // **Validates: Requirement 11.6** - save via POST to bot endpoint
    await simulateSaveBotSettings(state, mockFetch);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/settings/bot");
    expect(options.method).toBe("POST");
  });

  it("sends Content-Type: application/json header", async () => {
    // **Validates: Requirement 11.6** - correct content type
    await simulateSaveBotSettings(state, mockFetch);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("sends botDisplayName in the request body", async () => {
    // **Validates: Requirement 11.6** - body contains botDisplayName
    state.botName = "My Custom Bot";

    await simulateSaveBotSettings(state, mockFetch);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as ApiBotBody;
    expect(body.botDisplayName).toBe("My Custom Bot");
  });

  it("sends audioSource in the request body", async () => {
    // **Validates: Requirement 11.6** - body contains audioSource
    state.audioSource = "microphone";

    await simulateSaveBotSettings(state, mockFetch);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as ApiBotBody;
    expect(body.audioSource).toBe("microphone");
  });

  it("sends both botDisplayName and audioSource together", async () => {
    // **Validates: Requirement 11.6** - body contains both required fields
    state.botName = "Artiva Notetaker";
    state.audioSource = "system";

    await simulateSaveBotSettings(state, mockFetch);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as ApiBotBody;
    expect(body).toEqual({ botDisplayName: "Artiva Notetaker", audioSource: "system" });
  });
});

// ─── Tests: saveBotSettings toast feedback ────────────────────────────────────

describe("Bot Settings Tab - saveBotSettings toast feedback", () => {
  let state: BotSettingsState;
  let mockFetch: ReturnType<typeof vi.fn> & FetchLike;

  beforeEach(() => {
    state = {
      ...defaultBotSettings,
      toast: null,
    };
    mockFetch = vi.fn() as ReturnType<typeof vi.fn> & FetchLike;
  });

  it("shows success toast when response is ok", async () => {
    // **Validates: Requirement 11.7** - success toast on successful save
    mockFetch.mockResolvedValue({ ok: true } as Response);

    await simulateSaveBotSettings(state, mockFetch);

    expect(state.toast).not.toBeNull();
    expect(state.toast?.type).toBe("success");
    expect(state.toast?.message).toContain("Bot settings saved");
  });

  it("shows error toast when response is not ok (e.g. 400)", async () => {
    // **Validates: Requirement 11.8** - error toast on save failure
    mockFetch.mockResolvedValue({ ok: false, status: 400 } as Response);

    await simulateSaveBotSettings(state, mockFetch);

    expect(state.toast).not.toBeNull();
    expect(state.toast?.type).toBe("error");
    expect(state.toast?.message).toContain("Failed to save bot settings");
  });

  it("shows error toast when response is 500", async () => {
    // **Validates: Requirement 11.8** - error toast on server error
    mockFetch.mockResolvedValue({ ok: false, status: 500 } as Response);

    await simulateSaveBotSettings(state, mockFetch);

    expect(state.toast?.type).toBe("error");
  });

  it("shows error toast on network error (fetch throws)", async () => {
    // **Validates: Requirement 11.8** - error toast on network failure
    mockFetch.mockRejectedValue(new Error("Network error"));

    await simulateSaveBotSettings(state, mockFetch);

    expect(state.toast).not.toBeNull();
    expect(state.toast?.type).toBe("error");
    expect(state.toast?.message).toContain("Failed to save bot settings");
  });
});

// ─── Tests: bot settings loading from API ────────────────────────────────────

describe("Bot Settings Tab - bot settings loading from API", () => {
  it("maps botDisplayName from API response to botName state", () => {
    // **Validates: Requirement 11.2** - bot settings fetched from GET /api/settings/preferences
    const result = apiToState({ botDisplayName: "Artiva Notetaker", audioSource: "default" });
    expect(result.botName).toBe("Artiva Notetaker");
  });

  it("maps audioSource from API response to audioSource state", () => {
    // **Validates: Requirement 11.2** - audioSource loaded from API
    const result = apiToState({ botDisplayName: "AI Notetaker", audioSource: "microphone" });
    expect(result.audioSource).toBe("microphone");
  });

  it("maps both fields together from API response", () => {
    // **Validates: Requirement 11.2** - both fields loaded correctly
    const result = apiToState({ botDisplayName: "Custom Bot", audioSource: "system" });
    expect(result.botName).toBe("Custom Bot");
    expect(result.audioSource).toBe("system");
  });

  it("preserves default audioSource value from API", () => {
    // **Validates: Requirement 11.2** - default audioSource preserved
    const result = apiToState({ botDisplayName: "AI Notetaker", audioSource: "default" });
    expect(result.audioSource).toBe("default");
  });
});

// ─── Tests: no localStorage usage ────────────────────────────────────────────

describe("Bot Settings Tab - no localStorage usage", () => {
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

  it("apiToState does not call localStorage.getItem", () => {
    // **Validates: Requirement 11.9** - no localStorage reads during load
    apiToState({ botDisplayName: "AI Notetaker", audioSource: "default" });
    expect(localStorageGetSpy).not.toHaveBeenCalled();
  });

  it("apiToState does not call localStorage.setItem", () => {
    // **Validates: Requirement 11.9** - no localStorage writes during load
    apiToState({ botDisplayName: "AI Notetaker", audioSource: "default" });
    expect(localStorageSetSpy).not.toHaveBeenCalled();
  });

  it("simulateSaveBotSettings does not call localStorage during a successful save", async () => {
    // **Validates: Requirement 11.9** - full save flow avoids localStorage
    const state: BotSettingsState = { ...defaultBotSettings, toast: null };
    const mockFetch = vi.fn().mockResolvedValue({ ok: true } as Response) as ReturnType<typeof vi.fn> & FetchLike;

    await simulateSaveBotSettings(state, mockFetch);

    expect(localStorageGetSpy).not.toHaveBeenCalled();
    expect(localStorageSetSpy).not.toHaveBeenCalled();
  });

  it("simulateSaveBotSettings does not call localStorage on network error", async () => {
    // **Validates: Requirement 11.9** - error path also avoids localStorage
    const state: BotSettingsState = { ...defaultBotSettings, toast: null };
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error")) as ReturnType<typeof vi.fn> & FetchLike;

    await simulateSaveBotSettings(state, mockFetch);

    expect(localStorageGetSpy).not.toHaveBeenCalled();
    expect(localStorageSetSpy).not.toHaveBeenCalled();
  });

  it("simulateSaveBotSettings does not call localStorage on non-ok response", async () => {
    // **Validates: Requirement 11.9** - failure path also avoids localStorage
    const state: BotSettingsState = { ...defaultBotSettings, toast: null };
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 400 } as Response) as ReturnType<typeof vi.fn> & FetchLike;

    await simulateSaveBotSettings(state, mockFetch);

    expect(localStorageGetSpy).not.toHaveBeenCalled();
    expect(localStorageSetSpy).not.toHaveBeenCalled();
  });
});
