import fs from "node:fs";
import path from "node:path";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { listMeetingSessionsByUser } from "@/lib/db/queries/meeting-sessions";
import { toMeetingSessionRecord } from "@/features/meeting-assistant/server/session-record";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";
import { mapMeetingSessionToDetailStatus } from "@/features/meetings/helpers";
import { getFirstActiveWorkspaceIdForUser } from "@/lib/workspaces/server";

export const runtime = "nodejs";

function isBotProfileConfigured() {
  const profilePath = path.join(process.cwd(), "tmp", "bot-profile");

  if (!fs.existsSync(profilePath)) {
    return false;
  }

  const entries = fs.readdirSync(profilePath).filter((entry) => entry !== ".DS_Store");
  return entries.length > 0;
}

export async function GET() {
  const { userId } = await auth();
  const botProfileConfigured = isBotProfileConfigured();
  const geminiKeySet = Boolean(process.env.GEMINI_API_KEY);
  const audioSourceConfigured = Boolean(process.env.MEETING_AUDIO_SOURCE);

  if (!userId) {
    return NextResponse.json({
      botProfileConfigured,
      geminiKeySet,
      audioSourceConfigured,
      lastMeetingState: null,
      lastTranscriptLength: 0,
      lastActionItemCount: 0,
      mvpComplete: false
    });
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const workspaceId = await getFirstActiveWorkspaceIdForUser(user.id);
    const latestMeeting = await (workspaceId
      ? listMeetingSessionsByUser(user.id, workspaceId, {
          excludeDrafts: true
        })
      : Promise.resolve([]))
      .then((sessions) => sessions.map(toMeetingSessionRecord)[0] ?? null)
      .catch(() => null);

    const lastMeetingState = latestMeeting ? mapMeetingSessionToDetailStatus(latestMeeting.status) : null;
    const lastTranscriptLength = latestMeeting?.transcript?.length ?? 0;
    const lastActionItemCount = latestMeeting?.actionItems.length ?? 0;

    return NextResponse.json({
      botProfileConfigured,
      geminiKeySet,
      audioSourceConfigured,
      lastMeetingState,
      lastTranscriptLength,
      lastActionItemCount,
      mvpComplete:
        botProfileConfigured &&
        geminiKeySet &&
        lastMeetingState === "completed" &&
        lastTranscriptLength > 100 &&
        lastActionItemCount > 0
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return NextResponse.json({
        botProfileConfigured,
        geminiKeySet,
        audioSourceConfigured,
        lastMeetingState: null,
        lastTranscriptLength: 0,
        lastActionItemCount: 0,
        mvpComplete: false
      });
    }

    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to run MVP check."
      },
      { status: 500 }
    );
  }
}
