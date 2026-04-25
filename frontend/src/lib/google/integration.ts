// Google integration helpers — all DB operations go through the Express API.

const googleCalendarReadonlyScope = "https://www.googleapis.com/auth/calendar.readonly";

export class GoogleCalendarAuthRequiredError extends Error {
  code = "calendar_auth_required";
  constructor(message = "Please reconnect your Google Calendar") {
    super(message);
    this.name = "GoogleCalendarAuthRequiredError";
  }
}

function getGoogleClientId() {
  const id = process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID ?? null;
  if (!id) throw new Error("AUTH_GOOGLE_ID is not configured.");
  return id;
}

function getGoogleClientSecret() {
  const secret = process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? null;
  if (!secret) throw new Error("AUTH_GOOGLE_SECRET is not configured.");
  return secret;
}

type UserIntegrationRow = {
  id: string;
  userId: string;
  provider: string;
  email: string | null;
  scopes: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiry: Date | null;
};

// Fetch integration from Express API using a server-side token
async function fetchIntegrationFromApi(clerkUserId: string): Promise<UserIntegrationRow | null> {
  const BASE_URL = process.env.NEXT_PUBLIC_API_URL;
  if (!BASE_URL) return null;

  try {
    const { auth } = await import("@clerk/nextjs/server");
    const { getToken } = await auth();
    const token = await getToken();
    if (!token) return null;

    const res = await fetch(`${BASE_URL}/api/google/integration`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json() as { integration?: { connected: boolean; expiry: string | null } };
    if (!data.integration?.connected) return null;

    // Return a minimal row — accessToken is fetched separately when needed
    return {
      id: clerkUserId,
      userId: clerkUserId,
      provider: "google",
      email: null,
      scopes: googleCalendarReadonlyScope,
      accessToken: null, // not exposed by the status endpoint
      refreshToken: null,
      expiry: data.integration.expiry ? new Date(data.integration.expiry) : null,
    };
  } catch {
    return null;
  }
}

export async function refreshGoogleAccessToken(params: {
  userId: string;
  refreshToken: string;
}): Promise<{ accessToken: string | null; refreshToken: string; expiry: Date | null }> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getGoogleClientId(),
      client_secret: getGoogleClientSecret(),
      grant_type: "refresh_token",
      refresh_token: params.refreshToken,
    }),
  });

  if (!response.ok) throw new GoogleCalendarAuthRequiredError();

  const payload = await response.json() as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
  };

  if (!payload.access_token) throw new GoogleCalendarAuthRequiredError();

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? params.refreshToken,
    expiry: payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000) : null,
  };
}

export async function getActiveGoogleIntegration(userId: string): Promise<UserIntegrationRow | null> {
  return fetchIntegrationFromApi(userId);
}

export async function persistGoogleIntegrationForClerkUser(params: {
  clerkUserId: string;
  appUserId?: string | null;
  email?: string | null;
  scopes?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: number | null;
}) {
  // Persist via Express API
  const BASE_URL = process.env.NEXT_PUBLIC_API_URL;
  if (!BASE_URL) return;

  try {
    const { auth } = await import("@clerk/nextjs/server");
    const { getToken } = await auth();
    const token = await getToken();
    if (!token) return;

    await fetch(`${BASE_URL}/api/google/integration`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });
  } catch {
    // non-critical
  }
}
