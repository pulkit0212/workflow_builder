import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { deleteUserIntegration } from "@/lib/db/mutations/user-integrations";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";

const VALID_PROVIDERS = ["google", "microsoft_teams", "microsoft_outlook"] as const;
type CalendarProvider = (typeof VALID_PROVIDERS)[number];

function isValidProvider(p: string): p is CalendarProvider {
  return (VALID_PROVIDERS as readonly string[]).includes(p);
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  if (!isValidProvider(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await syncCurrentUserToDatabase(clerkUserId);
  await deleteUserIntegration(user.id, provider);

  return NextResponse.json({ success: true }, { status: 200 });
}
