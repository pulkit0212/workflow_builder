/**
 * workspaceFetch — client-side fetch wrapper that automatically attaches
 * the `x-workspace-id` header from localStorage on every request.
 *
 * localStorage key: `active-workspace-id`
 */

const STORAGE_KEY = "active-workspace-id";

/**
 * Reads the active workspace id from localStorage.
 * Returns null if not set or if running in a non-browser environment.
 */
export function getActiveWorkspaceId(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

/**
 * Persists the active workspace id to localStorage.
 */
export function setActiveWorkspaceId(id: string): void {
  localStorage.setItem(STORAGE_KEY, id);
}

/**
 * Drop-in replacement for `fetch` that merges the `x-workspace-id` header
 * when a workspace id is present in localStorage.
 *
 * If no workspace id is stored the request is forwarded unchanged — the
 * server will fall back to the user's first active workspace.
 */
export function workspaceFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const raw = getActiveWorkspaceId();
  // Treat whitespace-only values the same as absent
  const workspaceId = raw?.trim() || null;

  if (!workspaceId) {
    return fetch(input, init);
  }

  const existingHeaders = new Headers(init?.headers);
  existingHeaders.set("x-workspace-id", workspaceId);

  return fetch(input, {
    ...init,
    headers: existingHeaders,
  });
}
