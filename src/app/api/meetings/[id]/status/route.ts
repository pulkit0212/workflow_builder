import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { getMeetingSessionByIdForUser } from "@/lib/db/queries/meeting-sessions";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";
import { normalizeMeetingSessionStatus } from "@/features/meetings/server/state-machine";
import { normalizeMeetingActionItems } from "@/features/meeting-assistant/helpers";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext) {
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
    const { id } = await context.params;
    const session = await getMeetingSessionByIdForUser(id, user.id);

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          message: "Meeting session not found.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      meetingId: session.id,
      state: normalizeMeetingSessionStatus(session.status),
      errorCode: session.errorCode ?? null,
      failureReason: session.failureReason ?? null,
      recordingFilePath: session.recordingFilePath ?? null,
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
      updatedAt: session.updatedAt.toISOString(),
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
