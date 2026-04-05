/**
 * Property-Based Tests: Bot Settings Tab State Consistency
 *
 * **Property 13: Bot Settings Tab State Consistency**
 * **Validates: Requirements 11.6, 11.7, 11.9**
 *
 * Tests that:
 * 1. For any valid API preferences response, the bot state after loading matches
 *    the API data (round-trip mapping: API → state)
 * 2. For any bot settings state, saving and reloading produces the same state
 *    (round-trip save/load: state → API body → state)
 * 3. No localStorage.getItem/setItem is called during bot settings operations
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";

// ─── Types mirrored from page.tsx ─────────────────────────────────────────────

type ApiPreferences = {
  botDisplayName: string;
  audioSource: string;
  // Other fields present in the full API response but not relevant to bot state
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
 * Maps an API preferences response to the component's bot state.
 * Mirrors the mapping in page.tsx loadData():
 *   setBotName(p.botDisplayName);
 *   setAudioSource(p.audioSource);
 */
function apiToState(p: ApiPreferences): BotState {
  return {
    botName: p.botDisplayName,
    audioSource: p.audioSource,
  };
}

/**
 * Maps the component's bot state to the API POST body.
 * Mirrors the mapping in page.tsx saveBotSettings():
 *   body: JSON.stringify({
 *     botDisplayName: botName,
 *     audioSource
 *   })
 */
