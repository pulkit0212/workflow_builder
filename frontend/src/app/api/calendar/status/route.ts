import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUserIntegration } from "@/lib/db/queries/user-integrations";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import type { CalendarProvider } from "@/lib/calendar/types";

const CALENDAR_PROVIDERS: CalendarProvider[] = [
  "google",
  "microsoft_teams",
  "microsoft_outlook",
];

/**
 * Returns true if the integration has a valid (non-expired or refreshable) token.
 */
function isConnected(
  integration: {
    accessToken: string | null | undefined;
    refreshToken: string | null | undefined;
    expiry: Date | null | undefined;
  } | null
): boolean {
  if (!integration || !integration.accessToken) return false;

  const { expiry, refreshToken } = integration;

  // No expiry set — token is valid indefinitely
  if (!expiry) return true;

  // Token is not yet expired
  if (expiry > new Date()) return true;

  // Token is expired but can be refreshed
  if (refreshToken) return true;

  return false;
}

export async function GET() {
  const { userId: clerkUserId } = await auth();

  if (!clerkUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await syncCurrentUserToDatabase(clerkUserId);

  const results = await Promise.all(
    CALENDAR_PROVIDERS.map((provider) => getUserIntegration(user.id, provider))
  );

  const [google, microsoft_teams, microsoft_outlook] = results.map(isConnected);

  return NextResponse.json({ google, microsoft_teams, microsoft_outlook });
}
