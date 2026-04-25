import { googleCalendarClient } from "./google";
import { microsoftTeamsClient, microsoftOutlookClient } from "./microsoft";
import type { CalendarProvider, CalendarFeedResponse, UnifiedCalendarMeeting } from "./types";

type UserIntegrationRow = {
  provider: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiry: Date | null;
};

const CALENDAR_PROVIDERS: CalendarProvider[] = ["google", "microsoft_teams", "microsoft_outlook"];

function getClientForProvider(provider: CalendarProvider) {
  switch (provider) {
    case "google": return googleCalendarClient;
    case "microsoft_teams": return microsoftTeamsClient;
    case "microsoft_outlook": return microsoftOutlookClient;
  }
}

// Fetch connected calendar integrations from Express API
async function fetchCalendarIntegrations(token: string): Promise<UserIntegrationRow[]> {
  const BASE_URL = process.env.NEXT_PUBLIC_API_URL;
  if (!BASE_URL) return [];

  try {
    const res = await fetch(`${BASE_URL}/api/calendar/status`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];

    const data = await res.json() as { connections?: Record<string, boolean> };
    const connections = data.connections ?? {};

    // Return rows for connected providers — tokens are fetched per-provider when needed
    return CALENDAR_PROVIDERS
      .filter((p) => connections[p])
      .map((p) => ({
        provider: p,
        accessToken: null, // will be fetched via token refresh flow
        refreshToken: null,
        expiry: null,
      }));
  } catch {
    return [];
  }
}

export async function fetchUnifiedCalendarFeed(
  userId: string,
  startDate: Date,
  endDate: Date,
  token?: string
): Promise<CalendarFeedResponse> {
  if (!token) return { meetings: [] };

  const integrations = await fetchCalendarIntegrations(token);
  const connected = integrations.filter((r) => r.provider);

  if (connected.length === 0) return { meetings: [] };

  const results = await Promise.allSettled(
    connected.map((integration) => {
      const provider = integration.provider as CalendarProvider;
      const client = getClientForProvider(provider);
      return client.fetchMeetings({
        accessToken: integration.accessToken ?? "",
        refreshToken: integration.refreshToken,
        userId,
        startDate,
        endDate,
      });
    })
  );

  const meetings: UnifiedCalendarMeeting[] = [];
  const failedProviders: Array<{ provider: CalendarProvider; error: string }> = [];

  results.forEach((result, index) => {
    const provider = connected[index]!.provider as CalendarProvider;
    if (result.status === "fulfilled") {
      meetings.push(...result.value);
    } else {
      const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
      failedProviders.push({ provider, error });
    }
  });

  meetings.sort((a, b) => a.startTime.localeCompare(b.startTime));

  const PROVIDER_PRIORITY: Record<string, number> = {
    microsoft_teams: 0, microsoft_outlook: 1, google: 2,
  };

  const seen = new Map<string, UnifiedCalendarMeeting>();
  for (const m of meetings) {
    const key = `${m.title.toLowerCase().trim()}|${m.startTime.slice(0, 16)}`;
    const existing = seen.get(key);
    if (!existing || (PROVIDER_PRIORITY[m.provider] ?? 99) < (PROVIDER_PRIORITY[existing.provider] ?? 99)) {
      seen.set(key, m);
    }
  }

  const dedupedMeetings = Array.from(seen.values()).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const response: CalendarFeedResponse = { meetings: dedupedMeetings };
  if (failedProviders.length > 0) response.partialFailure = { failedProviders };

  return response;
}
