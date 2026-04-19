import { getUserIntegration } from "@/lib/db/queries/user-integrations";
import { upsertUserIntegration } from "@/lib/db/mutations/user-integrations";
import type { CalendarClient, UnifiedCalendarMeeting } from "@/lib/calendar/types";

const microsoftLogPrefix = "[microsoft-calendar]";

// Azure AD token endpoint (common tenant supports both personal and work accounts)
const AZURE_TOKEN_ENDPOINT = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

// Microsoft Graph calendarView endpoint
const GRAPH_CALENDAR_VIEW_URL = "https://graph.microsoft.com/v1.0/me/calendarView";

export class MicrosoftCalendarAuthRequiredError extends Error {
  code = "calendar_auth_required";

  constructor(message = "Please reconnect your Microsoft Calendar") {
    super(message);
    this.name = "MicrosoftCalendarAuthRequiredError";
  }
}

function getMicrosoftClientId(): string {
  const clientId = process.env.MICROSOFT_CLIENT_ID ?? process.env.AZURE_CLIENT_ID ?? null;
  if (!clientId) {
    throw new Error("MICROSOFT_CLIENT_ID is not configured.");
  }
  return clientId;
}

function getMicrosoftClientSecret(): string {
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET ?? process.env.AZURE_CLIENT_SECRET ?? null;
  if (!clientSecret) {
    throw new Error("MICROSOFT_CLIENT_SECRET is not configured.");
  }
  return clientSecret;
}

type GraphCalendarEvent = {
  id?: string;
  subject?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  onlineMeeting?: { joinUrl?: string } | null;
  onlineMeetingUrl?: string | null;
  isOnlineMeeting?: boolean;
  webLink?: string | null;
  body?: { content?: string } | null;
};

type GraphCalendarViewResponse = {
  value?: GraphCalendarEvent[];
};

type MicrosoftTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

function normalizeDateTime(dateTime: string | undefined): string {
  if (!dateTime) return "";
  // Append "Z" if no timezone offset is present (Graph returns local time without Z)
  if (!/[Zz]$/.test(dateTime) && !/[+-]\d{2}:\d{2}$/.test(dateTime)) {
    return dateTime + "Z";
  }
  return dateTime;
}

/** Returns true if the URL is an Outlook calendar web link (not a joinable meeting link) */
function isTeamsWebLink(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return hostname.includes("outlook.live.com") || hostname.includes("outlook.office.com") || hostname.includes("outlook.office365.com");
  } catch { return false; }
}

type MicrosoftProvider = "microsoft_teams" | "microsoft_outlook";

function extractTeamsJoinUrl(body: string | null | undefined): string | null {
  if (!body) return null;
  // Teams join links appear in the body as href or plain text
  const match = body.match(/https:\/\/teams\.(?:live\.com|microsoft\.com)\/meet\/[^\s"<>]+/i)
    ?? body.match(/https:\/\/teams\.(?:live\.com|microsoft\.com)\/[^\s"<>]+/i);
  return match ? match[0].replace(/&amp;/g, "&") : null;
}

function mapToUnified(event: GraphCalendarEvent, provider: MicrosoftProvider): UnifiedCalendarMeeting {
  const prefix = provider === "microsoft_teams" ? "teams" : "outlook";

  // Try all possible join URL sources in order of reliability
  const joinUrl =
    event.onlineMeeting?.joinUrl ??
    event.onlineMeetingUrl ??
    extractTeamsJoinUrl(event.body?.content) ??
    (isTeamsWebLink(event.webLink) ? null : event.webLink) ??
    null;

  console.log(`[microsoft-calendar] event "${event.subject}" joinUrl sources:`, {
    onlineMeetingJoinUrl: event.onlineMeeting?.joinUrl,
    onlineMeetingUrl: event.onlineMeetingUrl,
    isOnlineMeeting: event.isOnlineMeeting,
    webLink: event.webLink,
    resolved: joinUrl,
  });

  return {
    id: `${prefix}_${event.id ?? crypto.randomUUID()}`,
    title: event.subject?.trim() || "Untitled event",
    startTime: normalizeDateTime(event.start?.dateTime),
    endTime: normalizeDateTime(event.end?.dateTime),
    meetLink: joinUrl,
    provider,
    source: provider,
  };
}

async function refreshMicrosoftAccessToken(params: {
  userId: string;
  provider: MicrosoftProvider;
  refreshToken: string;
}): Promise<{ accessToken: string; refreshToken: string; expiry: Date | null }> {
  const existing = await getUserIntegration(params.userId, params.provider);

  const response = await fetch(AZURE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getMicrosoftClientId(),
      client_secret: getMicrosoftClientSecret(),
      grant_type: "refresh_token",
      refresh_token: params.refreshToken,
    }),
  });

  if (!response.ok) {
    console.error(`${microsoftLogPrefix} token refresh failed`, {
      userId: params.userId,
      provider: params.provider,
      status: response.status,
    });
    throw new MicrosoftCalendarAuthRequiredError();
  }

  const payload = (await response.json()) as MicrosoftTokenResponse;

  if (!payload.access_token) {
    throw new MicrosoftCalendarAuthRequiredError();
  }

  const expiry = payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000) : null;
  const newRefreshToken = payload.refresh_token ?? params.refreshToken;

  await upsertUserIntegration({
    userId: params.userId,
    provider: params.provider,
    email: existing?.email ?? null,
    scopes: existing?.scopes ?? null,
    accessToken: payload.access_token,
    refreshToken: newRefreshToken,
    expiry,
  });

  return { accessToken: payload.access_token, refreshToken: newRefreshToken, expiry };
}

