import { and, count, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { meetingSessions, workspaceMembers } from "@/db/schema";
import { db } from "@/lib/db/client";

function getDbOrThrow() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return db;
}

/**
 * Retrieves a meeting session by ID, enforcing the visibility access matrix:
 *
 * - private  → owner (userId) OR workspace member with role admin/owner
 * - workspace → any active workspace member
 * - shared   → owner OR admin/owner member OR user in sharedWithUserIds
 *
 * Returns null if the session doesn't exist or the user is not allowed to access it.
 * Callers should treat null as either 404 (not found) or 403 (forbidden) based on
 * whether the raw session exists — use `getMeetingSessionById` to distinguish.
 */
export async function getMeetingSessionByIdForUser(
  sessionId: string,
  userId: string,
  workspaceId?: string | null
): Promise<(typeof meetingSessions.$inferSelect) | null> {
  const database = getDbOrThrow();

  // Fetch the session (must belong to the given workspace if provided, otherwise just by id)
  const [session] = await database
    .select()
    .from(meetingSessions)
    .where(
      workspaceId
        ? and(
            eq(meetingSessions.id, sessionId),
            eq(meetingSessions.workspaceId, workspaceId)
          )
        : eq(meetingSessions.id, sessionId)
    )
    .limit(1);

  if (!session) return null;

  // Owner always has access
  if (session.userId === userId) return session;

  // Fetch the requester's membership in this workspace
  const [membership] = await database
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.status, "active")
      )
    )
    .limit(1);

  const role = membership?.role ?? null;
  const isAdminOrOwner = role === "admin" || role === "owner";
  const isActiveMember = role !== null; // any active membership

  const visibility = session.visibility as "private" | "workspace" | "shared";

  if (visibility === "private") {
    // Only owner (already handled above) and admin/owner members
    return isAdminOrOwner ? session : null;
  }

  if (visibility === "workspace") {
    // Any active workspace member
    return isActiveMember ? session : null;
  }

  // visibility === "shared"
  // Admin/owner members always have access
  if (isAdminOrOwner) return session;

  // Active members (member/viewer) have access if in sharedWithUserIds
  const sharedWith = (session.sharedWithUserIds as string[]) ?? [];
  if (sharedWith.includes(userId)) return session;

  // Active members (member role) also have access as workspace members
  if (role === "member") return session;

  // Viewers only if explicitly in sharedWithUserIds (already checked above)
  return null;
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

export async function getLatestMeetingSessionByLinkForUser(
  meetingLink: string,
  userId: string,
  workspaceId?: string | null
) {
  const database = getDbOrThrow();

  const [session] = await database
    .select()
    .from(meetingSessions)
    .where(
      workspaceId
        ? and(
            eq(meetingSessions.workspaceId, workspaceId),
            eq(meetingSessions.userId, userId),
            eq(meetingSessions.meetingLink, meetingLink)
          )
        : and(
            eq(meetingSessions.userId, userId),
            eq(meetingSessions.meetingLink, meetingLink)
          )
    )
    .orderBy(desc(meetingSessions.updatedAt))
    .limit(1);

  return session ?? null;
}

