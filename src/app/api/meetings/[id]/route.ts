import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { updateMeetingSessionSchema } from "@/features/meeting-assistant/schema";
import { buildMeetingDetailFromCalendarMeeting, buildMeetingDetailFromSession } from "@/features/meetings/server/detail-record";
import { decodeCalendarMeetingId, encodeCalendarMeetingId, isCalendarMeetingId } from "@/features/meetings/ids";
import { fetchGoogleCalendarMeetingById } from "@/lib/google/calendar";
import { getActiveGoogleIntegration } from "@/lib/google/integration";
import {
  getLatestMeetingSessionByCalendarEventIdForUser,
  getLatestMeetingSessionByLinkForUser,
  getMeetingSessionByIdForUser
} from "@/lib/db/queries/meeting-sessions";
import { createMeetingSession, updateMeetingSession } from "@/lib/db/mutations/meeting-sessions";
import { toMeetingSessionRecord } from "@/features/meeting-assistant/server/session-record";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";
import { startBot } from "@/lib/bot";
import {
  canTransitionMeetingSessionStatus,
  logMeetingSessionTransitionApplied,
  logMeetingSessionTransitionAttempt,
  normalizeMeetingSessionStatus
} from "@/features/meetings/server/state-machine";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

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

async function findLinkedMeetingSessionForCalendarMeeting(params: {
  userId: string;
  calendarEventId: string;
  meetLink: string;
}) {
  const byCalendarEventId = await getLatestMeetingSessionByCalendarEventIdForUser(
    params.calendarEventId,
    params.userId
  );

  if (byCalendarEventId) {
    return byCalendarEventId;
  }

  return getLatestMeetingSessionByLinkForUser(params.meetLink, params.userId);
}

export async function GET(_request: Request, context: RouteContext) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const { id } = await context.params;

    if (isCalendarMeetingId(id)) {
      const calendarMeetingId = decodeCalendarMeetingId(id);
      const calendarMeeting = await resolveGoogleCalendarMeeting(user.id, calendarMeetingId);

      if (!calendarMeeting || !calendarMeeting.meetLink) {
        return apiError("Meeting not found.", 404);
      }

      const matchedSession = await findLinkedMeetingSessionForCalendarMeeting({
        userId: user.id,
        calendarEventId: calendarMeeting.id,
        meetLink: calendarMeeting.meetLink
      });

      return apiSuccess({
        success: true,
        meeting: matchedSession
          ? buildMeetingDetailFromSession({
              routeId: encodeCalendarMeetingId(calendarMeeting.id),
              session: matchedSession,
              calendarMeeting
            })
          : buildMeetingDetailFromCalendarMeeting(calendarMeeting)
      });
    }

    const meeting = await getMeetingSessionByIdForUser(id, user.id);

    if (!meeting) {
      return apiError("Meeting not found.", 404);
    }

    return apiSuccess({
      success: true,
      meeting: buildMeetingDetailFromSession({
        session: meeting
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

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as { meetingUrl?: string } | null;
    console.info("[start-route] request received", {
      meetingId: id,
      userId
    });

    if (isCalendarMeetingId(id)) {
      const calendarMeetingId = decodeCalendarMeetingId(id);
      const calendarMeeting = await resolveGoogleCalendarMeeting(user.id, calendarMeetingId);

      if (!calendarMeeting || !calendarMeeting.meetLink) {
        return apiError("Meeting not found.", 404);
      }

      const existingSession = await findLinkedMeetingSessionForCalendarMeeting({
        userId: user.id,
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
        return apiError("Meeting session is not ready to start the AI Notetaker.", 409);
      }

      const session = existingSession
        ? await updateMeetingSession(existingSession.id, user.id, {
            externalCalendarEventId: calendarMeeting.id,
            title: calendarMeeting.title,
            meetingLink: meetingUrl,
            scheduledStartTime: calendarMeeting.startTime,
            scheduledEndTime: calendarMeeting.endTime,
            claimToken: null,
            status: "waiting_for_join"
          })
        : await createMeetingSession({
            userId: user.id,
            provider: calendarMeeting.provider,
            externalCalendarEventId: calendarMeeting.id,
            title: calendarMeeting.title,
            meetingLink: meetingUrl,
            scheduledStartTime: calendarMeeting.startTime,
            scheduledEndTime: calendarMeeting.endTime,
            claimToken: null,
            status: "waiting_for_join"
          });
      logMeetingSessionTransitionApplied({
        from: previousStatus,
        to: normalizeMeetingSessionStatus(session.status),
        sessionId: session.id
      });
      void startBot(session.id, meetingUrl, async (meetingSessionId, status) => {
        await updateMeetingSession(meetingSessionId, user.id, {
          status
        });
      }).catch((error) => {
        console.error("[start-route] bot start failed", error);
      });

      const response = apiSuccess({
        success: true,
        meeting: buildMeetingDetailFromSession({
          routeId: encodeCalendarMeetingId(calendarMeeting.id),
          session,
          calendarMeeting
        }),
        status: "bot_starting",
        message: "AI Notetaker is joining the meeting."
      });
      console.info("[start-route] response sent", {
        sessionId: session.id,
        status: session.status
      });
      return response;
    }

    const meeting = await getMeetingSessionByIdForUser(id, user.id);

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
      return apiError("Meeting session is not ready to start the AI Notetaker.", 409);
    }

    const session = await updateMeetingSession(meeting.id, user.id, {
      meetingLink: meetingUrl,
      claimToken: null,
      status: "waiting_for_join"
    });
    logMeetingSessionTransitionApplied({
      from: previousStatus,
      to: normalizeMeetingSessionStatus(session.status),
      sessionId: session.id
    });
    void startBot(session.id, meetingUrl, async (meetingSessionId, status) => {
      await updateMeetingSession(meetingSessionId, user.id, {
        status
      });
    }).catch((error) => {
      console.error("[start-route] bot start failed", error);
    });

    const response = apiSuccess({
      success: true,
      meeting: buildMeetingDetailFromSession({
        session
      }),
      status: "bot_starting",
      message: "AI Notetaker is joining the meeting."
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
    const { id } = await context.params;

    if (isCalendarMeetingId(id)) {
      return apiError("Calendar-backed meetings cannot be patched directly.", 400);
    }

    const existingSession = await getMeetingSessionByIdForUser(id, user.id);

    if (!existingSession) {
      return apiError("Meeting not found.", 404);
    }

    const session = await updateMeetingSession(id, user.id, parsed.data);
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
