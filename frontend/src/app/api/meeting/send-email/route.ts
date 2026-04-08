import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { getMeetingSessionByIdForUser } from "@/lib/db/queries/meeting-sessions";
import { updateMeetingSession } from "@/lib/db/mutations/meeting-sessions";
import { getActiveGoogleIntegration } from "@/lib/google/integration";
import { sendMeetingEmailSchema } from "@/features/meeting-email/schema";
import { sendGmailMessage } from "@/features/meeting-email/server/gmail";
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

  const parsed = sendMeetingEmailSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("Invalid email send request.", 400, parsed.error.flatten());
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const workspaceId = await resolveWorkspaceIdForRequest(request, user.id);

    const meeting = await getMeetingSessionByIdForUser(parsed.data.meetingId, user.id, workspaceId);

    if (!meeting) {
      return apiError("Meeting not found.", 404);
    }

    if (!meeting.followUpEmail?.trim()) {
      return apiError("Generate a follow-up email before sending.", 400);
    }

    const integration = await getActiveGoogleIntegration(user.id);

    if (!integration?.accessToken) {
      return apiError("Connect Google with Gmail access before sending email.", 400);
    }

    await sendGmailMessage(integration.accessToken, {
      recipients: parsed.data.recipients,
      subject: `Summary & Next Steps – ${meeting.title}`,
      body: meeting.followUpEmail
    });

    const emailSentAt = new Date();
    await updateMeetingSession(meeting.id, user.id, {
      workspaceId: workspaceId ?? null,
      emailSent: true,
      emailSentAt
    });

    return apiSuccess({
      success: true,
      emailSentAt: emailSentAt.toISOString()
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return apiError(
        "Your database tables are not set up yet. Run your database migrations, then try again.",
        503
      );
    }

    return apiError(error instanceof Error ? error.message : "Failed to send meeting email.", 500);
  }
}
