import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { getMeetingSessionByIdForUser } from "@/lib/db/queries/meeting-sessions";
import { updateMeetingSession } from "@/lib/db/mutations/meeting-sessions";
import { generateMeetingFollowUpSchema } from "@/features/meeting-followup/schema";
import { generateMeetingFollowUpEmail } from "@/features/meeting-followup/server/generate-followup";
import { normalizeMeetingActionItems } from "@/features/meeting-assistant/helpers";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";
import { resolveWorkspaceIdForRequest } from "@/lib/workspaces/server";

export async function POST(request: Request) {
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

  const parsed = generateMeetingFollowUpSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("Invalid follow-up request.", 400, parsed.error.flatten());
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const workspaceId = await resolveWorkspaceIdForRequest(request, user.id);

    const meeting = await getMeetingSessionByIdForUser(parsed.data.meetingId, user.id, workspaceId);

    if (!meeting) {
      return apiError("Meeting not found.", 404);
    }

    if (!meeting.summary || !Array.isArray(meeting.keyPoints)) {
      return apiError("Generate the meeting summary before creating a follow-up email.", 400);
    }

    const followUpEmail = await generateMeetingFollowUpEmail({
      title: meeting.title,
      summary: meeting.summary,
      keyPoints: meeting.keyPoints,
      actionItems: normalizeMeetingActionItems(meeting.actionItems)
    });

    await updateMeetingSession(meeting.id, user.id, {
      workspaceId: workspaceId ?? null,
      followUpEmail
    });

    return apiSuccess({
      success: true,
      followUpEmail
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return apiError(
        "Your database tables are not set up yet. Run your database migrations, then try again.",
        503
      );
    }

    return apiError(
      error instanceof Error ? error.message : "Failed to generate follow-up email.",
      500
    );
  }
}
