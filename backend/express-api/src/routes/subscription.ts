import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../db/client";

export const subscriptionRouter = Router();

// ── Plan definitions (mirrors frontend/src/lib/subscription.ts) ──────────────

type PlanId = "free" | "pro" | "elite" | "trial";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const planLimits: Record<PlanId, {
  meetingBot: boolean;
  transcription: boolean;
  summary: boolean;
  actionItems: boolean;
  history: boolean;
  meetingsPerMonth: number;
  unlimited: boolean;
}> = {
  free:  { meetingBot: false, transcription: false, summary: false, actionItems: false, history: false, meetingsPerMonth: 3,      unlimited: false },
  pro:   { meetingBot: true,  transcription: true,  summary: true,  actionItems: true,  history: true,  meetingsPerMonth: 10,     unlimited: false },
  elite: { meetingBot: true,  transcription: true,  summary: true,  actionItems: true,  history: true,  meetingsPerMonth: 999999, unlimited: true  },
  trial: { meetingBot: true,  transcription: true,  summary: true,  actionItems: true,  history: true,  meetingsPerMonth: 999999, unlimited: true  },
};

const planDefinitions: Record<PlanId, object> = {
  free:  { id: "free",  name: "Free",  price: 0,   badge: "Current",      badgeTone: "neutral", description: "Unlimited generation tools with three meeting previews per month.", features: ["Email Generator (unlimited)", "Task Generator (unlimited)", "Document Analyzer (unlimited)", "3 meeting recordings/month (preview only)"], limits: planLimits.free  },
  pro:   { id: "pro",   name: "Pro",   price: 99,  badge: "Most Popular",  badgeTone: "pending", description: "Meeting bot, transcription, summaries, and history for active individual users.", features: ["Everything in Free", "Meeting Bot (AI Notetaker)", "Auto Transcription", "Auto Summary", "Action Items extraction", "Meeting History", "10 meetings/month"], limits: planLimits.pro   },
  elite: { id: "elite", name: "Elite", price: 199, badge: "Best Value",    badgeTone: "accent",  description: "Unlimited meetings plus priority support and future feature access.", features: ["Everything in Pro", "Unlimited meetings", "Priority support", "Slack/Email export (coming soon)", "Team workspace (coming soon)", "All future features"], limits: planLimits.elite },
  trial: { id: "trial", name: "Trial", price: 0,   badge: "30 Days",       badgeTone: "pending", description: "Full Elite access for 30 days after signup.", features: ["Everything in Elite", "30-day free trial", "Full feature access"], limits: planLimits.trial },
};

function getPlanKey(plan: string): PlanId {
  return plan in planLimits ? (plan as PlanId) : "free";
}

function getTrialDaysLeft(trialEndsAt: Date, plan: string): number {
  if (plan !== "trial") return 0;
  const diff = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function monthHasRolledOver(lastResetDate: Date, now: Date): boolean {
  return (
    lastResetDate.getUTCFullYear() !== now.getUTCFullYear() ||
    lastResetDate.getUTCMonth() !== now.getUTCMonth()
  );
}

async function getOrCreateSubscription(clerkUserId: string) {
  const { rows } = await pool.query(
    `SELECT * FROM subscriptions WHERE user_id = $1 LIMIT 1`,
    [clerkUserId]
  );

  if (rows.length > 0) return rows[0];

  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + THIRTY_DAYS_MS);
  const { rows: inserted } = await pool.query(
    `INSERT INTO subscriptions (user_id, plan, status, trial_started_at, trial_ends_at, last_reset_date)
     VALUES ($1, 'trial', 'active', $2, $3, $2)
     RETURNING *`,
    [clerkUserId, now, trialEndsAt]
  );
  return inserted[0];
}

async function refreshSubscriptionIfNeeded(sub: Record<string, unknown>) {
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
  return rows[0] ?? sub;
}

// GET /api/subscription
subscriptionRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clerkUserId = req.clerkUserId;

    let sub = await getOrCreateSubscription(clerkUserId);
    sub = await refreshSubscriptionIfNeeded(sub);

    const plan = getPlanKey(sub.plan);

    const { rows: payments } = await pool.query(
      `SELECT id, created_at, plan, amount, currency, status, invoice_number, razorpay_payment_id, razorpay_order_id
       FROM subscription_payments
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [clerkUserId]
    );

    return res.json({
      success: true,
      plan: sub.plan,
      status: sub.status,
      subscription: sub,
      trialStartedAt: new Date(sub.trial_started_at).toISOString(),
      trialDaysLeft: getTrialDaysLeft(new Date(sub.trial_ends_at), sub.plan),
      trialEndsAt: new Date(sub.trial_ends_at).toISOString(),
      planStartedAt: sub.plan_started_at ? new Date(sub.plan_started_at).toISOString() : null,
      planEndsAt: sub.plan_ends_at ? new Date(sub.plan_ends_at).toISOString() : null,
      limits: {
        ...planLimits[plan],
        actionItems: planLimits[plan].actionItems,
        history: planLimits[plan].history,
      },
      meetingsUsedThisMonth: sub.meetings_used_this_month,
      planDefinition: planDefinitions[plan],
      payments: payments.map((p: Record<string, unknown>) => ({
        id: p.id,
        date: new Date(p.created_at as string).toISOString(),
        plan: p.plan,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        invoice: p.invoice_number ?? p.razorpay_payment_id ?? p.razorpay_order_id,
      })),
    });
  } catch (err) {
    next(err);
  }
});
