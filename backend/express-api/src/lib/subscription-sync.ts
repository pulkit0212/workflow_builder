import { pool } from "../db/client";
import { invalidateCachedUser } from "./user-sync-cache";

export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function monthHasRolledOver(lastResetDate: Date, now: Date): boolean {
  return (
    lastResetDate.getUTCFullYear() !== now.getUTCFullYear() ||
    lastResetDate.getUTCMonth() !== now.getUTCMonth()
  );
}

export async function syncUserPlanFromClerk(clerkUserId: string, plan: string): Promise<void> {
  await pool.query(`UPDATE users SET plan = $1, updated_at = NOW() WHERE clerk_user_id = $2`, [plan, clerkUserId]);
  invalidateCachedUser(clerkUserId);
}

export async function getOrCreateSubscription(clerkUserId: string) {
  const { rows } = await pool.query(`SELECT * FROM subscriptions WHERE user_id = $1 LIMIT 1`, [clerkUserId]);

  if (rows.length > 0) return rows[0];

  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + THIRTY_DAYS_MS);
  const { rows: inserted } = await pool.query(
    `INSERT INTO subscriptions (user_id, plan, status, trial_started_at, trial_ends_at, last_reset_date)
     VALUES ($1, 'trial', 'active', $2, $3, $2)
     RETURNING *`,
    [clerkUserId, now, trialEndsAt]
  );
  const row = inserted[0];
  await syncUserPlanFromClerk(clerkUserId, row.plan as string);
  return row;
}

export async function refreshSubscriptionIfNeeded(sub: Record<string, unknown>) {
  const now = new Date();
  const updates: Record<string, unknown> = {};

  if (sub.plan === "trial" && new Date(sub.trial_ends_at as string) < now) {
    updates.plan = "free";
    updates.status = "active";
  }

  if (
    ["pro", "elite"].includes(sub.plan as string) &&
    sub.plan_ends_at &&
    new Date(sub.plan_ends_at as string) < now
  ) {
    updates.plan = "free";
    updates.status = "expired";
  }

  if (
    monthHasRolledOver(new Date(sub.last_reset_date as string), now) &&
    (sub.meetings_used_this_month as number) > 0
  ) {
    updates.meetings_used_this_month = 0;
    updates.last_reset_date = now;
  }

  if (Object.keys(updates).length === 0) return sub;

  const setClauses = Object.keys(updates)
    .map((k, i) => `${k} = $${i + 2}`)
    .join(", ");
  const { rows } = await pool.query(
    `UPDATE subscriptions SET ${setClauses}, updated_at = NOW() WHERE user_id = $1 RETURNING *`,
    [sub.user_id, ...Object.values(updates)]
  );
  const updated = rows[0] ?? sub;
  await syncUserPlanFromClerk(String(updated.user_id), String(updated.plan));
  return updated;
}
