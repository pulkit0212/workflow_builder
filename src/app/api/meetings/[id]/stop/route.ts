import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { isCalendarMeetingId } from "@/features/meetings/ids";
import { getMeetingSessionByIdForUser } from "@/lib/db/queries/meeting-sessions";
import { buildMeetingDetailFromSession } from "@/features/meetings/server/detail-record";
import { persistBotCaptureStatusUpdate } from "@/features/meetings/server/bot-capture-persist";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";
import { stopBot } from "@/lib/bot";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export const runtime = "nodejs";

export async function POST(_request: Request, context: RouteContext) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const { id } = await context.params;

    if (isCalendarMeetingId(id)) {
      return apiError("Meeting session has not started yet.", 400);
    }

    const meeting = await getMeetingSessionByIdForUser(id, user.id);

    if (!meeting) {
      return apiError("Meeting not found.", 404);
    }

    const result = await stopBot(meeting.id, async (meetingSessionId, status, payload) => {
      await persistBotCaptureStatusUpdate(meetingSessionId, user.id, status, payload);
    });

    if (!result.success) {
      return apiError(
        result.error ||
          "Bot session may have been lost on server restart. Check if the recording file exists in tmp/audio/.",
        500
      );
    }

    const refreshed = await getMeetingSessionByIdForUser(meeting.id, user.id);

    if (!refreshed) {
      return apiError("Meeting not found.", 404);
    }

    return apiSuccess({
      success: true,
      meeting: buildMeetingDetailFromSession({
        session: refreshed
      })
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return apiError(
        "Your database tables are not set up yet. Run your database migrations, then try again.",
        503
      );
    }

    return apiError(error instanceof Error ? error.message : "Failed to stop Artivaa.", 500);
  }
}
