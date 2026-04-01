import fs from "node:fs";
import { eq } from "drizzle-orm";
import { updateMeetingSession } from "@/lib/db/mutations/meeting-sessions";
import { getMeetingSessionById } from "@/lib/db/queries/meeting-sessions";
import type { MeetingSessionStatus } from "@/features/meeting-assistant/types";
import { generateInsights, generateChapters } from "@/lib/insights/generate";
import { triggerIntegrations } from "@/lib/integrations/trigger";
import { saveRecording, getRecordingSize } from "@/lib/storage";
import { incrementMeetingUsage } from "@/lib/subscription.server";
import { db } from "@/lib/db/client";
import { users } from "@/db/schema";

export type BotCaptureSummaryPayload = {
  summary?: string;
  key_decisions?: string[];
  action_items?: Array<{
    task: string;
    owner?: string;
    due_date?: string;
    priority?: string;
  }>;
  risks_and_blockers?: string[];
  key_topics?: string[];
  meeting_sentiment?: string;
  follow_up_meeting_needed?: boolean;
};

export type BotCaptureStatusPayload = {
  errorCode?: string | null;
  failureReason?: string | null;
  recordingFilePath?: string | null;
  recordingStartedAt?: string | null;
  recordingEndedAt?: string | null;
  transcript?: string | null;
  summary?: BotCaptureSummaryPayload | null;
  meetingDurationSeconds?: number | null;
  outputPath?: string | null;
};

function mapSummaryToDb(summary: BotCaptureSummaryPayload) {
  return {
    summary: summary.summary ?? "No summary available.",
    keyDecisions: summary.key_decisions ?? [],
    risksAndBlockers: summary.risks_and_blockers ?? [],
    keyTopics: summary.key_topics ?? [],
    meetingSentiment: summary.meeting_sentiment ?? null,
    followUpNeeded: summary.follow_up_meeting_needed ?? null,
    keyPoints:
      (summary.key_decisions?.length ? summary.key_decisions : summary.key_topics) ?? [],
    actionItems:
      summary.action_items?.map((item) => ({
        task: item.task,
        owner: item.owner ?? "",
        deadline: item.due_date ?? "",
        dueDate: item.due_date ?? "",
        priority: item.priority ?? "Medium",
        completed: false
      })) ?? []
  };
}

/**
 * Persists bot pipeline updates to the meeting session row.
 * On `completed`, writes transcript, summary, recording URL, and kicks off insights + integrations.
 * Uses the session owner's `userId` from the database (required for Drizzle's owner-scoped update).
 */
export async function persistBotCaptureStatusUpdate(
  meetingSessionId: string,
  _requestingUserId: string,
  status: string,
  payload?: BotCaptureStatusPayload
) {
  const sessionRow = await getMeetingSessionById(meetingSessionId);
  if (!sessionRow) {
    console.error("[DB] persistBotCaptureStatusUpdate: meeting session not found:", meetingSessionId);
    return;
  }

  const ownerUserId = sessionRow.userId;

  console.log("[DB] Saving meeting results for:", meetingSessionId, "status:", status);
  console.log(
    "[DB] Has transcript:",
    payload?.transcript != null,
    "Length:",
    payload?.transcript != null ? payload.transcript.length : 0
  );
  console.log("[DB] Has summary:", !!payload?.summary?.summary);

  if (status === "completed" && payload?.transcript !== undefined && payload.summary) {
    let recordingUrl: string | null = null;
    let recordingSize: number | null = null;
    const audioPath = payload.outputPath || payload.recordingFilePath;

    if (audioPath && fs.existsSync(audioPath)) {
      try {
        recordingUrl = saveRecording(meetingSessionId, audioPath);
        recordingSize = getRecordingSize(meetingSessionId);
        console.log("[DB] Recording saved:", recordingUrl);
      } catch (error) {
        console.error("[DB] Recording save error:", error instanceof Error ? error.message : error);
      }
    }

    const mapped = mapSummaryToDb(payload.summary);
    const duration = payload.meetingDurationSeconds ?? null;

    await updateMeetingSession(meetingSessionId, ownerUserId, {
      status: "completed",
      transcript: payload.transcript,
      ...mapped,
      errorCode: null,
      failureReason: null,
      meetingDuration: duration,
      recordingUrl,
      recordingSize,
      recordingDuration: duration,
      recordingFilePath: payload.recordingFilePath ?? null,
      recordingEndedAt: payload.recordingEndedAt ?? null
    });

    const title = sessionRow.title ?? "Meeting";

    void generateInsights(payload.transcript || "", duration || 0)
      .then((insights) =>
        generateChapters(payload.transcript || "", duration || 0).then((chapters) =>
          updateMeetingSession(meetingSessionId, ownerUserId, {
            recordingUrl,
            recordingSize,
            recordingDuration: duration,
            insights,
            chapters: chapters as Array<Record<string, unknown>>
          })
        )
      )
      .catch((error) =>
        console.error("[DB] Insights generation error:", error instanceof Error ? error.message : error)
      );

    void triggerIntegrations(
      ownerUserId,
      meetingSessionId,
      title,
      { ...(payload.summary as unknown as Record<string, unknown>) },
      payload.transcript ?? ""
    ).catch((error) =>
      console.error("[DB] Integration trigger error:", error instanceof Error ? error.message : error)
    );

    console.log("[DB] Saved successfully (completed)");
    return;
  }

  if (status === "failed") {
    const failedPatch: Parameters<typeof updateMeetingSession>[2] = {
      status: "failed",
      errorCode: payload?.errorCode ?? null,
      failureReason: payload?.failureReason ?? null,
      recordingFilePath: payload?.recordingFilePath,
      recordingStartedAt: payload?.recordingStartedAt,
      recordingEndedAt: payload?.recordingEndedAt
    };
    if (payload && Object.prototype.hasOwnProperty.call(payload, "transcript")) {
      failedPatch.transcript = payload.transcript ?? null;
    }
    await updateMeetingSession(meetingSessionId, ownerUserId, failedPatch);
    console.log("[DB] Saved successfully (failed)");
    return;
  }

  await updateMeetingSession(meetingSessionId, ownerUserId, {
    status: status as MeetingSessionStatus,
    errorCode: payload?.errorCode ?? null,
    failureReason: payload?.failureReason ?? null,
    recordingFilePath: payload?.recordingFilePath,
    recordingStartedAt: payload?.recordingStartedAt,
    recordingEndedAt: payload?.recordingEndedAt
  });

  if (status === "capturing") {
    try {
      const [userRow] = db
        ? await db.select({ clerkUserId: users.clerkUserId }).from(users).where(eq(users.id, ownerUserId)).limit(1)
        : [];
      if (userRow?.clerkUserId) {
        await incrementMeetingUsage(userRow.clerkUserId);
        console.log("[DB] Meeting usage incremented for capturing transition:", meetingSessionId);
      } else {
        console.error("[DB] Could not find Clerk user ID for usage increment:", ownerUserId);
      }
    } catch (error) {
      console.error("[DB] Failed to increment meeting usage:", error instanceof Error ? error.message : error);
    }
  }
}
