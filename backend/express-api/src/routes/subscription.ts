import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../db/client";
import { getOrCreateSubscription, refreshSubscriptionIfNeeded } from "../lib/subscription-sync";

export const subscriptionRouter = Router();

// ── Plan definitions (mirrors frontend/src/lib/subscription.ts) ──────────────

type PlanId = "free" | "pro" | "elite" | "trial";

const fallbackPlanLimits: Record<PlanId, {
  meetingBot: boolean;
  transcription: boolean;
  summary: boolean;
  actionItems: boolean;
  history: boolean;
  meetingsPerMonth: number;
  unlimited: boolean;
  teamWorkspace: boolean;
}> = {
  free:  { meetingBot: false, transcription: false, summary: false, actionItems: false, history: false, meetingsPerMonth: 7,      unlimited: false, teamWorkspace: false },
  pro:   { meetingBot: true,  transcription: true,  summary: true,  actionItems: true,  history: true,  meetingsPerMonth: 20,     unlimited: false, teamWorkspace: false },
  elite: { meetingBot: true,  transcription: true,  summary: true,  actionItems: true,  history: true,  meetingsPerMonth: 999999, unlimited: true,  teamWorkspace: true  },
  trial: { meetingBot: true,  transcription: true,  summary: true,  actionItems: true,  history: true,  meetingsPerMonth: 999999, unlimited: true,  teamWorkspace: true  },
};

const fallbackPlanDefinitions: Record<PlanId, any> = {
  free:  { id: "free",  name: "Free",  price: 0,   badge: null,           badgeTone: "neutral", description: "Unlimited generation tools with seven meeting previews per month.", features: ["Email Generator (unlimited)", "Task Generator (unlimited)", "Document Analyzer (unlimited)", "7 meeting recordings/month (preview only)"], limits: fallbackPlanLimits.free  },
  pro:   { id: "pro",   name: "Pro",   price: 99,  badge: "Most Popular", badgeTone: "pending", description: "Meeting bot, transcription, summaries, and history for active individual users.", features: ["Everything in Free", "Meeting Bot (AI Notetaker)", "Auto Transcription", "Auto Summary", "Action Items extraction", "Meeting History", "20 meetings/month"], limits: fallbackPlanLimits.pro   },
  elite: { id: "elite", name: "Elite", price: 199, badge: "Best Value",   badgeTone: "accent",  description: "Unlimited meetings plus priority support and future feature access.", features: ["Everything in Pro", "Unlimited meetings", "Priority support", "Team workspace (shared meetings & invites)", "All future features"], limits: fallbackPlanLimits.elite },
  trial: { id: "trial", name: "Trial", price: 0,   badge: "30 Days",      badgeTone: "pending", description: "Full Elite-level access during your trial — team workspaces, unlimited meetings, every feature.", features: ["Everything in Elite", "Team workspace & invites", "Unlimited meetings during trial", "30-day free trial"], limits: fallbackPlanLimits.trial },
};

async function fetchPlanCatalog(): Promise<Array<{
  planId: PlanId;
  displayName: string;
  priceInr: number;
  badge: string | null;
  badgeTone: "neutral" | "accent" | "pending" | "dark";
  description: string;
  features: string[];
  limits: typeof fallbackPlanLimits[PlanId];
  sortOrder: number;
}>> {
  try {
    const { rows } = await pool.query(
      `SELECT plan_id AS "planId",
              display_name AS "displayName",
              price_inr AS "priceInr",
              badge,
              badge_tone AS "badgeTone",
              description,
              features,
              limits,
              sort_order AS "sortOrder"
       FROM plan_catalog
       WHERE is_active = true
       ORDER BY sort_order ASC`
    );
    return rows;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "42P01") return [];
    throw e;
  }
}

async function getPlanDefinition(plan: PlanId) {
  const catalog = await fetchPlanCatalog();
  const fromDb = catalog.find((p) => p.planId === plan);
  if (!fromDb) return fallbackPlanDefinitions[plan];
  const dbLimits =
    fromDb.limits && typeof fromDb.limits === "object" && !Array.isArray(fromDb.limits)
      ? (fromDb.limits as Partial<(typeof fallbackPlanLimits)[PlanId]>)
      : {};
  return {
    id: fromDb.planId,
    name: fromDb.displayName,
    price: fromDb.priceInr,
    badge: fromDb.badge,
    badgeTone: fromDb.badgeTone,
    description: fromDb.description,
    features: Array.isArray(fromDb.features) ? fromDb.features : [],
    limits: { ...fallbackPlanLimits[plan], ...dbLimits },
  };
}

async function getPlanLimits(plan: PlanId) {
  const def = await getPlanDefinition(plan);
  return def.limits ?? fallbackPlanLimits[plan];
}

function getPlanKey(plan: string): PlanId {
  return plan in fallbackPlanLimits ? (plan as PlanId) : "free";
}

function getTrialDaysLeft(trialEndsAt: Date, plan: string): number {
  if (plan !== "trial") return 0;
  const diff = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// GET /api/subscription
subscriptionRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clerkUserId = req.clerkUserId;

    let sub = await getOrCreateSubscription(clerkUserId);
    sub = await refreshSubscriptionIfNeeded(sub);

    const plan = getPlanKey(sub.plan);
    const planDefinition = await getPlanDefinition(plan);
    const limits = await getPlanLimits(plan);

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
        ...limits,
        actionItems: limits.actionItems,
        history: limits.history,
      },
      meetingsUsedThisMonth: sub.meetings_used_this_month,
      planDefinition,
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

// GET /api/subscription/plans — DB-driven plan cards + comparison
subscriptionRouter.get("/plans", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const catalog = await fetchPlanCatalog();
    if (catalog.length === 0) {
      return res.json({
        success: true,
        plans: Object.values(fallbackPlanDefinitions),
      });
    }

    return res.json({
      success: true,
      plans: catalog.map((p) => {
        const dbLim =
          p.limits && typeof p.limits === "object" && !Array.isArray(p.limits)
            ? (p.limits as Partial<(typeof fallbackPlanLimits)[PlanId]>)
            : {};
        return {
          id: p.planId,
          name: p.displayName,
          price: p.priceInr,
          badge: p.badge,
          badgeTone: p.badgeTone,
          description: p.description,
          features: p.features,
          limits: { ...fallbackPlanLimits[p.planId], ...dbLim },
          sortOrder: p.sortOrder,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});
