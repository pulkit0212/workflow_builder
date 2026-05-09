import { ForbiddenError } from "./errors";
import { getPlanLimits } from "./subscription";
import { getOrCreateSubscription, refreshSubscriptionIfNeeded } from "./subscription-sync";

/**
 * Ensures subscription row is fresh (trial expiry, month rollover) and blocks
 * new meeting creation when the plan's monthly cap is reached.
 */
export async function enforceMeetingQuotaBeforeCreate(clerkUserId: string): Promise<void> {
  let sub = await getOrCreateSubscription(clerkUserId);
  sub = await refreshSubscriptionIfNeeded(sub);
  const plan = String(sub.plan);
  const limits = getPlanLimits(plan);
  if (limits.unlimited) return;
  const used = sub.meetings_used_this_month as number;
  if (used >= limits.meetingsPerMonth) {
    throw new ForbiddenError(
      `Monthly meeting limit reached (${limits.meetingsPerMonth} on ${plan} plan). Upgrade to add more meetings.`
    );
  }
}
