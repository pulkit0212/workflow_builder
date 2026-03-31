import type { GoogleCalendarMeeting } from "@/lib/google/types";
import { GoogleCalendarAuthRequiredError, refreshGoogleAccessToken } from "@/lib/google/integration";

type GoogleCalendarEvent = {
  id?: string;
  summary?: string;
  status?: string;
  hangoutLink?: string;
  start?: {
    dateTime?: string;
    date?: string;
  };
  end?: {
    dateTime?: string;
    date?: string;
  };
  conferenceData?: {
    entryPoints?: Array<{
      uri?: string;
      entryPointType?: string;
      label?: string;
    }>;
  };
};

type GoogleCalendarEventResponse = GoogleCalendarEvent & {
  error?: {
    message?: string;
  };
};

const googleCalendarLogPrefix = "[google-calendar]";

function isGoogleMeetLink(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return /^meet\.google\.com$/i.test(url.host);
  } catch {
    return false;
  }
}

function resolveMeetLink(event: GoogleCalendarEvent): string | null {
  if (event.hangoutLink && isGoogleMeetLink(event.hangoutLink)) {
    return event.hangoutLink;
  }

  return (
    event.conferenceData?.entryPoints?.find((entryPoint) => {
      if (entryPoint.entryPointType !== "video") {
        return false;
      }

      return isGoogleMeetLink(entryPoint.uri) || /google meet/i.test(entryPoint.label ?? "");
    })?.uri ??
    null
  );
}

function getGoogleCalendarMeetingsForRangeUrl(params: {
  timeMin: string;
  timeMax?: string;
}) {
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("timeMin", params.timeMin);

  if (params.timeMax) {
    url.searchParams.set("timeMax", params.timeMax);
  }

  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "50");
  url.searchParams.set("conferenceDataVersion", "1");

  return url;
}

