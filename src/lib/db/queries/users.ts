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

export async function getUserByEmail(email: string) {
  const database = getDbOrThrow();
  console.info(`${usersLogPrefix} selecting user by email`, { email });

  const [user] = await database.select().from(users).where(eq(users.email, email)).limit(1);

  console.info(`${usersLogPrefix} email select complete`, {
    email,
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

  const existingByClerkUserId = await getUserByClerkUserId(clerkUserId);

  if (existingByClerkUserId) {
    const [updatedUser] = await database
      .update(users)
      .set({
        email,
        fullName,
        plan,
        updatedAt: now
      })
      .where(eq(users.id, existingByClerkUserId.id))
      .returning();

    if (!updatedUser) {
      throw new Error("Failed to update authenticated user record.");
    }

    console.info(`${usersLogPrefix} updated existing user by Clerk ID`, {
      clerkUserId,
      appUserId: updatedUser.id
    });

    return updatedUser;
  }

  const existingByEmail = await getUserByEmail(email);

  if (existingByEmail) {
    const [updatedUser] = await database
      .update(users)
      .set({
        clerkUserId,
        email,
        fullName,
        plan,
        updatedAt: now
      })
      .where(eq(users.id, existingByEmail.id))
      .returning();

    if (!updatedUser) {
      throw new Error("Failed to reattach authenticated user record.");
    }

    console.info(`${usersLogPrefix} reattached existing user by email`, {
      clerkUserId,
      email,
      appUserId: updatedUser.id
    });

    return updatedUser;
  }

  const [user] = await database
    .insert(users)
    .values({
      clerkUserId,
      email,
      fullName,
      plan,
      updatedAt: now
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
