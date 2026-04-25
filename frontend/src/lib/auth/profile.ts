import { getCurrentClerkUser } from "@/lib/auth/current-user";

export type AuthenticatedProfile = {
  id: string;
  clerkUserId: string;
  email: string;
  fullName: string | null;
  plan: string;
  source: "database" | "clerk";
};

export async function getCurrentAuthenticatedProfile(options?: {
  expectedClerkUserId?: string;
  sync?: boolean;
}): Promise<AuthenticatedProfile | null> {
  const clerkUser = await getCurrentClerkUser(options?.expectedClerkUserId);
  if (!clerkUser) return null;

  // Return Clerk-based profile — the Express backend handles DB sync on every API call.
  // The dashboard-account component refreshes the plan from /api/profile/me after load.
  return {
    id: clerkUser.clerkUserId,
    clerkUserId: clerkUser.clerkUserId,
    email: clerkUser.email,
    fullName: clerkUser.fullName,
    plan: "free",
    source: "clerk",
  };
}