async function fetchGoogleCalendarEvents(params: {
  accessToken: string;
  timeMin: string;
  timeMax?: string;
  userId?: string;
  refreshToken?: string | null;
}) {
  const url = getGoogleCalendarMeetingsForRangeUrl({
    timeMin: params.timeMin,
    timeMax: params.timeMax
  });

  console.info(`${googleCalendarLogPrefix} querying events`, {
    userId: params.userId ?? null,
    hasAccessToken: Boolean(params.accessToken),
    timeMin: params.timeMin,
    timeMax: params.timeMax ?? null
  });

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${params.accessToken}`
    },
    cache: "no-store"
  });

  if (response.status === 401 && params.userId && params.refreshToken) {
    let refreshedIntegration;

    try {
      refreshedIntegration = await refreshGoogleAccessToken({
        userId: params.userId,
        refreshToken: params.refreshToken
      });
    } catch (error) {
      console.error("[Calendar] Token refresh failed:", error);
      throw error instanceof GoogleCalendarAuthRequiredError
        ? error
        : new GoogleCalendarAuthRequiredError();
    }

    return fetchGoogleCalendarEvents({
      accessToken: refreshedIntegration.accessToken ?? "",
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      userId: params.userId,
      refreshToken: refreshedIntegration.refreshToken
    });
  }

  if (response.status === 401) {
    throw new GoogleCalendarAuthRequiredError();
  }

  if (!response.ok) {
    throw new Error("Failed to fetch Google Calendar events.");
  }

  const payload = (await response.json()) as {
    items?: GoogleCalendarEvent[];
  };

  console.info(`${googleCalendarLogPrefix} received events`, {
    userId: params.userId ?? null,
    eventCount: payload.items?.length ?? 0,
    firstEvent: payload.items?.[0]
      ? {
          id: payload.items[0].id ?? null,
          summary: payload.items[0].summary ?? null,
          status: payload.items[0].status ?? null,
          hasHangoutLink: Boolean(payload.items[0].hangoutLink),
          hasConferenceData: Boolean(payload.items[0].conferenceData?.entryPoints?.length)
        }
      : null
  });

  return payload;
}

async function fetchGoogleCalendarEventById(params: {
  accessToken: string;
  meetingId: string;
  userId?: string;
  refreshToken?: string | null;
}) {
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(params.meetingId)}`
  );
  url.searchParams.set("conferenceDataVersion", "1");

  console.info(`${googleCalendarLogPrefix} querying event by id`, {
    userId: params.userId ?? null,
    meetingId: params.meetingId
  });

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${params.accessToken}`
    },
    cache: "no-store"
  });

  if (response.status === 401 && params.userId && params.refreshToken) {
    let refreshedIntegration;

    try {
      refreshedIntegration = await refreshGoogleAccessToken({
        userId: params.userId,
        refreshToken: params.refreshToken
      });
    } catch (error) {
      console.error("[Calendar] Token refresh failed:", error);
      throw error instanceof GoogleCalendarAuthRequiredError
        ? error
        : new GoogleCalendarAuthRequiredError();
    }

    return fetchGoogleCalendarEventById({
      accessToken: refreshedIntegration.accessToken ?? "",
      meetingId: params.meetingId,
      userId: params.userId,
      refreshToken: refreshedIntegration.refreshToken
    });
  }

  if (response.status === 401) {
    throw new GoogleCalendarAuthRequiredError();
  }

  const payload = (await response.json()) as GoogleCalendarEventResponse;

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(payload.error?.message || "Failed to fetch Google Calendar event.");
  }

  console.info(`${googleCalendarLogPrefix} received event by id`, {
    userId: params.userId ?? null,
    meetingId: params.meetingId,
    hasMeetLink: Boolean(resolveMeetLink(payload))
  });

  return payload;
}

function mapGoogleCalendarEvents(items: GoogleCalendarEvent[]) {
  return items
    .filter((event) => event.status !== "cancelled")
    .map<GoogleCalendarMeeting>((event) => ({
      id: event.id ?? crypto.randomUUID(),
      title: event.summary?.trim() || "Untitled event",
      startTime: event.start?.dateTime || event.start?.date || "",
      endTime: event.end?.dateTime || event.end?.date || event.start?.dateTime || event.start?.date || "",
      meetLink: resolveMeetLink(event),
      provider: "google_meet",
      source: "google_calendar"
    }));
}

export async function fetchUpcomingGoogleCalendarMeetings(accessToken: string) {
  const payload = await fetchGoogleCalendarEvents({
    accessToken,
    timeMin: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
  });

  return mapGoogleCalendarEvents(payload.items ?? []);
}

export async function fetchGoogleCalendarMeetingsForDay(params: {
  accessToken: string;
  userId?: string;
  refreshToken?: string | null;
  day?: Date;
  includeWithoutMeetLink?: boolean;
}) {
  const day = params.day ?? new Date();
  const startOfDay = new Date(day);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(day);
  endOfDay.setHours(23, 59, 59, 999);

  const payload = await fetchGoogleCalendarEvents({
    accessToken: params.accessToken,
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    userId: params.userId,
    refreshToken: params.refreshToken
  });

  const meetings = mapGoogleCalendarEvents(payload.items ?? []);

  console.info(`${googleCalendarLogPrefix} mapped meetings for day`, {
    userId: params.userId ?? null,
    totalEvents: payload.items?.length ?? 0,
    mappedMeetings: meetings.length,
    meetingsWithMeetLinks: meetings.filter((meeting) => Boolean(meeting.meetLink)).length
  });

  return params.includeWithoutMeetLink ? meetings : meetings.filter((meeting) => Boolean(meeting.meetLink));
}

export async function fetchGoogleCalendarMeetingById(params: {
  accessToken: string;
  meetingId: string;
  userId?: string;
  refreshToken?: string | null;
}) {
  const event = await fetchGoogleCalendarEventById({
    accessToken: params.accessToken,
    meetingId: params.meetingId,
    userId: params.userId,
    refreshToken: params.refreshToken
  });

  if (!event || event.status === "cancelled") {
    return null;
  }

  return mapGoogleCalendarEvents([event])[0] ?? null;
}
