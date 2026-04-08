import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { createMeetingSessionSchema } from "@/features/meeting-assistant/schema";
import { createMeetingSession } from "@/lib/db/mutations/meeting-sessions";
import { listMeetingSessionsByUser } from "@/lib/db/queries/meeting-sessions";
import { toMeetingSessionRecord } from "@/features/meeting-assistant/server/session-record";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";
import { resolveWorkspaceIdForRequest } from "@/lib/workspaces/server";

export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const workspaceId = await resolveWorkspaceIdForRequest(request, user.id);

    const meetings = await listMeetingSessionsByUser(user.id, workspaceId, {
      excludeDrafts: true
    });

    return apiSuccess({
      success: true,
      meetings: meetings.map(toMeetingSessionRecord)
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return apiError(
        "Your database tables are not set up yet. Run your database migrations, then try again.",
        503
      );
    }

    return apiError(error instanceof Error ? error.message : "Failed to load meetings.", 500);
  }
}

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

  const parsed = createMeetingSessionSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("Invalid meeting session input.", 400, parsed.error.flatten());
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const workspaceId = await resolveWorkspaceIdForRequest(request, user.id);

    const session = await createMeetingSession({
      userId: user.id,
      workspaceId: workspaceId ?? null,
      provider: parsed.data.provider,
      title: parsed.data.title,
      meetingLink: parsed.data.meetingLink,
      notes: parsed.data.notes || undefined,
      status: "draft"
    });

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

    return apiError(error instanceof Error ? error.message : "Failed to create meeting session.", 500);
  }
}
