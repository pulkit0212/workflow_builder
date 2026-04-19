import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { updateMeetingSessionSchema } from "@/features/meeting-assistant/schema";
import { buildMeetingDetailFromCalendarMeeting, buildMeetingDetailFromSession } from "@/features/meetings/server/detail-record";
import { decodeCalendarMeetingId, encodeCalendarMeetingId, isCalendarMeetingId } from "@/features/meetings/ids";
import { fetchGoogleCalendarMeetingById } from "@/lib/google/calendar";
import { getActiveGoogleIntegration } from "@/lib/google/integration";
import { getUserIntegration } from "@/lib/db/queries/user-integrations";
import type { GoogleCalendarMeeting } from "@/lib/google/types";
import {
  getLatestMeetingSessionByCalendarEventIdForUser,
  getLatestMeetingSessionByLinkForUser,
  getMeetingSessionByIdForUser
} from "@/lib/db/queries/meeting-sessions";
import { updateMeetingSession } from "@/lib/db/mutations/meeting-sessions";
import { persistBotCaptureStatusUpdate } from "@/features/meetings/server/bot-capture-persist";
import { normalizeMeetingUrl } from "@/lib/meeting-url";
import { toMeetingSessionRecord } from "@/features/meeting-assistant/server/session-record";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";
import { startBot } from "@/lib/bot";
import {
  canTransitionMeetingSessionStatus,
  logMeetingSessionTransitionApplied,
  logMeetingSessionTransitionAttempt,
  normalizeMeetingSessionStatus
} from "@/features/meetings/server/state-machine";
import { getPlanLimits } from "@/lib/subscription";
import { getUserSubscription } from "@/lib/subscription.server";
import { checkRateLimit } from "@/lib/rate-limit";
import { and, eq, inArray, sql } from "drizzle-orm";
import { meetingSessions } from "@/db/schema";
import { db } from "@/lib/db/client";
import { resolveWorkspaceIdForRequest } from "@/lib/workspaces/server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const ACTIVE_SESSION_STATUSES = [
  "waiting_for_join",
  "waiting_for_admission",
  "capturing",
  "processing",
  "summarizing"
] as const;

/**
 * djb2-based hash that produces a BigInt fitting in a signed 64-bit integer
 * for use as a pg_advisory_xact_lock key.
 */
export function hashString(str: string): bigint {
  let hash = BigInt(5381);
  const mask = BigInt("0xFFFFFFFFFFFFFFFF");
  const signedMax = BigInt("0x7FFFFFFFFFFFFFFF");
  const mod = BigInt("0x10000000000000000");
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << BigInt(5)) + hash + BigInt(str.charCodeAt(i))) & mask;
  }
  // Convert to signed 64-bit range so Postgres accepts it
  if (hash > signedMax) {
    hash -= mod;
  }
  return hash;
}

type AtomicDedupResult =
  | { type: "new"; session: typeof meetingSessions.$inferSelect }
  | { type: "existing"; session: typeof meetingSessions.$inferSelect };

type AtomicInsertValues = {
  userId: string;
  workspaceId: string | null;
  provider: "google_meet" | "zoom_web" | "teams_web";
  title: string;
  meetingLink: string;
  normalizedMeetingUrl?: string | null;
  externalCalendarEventId?: string | null;
  claimToken?: string | null;
  scheduledStartTime?: Date | string | null;
  scheduledEndTime?: Date | string | null;
  notes?: string;
  status: string;
};

type AtomicUpdateValues = {
  workspaceId?: string | null;
  externalCalendarEventId?: string | null;
  title?: string;
  meetingLink?: string;
  normalizedMeetingUrl?: string | null;
  scheduledStartTime?: Date | string | null;
  scheduledEndTime?: Date | string | null;
  claimToken?: string | null;
  status?: string;
  notes?: string;
};

/**
 * Atomically checks for an existing active session with the same normalizedMeetingUrl
 * and either appends the userId to sharedWithUserIds (existing) or inserts a new session.
 * Uses pg_advisory_xact_lock to serialize concurrent requests on the same URL.
 */
