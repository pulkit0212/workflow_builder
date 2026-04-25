import { auth, currentUser } from "@clerk/nextjs/server";
import type { Route } from "next";
import { redirect } from "next/navigation";

const signInRoute = "/sign-in" as Route;

export type AppUser = {
  id: string;
  clerkUserId: string;
  email: string;
  fullName: string | null;
  plan: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CurrentClerkUser = {
  clerkUserId: string;
  email: string;
  fullName: string | null;
};

export async function getCurrentClerkUser(expectedClerkUserId?: string): Promise<CurrentClerkUser | null> {
  const session = await auth();
  if (!session.userId) return null;
  if (expectedClerkUserId && session.userId !== expectedClerkUserId) {
    throw new Error("Authenticated user mismatch.");
  }

  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const primaryEmail = clerkUser.emailAddresses.find(
    (e) => e.id === clerkUser.primaryEmailAddressId
  )?.emailAddress ?? null;

  if (!primaryEmail) return null;

  const fullName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim() || null;

  return { clerkUserId: clerkUser.id, email: primaryEmail, fullName };
}

export async function requireCurrentClerkUser(expectedClerkUserId?: string): Promise<CurrentClerkUser> {
  const clerkUser = await getCurrentClerkUser(expectedClerkUserId);
  if (!clerkUser) redirect(signInRoute);
  return clerkUser;
}

// Kept for backward compat — returns a minimal AppUser-shaped object from Clerk only.
// The real DB sync happens in the Express backend on every authenticated request.
export async function syncCurrentUserToDatabase(expectedClerkUserId?: string): Promise<AppUser> {
  const clerkUser = await requireCurrentClerkUser(expectedClerkUserId);
  return {
    id: clerkUser.clerkUserId,
    clerkUserId: clerkUser.clerkUserId,
    email: clerkUser.email,
    fullName: clerkUser.fullName,
    plan: "free",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function getCurrentAppUser(options?: {
  expectedClerkUserId?: string;
}): Promise<AppUser | null> {
  const clerkUser = await getCurrentClerkUser(options?.expectedClerkUserId);
  if (!clerkUser) return null;
  return {
    id: clerkUser.clerkUserId,
    clerkUserId: clerkUser.clerkUserId,
    email: clerkUser.email,
    fullName: clerkUser.fullName,
    plan: "free",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
