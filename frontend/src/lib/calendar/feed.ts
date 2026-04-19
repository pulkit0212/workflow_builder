import { db } from "@/lib/db/client";
import { userIntegrations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { googleCalendarClient } from "./google";
import { microsoftTeamsClient, microsoftOutlookClient } from "./microsoft";
import type { CalendarProvider, CalendarFeedResponse, UnifiedCalendarMeeting } from "./types";

type UserIntegrationRow = {
  id: string;
  userId: string;
  provider: string;
  email: string | null;
  scopes: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiry: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const CALENDAR_PROVIDERS: CalendarProvider[] = ["google", "microsoft_teams", "microsoft_outlook"];

function getClientForProvider(provider: CalendarProvider) {
  switch (provider) {
    case "google":
      return googleCalendarClient;
    case "microsoft_teams":
      return microsoftTeamsClient;
    case "microsoft_outlook":
      return microsoftOutlookClient;
  }
}

export async function fetchUnifiedCalendarFeed(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<CalendarFeedResponse> {
  if (!db) {
    return { meetings: [] };
  }

  // Query all calendar provider rows for this user
  let integrations: UserIntegrationRow[] = [];
  try {
    integrations = await db
      .select()
      .from(userIntegrations)
      .where(eq(userIntegrations.userId, userId))
      .then((rows) => rows.filter((r) => CALENDAR_PROVIDERS.includes(r.provider as CalendarProvider)));
  } catch (err) {
    console.error("[calendar-feed] DB query failed:", err);
    return { meetings: [] };
  }

  // Only include providers that have a non-null access_token
  const connected = integrations.filter((r) => r.accessToken != null);

  if (connected.length === 0) {
    return { meetings: [] };
  }

  // Fan out to each provider in parallel
  const results = await Promise.allSettled(
    connected.map((integration) => {
      const provider = integration.provider as CalendarProvider;
      const client = getClientForProvider(provider);
      return client.fetchMeetings({
        accessToken: integration.accessToken!,
        refreshToken: integration.refreshToken ?? null,
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

  // Sort merged results by startTime ascending
  meetings.sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Deduplicate: when multiple calendar providers return the same event (e.g. Teams + Outlook
  // both connected to the same Microsoft account), keep only one copy.
  // Dedup key: normalized title + start hour:minute (ignore seconds/nanoseconds).
  // Priority: microsoft_teams > microsoft_outlook > google
  const PROVIDER_PRIORITY: Record<string, number> = {
    microsoft_teams: 0,
    microsoft_outlook: 1,
    google: 2,
  };

  function normalizeStartTime(iso: string): string {
    // Truncate to minute precision: "2026-04-18T07:30" — ignores seconds/nanoseconds
    return iso.slice(0, 16);
  }

  const seen = new Map<string, UnifiedCalendarMeeting>();
  for (const m of meetings) {
    const key = `${m.title.toLowerCase().trim()}|${normalizeStartTime(m.startTime)}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, m);
    } else {
      const existingPriority = PROVIDER_PRIORITY[existing.provider] ?? 99;
      const newPriority = PROVIDER_PRIORITY[m.provider] ?? 99;
      if (newPriority < existingPriority) {
        seen.set(key, m);
      }
    }
  }
  const dedupedMeetings = Array.from(seen.values());
  // Re-sort after dedup
  dedupedMeetings.sort((a, b) => a.startTime.localeCompare(b.startTime));

  const response: CalendarFeedResponse = { meetings: dedupedMeetings };
  if (failedProviders.length > 0) {
    response.partialFailure = { failedProviders };
  }

  return response;
}