async function startMeetingSessionAtomic(params: {
  normalizedUrl: string;
  currentSessionId: string | null;
  userId: string;
  workspaceId: string | null;
  insertValues: AtomicInsertValues;
  updateSessionId?: string;
  updateValues?: AtomicUpdateValues;
}): Promise<AtomicDedupResult> {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const lockKey = hashString(params.normalizedUrl);

  return db.transaction(async (tx) => {
    // Acquire advisory lock scoped to this transaction — serializes concurrent requests for the same URL
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

    // Check for an existing active session with the same normalized URL
    const [existing] = await tx
      .select()
      .from(meetingSessions)
      .where(
        params.workspaceId
          ? and(
              eq(meetingSessions.workspaceId, params.workspaceId),
              eq(meetingSessions.normalizedMeetingUrl, params.normalizedUrl),
              inArray(meetingSessions.status, [...ACTIVE_SESSION_STATUSES])
            )
          : and(
              eq(meetingSessions.normalizedMeetingUrl, params.normalizedUrl),
              inArray(meetingSessions.status, [...ACTIVE_SESSION_STATUSES])
            )
      )
      .limit(1);

    // If the existing session IS the current session being updated, treat as new (continue)
    if (existing && (!params.currentSessionId || existing.id !== params.currentSessionId)) {
      // Append userId to sharedWithUserIds if not already present
      const current = existing.sharedWithUserIds ?? [];
      if (!current.includes(params.userId)) {
        const [updated] = await tx
          .update(meetingSessions)
          .set({
            workspaceId: params.workspaceId,
            sharedWithUserIds: [...current, params.userId],
            updatedAt: new Date()
          })
          .where(eq(meetingSessions.id, existing.id))
          .returning();
        return { type: "existing", session: updated ?? existing };
      }
      return { type: "existing", session: existing };
    }

    // No active session — insert or update
    let session: typeof meetingSessions.$inferSelect;
    if (params.updateSessionId && params.updateValues) {
      const uv = params.updateValues;
      const [updated] = await tx
        .update(meetingSessions)
        .set({
          ...(uv.workspaceId !== undefined && { workspaceId: uv.workspaceId }),
          ...(uv.externalCalendarEventId !== undefined && { externalCalendarEventId: uv.externalCalendarEventId }),
          ...(uv.title !== undefined && { title: uv.title }),
          ...(uv.meetingLink !== undefined && { meetingLink: uv.meetingLink }),
          ...(uv.normalizedMeetingUrl !== undefined && { normalizedMeetingUrl: uv.normalizedMeetingUrl }),
          ...(uv.claimToken !== undefined && { claimToken: uv.claimToken }),
          ...(uv.status !== undefined && { status: uv.status }),
          ...(uv.notes !== undefined && { notes: uv.notes }),
          ...(uv.scheduledStartTime !== undefined && {
            scheduledStartTime: typeof uv.scheduledStartTime === "string"
              ? new Date(uv.scheduledStartTime)
              : uv.scheduledStartTime
          }),
          ...(uv.scheduledEndTime !== undefined && {
            scheduledEndTime: typeof uv.scheduledEndTime === "string"
              ? new Date(uv.scheduledEndTime)
              : uv.scheduledEndTime
          }),
          updatedAt: new Date()
        })
        .where(eq(meetingSessions.id, params.updateSessionId))
        .returning();
      if (!updated) throw new Error("Meeting session not found.");
      session = updated;
    } else {
      const [inserted] = await tx
        .insert(meetingSessions)
        .values({
          userId: params.insertValues.userId,
          workspaceId: params.insertValues.workspaceId,
          provider: params.insertValues.provider,
          title: params.insertValues.title,
          meetingLink: params.insertValues.meetingLink,
          normalizedMeetingUrl: params.insertValues.normalizedMeetingUrl ?? null,
          externalCalendarEventId: params.insertValues.externalCalendarEventId ?? null,
          claimToken: params.insertValues.claimToken ?? null,
          scheduledStartTime:
            typeof params.insertValues.scheduledStartTime === "string"
              ? new Date(params.insertValues.scheduledStartTime)
              : params.insertValues.scheduledStartTime ?? null,
          scheduledEndTime:
            typeof params.insertValues.scheduledEndTime === "string"
              ? new Date(params.insertValues.scheduledEndTime)
              : params.insertValues.scheduledEndTime ?? null,
          notes: params.insertValues.notes || null,
          status: params.insertValues.status
        })
        .returning();
      if (!inserted) throw new Error("Failed to create meeting session.");
      session = inserted;
    }

    return { type: "new", session };
  });
}

/**
 * Wraps startBot in a try/catch so that any launch error is written to the DB
 * as a failed session instead of being silently swallowed.
 * Does NOT re-throw — errors are fully handled internally.
 * Requirements: 2.9, 3.1, 3.10
 */
