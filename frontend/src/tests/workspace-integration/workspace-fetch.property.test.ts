/**
 * Property-Based Tests: workspaceFetch header attachment
 *
 * Feature: workspace-integration, Property 6: workspaceFetch attaches header iff workspaceId present
 * Feature: workspace-integration, Property 7: Workspace switch updates localStorage
 *
 * **Validates: Requirements 3.4, 3.5, 9.4**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fc from "fast-check";

// ── localStorage stub (node environment has no DOM) ──────────────────────────

const localStorageStore: Record<string, string> = {};

const localStorageMock = {
  getItem: (key: string): string | null => localStorageStore[key] ?? null,
  setItem: (key: string, value: string): void => {
    localStorageStore[key] = value;
  },
  removeItem: (key: string): void => {
    delete localStorageStore[key];
  },
  clear: (): void => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]);
  },
};

// ── fetch stub ────────────────────────────────────────────────────────────────

type CapturedRequest = { input: RequestInfo | URL; init?: RequestInit };
let lastCapturedRequest: CapturedRequest | null = null;

const fetchMock = vi.fn(
  async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    lastCapturedRequest = { input, init };
    return new Response(null, { status: 200 });
  }
);

// ── Module setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
  // Install mocks on globalThis so the module under test picks them up
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, "fetch", {
    value: fetchMock,
    writable: true,
    configurable: true,
  });

  localStorageMock.clear();
  lastCapturedRequest = null;
  fetchMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Re-import the module fresh so it picks up the current globalThis.localStorage.
 * We use dynamic import + cache-busting via vi.resetModules().
 */
async function getModule() {
  vi.resetModules();
  return import("@/lib/workspace-fetch");
}

function getHeaderValue(init: RequestInit | undefined, name: string): string | null {
  if (!init?.headers) return null;
  if (init.headers instanceof Headers) {
    return init.headers.get(name);
  }
  if (Array.isArray(init.headers)) {
    const pair = init.headers.find(([k]) => k.toLowerCase() === name.toLowerCase());
    return pair ? pair[1] : null;
  }
  const record = init.headers as Record<string, string>;
  const key = Object.keys(record).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? record[key] : null;
}

/**
 * Generator for valid workspace IDs (UUID format).
 * Workspace IDs are always UUIDs in this system.
 */
const workspaceIdArb = fc.uuid();

/**
 * Generator for valid HTTP header names.
 * Uses only alphanumeric + hyphen to avoid JS prototype pollution and HTTP spec issues.
 */
const headerNameArb = fc
  .tuple(
    fc.constantFrom(...("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ").split("")),
    fc.string({ minLength: 0, maxLength: 16 }).map((s) =>
      s.replace(/[^a-zA-Z0-9\-]/g, "a")
    )
  )
  .map(([first, rest]) => first + rest)
  .filter((s) => s.toLowerCase() !== "x-workspace-id");

/**
 * Generator for valid HTTP header values (printable ASCII, no newlines, no leading/trailing whitespace).
 * The Headers API trims whitespace from values, so we avoid whitespace-only values.
 */
const headerValueArb = fc
  .string({ minLength: 1, maxLength: 64 })
  .filter((s) => /^[\x21-\x7E][\x20-\x7E]*[\x21-\x7E]$|^[\x21-\x7E]$/.test(s));

// ── Property 6 ────────────────────────────────────────────────────────────────

