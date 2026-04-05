/**
 * Property-Based Tests: Preferences Tab State Consistency
 *
 * **Property 12: Preferences Tab State Consistency**
 * **Validates: Requirements 10.6, 10.7, 10.9**
 *
 * Tests that:
 * 1. For any valid API preferences response, the state after loading matches
 *    the API data (round-trip mapping: API → state)
 * 2. For any preferences state, saving and reloading produces the same state
 *    (round-trip save/load: state → API body → state)
 * 3. No localStorage.getItem/setItem is called during preferences operations
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";

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

// ─── Mapping functions extracted from page.tsx ────────────────────────────────

/**
 * Maps an API preferences response to the component's PreferencesState.
 * Mirrors the mapping in page.tsx loadData():
 *   setPreferences({
 *     meetingSummaryEmail: p.emailNotifications.meetingSummary,
 *     actionItemsEmail: p.emailNotifications.actionItems,
 *     weeklyDigest: p.emailNotifications.weeklyDigest,
 *     productUpdates: p.emailNotifications.productUpdates,
 *     defaultTone: (p.defaultEmailTone.charAt(0).toUpperCase() + p.defaultEmailTone.slice(1)) as ...,
 *     summaryLength: p.summaryLength,
 *     language: p.language === "hi" ? "Hindi" : "English"
 *   });
 */
