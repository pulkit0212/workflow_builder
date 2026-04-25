import { NextRequest, NextResponse } from "next/server";

const MICROSOFT_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";

const SCOPES: Record<string, string> = {
  microsoft_teams:
    "openid email profile offline_access Calendars.Read OnlineMeetings.Read",
  microsoft_outlook:
    "openid email profile offline_access Calendars.Read",
};

export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get("provider") ?? "microsoft_teams";
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!clientId) {
    return NextResponse.redirect(
      `${appUrl}/dashboard/integrations?error=oauth_failed`
    );
  }

  const redirectUri = `${appUrl}/api/calendar/callback/microsoft`;
  const scope = SCOPES[provider] ?? SCOPES.microsoft_teams;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope,
    response_mode: "query",
    state: provider, // pass provider through state so callback knows which one
  });

  return NextResponse.redirect(`${MICROSOFT_AUTH_URL}?${params.toString()}`);
}
