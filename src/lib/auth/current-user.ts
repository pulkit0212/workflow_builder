import { auth, currentUser } from "@clerk/nextjs/server";
import type { Route } from "next";
import { redirect } from "next/navigation";
import type { AppUser } from "@/lib/db/queries/users";
import { getUserByClerkUserId, upsertUserByClerkIdentity } from "@/lib/db/queries/users";

const signInRoute = "/sign-in" as Route;
const authLogPrefix = "[auth-sync]";

export type CurrentClerkUser = {
  clerkUserId: string;
  email: string;
  fullName: string | null;
};

function getPrimaryEmailAddress(clerkUser: Awaited<ReturnType<typeof currentUser>>) {
  return clerkUser?.emailAddresses.find((email) => email.id === clerkUser.primaryEmailAddressId)?.emailAddress ?? null;
}

function getFullName(clerkUser: Awaited<ReturnType<typeof currentUser>>) {
  if (!clerkUser) {
    return null;
  }

  const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim();
  return name || clerkUser.username || null;
}

export async function getCurrentClerkUser(expectedClerkUserId?: string): Promise<CurrentClerkUser | null> {
  console.info(`${authLogPrefix} resolving current Clerk user`, {
    expectedClerkUserId: expectedClerkUserId ?? null
  });
  const session = await auth();

  if (!session.userId) {
    console.warn(`${authLogPrefix} no authenticated Clerk session`);
    return null;
  }

  if (expectedClerkUserId && session.userId !== expectedClerkUserId) {
    console.error(`${authLogPrefix} authenticated user mismatch`, {
      sessionUserId: session.userId,
      expectedClerkUserId
    });
    throw new Error("Authenticated user mismatch.");
  }

  const clerkUser = await currentUser();

  if (!clerkUser) {
    console.error(`${authLogPrefix} Clerk currentUser() returned null`, {
      sessionUserId: session.userId
    });
    throw new Error("Authenticated Clerk user not found.");
  }

  const primaryEmail = getPrimaryEmailAddress(clerkUser);

  if (!primaryEmail) {
    console.error(`${authLogPrefix} Clerk user is missing a primary email`, {
      clerkUserId: clerkUser.id
    });
    throw new Error("Authenticated user does not have a primary email address.");
  }

  console.info(`${authLogPrefix} resolved Clerk user`, {
    clerkUserId: clerkUser.id
  });

  return {
    clerkUserId: clerkUser.id,
    email: primaryEmail,
    fullName: getFullName(clerkUser)
  };
}

export async function requireCurrentClerkUser(expectedClerkUserId?: string) {
  const clerkUser = await getCurrentClerkUser(expectedClerkUserId);

  if (!clerkUser) {
    redirect(signInRoute);
  }

  return clerkUser;
}

export async function syncCurrentUserToDatabase(expectedClerkUserId?: string): Promise<AppUser> {
  const clerkUser = await requireCurrentClerkUser(expectedClerkUserId);
  console.info(`${authLogPrefix} syncing Clerk user to database`, {
    clerkUserId: clerkUser.clerkUserId
  });

  const appUser = await upsertUserByClerkIdentity(clerkUser);

  console.info(`${authLogPrefix} synced app user`, {
    clerkUserId: appUser.clerkUserId,
    appUserId: appUser.id
  });

  return appUser;
}

export async function getCurrentAppUser(options?: {
  expectedClerkUserId?: string;
  sync?: boolean;
}): Promise<AppUser | null> {
  const clerkUser = await getCurrentClerkUser(options?.expectedClerkUserId);

  if (!clerkUser) {
    return null;
  }

  if (options?.sync ?? true) {
    return upsertUserByClerkIdentity(clerkUser);
  }

  return getUserByClerkUserId(clerkUser.clerkUserId);
}
