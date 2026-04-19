import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { upsertUserIntegration } from "@/lib/db/mutations/user-integrations";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";

const VALID_PROVIDERS = ["google", "microsoft_teams", "microsoft_outlook"] as const;
type CalendarProvider = (typeof VALID_PROVIDERS)[number];

function isValidProvider(p: string): p is CalendarProvider {
  return (VALID_PROVIDERS as readonly string[]).includes(p);
}

const FAILURE_REDIRECT = "/dashboard/integrations?error=oauth_failed";
const SUCCESS_REDIRECT = "/dashboard/integrations";
const log = (msg: string, data?: unknown) => console.log(`[calendar-callback] ${msg}`, data ?? "");

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  log("callback received", { provider });

  if (!isValidProvider(provider)) {
    log("invalid provider", provider);
    return NextResponse.redirect(new URL(FAILURE_REDIRECT, request.url));
  }

  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const errorParam = searchParams.get("error");

  if (errorParam) {
    log("provider returned error", errorParam);
    return NextResponse.redirect(new URL(FAILURE_REDIRECT, request.url));
  }

  if (!code || !stateParam) {
    log("missing code or state", { code: !!code, state: !!stateParam });
    return NextResponse.redirect(new URL(FAILURE_REDIRECT, request.url));
  }

  // Validate state cookie — if cookie is missing (cross-origin cookie loss), fall back to
  // trusting the provider field embedded in the state param JSON.
  const cookieValue = request.cookies.get("calendar_oauth_state")?.value;
  log("state cookie present", !!cookieValue);

  if (cookieValue) {
    let cookiePayload: { state: string; provider: string };
    try {
      cookiePayload = JSON.parse(cookieValue);
    } catch {
      log("cookie payload not valid JSON");
      return NextResponse.redirect(new URL(FAILURE_REDIRECT, request.url));
    }

    // stateParam may be the full JSON string (as we set it) or just the csrf token
    let stateValue = stateParam;
    try {
      const parsed = JSON.parse(stateParam) as { state?: string };
      if (parsed.state) stateValue = parsed.state;
    } catch { /* plain string */ }

    if (cookiePayload.state !== stateValue && cookiePayload.state !== stateParam) {
      log("state mismatch", { cookie: cookiePayload.state, param: stateValue });
      return NextResponse.redirect(new URL(FAILURE_REDIRECT, request.url));
    }
    if (cookiePayload.provider !== provider) {
      log("provider mismatch in cookie", { cookie: cookiePayload.provider, param: provider });
      return NextResponse.redirect(new URL(FAILURE_REDIRECT, request.url));
    }
  } else {
    // No cookie — validate provider from state param JSON
    try {
      const parsed = JSON.parse(stateParam) as { provider?: string };
      if (parsed.provider !== provider) {
        log("provider mismatch in state param", { expected: provider, got: parsed.provider });
        return NextResponse.redirect(new URL(FAILURE_REDIRECT, request.url));
      }
    } catch {
      log("no cookie and state param not JSON — rejecting");
      return NextResponse.redirect(new URL(FAILURE_REDIRECT, request.url));
    }
  }

  // Authenticate user and resolve internal DB ID
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    log("no clerk session");
    return NextResponse.redirect(new URL(FAILURE_REDIRECT, request.url));
  }

  let internalUserId: string;
  try {
    const user = await syncCurrentUserToDatabase(clerkUserId);
    internalUserId = user.id;
  } catch (err) {
    log("failed to sync user to DB", err);
    return NextResponse.redirect(new URL(FAILURE_REDIRECT, request.url));
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectUri = `${appUrl}/api/calendar/callback/${provider}`;

  // Exchange code for tokens
  let tokenResponse: { access_token: string; refresh_token?: string; expires_in?: number };

  try {
    if (provider === "google") {
      const clientId = process.env.GOOGLE_CLIENT_ID ?? process.env.AUTH_GOOGLE_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? process.env.AUTH_GOOGLE_SECRET;

      if (!clientId || !clientSecret) {
        log("Google OAuth not configured");
        return NextResponse.redirect(new URL(FAILURE_REDIRECT, request.url));
      }

      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      });

      if (!res.ok) {
        const errText = await res.text();
        log("Google token exchange failed", { status: res.status, body: errText });
        return NextResponse.redirect(new URL(FAILURE_REDIRECT, request.url));
      }

      tokenResponse = await res.json() as typeof tokenResponse;
    } else {
      const clientId = process.env.MICROSOFT_CLIENT_ID ?? process.env.AZURE_CLIENT_ID;
      const clientSecret = process.env.MICROSOFT_CLIENT_SECRET ?? process.env.AZURE_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        log("Microsoft OAuth not configured");
        return NextResponse.redirect(new URL(FAILURE_REDIRECT, request.url));
      }

      const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      });

      if (!res.ok) {
        const errText = await res.text();
        log("Microsoft token exchange failed", { status: res.status, body: errText });
        return NextResponse.redirect(new URL(FAILURE_REDIRECT, request.url));
      }

      tokenResponse = await res.json() as typeof tokenResponse;
    }
  } catch (err) {
    log("token exchange threw", err);
    return NextResponse.redirect(new URL(FAILURE_REDIRECT, request.url));
  }

  if (!tokenResponse.access_token) {
    log("no access_token in response");
    return NextResponse.redirect(new URL(FAILURE_REDIRECT, request.url));
  }

  const expiry = tokenResponse.expires_in
    ? new Date(Date.now() + tokenResponse.expires_in * 1000)
    : null;

  try {
    await upsertUserIntegration({
      userId: internalUserId,
      provider,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token ?? null,
      expiry,
      email: null,
      scopes: null,
    });
    log("upserted integration", { provider, userId: internalUserId });
  } catch (err) {
    log("failed to upsert integration", err);
    return NextResponse.redirect(new URL(FAILURE_REDIRECT, request.url));
  }

  const response = NextResponse.redirect(new URL(SUCCESS_REDIRECT, request.url));
  response.cookies.set("calendar_oauth_state", "", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  return response;
}
