// Client-safe API client — no server-only imports.

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

function getBaseUrl(): string {
  if (!BASE_URL) throw new Error("NEXT_PUBLIC_API_URL is not configured");
  return BASE_URL;
}

/**
 * createApiFetch — factory for a client-side fetch wrapper.
 * Pass a getToken function from Clerk's useSession hook.
 * Use this in React components via useApiFetch hook.
 */
export function createApiFetch(
  getToken: () => Promise<string | null>
): (path: string, init?: RequestInit & { workspaceId?: string }) => Promise<Response> {
  return async function (
    path: string,
    init?: RequestInit & { workspaceId?: string }
  ): Promise<Response> {
    const token = await getToken();
    const headers = new Headers(init?.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Content-Type") && !(init?.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    if (init?.workspaceId) headers.set("x-workspace-id", init.workspaceId);
    const { workspaceId: _w, ...fetchInit } = init ?? {};
    return fetch(`${getBaseUrl()}${path}`, { ...fetchInit, headers });
  };
}

/**
 * getClerkToken — waits for Clerk to initialize and returns the session JWT.
 * Retries for up to 10 seconds.
 */
async function getClerkToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;

  for (let i = 0; i < 100; i++) {
    const clerk = w.Clerk;
    if (clerk?.session?.getToken) {
      try {
        const token = await clerk.session.getToken();
        if (token) return token;
      } catch {
        // session not ready yet, keep waiting
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  return null;
}

/**
 * clientApiFetch — client-side fetch wrapper.
 * Waits for Clerk session to be ready before making the request.
 * Use this in non-React contexts (feature API files, etc.)
 */
export async function clientApiFetch(
  path: string,
  init?: RequestInit & { workspaceId?: string }
): Promise<Response> {
  const token = await getClerkToken();

  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && !(init?.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (init?.workspaceId) headers.set("x-workspace-id", init.workspaceId);
  const { workspaceId: _w, ...fetchInit } = init ?? {};
  return fetch(`${getBaseUrl()}${path}`, { ...fetchInit, headers });
}
