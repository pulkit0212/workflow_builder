import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { getActiveGoogleIntegration } from "@/lib/google/integration";
import { fetchGoogleCalendarMeetingsForDay } from "@/lib/google/calendar";
import { GoogleCalendarAuthRequiredError } from "@/lib/google/integration";

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureDatabaseReady();

    const user = await syncCurrentUserToDatabase(userId);
    console.info("[meetings-today] user resolved", { userId: user.id });

    const integration = await getActiveGoogleIntegration(user.id);
    console.info("[meetings-today] token found", {
      hasAccessToken: Boolean(integration?.accessToken),
      scopes: integration?.scopes ?? null
    });

    if (!integration?.accessToken) {
      return NextResponse.json({ message: "Google account not connected" });
    }

    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    console.info("[meetings-today] query window", {
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString()
    });

    const mappedMeetings = await fetchGoogleCalendarMeetingsForDay({
      accessToken: integration.accessToken,
      userId: user.id,
      refreshToken: integration.refreshToken,
      day: today,
      includeWithoutMeetLink: true
    });
    const meetings = mappedMeetings.filter((meeting) => Boolean(meeting.meetLink));

    console.info("[meetings-today] raw event count", {
      count: mappedMeetings.length
    });
    console.info("[meetings-today] mapped meet events count", {
      count: meetings.length
    });
    console.info("[meetings-today] first mapped meeting", meetings[0] ?? null);

    return NextResponse.json(meetings);
  } catch (error) {
    if (error instanceof GoogleCalendarAuthRequiredError) {
      return NextResponse.json({
        meetings: [],
        error: "calendar_auth_required",
        message: "Please reconnect your Google Calendar"
      });
    }

    if (isMissingDatabaseRelationError(error)) {
      return NextResponse.json(
        {
          message: "Your database tables are not set up yet. Run your database migrations, then try again."
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to load today's meetings."
      },
      { status: 500 }
    );
  }
}
