export type PlanId = "free" | "pro" | "elite" | "trial";

export type SubscriptionLimits = {
  meetingBot: boolean;
  transcription: boolean;
  summary: boolean;
  actionItems: boolean;
  history: boolean;
  meetingsPerMonth: number;
  unlimited: boolean;
};

export type PlanDefinition = {
  id: PlanId;
  name: string;
  price: number;
  badge: string;
  badgeTone: "neutral" | "accent" | "pending" | "dark";
  features: string[];
  limits: SubscriptionLimits;
  description: string;
};

export type SubscriptionRecord = {
  id: string;
  userId: string;
  plan: PlanId;
  status: "active" | "expired" | "cancelled";
  trialStartedAt: Date;
  trialEndsAt: Date;
  planStartedAt: Date | null;
  planEndsAt: Date | null;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  razorpaySubId: string | null;
  meetingsUsedThisMonth: number;
  lastResetDate: Date;
  createdAt: Date;
  updatedAt: Date;
};

export const planDefinitions: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    badge: "Current",
    badgeTone: "neutral",
    description: "Unlimited generation tools with three meeting previews per month.",
    features: [
      "Email Generator (unlimited)",
      "Task Generator (unlimited)",
      "Document Analyzer (unlimited)",
      "3 meeting recordings/month (preview only)"
    ],
    limits: {
      meetingBot: false,
      transcription: false,
      summary: false,
      actionItems: false,
      history: false,
      meetingsPerMonth: 3,
      unlimited: false
    }
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 99,
    badge: "Most Popular",
    badgeTone: "pending",
    description: "Meeting bot, transcription, summaries, and history for active individual users.",
    features: [
      "Everything in Free",
      "Meeting Bot (AI Notetaker)",
      "Auto Transcription",
      "Auto Summary",
      "Action Items extraction",
      "Meeting History",
      "10 meetings/month"
    ],
    limits: {
      meetingBot: true,
      transcription: true,
      summary: true,
      actionItems: true,
      history: true,
      meetingsPerMonth: 10,
      unlimited: false
    }
  },
  elite: {
    id: "elite",
    name: "Elite",
    price: 199,
    badge: "Best Value",
    badgeTone: "accent",
    description: "Unlimited meetings plus priority support and future feature access.",
    features: [
      "Everything in Pro",
      "Unlimited meetings",
      "Priority support",
      "Slack/Email export (coming soon)",
      "Team workspace (coming soon)",
      "All future features"
    ],
    limits: {
      meetingBot: true,
      transcription: true,
      summary: true,
      actionItems: true,
      history: true,
      meetingsPerMonth: 999999,
      unlimited: true
    }
  },
  trial: {
    id: "trial",
    name: "Trial",
    price: 0,
    badge: "30 Days",
    badgeTone: "pending",
    description: "Full Elite access for 30 days after signup.",
    features: ["Everything in Elite", "30-day free trial", "Full feature access"],
    limits: {
      meetingBot: true,
      transcription: true,
      summary: true,
      actionItems: true,
      history: true,
      meetingsPerMonth: 999999,
      unlimited: true
    }
  }
};

export function getPlanLimits(plan: string): SubscriptionLimits {
  const key = plan in planDefinitions ? (plan as PlanId) : "free";
  return planDefinitions[key].limits;
}

export function getPlanDefinition(plan: string): PlanDefinition {
  return planDefinitions[plan in planDefinitions ? (plan as PlanId) : "free"];
}

export function canUseMeetingBot(plan: string) {
  return getPlanLimits(plan).meetingBot;
}

export function canUseHistory(plan: string) {
  return getPlanLimits(plan).history;
}

export function canUseActionItems(plan: string) {
  return getPlanLimits(plan).actionItems;
}

export function isTrialActive(sub: Pick<SubscriptionRecord, "plan" | "trialEndsAt">) {
  return sub.plan === "trial" && new Date(sub.trialEndsAt) > new Date();
}

export function getTrialDaysLeft(sub: Pick<SubscriptionRecord, "plan" | "trialEndsAt">) {
  if (sub.plan !== "trial") return 0;

  const diff = new Date(sub.trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function getSubscriptionDisplayPlan(plan: string) {
  return getPlanDefinition(plan).name;
}
