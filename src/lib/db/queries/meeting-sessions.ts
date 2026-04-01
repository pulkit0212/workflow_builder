import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { meetingSessions } from "@/db/schema";
import { db } from "@/lib/db/client";

function getDbOrThrow() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return db;
}

export async function getMeetingSessionByIdForUser(sessionId: string, userId: string) {
  const database = getDbOrThrow();

  const [session] = await database
    .select()
    .from(meetingSessions)
    .where(
      and(
        eq(meetingSessions.id, sessionId),
        or(
          eq(meetingSessions.userId, userId),
          sql`EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(${meetingSessions.sharedWithUserIds}, '[]'::jsonb)) AS elem
            WHERE elem = ${userId}::text
          )`
        )
      )
    )
    .limit(1);

  return session ?? null;
}

export async function getMeetingSessionById(sessionId: string) {
  const database = getDbOrThrow();

  const [session] = await database
    .select()
    .from(meetingSessions)
    .where(eq(meetingSessions.id, sessionId))
    .limit(1);

  return session ?? null;
}

export async function getLatestMeetingSessionByLinkForUser(meetingLink: string, userId: string) {
  const database = getDbOrThrow();

  const [session] = await database
    .select()
    .from(meetingSessions)
    .where(and(eq(meetingSessions.userId, userId), eq(meetingSessions.meetingLink, meetingLink)))
    .orderBy(desc(meetingSessions.updatedAt))
    .limit(1);

  return session ?? null;
}

export async function getLatestMeetingSessionByCalendarEventIdForUser(
  externalCalendarEventId: string,
  userId: string
) {
  const database = getDbOrThrow();

  const [session] = await database
    .select()
    .from(meetingSessions)
    .where(
      and(
        eq(meetingSessions.userId, userId),
        eq(meetingSessions.externalCalendarEventId, externalCalendarEventId)
      )
    )
    .orderBy(desc(meetingSessions.updatedAt))
    .limit(1);

  return session ?? null;
}

export async function listMeetingSessionsByUser(
  userId: string,
  options?: {
    completedOnly?: boolean;
    excludeDrafts?: boolean;
  }
) {
  const database = getDbOrThrow();
  const condition = options?.completedOnly
    ? and(eq(meetingSessions.userId, userId), eq(meetingSessions.status, "completed"))
    : options?.excludeDrafts
      ? and(eq(meetingSessions.userId, userId), ne(meetingSessions.status, "draft"))
    : eq(meetingSessions.userId, userId);

  return database
    .select()
    .from(meetingSessions)
    .where(condition)
    .orderBy(desc(meetingSessions.createdAt));
}

export async function listMeetingSessionsByStatusesForUser(userId: string, statuses: string[]) {
  const database = getDbOrThrow();

  return database
    .select()
    .from(meetingSessions)
    .where(and(eq(meetingSessions.userId, userId), inArray(meetingSessions.status, statuses)))
    .orderBy(desc(meetingSessions.updatedAt));
}

const ACTIVE_GOOGLE_MEET_STATUSES = [
  "waiting_for_join",
  "waiting_for_admission",
  "capturing",
  "processing",
  "summarizing"
] as const;

export async function findActiveGoogleMeetSessionByNormalizedUrl(normalizedUrl: string) {
  const database = getDbOrThrow();

  const [session] = await database
    .select()
    .from(meetingSessions)
    .where(
      and(
        eq(meetingSessions.normalizedMeetingUrl, normalizedUrl),
        inArray(meetingSessions.status, [...ACTIVE_GOOGLE_MEET_STATUSES])
      )
    )
    .orderBy(desc(meetingSessions.updatedAt))
    .limit(1);

  return session ?? null;
}
