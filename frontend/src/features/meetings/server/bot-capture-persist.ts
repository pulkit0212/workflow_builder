import fs from "node:fs";
import { and, eq } from "drizzle-orm";
import { updateMeetingSession } from "@/lib/db/mutations/meeting-sessions";
import { getMeetingSessionById } from "@/lib/db/queries/meeting-sessions";
import type { MeetingSessionStatus } from "@/features/meeting-assistant/types";
import { generateInsights, generateChapters } from "@/lib/insights/generate";
import { saveRecording, getRecordingSize } from "@/lib/storage";
import { incrementMeetingUsage } from "@/lib/subscription.server";
import { db } from "@/lib/db/client";
import { actionItems, userPreferences, users } from "@/db/schema";

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

async function syncMeetingActionItems(params: {
  meetingId: string;
  workspaceId: string | null;
  meetingTitle: string;
  ownerUserId: string;
  sharedUserIds: string[];
  items: Array<{
    task: string;
    owner?: string;
    due_date?: string;
    priority?: string;
  }>;
}) {
  if (!db || !params.workspaceId) {
    return;
  }

  const targetUserIds = Array.from(new Set([params.ownerUserId, ...params.sharedUserIds]));

  await db
    .delete(actionItems)
    .where(
      and(
        eq(actionItems.meetingId, params.meetingId),
        eq(actionItems.workspaceId, params.workspaceId),
        eq(actionItems.source, "meeting")
      )
    );

  if (params.items.length === 0 || targetUserIds.length === 0) {
    return;
  }

  const now = new Date();

  await db.insert(actionItems).values(
    targetUserIds.flatMap((userId) =>
      params.items.map((item) => ({
        workspaceId: params.workspaceId,
        meetingId: params.meetingId,
        meetingTitle: params.meetingTitle,
        userId,
        task: item.task,
        owner: item.owner?.trim() || "Unassigned",
        dueDate: item.due_date?.trim() || "Not specified",
        priority: item.priority?.trim() || "Medium",
        completed: false,
        status: "pending",
        source: "meeting",
        updatedAt: now
      }))
    )
  );
}

/**
 * Auto-share meeting summary to integrations the user has enabled in autoShareTargets preferences.
 * Only fires integrations the user has explicitly opted into — same logic as execute-run.ts.
 */
async function triggerAutoShare(
  userId: string,
  title: string,
  summary: Record<string, unknown>,
  transcript: string
) {
  if (!db) return;

  const [prefs] = await db
    .select({ autoShareTargets: userPreferences.autoShareTargets })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  const targets = prefs?.autoShareTargets as Record<string, boolean> | null;
  if (!targets) return;

  const enabledTargets = new Set(
    Object.entries(targets)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key)
  );

  if (enabledTargets.size === 0) return;

  const { listEnabledIntegrationsByUser } = await import("@/lib/db/queries/integrations");
  const allEnabled = await listEnabledIntegrationsByUser(userId);
  const filtered = allEnabled.filter((i) => enabledTargets.has(i.type));

  if (filtered.length === 0) return;

  const { sendSlackSummary } = await import("@/lib/integrations/slack");
  const { sendGmailSummary } = await import("@/lib/integrations/gmail");
  const { createNotionPage } = await import("@/lib/integrations/notion");
  const { createJiraTickets } = await import("@/lib/integrations/jira");
  const { getActiveGoogleIntegration } = await import("@/lib/google/integration");

  for (const integration of filtered) {
    const config = (integration.config ?? {}) as Record<string, string>;
    try {
      switch (integration.type) {
        case "slack":
          await sendSlackSummary(config, title, summary);
          console.log("[auto-share] slack ✓");
          break;
        case "gmail": {
          const googleIntegration = await getActiveGoogleIntegration(userId);
          const accessToken = googleIntegration?.accessToken;
          if (accessToken) {
            await sendGmailSummary(config, title, summary, accessToken);
            console.log("[auto-share] gmail ✓");
          }
          break;
        }
        case "notion":
          await createNotionPage(config, title, summary, transcript);
          console.log("[auto-share] notion ✓");
          break;
        case "jira": {
          const actionItemsList = Array.isArray(summary.action_items)
            ? (summary.action_items as Array<Record<string, unknown>>)
            : [];
          if (actionItemsList.length > 0) {
            await createJiraTickets(config, title, actionItemsList);
            console.log("[auto-share] jira ✓");
          }
          break;
        }
      }
    } catch (err) {
      console.error(`[auto-share] ${integration.type} failed:`, err instanceof Error ? err.message : err);
    }
  }
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
      transcript: payload.transcript ?? undefined,
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

    void triggerAutoShare(
      ownerUserId,
      title,
      payload.summary as unknown as Record<string, unknown>,
      payload.transcript ?? ""
    ).catch((error) =>
      console.error("[DB] Auto-share error:", error instanceof Error ? error.message : error)
    );

    console.log("[DB] Saved successfully (completed)");

    await syncMeetingActionItems({
      meetingId: meetingSessionId,
      workspaceId: sessionRow.workspaceId ?? null,
      meetingTitle: title,
      ownerUserId,
      sharedUserIds: Array.isArray(sessionRow.sharedWithUserIds) ? sessionRow.sharedWithUserIds : [],
      items: Array.isArray(payload.summary.action_items) ? payload.summary.action_items : []
    });

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
      failedPatch.transcript = payload.transcript ?? undefined;
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