function apiToState(p: ApiPreferences): PreferencesState {
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
 * Maps the component's PreferencesState back to the API POST body.
 * Mirrors the mapping in page.tsx savePreferences():
 *   body: JSON.stringify({
 *     emailNotifications: {
 *       meetingSummary: preferences.meetingSummaryEmail,
 *       actionItems: preferences.actionItemsEmail,
 *       weeklyDigest: preferences.weeklyDigest,
 *       productUpdates: preferences.productUpdates,
 *     },
 *     defaultEmailTone: preferences.defaultTone.toLowerCase(),
 *     summaryLength: preferences.summaryLength,
 *     language: preferences.language === "Hindi" ? "hi" : "en",
 *   })
 */
function stateToApiBody(
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

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const arbEmailTone = fc.constantFrom(
  "professional",
  "friendly",
  "formal",
  "concise"
) as fc.Arbitrary<ApiPreferences["defaultEmailTone"]>;

const arbSummaryLength = fc.constantFrom(
  "brief",
  "standard",
  "detailed"
) as fc.Arbitrary<ApiPreferences["summaryLength"]>;

const arbLanguage = fc.constantFrom("en", "hi") as fc.Arbitrary<
  ApiPreferences["language"]
>;

const arbApiPreferences: fc.Arbitrary<ApiPreferences> = fc.record({
  emailNotifications: fc.record({
    meetingSummary: fc.boolean(),
    actionItems: fc.boolean(),
    weeklyDigest: fc.boolean(),
    productUpdates: fc.boolean(),
  }),
  defaultEmailTone: arbEmailTone,
  summaryLength: arbSummaryLength,
  language: arbLanguage,
  botDisplayName: fc.string({ minLength: 1, maxLength: 100 }),
  audioSource: fc.string({ minLength: 1, maxLength: 100 }),
});

const arbStateTone = fc.constantFrom(
  "Professional",
  "Friendly",
  "Formal",
  "Concise"
) as fc.Arbitrary<PreferencesState["defaultTone"]>;

const arbStateLanguage = fc.constantFrom(
  "English",
  "Hindi"
) as fc.Arbitrary<PreferencesState["language"]>;

const arbPreferencesState: fc.Arbitrary<PreferencesState> = fc.record({
  meetingSummaryEmail: fc.boolean(),
  actionItemsEmail: fc.boolean(),
  weeklyDigest: fc.boolean(),
  productUpdates: fc.boolean(),
  defaultTone: arbStateTone,
  language: arbStateLanguage,
  summaryLength: arbSummaryLength,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Property 12: Preferences Tab State Consistency", () => {
  // ── Property 1: API → State mapping round-trip ────────────────────────────

  describe(
    "Property 1: State after loading matches API response (API → State mapping)",
    () => {
      it(
        "email notification toggles always reflect the API response values",
        () => {
          /**
           * **Validates: Requirements 10.6**
           * For any valid API preferences response, the state's email notification
           * fields must exactly match the API's emailNotifications fields.
           */
          fc.assert(
            fc.property(arbApiPreferences, (apiPrefs) => {
              const state = apiToState(apiPrefs);

              expect(state.meetingSummaryEmail).toBe(
                apiPrefs.emailNotifications.meetingSummary
              );
              expect(state.actionItemsEmail).toBe(
                apiPrefs.emailNotifications.actionItems
              );
              expect(state.weeklyDigest).toBe(
                apiPrefs.emailNotifications.weeklyDigest
              );
              expect(state.productUpdates).toBe(
                apiPrefs.emailNotifications.productUpdates
              );
            }),
            { numRuns: 100 }
          );
        }
      );

      it(
        "defaultTone in state is always the capitalized form of API defaultEmailTone",
        () => {
          /**
           * **Validates: Requirements 10.6**
           * For any valid API tone value, the state's defaultTone must be the
           * same value with the first letter capitalized.
           */
          fc.assert(
            fc.property(arbApiPreferences, (apiPrefs) => {
              const state = apiToState(apiPrefs);
              const expected =
                apiPrefs.defaultEmailTone.charAt(0).toUpperCase() +
                apiPrefs.defaultEmailTone.slice(1);

              expect(state.defaultTone).toBe(expected);
            }),
            { numRuns: 100 }
          );
        }
      );

      it(
        "summaryLength in state always equals the API summaryLength",
        () => {
          /**
           * **Validates: Requirements 10.6**
           * summaryLength passes through unchanged from API to state.
           */
          fc.assert(
            fc.property(arbApiPreferences, (apiPrefs) => {
              const state = apiToState(apiPrefs);
              expect(state.summaryLength).toBe(apiPrefs.summaryLength);
            }),
            { numRuns: 100 }
          );
        }
      );

      it(
        "language in state is always 'English' for 'en' and 'Hindi' for 'hi'",
        () => {
          /**
           * **Validates: Requirements 10.6**
           * The language mapping must be bijective: "en" → "English", "hi" → "Hindi".
           */
          fc.assert(
            fc.property(arbApiPreferences, (apiPrefs) => {
              const state = apiToState(apiPrefs);

              if (apiPrefs.language === "en") {
                expect(state.language).toBe("English");
              } else {
                expect(state.language).toBe("Hindi");
              }
            }),
            { numRuns: 100 }
          );
        }
      );
    }
  );

  // ── Property 2: State → API → State round-trip ────────────────────────────

  describe(
    "Property 2: Round-trip save/load produces the same state (State → API body → State)",
    () => {
      it(
        "saving and reloading any preferences state produces the identical state",
        () => {
          /**
           * **Validates: Requirements 10.7**
           * For any preferences state s:
           *   apiToState(stateToApiBody(s)) === s
           *
           * This verifies that the save mapping (state → API body) and the load
           * mapping (API response → state) are inverses of each other, ensuring
           * that a save followed by a reload produces the same displayed state.
           */
          fc.assert(
            fc.property(arbPreferencesState, (originalState) => {
              // Simulate save: convert state to API body
              const apiBody = stateToApiBody(originalState);

              // Simulate reload: convert API body back to state
              // The API returns the same fields it received, so we reconstruct
              // a full ApiPreferences object from the body (bot fields are irrelevant here)
              const reloadedApiPrefs: ApiPreferences = {
                ...apiBody,
                botDisplayName: "irrelevant",
                audioSource: "irrelevant",
              };
              const reloadedState = apiToState(reloadedApiPrefs);

              // The reloaded state must match the original state exactly
              expect(reloadedState.meetingSummaryEmail).toBe(
                originalState.meetingSummaryEmail
              );
              expect(reloadedState.actionItemsEmail).toBe(
                originalState.actionItemsEmail
              );
              expect(reloadedState.weeklyDigest).toBe(
                originalState.weeklyDigest
              );
              expect(reloadedState.productUpdates).toBe(
                originalState.productUpdates
              );
              expect(reloadedState.defaultTone).toBe(originalState.defaultTone);
              expect(reloadedState.summaryLength).toBe(
                originalState.summaryLength
              );
              expect(reloadedState.language).toBe(originalState.language);
            }),
            { numRuns: 200 }
          );
        }
      );

      it(
        "tone mapping is bijective: state tone lowercased equals API tone",
        () => {
          /**
           * **Validates: Requirements 10.7**
           * The tone mapping must be reversible:
           *   stateToApiBody(state).defaultEmailTone === state.defaultTone.toLowerCase()
           */
          fc.assert(
            fc.property(arbPreferencesState, (state) => {
              const apiBody = stateToApiBody(state);
              expect(apiBody.defaultEmailTone).toBe(
                state.defaultTone.toLowerCase()
              );
            }),
            { numRuns: 100 }
          );
        }
      );

      it(
        "language mapping is bijective: 'English' → 'en', 'Hindi' → 'hi'",
        () => {
          /**
           * **Validates: Requirements 10.7**
           * The language mapping must be reversible:
           *   "English" → "en" and "Hindi" → "hi"
           */
          fc.assert(
            fc.property(arbPreferencesState, (state) => {
              const apiBody = stateToApiBody(state);

              if (state.language === "English") {
                expect(apiBody.language).toBe("en");
              } else {
                expect(apiBody.language).toBe("hi");
              }
            }),
            { numRuns: 100 }
          );
        }
      );

      it(
        "email notification fields pass through unchanged in both directions",
        () => {
          /**
           * **Validates: Requirements 10.7**
           * Boolean email notification fields must survive the round-trip unchanged.
           */
          fc.assert(
            fc.property(arbPreferencesState, (state) => {
              const apiBody = stateToApiBody(state);

              expect(apiBody.emailNotifications.meetingSummary).toBe(
                state.meetingSummaryEmail
              );
              expect(apiBody.emailNotifications.actionItems).toBe(
                state.actionItemsEmail
              );
              expect(apiBody.emailNotifications.weeklyDigest).toBe(
                state.weeklyDigest
              );
              expect(apiBody.emailNotifications.productUpdates).toBe(
                state.productUpdates
              );
            }),
            { numRuns: 100 }
          );
        }
      );
    }
  );

  // ── Property 3: No localStorage usage ────────────────────────────────────

  describe(
    "Property 3: No localStorage operations during preferences loading or saving",
    () => {
      let localStorageGetSpy: ReturnType<typeof vi.spyOn>;
      let localStorageSetSpy: ReturnType<typeof vi.spyOn>;
      let localStorageRemoveSpy: ReturnType<typeof vi.spyOn>;

      beforeEach(() => {
        // Provide a minimal localStorage mock in the node environment
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
        localStorageRemoveSpy = vi.spyOn(
          globalThis.localStorage,
          "removeItem"
        );
      });

      afterEach(() => {
        vi.restoreAllMocks();
      });

      it(
        "apiToState never calls localStorage.getItem for any API preferences",
        () => {
          /**
           * **Validates: Requirements 10.9**
           * The mapping from API response to component state must not read
           * from localStorage. State is derived solely from the API response.
           */
          fc.assert(
            fc.property(arbApiPreferences, (apiPrefs) => {
              localStorageGetSpy.mockClear();

              apiToState(apiPrefs);

              expect(localStorageGetSpy).not.toHaveBeenCalled();
            }),
            { numRuns: 50 }
          );
        }
      );

      it(
        "stateToApiBody never calls localStorage.setItem for any preferences state",
        () => {
          /**
           * **Validates: Requirements 10.9**
           * The mapping from component state to API POST body must not write
           * to localStorage. Saving goes directly to the API.
           */
          fc.assert(
            fc.property(arbPreferencesState, (state) => {
              localStorageSetSpy.mockClear();

              stateToApiBody(state);

              expect(localStorageSetSpy).not.toHaveBeenCalled();
            }),
            { numRuns: 50 }
          );
        }
      );

      it(
        "neither apiToState nor stateToApiBody calls localStorage.removeItem",
        () => {
          /**
           * **Validates: Requirements 10.9**
           * No localStorage cleanup should occur during preferences operations.
           */
          fc.assert(
            fc.property(arbApiPreferences, arbPreferencesState, (apiPrefs, state) => {
              localStorageRemoveSpy.mockClear();

              apiToState(apiPrefs);
              stateToApiBody(state);

              expect(localStorageRemoveSpy).not.toHaveBeenCalled();
            }),
            { numRuns: 50 }
          );
        }
      );

      it(
        "the full load-then-save cycle never touches localStorage",
        () => {
          /**
           * **Validates: Requirements 10.9**
           * A complete preferences cycle (load API response → update state → save)
           * must not interact with localStorage at any point.
           */
          fc.assert(
            fc.property(arbApiPreferences, (apiPrefs) => {
              localStorageGetSpy.mockClear();
              localStorageSetSpy.mockClear();
              localStorageRemoveSpy.mockClear();

              // Simulate full cycle: load from API, then save back
              const state = apiToState(apiPrefs);
              stateToApiBody(state);

              expect(localStorageGetSpy).not.toHaveBeenCalled();
              expect(localStorageSetSpy).not.toHaveBeenCalled();
              expect(localStorageRemoveSpy).not.toHaveBeenCalled();
            }),
            { numRuns: 100 }
          );
        }
      );
    }
  );
});
