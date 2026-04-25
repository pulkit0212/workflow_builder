import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

const MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const failRedirect = `${appUrl}/dashboard/integrations?error=oauth_failed`;

  const code = req.nextUrl.searchParams.get("code");
  const provider = req.nextUrl.searchParams.get("state") ?? "microsoft_teams";
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      `${appUrl}/dashboard/integrations?error=oauth_cancelled`
    );
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(failRedirect);
  }

  const redirectUri = `${appUrl}/api/calendar/callback/microsoft`;

  // Exchange code for tokens
  const tokenRes = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(failRedirect);
  }

  const tokens = await tokenRes.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!tokens.access_token) {
    return NextResponse.redirect(failRedirect);
  }

  // Persist via Express API
  try {
    const { getToken } = await auth();
    const clerkToken = await getToken();

    if (!clerkToken) {
      return NextResponse.redirect(failRedirect);
    }

    await fetch(`${apiUrl}/api/calendar/save-connection`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clerkToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        expiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : null,
      }),
    });
  } catch {
    // non-critical — still redirect to success
  }

  return NextResponse.redirect(`${appUrl}/dashboard/integrations?connected=${provider}`);
}