describe(
  // Feature: workspace-integration, Property 6: workspaceFetch attaches header iff workspaceId present
  "Property 6: workspaceFetch attaches x-workspace-id header iff workspaceId present",
  () => {
    it(
      "includes x-workspace-id header when localStorage has a non-empty workspace id",
      async () => {
        /**
         * **Validates: Requirements 3.4**
         * For any non-empty workspace id stored in localStorage,
         * workspaceFetch MUST attach x-workspace-id with that exact value.
         */
        await fc.assert(
          fc.asyncProperty(
            workspaceIdArb,
            fc.string({ minLength: 1, maxLength: 256 }),
            async (workspaceId, url) => {
              localStorageMock.clear();
              fetchMock.mockClear();
              lastCapturedRequest = null;

              localStorageMock.setItem("active-workspace-id", workspaceId);

              const { workspaceFetch } = await getModule();
              await workspaceFetch(url);

              expect(fetchMock).toHaveBeenCalledOnce();
              const [, capturedInit] = fetchMock.mock.calls[0];
              const headerValue = getHeaderValue(capturedInit, "x-workspace-id");
              expect(headerValue).toBe(workspaceId);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "does NOT include x-workspace-id header when localStorage has no workspace id",
      async () => {
        /**
         * **Validates: Requirements 3.4**
         * When localStorage['active-workspace-id'] is absent,
         * workspaceFetch MUST NOT attach the x-workspace-id header.
         */
        await fc.assert(
          fc.asyncProperty(
            fc.string({ minLength: 1, maxLength: 256 }),
            async (url) => {
              localStorageMock.clear();
              fetchMock.mockClear();

              // Ensure key is absent
              localStorageMock.removeItem("active-workspace-id");

              const { workspaceFetch } = await getModule();
              await workspaceFetch(url);

              expect(fetchMock).toHaveBeenCalledOnce();
              const [, capturedInit] = fetchMock.mock.calls[0];
              const headerValue = getHeaderValue(capturedInit, "x-workspace-id");
              expect(headerValue).toBeNull();
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "preserves existing headers while adding x-workspace-id",
      async () => {
        /**
         * **Validates: Requirements 3.4**
         * workspaceFetch must merge x-workspace-id without dropping
         * any headers already present in the init object.
         */
        await fc.assert(
          fc.asyncProperty(
            workspaceIdArb,
            headerNameArb,
            headerValueArb,
            async (workspaceId, headerName, headerValue) => {
              // Avoid collision with the header we're injecting
              fc.pre(headerName.toLowerCase() !== "x-workspace-id");

              localStorageMock.clear();
              fetchMock.mockClear();
              localStorageMock.setItem("active-workspace-id", workspaceId);

              const { workspaceFetch } = await getModule();
              await workspaceFetch("/api/test", {
                headers: { [headerName]: headerValue },
              });

              expect(fetchMock).toHaveBeenCalledOnce();
              const [, capturedInit] = fetchMock.mock.calls[0];
              const injected = getHeaderValue(capturedInit, "x-workspace-id");
              const preserved = getHeaderValue(capturedInit, headerName);
              expect(injected).toBe(workspaceId);
              expect(preserved).toBe(headerValue);
            }
          ),
          { numRuns: 100 }
        );
      }
    );
  }
);

// ── Property 7 ────────────────────────────────────────────────────────────────

describe(
  // Feature: workspace-integration, Property 7: Workspace switch updates localStorage
  "Property 7: Workspace switch updates localStorage and subsequent workspaceFetch uses new id",
  () => {
    it(
      "after setActiveWorkspaceId, getActiveWorkspaceId returns the new id",
      async () => {
        /**
         * **Validates: Requirements 3.5, 9.4**
         * For any workspace id passed to setActiveWorkspaceId,
         * getActiveWorkspaceId must immediately return that same id.
         */
        await fc.assert(
          fc.asyncProperty(
            workspaceIdArb,
            async (workspaceId) => {
              localStorageMock.clear();

              const { setActiveWorkspaceId, getActiveWorkspaceId } = await getModule();
              setActiveWorkspaceId(workspaceId);

              expect(getActiveWorkspaceId()).toBe(workspaceId);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "workspaceFetch uses the id set by the most recent setActiveWorkspaceId call",
      async () => {
        /**
         * **Validates: Requirements 3.5, 9.4**
         * After switching workspace via setActiveWorkspaceId(newId),
         * the next workspaceFetch call MUST include newId in x-workspace-id.
         */
        await fc.assert(
          fc.asyncProperty(
            workspaceIdArb,
            workspaceIdArb,
            async (oldId, newId) => {
              fc.pre(oldId !== newId);

              localStorageMock.clear();
              fetchMock.mockClear();

              const { setActiveWorkspaceId, workspaceFetch } = await getModule();

              // Set initial workspace
              setActiveWorkspaceId(oldId);
              // Switch to new workspace
              setActiveWorkspaceId(newId);

              await workspaceFetch("/api/workspace/meetings");

              expect(fetchMock).toHaveBeenCalledOnce();
              const [, capturedInit] = fetchMock.mock.calls[0];
              const headerValue = getHeaderValue(capturedInit, "x-workspace-id");
              expect(headerValue).toBe(newId);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "switching workspace multiple times always reflects the last selection",
      async () => {
        /**
         * **Validates: Requirements 3.5, 9.4**
         * After N consecutive workspace switches, only the last id
         * must appear in the x-workspace-id header.
         */
        await fc.assert(
          fc.asyncProperty(
            fc.array(workspaceIdArb, { minLength: 2, maxLength: 10 }),
            async (ids) => {
              localStorageMock.clear();
              fetchMock.mockClear();

              const { setActiveWorkspaceId, workspaceFetch } = await getModule();

              for (const id of ids) {
                setActiveWorkspaceId(id);
              }

              await workspaceFetch("/api/workspace/dashboard");

              expect(fetchMock).toHaveBeenCalledOnce();
              const [, capturedInit] = fetchMock.mock.calls[0];
              const headerValue = getHeaderValue(capturedInit, "x-workspace-id");
              expect(headerValue).toBe(ids[ids.length - 1]);
            }
          ),
          { numRuns: 100 }
        );
      }
    );
  }
);
