import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { updateMeetingSessionSchema } from "@/features/meeting-assistant/schema";
import { getMeetingSessionByIdForUser } from "@/lib/db/queries/meeting-sessions";
import { updateMeetingSession } from "@/lib/db/mutations/meeting-sessions";
import { toMeetingSessionRecord } from "@/features/meeting-assistant/server/session-record";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
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

  const parsed = updateMeetingSessionSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("Invalid meeting session update.", 400, parsed.error.flatten());
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const { id } = await context.params;
    const existingSession = await getMeetingSessionByIdForUser(id, user.id);

    if (!existingSession) {
      return apiError("Meeting session not found.", 404);
    }

    const session = await updateMeetingSession(id, user.id, parsed.data);
    return apiSuccess({
      success: true,
      session: toMeetingSessionRecord(session)
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return apiError(
        "Your database tables are not set up yet. Run your database migrations, then try again.",
        503
      );
    }

    return apiError(error instanceof Error ? error.message : "Failed to update meeting session.", 500);
  }
}
