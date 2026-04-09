/**
 * Shim for @clerk/nextjs/server — replaces Next.js-bound Clerk helpers with
 * framework-agnostic equivalents from @clerk/backend.
 *
 * The Express adapter in main.ts passes a real Web API Request object to each
 * route handler, so we can authenticate directly from it.
 */
import { createClerkClient } from "@clerk/backend";

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY ?? "",
  publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
});

// Support both usage patterns:
//   import { clerkClient } from "@clerk/nextjs/server"
//   const c = clerkClient          (direct instance — most routes)
//   const c = await clerkClient()  (factory call — settings/account route)
export const clerkClient = Object.assign(
  () => Promise.resolve(clerk),
  clerk
);

/**
 * Drop-in replacement for Clerk's auth() from @clerk/nextjs/server.
 * Reads the Authorization header or __session cookie from the Web API Request
 * that is currently executing (stored per async-context via AsyncLocalStorage).
 */

import { AsyncLocalStorage } from "node:async_hooks";

// Each route invocation stores its Request here so auth() can read it.
export const requestStorage = new AsyncLocalStorage<Request>();

export async function auth(): Promise<{ userId: string | null }> {
  const req = requestStorage.getStore();

  if (!req) {
    return { userId: null };
  }

  try {
    const requestState = await clerk.authenticateRequest(req, {
      secretKey: process.env.CLERK_SECRET_KEY ?? "",
      publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
      authorizedParties: [
        "http://localhost:3000",
        "http://localhost:4000",
        process.env.NEXT_PUBLIC_APP_URL ?? "",
      ].filter(Boolean),
    });

    const payload = requestState.toAuth();
    const userId = payload?.userId ?? null;

    if (!userId) {
      // Log what we received to help debug auth issues
      const cookieHeader = req.headers.get("cookie") ?? "(none)";
      const authHeader = req.headers.get("authorization") ?? "(none)";
      console.warn("[clerk-shim] auth() resolved no userId", {
        hasCookie: cookieHeader !== "(none)",
        hasAuthHeader: authHeader !== "(none)",
        status: requestState.status,
      });
    }

    return { userId };
  } catch (err) {
    console.error("[clerk-shim] auth() error", err);
    return { userId: null };
  }
}

export async function currentUser() {
  const { userId } = await auth();
  if (!userId) return null;
  try {
    return await clerk.users.getUser(userId);
  } catch {
    return null;
  }
}
