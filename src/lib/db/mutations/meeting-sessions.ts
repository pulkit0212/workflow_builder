import { and, eq } from "drizzle-orm";
import { meetingSessions } from "@/db/schema";
import type { MeetingSessionStatus } from "@/features/meeting-assistant/types";
import { db } from "@/lib/db/client";

const meetingSessionsLogPrefix = "[db-meeting-sessions]";

function getDbOrThrow() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return db;
}

type CreateMeetingSessionInput = {
  userId: string;
  provider: "google_meet" | "zoom_web" | "teams_web";
  title: string;
  meetingLink: string;
  externalCalendarEventId?: string | null;
  claimToken?: string | null;
  scheduledStartTime?: Date | string | null;
  scheduledEndTime?: Date | string | null;
  notes?: string;
  status: MeetingSessionStatus;
};

type UpdateMeetingSessionInput = {
  provider?: "google_meet" | "zoom_web" | "teams_web";
  title?: string;
  meetingLink?: string;
  externalCalendarEventId?: string | null;
  claimToken?: string | null;
  scheduledStartTime?: Date | string | null;
  scheduledEndTime?: Date | string | null;
  notes?: string;
  transcript?: string;
  summary?: string;
  followUpEmail?: string;
  keyPoints?: string[];
  actionItems?: Array<{
    task: string;
    owner: string;
    deadline: string;
    completed: boolean;
  }>;
  status?: MeetingSessionStatus;
  emailSent?: boolean;
  emailSentAt?: Date | string | null;
  aiRunId?: string;
};

export async function createMeetingSession(values: CreateMeetingSessionInput) {
  const database = getDbOrThrow();
  console.info(`${meetingSessionsLogPrefix} inserting meeting_session`, {
    userId: values.userId,
    provider: values.provider,
    title: values.title
  });

  const [session] = await database
    .insert(meetingSessions)
    .values({
      userId: values.userId,
      provider: values.provider,
      title: values.title,
      meetingLink: values.meetingLink,
      externalCalendarEventId: values.externalCalendarEventId ?? null,
      claimToken: values.claimToken ?? null,
      scheduledStartTime:
        typeof values.scheduledStartTime === "string"
          ? new Date(values.scheduledStartTime)
          : values.scheduledStartTime ?? null,
      scheduledEndTime:
        typeof values.scheduledEndTime === "string"
          ? new Date(values.scheduledEndTime)
          : values.scheduledEndTime ?? null,
      notes: values.notes || null,
      status: values.status
    })
    .returning();

  if (!session) {
    throw new Error("Failed to create meeting session.");
  }

  return session;
}

export async function updateMeetingSession(sessionId: string, userId: string, values: UpdateMeetingSessionInput) {
  const database = getDbOrThrow();
  const payload: Record<string, unknown> = {
    updatedAt: new Date()
  };

  if (values.title !== undefined) {
    payload.title = values.title;
  }

  if (values.provider !== undefined) {
    payload.provider = values.provider;
  }

  if (values.meetingLink !== undefined) {
    payload.meetingLink = values.meetingLink;
  }

  if (values.externalCalendarEventId !== undefined) {
    payload.externalCalendarEventId = values.externalCalendarEventId;
  }

  if (values.claimToken !== undefined) {
    payload.claimToken = values.claimToken;
  }

  if (values.scheduledStartTime !== undefined) {
    payload.scheduledStartTime =
      typeof values.scheduledStartTime === "string"
        ? new Date(values.scheduledStartTime)
        : values.scheduledStartTime;
  }

  if (values.scheduledEndTime !== undefined) {
    payload.scheduledEndTime =
      typeof values.scheduledEndTime === "string"
        ? new Date(values.scheduledEndTime)
        : values.scheduledEndTime;
  }

  if (values.notes !== undefined) {
    payload.notes = values.notes || null;
  }

  if (values.transcript !== undefined) {
    payload.transcript = values.transcript;
  }

  if (values.summary !== undefined) {
    payload.summary = values.summary;
  }

  if (values.followUpEmail !== undefined) {
    payload.followUpEmail = values.followUpEmail || null;
  }

  if (values.keyPoints !== undefined) {
    payload.keyPoints = values.keyPoints;
  }

  if (values.actionItems !== undefined) {
    payload.actionItems = values.actionItems;
  }

  if (values.status !== undefined) {
    payload.status = values.status;
  }

  if (values.emailSent !== undefined) {
    payload.emailSent = values.emailSent;
  }

  if (values.emailSentAt !== undefined) {
    payload.emailSentAt =
      typeof values.emailSentAt === "string"
        ? new Date(values.emailSentAt)
        : values.emailSentAt;
  }

  if (values.aiRunId !== undefined) {
    payload.aiRunId = values.aiRunId;
  }

  const [session] = await database
    .update(meetingSessions)
    .set(payload)
    .where(and(eq(meetingSessions.id, sessionId), eq(meetingSessions.userId, userId)))
    .returning();

  if (!session) {
    throw new Error("Meeting session not found.");
  }

  return session;
}
