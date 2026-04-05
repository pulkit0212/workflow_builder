import { getUserByClerkUserId } from "@/lib/db/queries/users";
import { getUserIntegration } from "@/lib/db/queries/user-integrations";
import { upsertUserIntegration } from "@/lib/db/mutations/user-integrations";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { getGoogleAuthEnv } from "@/lib/google/env";

const googleProvider = "google";
const googleIntegrationLogPrefix = "[google-integration]";
const googleCalendarReadonlyScope = "https://www.googleapis.com/auth/calendar.readonly";

export class GoogleCalendarAuthRequiredError extends Error {
  code = "calendar_auth_required";

  constructor(message = "Please reconnect your Google Calendar") {
    super(message);
    this.name = "GoogleCalendarAuthRequiredError";
  }
}

function getGoogleClientId() {
  const googleAuthEnv = getGoogleAuthEnv();

  if (!googleAuthEnv.googleClientId) {
    throw new Error("AUTH_GOOGLE_ID is not configured.");
  }

  return googleAuthEnv.googleClientId;
}

function getGoogleClientSecret() {
  const googleAuthEnv = getGoogleAuthEnv();

  if (!googleAuthEnv.googleClientSecret) {
    throw new Error("AUTH_GOOGLE_SECRET is not configured.");
  }

  return googleAuthEnv.googleClientSecret;
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
  await ensureDatabaseReady();
  const user =
    params.appUserId != null
      ? {
          id: params.appUserId
        }
      : await getUserByClerkUserId(params.clerkUserId);

  if (!user) {
    throw new Error("Authenticated app user could not be resolved for Google integration.");
  }

  const existing = await getUserIntegration(user.id, googleProvider);

  console.info(`${googleIntegrationLogPrefix} persisting Google integration`, {
    clerkUserId: params.clerkUserId,
    appUserId: user.id,
    provider: googleProvider,
    hasExistingIntegration: Boolean(existing),
    hasAccessToken: Boolean(params.accessToken ?? existing?.accessToken),
    hasRefreshToken: Boolean(params.refreshToken ?? existing?.refreshToken)
  });

  return upsertUserIntegration({
    userId: user.id,
    provider: googleProvider,
    email: params.email ?? existing?.email ?? null,
    scopes: params.scopes ?? existing?.scopes ?? null,
    accessToken: params.accessToken ?? existing?.accessToken ?? null,
    refreshToken: params.refreshToken ?? existing?.refreshToken ?? null,
    expiry: params.expiresAt ? new Date(params.expiresAt * 1000) : existing?.expiry ?? null
  });
}

export async function refreshGoogleAccessToken(params: {
  userId: string;
  refreshToken: string;
}) {
  const existing = await getUserIntegration(params.userId, googleProvider);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: getGoogleClientId(),
      client_secret: getGoogleClientSecret(),
      grant_type: "refresh_token",
      refresh_token: params.refreshToken
    })
  });

  if (!response.ok) {
    console.error(`${googleIntegrationLogPrefix} token refresh failed`, {
      userId: params.userId,
      status: response.status
    });
    throw new GoogleCalendarAuthRequiredError();
  }

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
  };

  if (!payload.access_token) {
    throw new GoogleCalendarAuthRequiredError();
  }

  const expiresAt = payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000) : null;

  return upsertUserIntegration({
    userId: params.userId,
    provider: googleProvider,
    email: existing?.email ?? null,
    scopes: existing?.scopes ?? null,
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? params.refreshToken,
    expiry: expiresAt
  });
}

function hasCalendarReadonlyScope(scopes: string | null | undefined) {
  return scopes?.split(" ").includes(googleCalendarReadonlyScope) ?? false;
}

export async function getActiveGoogleIntegration(userId: string) {
  await ensureDatabaseReady();
  const integration = await getUserIntegration(userId, googleProvider);

  console.info(`${googleIntegrationLogPrefix} loaded Google integration`, {
    userId,
    found: Boolean(integration),
    provider: integration?.provider ?? googleProvider,
    hasAccessToken: Boolean(integration?.accessToken),
    scopes: integration?.scopes ?? null,
    hasCalendarReadonlyScope: hasCalendarReadonlyScope(integration?.scopes)
  });

  if (!integration) {
    return null;
  }

  if (!integration.scopes || !hasCalendarReadonlyScope(integration.scopes)) {
    console.warn(`${googleIntegrationLogPrefix} stored Google integration is stale or missing calendar.readonly scope`, {
      userId,
      provider: integration.provider,
      scopes: integration.scopes
    });
    return null;
  }

  const expiryTime = integration.expiry ? integration.expiry.getTime() : null;
  const needsRefresh = Boolean(
    integration.refreshToken &&
      expiryTime &&
      expiryTime <= Date.now() + 60 * 1000
  );

  if (needsRefresh && integration.refreshToken) {
    try {
      return await refreshGoogleAccessToken({
        userId,
        refreshToken: integration.refreshToken
      });
    } catch (error) {
      console.error("[Calendar] Token refresh failed:", error);
      throw error instanceof GoogleCalendarAuthRequiredError
        ? error
        : new GoogleCalendarAuthRequiredError();
    }
  }

  if (expiryTime && expiryTime <= Date.now() + 60 * 1000 && !integration.refreshToken) {
    throw new GoogleCalendarAuthRequiredError();
  }

  return integration;
}
