import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { getUpcomingGoogleCalendarMeetingsForUser } from "@/features/upcoming-meetings/server";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const now = new Date();
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const meetings = await getUpcomingGoogleCalendarMeetingsForUser(user.id);
    const filtered = meetings.filter((meeting) => {
      if (!meeting.meetLink) {
        return false;
      }

      const startTime = new Date(meeting.startTime).getTime();
      return Number.isFinite(startTime) && startTime > endOfToday.getTime();
    });

    return NextResponse.json(filtered);
  } catch (error) {
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
        message: error instanceof Error ? error.message : "Failed to load upcoming meetings."
      },
      { status: 500 }
    );
  }
}
