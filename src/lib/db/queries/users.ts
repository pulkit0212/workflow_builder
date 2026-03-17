import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { db } from "@/lib/db/client";

const usersLogPrefix = "[db-users]";

function getDbOrThrow() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return db;
}

export type AppUser = typeof users.$inferSelect;

export type UpsertAppUserInput = {
  clerkUserId: string;
  email: string;
  fullName: string | null;
  plan?: string;
};

export async function getUserByClerkUserId(clerkUserId: string) {
  const database = getDbOrThrow();
  console.info(`${usersLogPrefix} selecting user by Clerk ID`, { clerkUserId });

  const [user] = await database.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);

  console.info(`${usersLogPrefix} select complete`, {
    clerkUserId,
    found: Boolean(user)
  });

  return user ?? null;
}

export async function upsertUserByClerkIdentity({
  clerkUserId,
  email,
  fullName,
  plan = "free"
}: UpsertAppUserInput): Promise<AppUser> {
  const database = getDbOrThrow();
  const now = new Date();
  console.info(`${usersLogPrefix} upserting user`, {
    clerkUserId,
    email
  });

  const [user] = await database
    .insert(users)
    .values({
      clerkUserId,
      email,
      fullName,
      plan,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: users.clerkUserId,
      set: {
        email,
        fullName,
        updatedAt: now
      }
    })
    .returning();

  if (user) {
    console.info(`${usersLogPrefix} upsert succeeded`, {
      clerkUserId,
      appUserId: user.id
    });
    return user;
  }

  const selected = await getUserByClerkUserId(clerkUserId);

  if (!selected) {
    console.error(`${usersLogPrefix} upsert completed but user could not be reloaded`, {
      clerkUserId
    });
    throw new Error("Failed to resolve authenticated user record.");
  }

  console.info(`${usersLogPrefix} reloaded user after upsert`, {
    clerkUserId,
    appUserId: selected.id
  });

  return selected;
}
