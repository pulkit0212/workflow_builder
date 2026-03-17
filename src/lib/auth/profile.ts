import { getCurrentClerkUser, getCurrentAppUser, syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { isDatabaseConfigured } from "@/lib/db/client";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";

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

  if (!clerkUser) {
    return null;
  }

  if (!isDatabaseConfigured) {
    return {
      id: clerkUser.clerkUserId,
      clerkUserId: clerkUser.clerkUserId,
      email: clerkUser.email,
      fullName: clerkUser.fullName,
      plan: "free",
      source: "clerk"
    };
  }

  let appUser = null;

  try {
    appUser = options?.sync ?? true
      ? await syncCurrentUserToDatabase(clerkUser.clerkUserId)
      : await getCurrentAppUser({
          expectedClerkUserId: clerkUser.clerkUserId,
          sync: false
        });
  } catch (error) {
    if (!isMissingDatabaseRelationError(error)) {
      throw error;
    }
  }

  if (!appUser) {
    return {
      id: clerkUser.clerkUserId,
      clerkUserId: clerkUser.clerkUserId,
      email: clerkUser.email,
      fullName: clerkUser.fullName,
      plan: "free",
      source: "clerk"
    };
  }

  return {
    id: appUser.id,
    clerkUserId: appUser.clerkUserId,
    email: appUser.email,
    fullName: appUser.fullName,
    plan: appUser.plan,
    source: "database"
  };
}
