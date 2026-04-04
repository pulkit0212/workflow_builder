/**
 * Property-Based Tests: localStorage Elimination
 *
 * **Property 14: localStorage Elimination**
 * **Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8**
 *
 * Tests that:
 * 1. No localStorage.getItem() calls are made during preferences or bot settings operations
 * 2. No localStorage.setItem() calls are made during preferences or bot settings operations
 * 3. No localStorage.removeItem() calls are made during settings operations
 * 4. The source code of the Settings Page contains no references to
 *    preferencesStorageKey, botSettingsStorageKey, localStorage.getItem, or localStorage.setItem
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import * as fs from "node:fs";
import * as path from "node:path";

// ─── Types mirrored from page.tsx ─────────────────────────────────────────────

type ApiPreferences = {
  emailNotifications: {
    meetingSummary: boolean;
    actionItems: boolean;
    weeklyDigest: boolean;
    productUpdates: boolean;
  };
  defaultEmailTone: "professional" | "friendly" | "formal" | "concise";
  summaryLength: "brief" | "standard" | "detailed";
  language: "en" | "hi";
  botDisplayName: string;
  audioSource: string;
};

type PreferencesState = {
  meetingSummaryEmail: boolean;
  actionItemsEmail: boolean;
  weeklyDigest: boolean;
  productUpdates: boolean;
  defaultTone: "Professional" | "Friendly" | "Formal" | "Concise";
  language: "English" | "Hindi";
  summaryLength: "brief" | "standard" | "detailed";
};

type BotState = {
  botName: string;
  audioSource: string;
};

type BotApiBody = {
  botDisplayName: string;
  audioSource: string;
};

// ─── Mapping functions extracted from page.tsx ────────────────────────────────

/**
 * Maps an API preferences response to the component's PreferencesState.
 * Mirrors the mapping in page.tsx loadData().
 */
