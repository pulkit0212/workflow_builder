import { normalizeMeetingActionItems } from "@/features/meeting-assistant/helpers";
import { toMeetingSessionRecord } from "@/features/meeting-assistant/server/session-record";
import { mapMeetingSessionToDetailStatus } from "@/features/meetings/helpers";
import { encodeCalendarMeetingId } from "@/features/meetings/ids";
import type { MeetingDetailRecord } from "@/features/meetings/types";
import type { GoogleCalendarMeeting } from "@/lib/google/types";
import type { getMeetingSessionByIdForUser, getLatestMeetingSessionByLinkForUser } from "@/lib/db/queries/meeting-sessions";

type DatabaseMeetingSession =
  | Awaited<ReturnType<typeof getMeetingSessionByIdForUser>>
  | Awaited<ReturnType<typeof getLatestMeetingSessionByLinkForUser>>;

export function buildMeetingDetailFromSession(params: {
  routeId?: string;
  session: NonNullable<DatabaseMeetingSession>;
  calendarMeeting?: GoogleCalendarMeeting | null;
}): MeetingDetailRecord {
  const sessionRecord = toMeetingSessionRecord(params.session);
  const scheduledStartTime = params.calendarMeeting?.startTime ?? sessionRecord.scheduledStartTime ?? null;
  const scheduledEndTime = params.calendarMeeting?.endTime ?? sessionRecord.scheduledEndTime ?? null;

  return {
    id: params.routeId ?? sessionRecord.id,
    meetingSessionId: sessionRecord.id,
    calendarEventId: params.calendarMeeting?.id ?? sessionRecord.externalCalendarEventId ?? null,
    source: params.calendarMeeting ? "google_calendar" : "app",
    title: params.calendarMeeting?.title ?? sessionRecord.title,
    meetingLink: params.calendarMeeting?.meetLink ?? sessionRecord.meetingLink,
    provider: params.calendarMeeting?.provider ?? sessionRecord.provider,
    scheduledStartTime,
    scheduledEndTime,
    captureSessionId: null,
    captureStartedAt: null,
    captureEndedAt: null,
    createdAt: sessionRecord.createdAt,
    updatedAt: sessionRecord.updatedAt,
    status: mapMeetingSessionToDetailStatus(sessionRecord.status),
    transcript: sessionRecord.transcript,
    summary: sessionRecord.summary,
    keyPoints: sessionRecord.keyPoints,
    actionItems: normalizeMeetingActionItems(sessionRecord.actionItems),
    canJoinAndCapture: !sessionRecord.summary && mapMeetingSessionToDetailStatus(sessionRecord.status) !== "processing"
  };
}

export function buildMeetingDetailFromCalendarMeeting(meeting: GoogleCalendarMeeting): MeetingDetailRecord {
  return {
    id: encodeCalendarMeetingId(meeting.id),
    meetingSessionId: null,
    calendarEventId: meeting.id,
    source: "google_calendar",
    title: meeting.title,
    meetingLink: meeting.meetLink ?? "",
    provider: meeting.provider,
    scheduledStartTime: meeting.startTime,
    scheduledEndTime: meeting.endTime,
    captureSessionId: null,
    captureStartedAt: null,
    captureEndedAt: null,
    createdAt: null,
    updatedAt: null,
    status: "scheduled",
    transcript: null,
    summary: null,
    keyPoints: [],
    actionItems: [],
    canJoinAndCapture: Boolean(meeting.meetLink)
  };
}