export async function getLatestMeetingSessionByCalendarEventIdForUser(
  externalCalendarEventId: string,
  userId: string,
  workspaceId?: string | null
) {
  const database = getDbOrThrow();

  const [session] = await database
    .select()
    .from(meetingSessions)
    .where(
      workspaceId
        ? and(
            eq(meetingSessions.userId, userId),
            eq(meetingSessions.workspaceId, workspaceId),
            eq(meetingSessions.externalCalendarEventId, externalCalendarEventId)
          )
        : and(
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
  workspaceId?: string | null,
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

export async function listMeetingSessionsByStatusesForUser(
  userId: string,
  workspaceId?: string | null,
  statuses: string[] = []
) {
  const database = getDbOrThrow();

  return database
    .select()
    .from(meetingSessions)
    .where(
      workspaceId
        ? and(
            eq(meetingSessions.workspaceId, workspaceId),
            eq(meetingSessions.userId, userId),
            inArray(meetingSessions.status, statuses)
          )
        : and(
            eq(meetingSessions.userId, userId),
            inArray(meetingSessions.status, statuses)
          )
    )
    .orderBy(desc(meetingSessions.updatedAt));
}

const ACTIVE_GOOGLE_MEET_STATUSES = [
  "waiting_for_join",
  "waiting_for_admission",
  "capturing",
  "processing",
  "summarizing"
] as const;

export async function findActiveGoogleMeetSessionByNormalizedUrl(
  normalizedUrl: string,
  workspaceId?: string | null
) {
  const database = getDbOrThrow();

  const [session] = await database
    .select()
    .from(meetingSessions)
    .where(
      workspaceId
        ? and(
            eq(meetingSessions.normalizedMeetingUrl, normalizedUrl),
            eq(meetingSessions.workspaceId, workspaceId),
            inArray(meetingSessions.status, [...ACTIVE_GOOGLE_MEET_STATUSES])
          )
        : and(
            eq(meetingSessions.normalizedMeetingUrl, normalizedUrl),
            inArray(meetingSessions.status, [...ACTIVE_GOOGLE_MEET_STATUSES])
          )
    )
    .orderBy(desc(meetingSessions.updatedAt))
    .limit(1);

  return session ?? null;
}

export async function listMeetingSessionsByUserPaginated(
  userId: string,
  workspaceId?: string | null,
  options: {
    page: number;
    limit: number;
    excludeDrafts?: boolean;
    statuses?: string[];
    search?: string;
    dateFrom?: Date;
    requireApprovedForWorkspace?: boolean;
    excludeUnrecorded?: boolean; // exclude scheduled/draft meetings with no transcript/summary
  } = { page: 1, limit: 20 }
) {
  const database = getDbOrThrow();
  const { page, limit, excludeDrafts, statuses, search, dateFrom, requireApprovedForWorkspace, excludeUnrecorded } = options;
  const offset = (page - 1) * limit;

  // Workspace mode: show ALL meetings shared to this workspace (any user)
  // Personal mode: show only current user's meetings
  const conditions = workspaceId
    ? [eq(meetingSessions.workspaceId, workspaceId)]
    : [eq(meetingSessions.userId, userId)];

  // In workspace mode, only show explicitly shared (approved) meetings
  if (workspaceId && requireApprovedForWorkspace) {
    conditions.push(eq(meetingSessions.workspaceMoveStatus, "approved"));
  }

  if (excludeDrafts) {
    conditions.push(ne(meetingSessions.status, "draft"));
  }

  // Exclude meetings that were shared from calendar but never actually recorded
  // (status = scheduled/draft AND no transcript AND no summary)
  if (excludeUnrecorded) {
    conditions.push(
      or(
        // Keep if status is not scheduled/draft (i.e., was actually processed)
        and(
          ne(meetingSessions.status, "scheduled"),
          ne(meetingSessions.status, "draft")
        ),
        // OR keep if it has transcript or summary (content exists)
        sql`(${meetingSessions.transcript} IS NOT NULL AND ${meetingSessions.transcript} != '')`,
        sql`(${meetingSessions.summary} IS NOT NULL AND ${meetingSessions.summary} != '')`
      )!
    );
  }

  if (statuses && statuses.length > 0) {
    conditions.push(inArray(meetingSessions.status, statuses));
  }

  if (search && search.trim().length > 0) {
    const term = `%${search.trim().toLowerCase()}%`;
    conditions.push(
      or(
        ilike(meetingSessions.title, term),
        ilike(meetingSessions.summary ?? sql`''`, term),
        ilike(meetingSessions.failureReason ?? sql`''`, term)
      )!
    );
  }

  if (dateFrom) {
    conditions.push(sql`${meetingSessions.createdAt} >= ${dateFrom}`);
  }

  const where = and(...conditions);

  const [rows, totalRows] = await Promise.all([
    database
      .select()
      .from(meetingSessions)
      .where(where)
      .orderBy(desc(meetingSessions.createdAt))
      .limit(limit)
      .offset(offset),
    database
      .select({ count: count() })
      .from(meetingSessions)
      .where(where)
  ]);

  const total = totalRows[0]?.count ?? 0;

  return {
    sessions: rows,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.max(Math.ceil(total / limit), 1)
    }
  };
}
