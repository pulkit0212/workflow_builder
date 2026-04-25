import { fetchUpcomingGoogleCalendarMeetings } from "@/lib/google/calendar";

// Fetches upcoming Google Calendar meetings using an access token obtained from the Express API.
// The token is passed in from the caller (server component or API route) that already has it.
export async function getUpcomingGoogleCalendarMeetingsForUser(accessToken: string) {
  if (!accessToken) return [];
  return fetchUpcomingGoogleCalendarMeetings(accessToken);
}
