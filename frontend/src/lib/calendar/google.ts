import { refreshGoogleAccessToken, GoogleCalendarAuthRequiredError } from "@/lib/google/integration";
import type { CalendarClient, UnifiedCalendarMeeting } from "@/lib/calendar/types";

type GoogleCalendarEvent = {
  id?: string;
  summary?: string;
  status?: string;
  hangoutLink?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  conferenceData?: {
    entryPoints?: Array<{ uri?: string; entryPointType?: string }>;
  };
};

function isGoogleMeetLink(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    return /^meet\.google\.com$/i.test(new URL(value).host);
  } catch { return false; }
}

function isZoomLink(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const { hostname } = new URL(value);
    return hostname === "zoom.us" || hostname.endsWith(".zoom.us");
  } catch { return false; }
}

function isTeamsLink(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const { hostname } = new URL(value);
    return hostname.includes("teams.microsoft.com") || hostname.includes("teams.live.com");
  } catch { return false; }
}

function resolveMeetLink(event: GoogleCalendarEvent): string | null {
  if (event.hangoutLink && isGoogleMeetLink(event.hangoutLink)) return event.hangoutLink;

  const videoEntry = event.conferenceData?.entryPoints?.find(
    (ep) => ep.entryPointType === "video" && ep.uri
  );
  if (videoEntry?.uri) return videoEntry.uri;

  for (const ep of event.conferenceData?.entryPoints ?? []) {
    if (!ep.uri) continue;
    if (isGoogleMeetLink(ep.uri) || isZoomLink(ep.uri) || isTeamsLink(ep.uri)) return ep.uri;
  }

  const text = [event.description ?? "", event.location ?? ""].join(" ");
  const urls = text.match(/https?:\/\/[^\s"<>]+/g) ?? [];
  for (const url of urls) {
    if (isZoomLink(url) || isTeamsLink(url)) return url.split("?")[0] ?? url;
  }

  return null;
}

function mapToUnified(event: GoogleCalendarEvent): UnifiedCalendarMeeting {
  return {
    id: `google_${event.id ?? crypto.randomUUID()}`,
    title: event.summary?.trim() || "Untitled event",
    startTime: event.start?.dateTime || event.start?.date || "",
    endTime: event.end?.dateTime || event.end?.date || event.start?.dateTime || event.start?.date || "",
    meetLink: resolveMeetLink(event),
    provider: "google",
    source: "google_calendar",
  };
}

async function fetchEvents(params: {
  accessToken: string;
  refreshToken: string | null;
  userId: string;
  timeMin: string;
  timeMax: string;
}): Promise<{ items?: GoogleCalendarEvent[] }> {
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("timeMin", params.timeMin);
  url.searchParams.set("timeMax", params.timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "50");
  url.searchParams.set("conferenceDataVersion", "1");
  url.searchParams.set("fields", "items(id,summary,status,hangoutLink,description,location,start,end,conferenceData)");

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${params.accessToken}` },
    cache: "no-store",
  });

  if (response.status === 401 && params.refreshToken) {
    let refreshed;
    try {
      refreshed = await refreshGoogleAccessToken({
        userId: params.userId,
        refreshToken: params.refreshToken,
      });
    } catch (err) {
      throw err instanceof GoogleCalendarAuthRequiredError
        ? err
        : new GoogleCalendarAuthRequiredError();
    }
    return fetchEvents({
      accessToken: refreshed.accessToken ?? "",
      refreshToken: refreshed.refreshToken,
      userId: params.userId,
      timeMin: params.timeMin,
      timeMax: params.timeMax,
    });
  }

  if (response.status === 401) throw new GoogleCalendarAuthRequiredError();
  if (!response.ok) throw new Error("Failed to fetch Google Calendar events.");

  return response.json() as Promise<{ items?: GoogleCalendarEvent[] }>;
}

export const googleCalendarClient: CalendarClient = {
  async fetchMeetings({ accessToken, refreshToken, userId, startDate, endDate }) {
    const payload = await fetchEvents({
      accessToken,
      refreshToken,
      userId,
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
    });

    return (payload.items ?? [])
      .filter((event) => event.status !== "cancelled")
      .map(mapToUnified);
  },
};
