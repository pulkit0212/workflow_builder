import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { fetchUpcomingGoogleCalendarMeetings } from "@/lib/google/calendar";
import { getActiveGoogleIntegration } from "@/lib/google/integration";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const integration = await getActiveGoogleIntegration(user.id);

    if (!integration?.accessToken) {
      return apiError("Google is not connected.", 404);
    }

    const meetings = await fetchUpcomingGoogleCalendarMeetings(integration.accessToken);

    return apiSuccess({
      success: true,
      meetings
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return apiError(
        "Your database tables are not set up yet. Run your database migrations, then try again.",
        503
      );
    }

    return apiError(error instanceof Error ? error.message : "Failed to load Google Calendar meetings.", 500);
  }
}
