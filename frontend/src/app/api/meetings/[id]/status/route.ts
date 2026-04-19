import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { getMeetingSessionByIdForUser } from "@/lib/db/queries/meeting-sessions";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";
import { normalizeMeetingSessionStatus } from "@/features/meetings/server/state-machine";
import { normalizeMeetingActionItems } from "@/features/meeting-assistant/helpers";
import { resolveWorkspaceIdForRequest } from "@/lib/workspaces/server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export const runtime = "nodejs";

function getPlatformFromProvider(provider: string | null | undefined) {
  switch (provider) {
    case "zoom_web":
      return { platform: "zoom", platformName: "Zoom" };
    case "teams_web":
      return { platform: "teams", platformName: "Microsoft Teams" };
    default:
      return { platform: "google", platformName: "Google Meet" };
  }
}

export async function GET(request: Request, context: RouteContext) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      {
        success: false,
        message: "Unauthorized.",
      },
      { status: 401 }
    );
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const workspaceId = await resolveWorkspaceIdForRequest(request, user.id);
    const { id } = await context.params;
    const session = await getMeetingSessionByIdForUser(id, user.id, workspaceId);
    const sessionsFile = path.join(process.cwd(), "tmp", "bot-sessions.json");
    let botSession: Record<string, unknown> | null = null;

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          message: "Meeting session not found.",
        },
        { status: 404 }
      );
    }

    try {
      if (fs.existsSync(sessionsFile)) {
        const sessions = JSON.parse(fs.readFileSync(sessionsFile, "utf8")) as Record<string, Record<string, unknown>>;
        botSession = sessions[id] || null;
      }
    } catch {
      botSession = null;
    }

    const providerPlatform = getPlatformFromProvider(session.provider);

    return NextResponse.json({
      success: true,
      meetingId: session.id,
      state: normalizeMeetingSessionStatus(session.status),
      errorCode: session.errorCode ?? null,
      failureReason: session.failureReason ?? null,
      recordingFilePath: session.recordingFilePath ?? null,
      recordingUrl: session.recordingUrl ?? null,
      recordingDuration: session.recordingDuration ?? null,
      recordingStartedAt: session.recordingStartedAt ? session.recordingStartedAt.toISOString() : null,
      recordingEndedAt: session.recordingEndedAt ? session.recordingEndedAt.toISOString() : null,
      transcript: session.transcript ?? null,
      summary: session.summary
        ? {
            summary: session.summary,
            key_points: Array.isArray(session.keyPoints) ? session.keyPoints : [],
            action_items: normalizeMeetingActionItems(session.actionItems),
          }
        : null,
      insights: session.insights && typeof session.insights === "object" ? session.insights : null,
      chapters: Array.isArray(session.chapters) ? session.chapters : null,
      updatedAt: session.updatedAt.toISOString(),
      platform: typeof botSession?.platform === "string" ? botSession.platform : providerPlatform.platform,
      platformName: typeof botSession?.platformName === "string" ? botSession.platformName : providerPlatform.platformName
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return NextResponse.json(
        {
          success: false,
          message: "Your database tables are not set up yet. Run your database migrations, then try again.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to load meeting status.",
      },
      { status: 500 }
    );
  }
}