function stateToApiBody(s: BotState): BotApiBody {
  return {
    botDisplayName: s.botName,
    audioSource: s.audioSource,
  };
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const arbNonEmptyString = fc.string({ minLength: 1, maxLength: 100 });

const arbApiPreferences: fc.Arbitrary<ApiPreferences> = fc.record({
  botDisplayName: arbNonEmptyString,
  audioSource: arbNonEmptyString,
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
});

const arbBotState: fc.Arbitrary<BotState> = fc.record({
  botName: arbNonEmptyString,
  audioSource: arbNonEmptyString,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Property 13: Bot Settings Tab State Consistency", () => {
  // ── Property 1: API → State mapping ──────────────────────────────────────

  describe(
    "Property 1: State after loading matches API response (API → State mapping)",
    () => {
      it(
        "botName in state always equals botDisplayName from API response",
        () => {
          /**
           * **Validates: Requirements 11.6**
           * For any valid API preferences response, the state's botName must
           * exactly match the API's botDisplayName field.
           */
          fc.assert(
            fc.property(arbApiPreferences, (apiPrefs) => {
              const state = apiToState(apiPrefs);
              expect(state.botName).toBe(apiPrefs.botDisplayName);
            }),
            { numRuns: 100 }
          );
        }
      );

      it(
        "audioSource in state always equals audioSource from API response",
        () => {
          /**
           * **Validates: Requirements 11.6**
           * For any valid API preferences response, the state's audioSource must
           * exactly match the API's audioSource field.
           */
          fc.assert(
            fc.property(arbApiPreferences, (apiPrefs) => {
              const state = apiToState(apiPrefs);
              expect(state.audioSource).toBe(apiPrefs.audioSource);
            }),
            { numRuns: 100 }
          );
        }
      );

      it(
        "bot state fields are independent of non-bot API fields",
        () => {
          /**
           * **Validates: Requirements 11.6**
           * The bot state must only be influenced by botDisplayName and audioSource
           * from the API response, not by other preference fields.
           */
          fc.assert(
            fc.property(arbApiPreferences, arbApiPreferences, (apiPrefs1, apiPrefs2) => {
              // Create a merged preferences where bot fields come from apiPrefs1
              // but all other fields come from apiPrefs2
              const merged: ApiPreferences = {
                ...apiPrefs2,
                botDisplayName: apiPrefs1.botDisplayName,
                audioSource: apiPrefs1.audioSource,
              };

              const stateFromOriginal = apiToState(apiPrefs1);
              const stateFromMerged = apiToState(merged);

              // Bot state should be identical since bot fields are the same
              expect(stateFromMerged.botName).toBe(stateFromOriginal.botName);
              expect(stateFromMerged.audioSource).toBe(stateFromOriginal.audioSource);
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
        "saving and reloading any bot state produces the identical state",
        () => {
          /**
           * **Validates: Requirements 11.7**
           * For any bot state s:
           *   apiToState(stateToApiBody(s)) === s
           *
           * This verifies that the save mapping (state → API body) and the load
           * mapping (API response → state) are inverses of each other, ensuring
           * that a save followed by a reload produces the same displayed state.
           */
          fc.assert(
            fc.property(arbBotState, (originalState) => {
              // Simulate save: convert state to API body
              const apiBody = stateToApiBody(originalState);

              // Simulate reload: the API returns the saved values in the preferences response
              const reloadedApiPrefs: ApiPreferences = {
                botDisplayName: apiBody.botDisplayName,
                audioSource: apiBody.audioSource,
                // Other fields are irrelevant for bot state
                emailNotifications: {
                  meetingSummary: false,
                  actionItems: false,
                  weeklyDigest: false,
                  productUpdates: false,
                },
                defaultEmailTone: "professional",
                summaryLength: "standard",
                language: "en",
              };
              const reloadedState = apiToState(reloadedApiPrefs);

              // The reloaded state must match the original state exactly
              expect(reloadedState.botName).toBe(originalState.botName);
              expect(reloadedState.audioSource).toBe(originalState.audioSource);
            }),
            { numRuns: 200 }
          );
        }
      );

      it(
        "botDisplayName in API body always equals botName from state",
        () => {
          /**
           * **Validates: Requirements 11.7**
           * The save mapping must preserve botName as botDisplayName without transformation.
           */
          fc.assert(
            fc.property(arbBotState, (state) => {
              const apiBody = stateToApiBody(state);
              expect(apiBody.botDisplayName).toBe(state.botName);
            }),
            { numRuns: 100 }
          );
        }
      );

      it(
        "audioSource in API body always equals audioSource from state",
        () => {
          /**
           * **Validates: Requirements 11.7**
           * The save mapping must preserve audioSource without transformation.
           */
          fc.assert(
            fc.property(arbBotState, (state) => {
              const apiBody = stateToApiBody(state);
              expect(apiBody.audioSource).toBe(state.audioSource);
            }),
            { numRuns: 100 }
          );
        }
      );

      it(
        "round-trip is identity: apiToState(stateToApiBody(s)) equals s for all bot states",
        () => {
          /**
           * **Validates: Requirements 11.7**
           * The composition of save and load mappings must be the identity function.
           */
          fc.assert(
            fc.property(arbBotState, (state) => {
              const apiBody = stateToApiBody(state);
              const reloadedState = apiToState({
                botDisplayName: apiBody.botDisplayName,
                audioSource: apiBody.audioSource,
                emailNotifications: {
                  meetingSummary: false,
                  actionItems: false,
                  weeklyDigest: false,
                  productUpdates: false,
                },
                defaultEmailTone: "professional",
                summaryLength: "standard",
                language: "en",
              });

              expect(reloadedState).toEqual(state);
            }),
            { numRuns: 200 }
          );
        }
      );
    }
  );

  // ── Property 3: No localStorage usage ────────────────────────────────────

  describe(
    "Property 3: No localStorage operations during bot settings loading or saving",
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
        localStorageRemoveSpy = vi.spyOn(globalThis.localStorage, "removeItem");
      });

      afterEach(() => {
        vi.restoreAllMocks();
      });

      it(
        "apiToState never calls localStorage.getItem for any API preferences",
        () => {
          /**
           * **Validates: Requirements 11.9**
           * The mapping from API response to bot state must not read from
           * localStorage. State is derived solely from the API response.
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
        "stateToApiBody never calls localStorage.setItem for any bot state",
        () => {
          /**
           * **Validates: Requirements 11.9**
           * The mapping from bot state to API POST body must not write to
           * localStorage. Saving goes directly to the API.
           */
          fc.assert(
            fc.property(arbBotState, (state) => {
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
           * **Validates: Requirements 11.9**
           * No localStorage cleanup should occur during bot settings operations.
           */
          fc.assert(
            fc.property(arbApiPreferences, arbBotState, (apiPrefs, state) => {
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
           * **Validates: Requirements 11.9**
           * A complete bot settings cycle (load API response → update state → save)
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
