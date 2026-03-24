import { encodeCalendarMeetingId } from "@/features/meetings/ids";
import type { UpcomingMeeting } from "@/features/upcoming-meetings/types";

export function buildMeetingAssistantHref(meeting: UpcomingMeeting) {
  return `/dashboard/meetings/${encodeCalendarMeetingId(meeting.id)}`;
}
