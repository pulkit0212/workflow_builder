// Server-only API client — only import this in Server Components or Route Handlers.
import { auth } from "@clerk/nextjs/server";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;
if (!BASE_URL) throw new Error("NEXT_PUBLIC_API_URL is not configured");

/**
 * apiFetch — server-side fetch wrapper for the Express API.
 * Only use in Server Components or Next.js Route Handlers.
 */
export async function apiFetch(
  path: string,
  init?: RequestInit & { workspaceId?: string }
): Promise<Response> {
  const { getToken } = await auth();
  const token = await getToken();

  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && !(init?.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (init?.workspaceId) headers.set("x-workspace-id", init.workspaceId);

  const { workspaceId: _w, ...fetchInit } = init ?? {};
  return fetch(`${BASE_URL}${path}`, { ...fetchInit, headers });
}
