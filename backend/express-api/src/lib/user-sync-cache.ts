import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { users } from "../db/schema/users";

// AppUser is inferred from the users table schema
export type AppUser = typeof users.$inferSelect;

// DrizzleDB type alias for the database instance
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DrizzleDB = NodePgDatabase<any>;

interface CacheEntry {
  user: AppUser;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 60_000; // 60 seconds

export function getCachedUser(clerkUserId: string): AppUser | null {
  const entry = cache.get(clerkUserId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(clerkUserId);
    return null;
  }
  return entry.user;
}

export function setCachedUser(clerkUserId: string, user: AppUser): void {
  cache.set(clerkUserId, {
    user,
    expiresAt: Date.now() + TTL_MS,
  });
}

export async function syncUser(clerkUserId: string, db: DrizzleDB): Promise<AppUser> {
  // Check cache first
  const cached = getCachedUser(clerkUserId);
  if (cached) return cached;

  // Try to insert; if the clerkUserId already exists, do nothing
  await db
    .insert(users)
    .values({
      clerkUserId,
      email: `${clerkUserId}@placeholder.invalid`,
    })
    .onConflictDoNothing();

  // Select the existing (or newly inserted) user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);

  if (!user) {
    throw new Error(`Failed to sync user for clerkUserId: ${clerkUserId}`);
  }

  setCachedUser(clerkUserId, user);
  return user;
}
