import type { InferSelectModel } from "drizzle-orm";
import { meetingSessions } from "@/db/schema";
import { normalizeMeetingActionItems } from "@/features/meeting-assistant/helpers";
import type { MeetingSessionRecord } from "@/features/meeting-assistant/types";

type DatabaseMeetingSession = InferSelectModel<typeof meetingSessions>;

export function toMeetingSessionRecord(session: DatabaseMeetingSession): MeetingSessionRecord {
  const normalizedStatus =
    session.status.startsWith("waiting_for_") ? "waiting_for_join" : session.status;

  return {
    id: session.id,
    title: session.title,
    meetingLink: session.meetingLink,
    externalCalendarEventId: session.externalCalendarEventId ?? null,
    provider:
      session.provider === "google_meet" || session.provider === "zoom_web" || session.provider === "teams_web"
        ? session.provider
        : "google_meet",
    scheduledStartTime: session.scheduledStartTime ? session.scheduledStartTime.toISOString() : null,
    scheduledEndTime: session.scheduledEndTime ? session.scheduledEndTime.toISOString() : null,
    notes: session.notes ?? null,
    transcript: session.transcript ?? null,
    summary: session.summary ?? null,
    followUpEmail: session.followUpEmail ?? null,
    keyPoints: Array.isArray(session.keyPoints) ? session.keyPoints : [],
    actionItems: normalizeMeetingActionItems(session.actionItems),
    emailSent: Boolean(session.emailSent),
    emailSentAt: session.emailSentAt ? session.emailSentAt.toISOString() : null,
    status:
      normalizedStatus === "joining" ||
      normalizedStatus === "waiting_for_join" ||
      normalizedStatus === "joined" ||
      normalizedStatus === "capturing" ||
      normalizedStatus === "recording" ||
      normalizedStatus === "recorded" ||
      normalizedStatus === "processing_transcript" ||
      normalizedStatus === "processing_summary" ||
      normalizedStatus === "processing" ||
      normalizedStatus === "failed" ||
      normalizedStatus === "transcribed" ||
      normalizedStatus === "completed"
        ? normalizedStatus
        : "draft",
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString()
  };
}
