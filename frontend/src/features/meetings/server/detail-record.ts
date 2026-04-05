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
    captureStartedAt: sessionRecord.recordingStartedAt,
    captureEndedAt: sessionRecord.recordingEndedAt,
    createdAt: sessionRecord.createdAt,
    updatedAt: sessionRecord.updatedAt,
    status: mapMeetingSessionToDetailStatus(sessionRecord.status),
    errorCode: sessionRecord.errorCode,
    failureReason: sessionRecord.failureReason,
    transcript: sessionRecord.transcript,
    summary: sessionRecord.summary,
    keyDecisions: sessionRecord.keyDecisions,
    risksAndBlockers: sessionRecord.risksAndBlockers,
    keyTopics: sessionRecord.keyTopics,
    meetingSentiment: sessionRecord.meetingSentiment,
    followUpNeeded: sessionRecord.followUpNeeded,
    meetingDuration: sessionRecord.meetingDuration,
    keyPoints: sessionRecord.keyPoints,
    actionItems: normalizeMeetingActionItems(sessionRecord.actionItems),
    recordingUrl: sessionRecord.recordingUrl,
    recordingSize: sessionRecord.recordingSize,
    recordingDuration: sessionRecord.recordingDuration,
    insights: sessionRecord.insights,
    chapters: sessionRecord.chapters,
    canJoinAndCapture: mapMeetingSessionToDetailStatus(sessionRecord.status) === "failed"
      ? true
      : !sessionRecord.summary && mapMeetingSessionToDetailStatus(sessionRecord.status) !== "processing"
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
    errorCode: null,
    failureReason: null,
    transcript: null,
    summary: null,
    keyDecisions: [],
    risksAndBlockers: [],
    keyTopics: [],
    meetingSentiment: null,
    followUpNeeded: null,
    meetingDuration: null,
    keyPoints: [],
    actionItems: [],
    recordingUrl: null,
    recordingSize: null,
    recordingDuration: null,
    insights: null,
    chapters: null,
    canJoinAndCapture: Boolean(meeting.meetLink)
  };
}
