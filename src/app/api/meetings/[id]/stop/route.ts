import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { isCalendarMeetingId } from "@/features/meetings/ids";
import { getMeetingSessionByIdForUser } from "@/lib/db/queries/meeting-sessions";
import { updateMeetingSession } from "@/lib/db/mutations/meeting-sessions";
import { buildMeetingDetailFromSession } from "@/features/meetings/server/detail-record";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";
import { stopBot } from "@/lib/bot";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type BotSummary = {
  summary?: string;
  action_items?: string[];
  decisions?: string[];
  key_topics?: string[];
};

export const runtime = "nodejs";

function stopError(message: string, status: number, code: string) {
  return NextResponse.json(
    {
      success: false,
      message,
      code,
    },
    { status }
  );
}

function mapActionItems(items: string[] | undefined) {
  return (items ?? []).map((item) => {
    const [ownerPart, ...taskParts] = item.split(":");
    const hasOwner = taskParts.length > 0;

    return {
      owner: hasOwner ? ownerPart.trim() : "",
      task: hasOwner ? taskParts.join(":").trim() : ownerPart.trim(),
      deadline: "",
      completed: false,
    };
  });
}

function mapKeyPoints(summary: BotSummary) {
  const values = [...(summary.decisions ?? []), ...(summary.key_topics ?? [])]
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set(values)];
}

export async function POST(_request: Request, context: RouteContext) {
  const { userId } = await auth();

  if (!userId) {
    return stopError("Unauthorized.", 401, "unauthorized");
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const { id } = await context.params;

    if (isCalendarMeetingId(id)) {
      return stopError("Meeting session has not started yet.", 400, "invalid_status_transition");
    }

    const meeting = await getMeetingSessionByIdForUser(id, user.id);

    if (!meeting) {
      return stopError("Meeting not found.", 404, "meeting_not_found");
    }

    const result = await stopBot(meeting.id, async (meetingSessionId, status) => {
      await updateMeetingSession(meetingSessionId, user.id, {
        status,
      });
    });

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error,
          code: "stop_failed",
          hint: "Bot session may have been lost on server restart. Check if recording file exists in /tmp/audio/",
        },
        { status: 500 }
      );
    }

    const persistedMeeting = await updateMeetingSession(meeting.id, user.id, {
      transcript: result.transcript,
      summary: result.summary?.summary ?? "No summary available.",
      keyPoints: mapKeyPoints(result.summary ?? {}),
      actionItems: mapActionItems(result.summary?.action_items),
      status: "completed",
    });

    return NextResponse.json({
      success: true,
      meetingId: persistedMeeting.id,
      status: persistedMeeting.status,
      meeting: buildMeetingDetailFromSession({
        session: persistedMeeting,
      }),
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return stopError(
        "Your database tables are not set up yet. Run your database migrations, then try again.",
        503,
        "database_unavailable"
      );
    }

    return stopError(
      error instanceof Error ? error.message : "Failed to stop AI Notetaker.",
      500,
      "unexpected_error"
    );
  }
}
