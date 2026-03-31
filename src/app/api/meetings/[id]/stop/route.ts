import { auth } from "@clerk/nextjs/server";
import fs from "node:fs";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { isCalendarMeetingId } from "@/features/meetings/ids";
import { getMeetingSessionByIdForUser } from "@/lib/db/queries/meeting-sessions";
import { updateMeetingSession } from "@/lib/db/mutations/meeting-sessions";
import { buildMeetingDetailFromSession } from "@/features/meetings/server/detail-record";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";
import { stopBot } from "@/lib/bot";
import { triggerIntegrations } from "@/lib/integrations/trigger";
import { saveRecording, getRecordingSize } from "@/lib/storage";
import { generateInsights, generateChapters } from "@/lib/insights/generate";

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
      await updateMeetingSession(meetingSessionId, user.id, {
        status,
        errorCode: payload?.errorCode ?? null,
        failureReason: payload?.failureReason ?? null,
        recordingFilePath: payload?.recordingFilePath,
        recordingStartedAt: payload?.recordingStartedAt,
        recordingEndedAt: payload?.recordingEndedAt
      });
    });

    if (!result.success) {
      return apiError(
        result.error ||
          "Bot session may have been lost on server restart. Check if the recording file exists in tmp/audio/.",
        500
      );
    }

    let recordingUrl: string | null = null;
    let recordingSize: number | null = null;
    const audioPath = result.outputPath || meeting.recordingFilePath || null;

    if (audioPath && fs.existsSync(audioPath)) {
      try {
        recordingUrl = saveRecording(meeting.id, audioPath);
        recordingSize = getRecordingSize(meeting.id);
        console.log("[Stop] Recording saved:", recordingUrl);
      } catch (error) {
        console.error("[Stop] Recording save error:", error instanceof Error ? error.message : error);
      }
    }

    const persistedMeeting = await updateMeetingSession(meeting.id, user.id, {
      transcript: result.transcript,
      summary: result.summary?.summary ?? "No summary available.",
      errorCode: null,
      failureReason: null,
      keyDecisions: result.summary?.key_decisions ?? [],
      risksAndBlockers: result.summary?.risks_and_blockers ?? [],
      keyTopics: result.summary?.key_topics ?? [],
      meetingSentiment: result.summary?.meeting_sentiment ?? null,
      followUpNeeded: result.summary?.follow_up_meeting_needed ?? null,
      meetingDuration: result.meetingDurationSeconds ?? null,
      keyPoints:
        (result.summary?.key_decisions?.length ? result.summary.key_decisions : result.summary?.key_topics) ?? [],
      actionItems:
        result.summary?.action_items?.map((item) => ({
          task: item.task,
          owner: item.owner ?? "",
          deadline: item.due_date ?? "",
          dueDate: item.due_date ?? "",
          priority: item.priority ?? "Medium",
          completed: false
        })) ?? [],
      recordingUrl,
      recordingSize,
      recordingDuration: result.meetingDurationSeconds ?? null,
      status: "completed",
    });

    const duration = result.meetingDurationSeconds || 0;

    void generateInsights(result.transcript || "", duration)
      .then((insights) =>
        generateChapters(result.transcript || "", duration).then((chapters) =>
          updateMeetingSession(meeting.id, user.id, {
            recordingUrl,
            recordingSize,
            recordingDuration: duration,
            insights,
            chapters: chapters as Array<Record<string, unknown>>
          })
        )
      )
      .catch((error) =>
        console.error("[Stop] Insights generation error:", error instanceof Error ? error.message : error)
      );

    void triggerIntegrations(
      user.id,
      meeting.id,
      persistedMeeting.title || "Meeting",
      result.summary ?? {},
      result.transcript ?? ""
    ).catch((error) =>
      console.error("[Stop] Integration trigger error:", error instanceof Error ? error.message : error)
    );

    return apiSuccess({
      success: true,
      meeting: buildMeetingDetailFromSession({
        session: persistedMeeting,
      }),
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return apiError(
        "Your database tables are not set up yet. Run your database migrations, then try again.",
        503
      );
    }

    return apiError(error instanceof Error ? error.message : "Failed to stop Artiva.", 500);
  }
}