async function startBotSafely(sessionId: string, meetingUrl: string, userId: string) {
  try {
    await startBot(sessionId, meetingUrl, async (meetingSessionId, status, payload) => {
      await persistBotCaptureStatusUpdate(meetingSessionId, userId, status, payload);
    });
  } catch (error) {
    if (!db) return;
    await db.update(meetingSessions).set({
      status: "failed",
      errorCode: "bot_launch_failed",
      failureReason: error instanceof Error ? error.message : String(error),
      updatedAt: new Date()
    }).where(eq(meetingSessions.id, sessionId));
  }
}

async function resolveGoogleCalendarMeeting(userId: string, meetingId: string) {
  const integration = await getActiveGoogleIntegration(userId);

  if (!integration?.accessToken) {
    return null;
  }

  return fetchGoogleCalendarMeetingById({
    accessToken: integration.accessToken,
    meetingId,
    userId,
    refreshToken: integration.refreshToken
  });
}

async function resolveMicrosoftCalendarMeeting(
  userId: string,
  rawEventId: string,
  provider: "microsoft_teams" | "microsoft_outlook"
): Promise<GoogleCalendarMeeting | null> {
  const integration = await getUserIntegration(userId, provider);
  if (!integration?.accessToken) return null;

  try {
    const url = new URL(`https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(rawEventId)}`);
    url.searchParams.set("$select", "id,subject,start,end,onlineMeeting,onlineMeetingUrl,webLink,body");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${integration.accessToken}` },
      cache: "no-store",
    });

    if (!res.ok) return null;

    const event = await res.json() as {
      id?: string;
      subject?: string;
      start?: { dateTime?: string };
      end?: { dateTime?: string };
      onlineMeeting?: { joinUrl?: string } | null;
      onlineMeetingUrl?: string | null;
      webLink?: string | null;
      body?: { content?: string } | null;
    };

    // Extract Teams join URL from body if not in onlineMeeting
    let joinUrl = event.onlineMeeting?.joinUrl ?? event.onlineMeetingUrl ?? null;
    if (!joinUrl && event.body?.content) {
      const match = event.body.content.match(/https:\/\/teams\.(?:live\.com|microsoft\.com)\/meet\/[^\s"<>&]+/i);
      if (match) joinUrl = match[0].replace(/&amp;/g, "&");
    }

    const normalize = (dt?: string) => {
      if (!dt) return "";
      return /[Zz]$/.test(dt) || /[+-]\d{2}:\d{2}$/.test(dt) ? dt : dt + "Z";
    };

    return {
      id: rawEventId,
      title: event.subject?.trim() || "Untitled event",
      startTime: normalize(event.start?.dateTime),
      endTime: normalize(event.end?.dateTime),
      meetLink: joinUrl,
      provider: provider === "microsoft_teams" ? "teams_web" : "teams_web",
      source: provider,
    };
  } catch {
    return null;
  }
}

async function findLinkedMeetingSessionForCalendarMeeting(params: {
  userId: string;
  workspaceId: string | null;
  calendarEventId: string;
  meetLink: string;
}) {
  const byCalendarEventId = await getLatestMeetingSessionByCalendarEventIdForUser(
    params.calendarEventId,
    params.userId,
    params.workspaceId
  );

  if (byCalendarEventId) {
    return byCalendarEventId;
  }

  return getLatestMeetingSessionByLinkForUser(
    params.meetLink,
    params.userId,
    params.workspaceId
  );
}

export async function GET(request: Request, context: RouteContext) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const workspaceId = await resolveWorkspaceIdForRequest(request, user.id);
    const { id } = await context.params;

    if (isCalendarMeetingId(id)) {
      const calendarMeetingId = decodeCalendarMeetingId(id);

      // Strip provider prefix added by unified calendar clients (google_, teams_, outlook_)
      let rawEventId = calendarMeetingId;
      let detectedProvider: "google" | "microsoft_teams" | "microsoft_outlook" = "google";
      for (const prefix of ["google_", "teams_", "outlook_"]) {
        if (calendarMeetingId.startsWith(prefix)) {
          rawEventId = calendarMeetingId.slice(prefix.length);
          if (prefix === "teams_") detectedProvider = "microsoft_teams";
          else if (prefix === "outlook_") detectedProvider = "microsoft_outlook";
          break;
        }
      }

      let calendarMeeting: GoogleCalendarMeeting | null = null;
      if (detectedProvider === "microsoft_teams" || detectedProvider === "microsoft_outlook") {
        calendarMeeting = await resolveMicrosoftCalendarMeeting(user.id, rawEventId, detectedProvider);
      } else {
        calendarMeeting = await resolveGoogleCalendarMeeting(user.id, rawEventId);
      }

      if (!calendarMeeting) {
        return apiError("Meeting not found.", 404);
      }

      const matchedSession = await findLinkedMeetingSessionForCalendarMeeting({
        userId: user.id,
        workspaceId,
        calendarEventId: calendarMeeting.id,
        meetLink: calendarMeeting.meetLink ?? ""
      });

      return apiSuccess({
        success: true,
        meeting: matchedSession
          ? buildMeetingDetailFromSession({
              routeId: encodeCalendarMeetingId(calendarMeeting.id),
              session: matchedSession,
              calendarMeeting,
              currentUserId: user.id
            })
          : buildMeetingDetailFromCalendarMeeting(calendarMeeting)
      });
    }

    const meeting = await getMeetingSessionByIdForUser(id, user.id, workspaceId);

    if (!meeting) {
      return apiError("Meeting not found.", 404);
    }

    return apiSuccess({
      success: true,
      meeting: buildMeetingDetailFromSession({
        session: meeting,
        currentUserId: user.id
      })
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return apiError(
        "Your database tables are not set up yet. Run your database migrations, then try again.",
        503
      );
    }

    return apiError(error instanceof Error ? error.message : "Failed to load meeting.", 500);
  }
}

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  const rl = checkRateLimit(`meeting-start:${userId}`, 5, 60_000);
  if (!rl.allowed) {
    return apiError("Too many requests. Please wait before trying again.", 429);
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const workspaceId = await resolveWorkspaceIdForRequest(request, user.id);
    const subscription = await getUserSubscription(user.clerkUserId);
    const limits = getPlanLimits(subscription.plan);
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as { meetingUrl?: string } | null;
    console.info("[start-route] request received", {
      meetingId: id,
      userId
    });

    if (!limits.meetingBot) {
      return apiError("Meeting recording requires Pro or Elite plan.", 403, {
        error: "upgrade_required",
        currentPlan: subscription.plan,
        limits
      });
    }

    if (!limits.unlimited && subscription.meetingsUsedThisMonth >= limits.meetingsPerMonth) {
      return apiError(`You have used all ${limits.meetingsPerMonth} meetings this month.`, 403, {
        error: "limit_reached",
        currentPlan: subscription.plan,
        limits
      });
    }

    if (isCalendarMeetingId(id)) {
      const calendarMeetingId = decodeCalendarMeetingId(id);
      const calendarMeeting = await resolveGoogleCalendarMeeting(user.id, calendarMeetingId);

      if (!calendarMeeting || !calendarMeeting.meetLink) {
        return apiError("Meeting not found.", 404);
      }

      const existingSession = await findLinkedMeetingSessionForCalendarMeeting({
        userId: user.id,
        workspaceId,
        calendarEventId: calendarMeeting.id,
        meetLink: calendarMeeting.meetLink
      });
      const previousStatus = normalizeMeetingSessionStatus(existingSession?.status);
      logMeetingSessionTransitionAttempt({
        from: previousStatus,
        to: "waiting_for_join",
        sessionId: existingSession?.id ?? calendarMeeting.id
      });
      const meetingUrl = body?.meetingUrl?.trim() || calendarMeeting.meetLink;

      if (!canTransitionMeetingSessionStatus(previousStatus, "waiting_for_join")) {
        return apiError("Meeting session is not ready to start Artivaa.", 409);
      }

      const normalizedMeetingUrl = normalizeMeetingUrl(meetingUrl);

      const dedup = await startMeetingSessionAtomic({
        normalizedUrl: normalizedMeetingUrl ?? meetingUrl,
        currentSessionId: existingSession?.id ?? null,
        userId: user.id,
        workspaceId,
        insertValues: {
          userId: user.id,
          workspaceId,
          provider: calendarMeeting.provider,
          externalCalendarEventId: calendarMeeting.id,
          title: calendarMeeting.title,
          meetingLink: meetingUrl,
          normalizedMeetingUrl,
          scheduledStartTime: calendarMeeting.startTime,
          scheduledEndTime: calendarMeeting.endTime,
          claimToken: null,
          status: "waiting_for_join"
        },
        updateSessionId: existingSession?.id,
        updateValues: existingSession
          ? {
              workspaceId,
              externalCalendarEventId: calendarMeeting.id,
              title: calendarMeeting.title,
              meetingLink: meetingUrl,
              normalizedMeetingUrl,
              scheduledStartTime: calendarMeeting.startTime,
              scheduledEndTime: calendarMeeting.endTime,
              claimToken: null,
              status: "waiting_for_join"
            }
          : undefined
      });

      if (dedup.type === "existing") {
        return apiSuccess({
          success: true,
          meeting: buildMeetingDetailFromSession({
            routeId: encodeCalendarMeetingId(calendarMeeting.id),
            session: dedup.session,
            calendarMeeting,
            currentUserId: user.id
          }),
          status: "already_recording",
          message: "This meeting is already being recorded. You will receive the summary when complete."
        });
      }

      const session = dedup.session;
      logMeetingSessionTransitionApplied({
        from: previousStatus,
        to: normalizeMeetingSessionStatus(session.status),
        sessionId: session.id
      });
      startBotSafely(session.id, meetingUrl, user.id);

      const response = apiSuccess({
        success: true,
        meeting: buildMeetingDetailFromSession({
          routeId: encodeCalendarMeetingId(calendarMeeting.id),
          session,
          calendarMeeting,
          currentUserId: user.id
        }),
        status: "bot_starting",
        message: "Artivaa is joining the meeting."
      });
      console.info("[start-route] response sent", {
        sessionId: session.id,
        status: session.status
      });
      return response;
    }

    const meeting = await getMeetingSessionByIdForUser(id, user.id, workspaceId);

    if (!meeting) {
      return apiError("Meeting not found.", 404);
    }

    const previousStatus = normalizeMeetingSessionStatus(meeting.status);
    logMeetingSessionTransitionAttempt({
      from: previousStatus,
      to: "waiting_for_join",
      sessionId: meeting.id
    });
    const meetingUrl = body?.meetingUrl?.trim() || meeting.meetingLink;

    if (!canTransitionMeetingSessionStatus(previousStatus, "waiting_for_join")) {
      return apiError("Meeting session is not ready to start Artivaa.", 409);
    }

    const normalizedMeetingUrl = normalizeMeetingUrl(meetingUrl);

    const dedup = await startMeetingSessionAtomic({
      normalizedUrl: normalizedMeetingUrl ?? meetingUrl,
      currentSessionId: meeting.id,
      userId: user.id,
      workspaceId,
      insertValues: {
        userId: user.id,
        workspaceId,
        provider: meeting.provider as "google_meet" | "zoom_web" | "teams_web",
        title: meeting.title,
        meetingLink: meetingUrl,
        normalizedMeetingUrl,
        status: "waiting_for_join"
      },
      updateSessionId: meeting.id,
      updateValues: {
        workspaceId,
        meetingLink: meetingUrl,
        normalizedMeetingUrl,
        claimToken: null,
        status: "waiting_for_join"
      }
    });

    if (dedup.type === "existing") {
      return apiSuccess({
        success: true,
        meeting: buildMeetingDetailFromSession({
          session: dedup.session,
          currentUserId: user.id
        }),
        status: "already_recording",
        message: "This meeting is already being recorded. You will receive the summary when complete."
      });
    }

    const session = dedup.session;
    logMeetingSessionTransitionApplied({
      from: previousStatus,
      to: normalizeMeetingSessionStatus(session.status),
      sessionId: session.id
    });
    startBotSafely(session.id, meetingUrl, user.id);

    const response = apiSuccess({
      success: true,
      meeting: buildMeetingDetailFromSession({
        session,
        currentUserId: user.id
      }),
      status: "bot_starting",
      message: "Artivaa is joining the meeting."
    });
    console.info("[start-route] response sent", {
      sessionId: session.id,
      status: session.status
    });
    return response;
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return apiError(
        "Your database tables are not set up yet. Run your database migrations, then try again.",
        503
      );
    }

    return apiError(error instanceof Error ? error.message : "Failed to start the meeting.", 500);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", 400);
  }

  const parsed = updateMeetingSessionSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("Invalid meeting session update.", 400, parsed.error.flatten());
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const workspaceId = await resolveWorkspaceIdForRequest(request, user.id);
    const { id } = await context.params;

    if (isCalendarMeetingId(id)) {
      return apiError("Calendar-backed meetings cannot be patched directly.", 400);
    }

    const existingSession = await getMeetingSessionByIdForUser(id, user.id, workspaceId);

    if (!existingSession) {
      return apiError("Meeting not found.", 404);
    }

    const session = await updateMeetingSession(id, user.id, {
      ...parsed.data,
      workspaceId: workspaceId ?? null
    });
    return apiSuccess({
      success: true,
      session: toMeetingSessionRecord(session)
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return apiError(
        "Your database tables are not set up yet. Run your database migrations, then try again.",
        503
      );
    }

    return apiError(error instanceof Error ? error.message : "Failed to update meeting.", 500);
  }
}