async function fetchGraphEvents(params: {
  accessToken: string;
  refreshToken: string | null;
  userId: string;
  provider: MicrosoftProvider;
  startDateTime: string;
  endDateTime: string;
}): Promise<GraphCalendarViewResponse> {
  const url = new URL(GRAPH_CALENDAR_VIEW_URL);
  url.searchParams.set("startDateTime", params.startDateTime);
  url.searchParams.set("endDateTime", params.endDateTime);
  url.searchParams.set("$select", "id,subject,start,end,onlineMeeting,onlineMeetingUrl,isOnlineMeeting,webLink,body");

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${params.accessToken}` },
    cache: "no-store",
  });

  if (response.status === 401 && params.refreshToken) {
    let refreshed: { accessToken: string; refreshToken: string; expiry: Date | null };
    try {
      refreshed = await refreshMicrosoftAccessToken({
        userId: params.userId,
        provider: params.provider,
        refreshToken: params.refreshToken,
      });
    } catch (err) {
      throw err instanceof MicrosoftCalendarAuthRequiredError
        ? err
        : new MicrosoftCalendarAuthRequiredError();
    }
    // Retry once with the new token
    return fetchGraphEvents({
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      userId: params.userId,
      provider: params.provider,
      startDateTime: params.startDateTime,
      endDateTime: params.endDateTime,
    });
  }

  if (response.status === 401) throw new MicrosoftCalendarAuthRequiredError();
  if (!response.ok) {
    throw new Error(`Failed to fetch Microsoft Graph calendar events: ${response.status}`);
  }

  return response.json() as Promise<GraphCalendarViewResponse>;
}

function createMicrosoftCalendarClient(provider: MicrosoftProvider): CalendarClient {
  return {
    async fetchMeetings({ accessToken, refreshToken, userId, startDate, endDate }) {
      // Check token expiry and proactively refresh if within 60 seconds
      const integration = await getUserIntegration(userId, provider);
      let currentAccessToken = accessToken;
      let currentRefreshToken = refreshToken;

      if (integration) {
        const expiryTime = integration.expiry ? integration.expiry.getTime() : null;
        const needsRefresh = Boolean(
          integration.refreshToken &&
            expiryTime &&
            expiryTime <= Date.now() + 60 * 1000
        );

        if (needsRefresh && integration.refreshToken) {
          try {
            const refreshed = await refreshMicrosoftAccessToken({
              userId,
              provider,
              refreshToken: integration.refreshToken,
            });
            currentAccessToken = refreshed.accessToken;
            currentRefreshToken = refreshed.refreshToken;
          } catch (err) {
            console.error(`${microsoftLogPrefix} proactive token refresh failed`, { userId, provider });
            throw err instanceof MicrosoftCalendarAuthRequiredError
              ? err
              : new MicrosoftCalendarAuthRequiredError();
          }
        } else if (expiryTime && expiryTime <= Date.now() + 60 * 1000 && !integration.refreshToken) {
          throw new MicrosoftCalendarAuthRequiredError();
        }
      }

      const payload = await fetchGraphEvents({
        accessToken: currentAccessToken,
        refreshToken: currentRefreshToken,
        userId,
        provider,
        startDateTime: startDate.toISOString(),
        endDateTime: endDate.toISOString(),
      });

      return (payload.value ?? []).map((event) => mapToUnified(event, provider));
    },
  };
}

export const microsoftTeamsClient: CalendarClient = createMicrosoftCalendarClient("microsoft_teams");
export const microsoftOutlookClient: CalendarClient = createMicrosoftCalendarClient("microsoft_outlook");
