import type { NextRequest } from "next/server";

/**
 * Public app base URL for OAuth redirects (must be absolute https/http).
 * Prefer the incoming request host so redirect_uri matches the URL in the browser.
 */
export function getAppBaseUrl(req?: Pick<NextRequest, "headers">): string {
  if (req) {
    const host =
      req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
      req.headers.get("host")?.trim();
    if (host) {
      const proto =
        req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
        (host.startsWith("localhost") ? "http" : "https");
      return `${proto}://${host}`.replace(/\/$/, "");
    }
  }

  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (fromEnv && /^https?:\/\//i.test(fromEnv)) {
    return fromEnv;
  }

  return "http://localhost:3000";
}

export function getMicrosoftOAuthRedirectUri(req?: Pick<NextRequest, "headers">): string {
  return `${getAppBaseUrl(req)}/api/calendar/callback/microsoft`;
}
