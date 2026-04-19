import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

const VALID_PROVIDERS = ["google", "microsoft_teams", "microsoft_outlook"] as const;
type CalendarProvider = (typeof VALID_PROVIDERS)[number];

function isValidProvider(p: string): p is CalendarProvider {
  return (VALID_PROVIDERS as readonly string[]).includes(p);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  if (!isValidProvider(provider)) {
    return NextResponse.json(
      { success: false, message: `Invalid provider: "${provider}". Must be one of: ${VALID_PROVIDERS.join(", ")}` },
      { status: 400 }
    );
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }

  const csrfToken = crypto.randomUUID();
  const statePayload = JSON.stringify({ state: csrfToken, provider });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectUri = `${appUrl}/api/calendar/callback/${provider}`;

  let authorizationUrl: string;

  if (provider === "google") {
    const clientId = process.env.GOOGLE_CLIENT_ID ?? process.env.AUTH_GOOGLE_ID;
    if (!clientId) {
      return NextResponse.json(
        { success: false, message: "Google OAuth is not configured." },
        { status: 500 }
      );
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/calendar.readonly",
      state: statePayload,
      access_type: "offline",
      prompt: "consent",
    });

    authorizationUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  } else {
    // microsoft_teams or microsoft_outlook — both use Azure AD
    const clientId = process.env.MICROSOFT_CLIENT_ID ?? process.env.AZURE_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json(
        { success: false, message: "Microsoft OAuth is not configured." },
        { status: 500 }
      );
    }

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: "Calendars.Read offline_access",
      state: statePayload,
      response_mode: "query",
    });

    authorizationUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  }

  const response = NextResponse.redirect(authorizationUrl, 302);

  response.cookies.set("calendar_oauth_state", statePayload, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