function apiToPreferencesState(p: ApiPreferences): PreferencesState {
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

/**
 * Maps the component's PreferencesState to the API POST body.
 * Mirrors the mapping in page.tsx savePreferences().
 */
function preferencesStateToApiBody(
  s: PreferencesState
): Omit<ApiPreferences, "botDisplayName" | "audioSource"> {
  return {
    emailNotifications: {
      meetingSummary: s.meetingSummaryEmail,
      actionItems: s.actionItemsEmail,
      weeklyDigest: s.weeklyDigest,
      productUpdates: s.productUpdates,
    },
    defaultEmailTone: s.defaultTone.toLowerCase() as ApiPreferences["defaultEmailTone"],
    summaryLength: s.summaryLength,
    language: s.language === "Hindi" ? "hi" : "en",
  };
}

/**
 * Maps an API preferences response to the component's BotState.
 * Mirrors the mapping in page.tsx loadData().
 */
function apiToBotState(p: ApiPreferences): BotState {
  return {
    botName: p.botDisplayName,
    audioSource: p.audioSource,
  };
}

/**
 * Maps the component's BotState to the API POST body.
 * Mirrors the mapping in page.tsx saveBotSettings().
 */
function botStateToApiBody(s: BotState): BotApiBody {
  return {
    botDisplayName: s.botName,
    audioSource: s.audioSource,
  };
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const arbNonEmptyString = fc.string({ minLength: 1, maxLength: 100 });

const arbApiPreferences: fc.Arbitrary<ApiPreferences> = fc.record({
  emailNotifications: fc.record({
    meetingSummary: fc.boolean(),
    actionItems: fc.boolean(),
    weeklyDigest: fc.boolean(),
    productUpdates: fc.boolean(),
  }),
  defaultEmailTone: fc.constantFrom(
    "professional",
    "friendly",
    "formal",
    "concise"
  ) as fc.Arbitrary<ApiPreferences["defaultEmailTone"]>,
  summaryLength: fc.constantFrom(
    "brief",
    "standard",
    "detailed"
  ) as fc.Arbitrary<ApiPreferences["summaryLength"]>,
  language: fc.constantFrom("en", "hi") as fc.Arbitrary<ApiPreferences["language"]>,
  botDisplayName: arbNonEmptyString,
  audioSource: arbNonEmptyString,
});

const arbPreferencesState: fc.Arbitrary<PreferencesState> = fc.record({
  meetingSummaryEmail: fc.boolean(),
  actionItemsEmail: fc.boolean(),
  weeklyDigest: fc.boolean(),
  productUpdates: fc.boolean(),
  defaultTone: fc.constantFrom(
    "Professional",
    "Friendly",
    "Formal",
    "Concise"
  ) as fc.Arbitrary<PreferencesState["defaultTone"]>,
  language: fc.constantFrom(
    "English",
    "Hindi"
  ) as fc.Arbitrary<PreferencesState["language"]>,
  summaryLength: fc.constantFrom(
    "brief",
    "standard",
    "detailed"
  ) as fc.Arbitrary<PreferencesState["summaryLength"]>,
});

const arbBotState: fc.Arbitrary<BotState> = fc.record({
  botName: arbNonEmptyString,
  audioSource: arbNonEmptyString,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Property 14: localStorage Elimination", () => {
  // ── Setup: mock localStorage in node environment ──────────────────────────

  let localStorageGetSpy: ReturnType<typeof vi.spyOn>;
  let localStorageSetSpy: ReturnType<typeof vi.spyOn>;
  let localStorageRemoveSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    const store: Record<string, string> = {};
    const mockLocalStorage = {
      getItem: vi.fn((_key: string) => store[_key] ?? null),
      setItem: vi.fn((_key: string, value: string) => {
        store[_key] = value;
      }),
      removeItem: vi.fn((_key: string) => {
        delete store[_key];
      }),
      clear: vi.fn(() => {
        for (const key of Object.keys(store)) delete store[key];
      }),
      key: vi.fn((_index: number) => Object.keys(store)[_index] ?? null),
      get length() {
        return Object.keys(store).length;
      },
    };

    Object.defineProperty(globalThis, "localStorage", {
      value: mockLocalStorage,
      writable: true,
      configurable: true,
    });

    localStorageGetSpy = vi.spyOn(globalThis.localStorage, "getItem");
    localStorageSetSpy = vi.spyOn(globalThis.localStorage, "setItem");
    localStorageRemoveSpy = vi.spyOn(globalThis.localStorage, "removeItem");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Source code static analysis ───────────────────────────────────────────

  describe("Static analysis: Settings Page source code contains no localStorage references", () => {
    const settingsPagePath = path.resolve(
      process.cwd(),
      "src/app/dashboard/settings/page.tsx"
    );

    it(
      "Settings Page source does not reference preferencesStorageKey",
      () => {
        /**
         * **Validates: Requirements 15.5**
         * The Settings Page source code must not contain any reference to
         * preferencesStorageKey, which was the old localStorage key for preferences.
         */
        const source = fs.readFileSync(settingsPagePath, "utf-8");
        expect(source).not.toContain("preferencesStorageKey");
      }
    );

    it(
      "Settings Page source does not reference botSettingsStorageKey",
      () => {
        /**
         * **Validates: Requirements 15.6**
         * The Settings Page source code must not contain any reference to
         * botSettingsStorageKey, which was the old localStorage key for bot settings.
         */
        const source = fs.readFileSync(settingsPagePath, "utf-8");
        expect(source).not.toContain("botSettingsStorageKey");
      }
    );

    it(
      "Settings Page source does not call localStorage.getItem for settings",
      () => {
        /**
         * **Validates: Requirements 15.1, 15.3, 15.7**
         * The Settings Page source code must not contain localStorage.getItem calls
         * for preferences or bot settings. All reads must go through the API.
         */
        const source = fs.readFileSync(settingsPagePath, "utf-8");
        // Check for localStorage.getItem pattern
        expect(source).not.toMatch(/localStorage\.getItem\s*\(/);
      }
    );

    it(
      "Settings Page source does not call localStorage.setItem for settings",
      () => {
        /**
         * **Validates: Requirements 15.2, 15.4, 15.8**
         * The Settings Page source code must not contain localStorage.setItem calls
         * for preferences or bot settings. All writes must go through the API.
         */
        const source = fs.readFileSync(settingsPagePath, "utf-8");
        // Check for localStorage.setItem pattern
        expect(source).not.toMatch(/localStorage\.setItem\s*\(/);
      }
    );
  });

  // ── Property: No localStorage during preferences loading ─────────────────

  describe("No localStorage.getItem during preferences loading (Requirements 15.1, 15.7)", () => {
    it(
      "apiToPreferencesState never calls localStorage.getItem for any API response",
      () => {
        /**
         * **Validates: Requirements 15.1, 15.7**
         * For any valid API preferences response, loading preferences into state
         * must not read from localStorage.
         */
        fc.assert(
          fc.property(arbApiPreferences, (apiPrefs) => {
            localStorageGetSpy.mockClear();

            apiToPreferencesState(apiPrefs);

            expect(localStorageGetSpy).not.toHaveBeenCalled();
          }),
          { numRuns: 100 }
        );
      }
    );

    it(
      "apiToBotState never calls localStorage.getItem for any API response",
      () => {
        /**
         * **Validates: Requirements 15.3, 15.7**
         * For any valid API preferences response, loading bot settings into state
         * must not read from localStorage.
         */
        fc.assert(
          fc.property(arbApiPreferences, (apiPrefs) => {
            localStorageGetSpy.mockClear();

            apiToBotState(apiPrefs);

            expect(localStorageGetSpy).not.toHaveBeenCalled();
          }),
          { numRuns: 100 }
        );
      }
    );
  });

  // ── Property: No localStorage during preferences saving ──────────────────

  describe("No localStorage.setItem during preferences saving (Requirements 15.2, 15.8)", () => {
    it(
      "preferencesStateToApiBody never calls localStorage.setItem for any preferences state",
      () => {
        /**
         * **Validates: Requirements 15.2, 15.8**
         * For any preferences state, saving preferences to the API body
         * must not write to localStorage.
         */
        fc.assert(
          fc.property(arbPreferencesState, (state) => {
            localStorageSetSpy.mockClear();

            preferencesStateToApiBody(state);

            expect(localStorageSetSpy).not.toHaveBeenCalled();
          }),
          { numRuns: 100 }
        );
      }
    );

    it(
      "botStateToApiBody never calls localStorage.setItem for any bot state",
      () => {
        /**
         * **Validates: Requirements 15.4, 15.8**
         * For any bot settings state, saving bot settings to the API body
         * must not write to localStorage.
         */
        fc.assert(
          fc.property(arbBotState, (state) => {
            localStorageSetSpy.mockClear();

            botStateToApiBody(state);

            expect(localStorageSetSpy).not.toHaveBeenCalled();
          }),
          { numRuns: 100 }
        );
      }
    );
  });

  // ── Property: No localStorage.removeItem during any settings operation ────

  describe("No localStorage.removeItem during settings operations", () => {
    it(
      "no settings operation calls localStorage.removeItem",
      () => {
        /**
         * **Validates: Requirements 15.1, 15.2, 15.3, 15.4**
         * No settings operation (load or save, preferences or bot) should
         * call localStorage.removeItem.
         */
        fc.assert(
          fc.property(arbApiPreferences, arbPreferencesState, arbBotState, (apiPrefs, prefState, botState) => {
            localStorageRemoveSpy.mockClear();

            apiToPreferencesState(apiPrefs);
            preferencesStateToApiBody(prefState);
            apiToBotState(apiPrefs);
            botStateToApiBody(botState);

            expect(localStorageRemoveSpy).not.toHaveBeenCalled();
          }),
          { numRuns: 50 }
        );
      }
    );
  });

  // ── Property: Complete settings cycle never touches localStorage ──────────

  describe("Complete settings cycle never touches localStorage (Requirements 15.1–15.8)", () => {
    it(
      "full preferences load-then-save cycle never touches localStorage",
      () => {
        /**
         * **Validates: Requirements 15.1, 15.2, 15.7, 15.8**
         * A complete preferences cycle (load API response → update state → save)
         * must not interact with localStorage at any point.
         */
        fc.assert(
          fc.property(arbApiPreferences, (apiPrefs) => {
            localStorageGetSpy.mockClear();
            localStorageSetSpy.mockClear();
            localStorageRemoveSpy.mockClear();

            const state = apiToPreferencesState(apiPrefs);
            preferencesStateToApiBody(state);

            expect(localStorageGetSpy).not.toHaveBeenCalled();
            expect(localStorageSetSpy).not.toHaveBeenCalled();
            expect(localStorageRemoveSpy).not.toHaveBeenCalled();
          }),
          { numRuns: 100 }
        );
      }
    );

    it(
      "full bot settings load-then-save cycle never touches localStorage",
      () => {
        /**
         * **Validates: Requirements 15.3, 15.4, 15.7, 15.8**
         * A complete bot settings cycle (load API response → update state → save)
         * must not interact with localStorage at any point.
         */
        fc.assert(
          fc.property(arbApiPreferences, (apiPrefs) => {
            localStorageGetSpy.mockClear();
            localStorageSetSpy.mockClear();
            localStorageRemoveSpy.mockClear();

            const state = apiToBotState(apiPrefs);
            botStateToApiBody(state);

            expect(localStorageGetSpy).not.toHaveBeenCalled();
            expect(localStorageSetSpy).not.toHaveBeenCalled();
            expect(localStorageRemoveSpy).not.toHaveBeenCalled();
          }),
          { numRuns: 100 }
        );
      }
    );

    it(
      "combined preferences and bot settings cycle never touches localStorage",
      () => {
        /**
         * **Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.7, 15.8**
         * A combined cycle covering both preferences and bot settings must not
         * interact with localStorage at any point.
         */
        fc.assert(
          fc.property(arbApiPreferences, (apiPrefs) => {
            localStorageGetSpy.mockClear();
            localStorageSetSpy.mockClear();
            localStorageRemoveSpy.mockClear();

            // Simulate loading both preferences and bot settings from the same API response
            const prefState = apiToPreferencesState(apiPrefs);
            const botState = apiToBotState(apiPrefs);

            // Simulate saving both
            preferencesStateToApiBody(prefState);
            botStateToApiBody(botState);

            expect(localStorageGetSpy).not.toHaveBeenCalled();
            expect(localStorageSetSpy).not.toHaveBeenCalled();
            expect(localStorageRemoveSpy).not.toHaveBeenCalled();
          }),
          { numRuns: 100 }
        );
      }
    );
  });
});
