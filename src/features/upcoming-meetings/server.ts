import { fetchUpcomingGoogleCalendarMeetings } from "@/lib/google/calendar";
import { getActiveGoogleIntegration } from "@/lib/google/integration";

export async function getUpcomingGoogleCalendarMeetingsForUser(userId: string) {
  const integration = await getActiveGoogleIntegration(userId);

  if (!integration?.accessToken) {
    return [];
  }

  return fetchUpcomingGoogleCalendarMeetings(integration.accessToken);
}
