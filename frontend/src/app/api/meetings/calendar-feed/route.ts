import { auth } from "@clerk/nextjs/server";
import { type NextRequest } from "next/server";
import { apiError } from "@/lib/api-responses";
import { NextResponse } from "next/server";
import { fetchUnifiedCalendarFeed } from "@/lib/calendar/feed";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";

export const runtime = "nodejs";

function isValidIso8601(value: string): boolean {
  const date = new Date(value);
  return !isNaN(date.getTime()) && value.trim().length > 0;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (!startDate || !endDate) {
    return apiError("Missing required query params: startDate and endDate.", 400);
  }

  if (!isValidIso8601(startDate) || !isValidIso8601(endDate)) {
    return apiError("startDate and endDate must be valid ISO 8601 dates.", 400);
  }

  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return apiError("Unauthorized.", 401);

  try {
    // Resolve Clerk ID → internal DB UUID
    const user = await syncCurrentUserToDatabase(clerkUserId);

    const feed = await fetchUnifiedCalendarFeed(
      user.id,
      new Date(startDate),
      new Date(endDate)
    );
    return NextResponse.json(feed, { status: 200 });
  } catch (err) {
    console.error("[calendar-feed] Unexpected error:", err);
    return apiError("Failed to load calendar feed.", 500);
  }
}
