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
  workspaceId?: string | null;
  provider: "google_meet" | "zoom_web" | "teams_web";
  title: string;
  meetingLink: string;
  normalizedMeetingUrl?: string | null;
  externalCalendarEventId?: string | null;
  claimToken?: string | null;
  scheduledStartTime?: Date | string | null;
  scheduledEndTime?: Date | string | null;
  notes?: string;
  status: MeetingSessionStatus;
};

type UpdateMeetingSessionInput = {
  workspaceId?: string | null;
  provider?: "google_meet" | "zoom_web" | "teams_web";
  title?: string;
  meetingLink?: string;
  normalizedMeetingUrl?: string | null;
  sharedWithUserIds?: string[];
  externalCalendarEventId?: string | null;
  claimToken?: string | null;
  scheduledStartTime?: Date | string | null;
  scheduledEndTime?: Date | string | null;
  notes?: string;
  errorCode?: string | null;
  failureReason?: string | null;
  transcript?: string;
  summary?: string;
  keyDecisions?: string[];
  risksAndBlockers?: string[];
  keyTopics?: string[];
  meetingSentiment?: string | null;
  followUpNeeded?: boolean | null;
  meetingDuration?: number | null;
  followUpEmail?: string;
  keyPoints?: string[];
  actionItems?: Array<{
    task: string;
    owner: string;
    deadline: string;
    completed: boolean;
  }>;
  recordingFilePath?: string | null;
  recordingUrl?: string | null;
  recordingSize?: number | null;
  recordingDuration?: number | null;
  recordingStartedAt?: Date | string | null;
  recordingEndedAt?: Date | string | null;
  insights?: Record<string, unknown> | null;
  chapters?: Array<Record<string, unknown>> | null;
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
      workspaceId: values.workspaceId ?? null,
      provider: values.provider,
      title: values.title,
      meetingLink: values.meetingLink,
      normalizedMeetingUrl: values.normalizedMeetingUrl ?? null,
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

  if (values.workspaceId !== undefined) {
    payload.workspaceId = values.workspaceId;
  }

  if (values.meetingLink !== undefined) {
    payload.meetingLink = values.meetingLink;
  }

  if (values.normalizedMeetingUrl !== undefined) {
    payload.normalizedMeetingUrl = values.normalizedMeetingUrl || null;
  }

  if (values.sharedWithUserIds !== undefined) {
    payload.sharedWithUserIds = values.sharedWithUserIds;
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

  if (values.errorCode !== undefined) {
    payload.errorCode = values.errorCode || null;
  }

  if (values.failureReason !== undefined) {
    payload.failureReason = values.failureReason || null;
  }

  if (values.transcript !== undefined) {
    payload.transcript = values.transcript;
  }

  if (values.summary !== undefined) {
    payload.summary = values.summary;
  }

  if (values.keyDecisions !== undefined) {
    payload.keyDecisions = values.keyDecisions;
  }

  if (values.risksAndBlockers !== undefined) {
    payload.risksAndBlockers = values.risksAndBlockers;
  }

  if (values.keyTopics !== undefined) {
    payload.keyTopics = values.keyTopics;
  }

  if (values.meetingSentiment !== undefined) {
    payload.meetingSentiment = values.meetingSentiment || null;
  }

  if (values.followUpNeeded !== undefined) {
    payload.followUpNeeded = values.followUpNeeded;
  }

  if (values.meetingDuration !== undefined) {
    payload.meetingDuration = values.meetingDuration;
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

  if (values.recordingFilePath !== undefined) {
    payload.recordingFilePath = values.recordingFilePath || null;
  }

  if (values.recordingUrl !== undefined) {
    payload.recordingUrl = values.recordingUrl || null;
  }

  if (values.recordingSize !== undefined) {
    payload.recordingSize = values.recordingSize;
  }

  if (values.recordingDuration !== undefined) {
    payload.recordingDuration = values.recordingDuration;
  }

  if (values.recordingStartedAt !== undefined) {
    payload.recordingStartedAt =
      typeof values.recordingStartedAt === "string"
        ? new Date(values.recordingStartedAt)
        : values.recordingStartedAt;
  }

  if (values.recordingEndedAt !== undefined) {
    payload.recordingEndedAt =
      typeof values.recordingEndedAt === "string"
        ? new Date(values.recordingEndedAt)
        : values.recordingEndedAt;
  }

  if (values.insights !== undefined) {
    payload.insights = values.insights;
  }

  if (values.chapters !== undefined) {
    payload.chapters = values.chapters;
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

export async function addUserToMeetingSessionShares(sessionId: string, userIdToAdd: string) {
  const database = getDbOrThrow();
  const [row] = await database.select().from(meetingSessions).where(eq(meetingSessions.id, sessionId)).limit(1);

  if (!row) {
    return null;
  }

  const current = row.sharedWithUserIds ?? [];

  if (current.includes(userIdToAdd)) {
    return row;
  }

  const [updated] = await database
    .update(meetingSessions)
    .set({
      sharedWithUserIds: [...current, userIdToAdd],
      updatedAt: new Date()
    })
    .where(eq(meetingSessions.id, sessionId))
    .returning();

  return updated ?? null;
}
