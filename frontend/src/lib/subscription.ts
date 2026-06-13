export type PlanId = "free" | "pro" | "elite" | "trial";

export type SubscriptionLimits = {
  meetingBot: boolean;
  transcription: boolean;
  summary: boolean;
  /** View action items hub (Pro+). Data always saved in DB for all plans. */
  actionItems: boolean;
  /** Edit / create / delete action items (Elite+). */
  actionItemsManage: boolean;
  /** View history page (Pro+). */
  history: boolean;
  /** Download PDF, export CSV, share to integrations (Elite+). */
  exportShareDownload: boolean;
  meetingsPerMonth: number;
  unlimited: boolean;
  /** Team workspace — Elite only */
  teamWorkspace: boolean;
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
    description: "AI tools plus 7 meetings/month with full bot capture — data saved for when you upgrade.",
    features: [
      "Email Generator (unlimited)",
      "Task Generator (unlimited)",
      "Document Analyzer (unlimited)",
      "Meeting Bot — 7 meetings/month (record, transcript, summary saved)",
      "View meeting results in meeting detail",
      "Task Backlog & History — upgrade to Pro to open",
    ],
    limits: {
      meetingBot: true,
      transcription: true,
      summary: true,
      actionItems: false,
      actionItemsManage: false,
      history: false,
      exportShareDownload: false,
      meetingsPerMonth: 7,
      unlimited: false,
      teamWorkspace: false,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 99,
    badge: "Most Popular",
    badgeTone: "pending",
    description: "View meetings, action items, and history — export, share, and edit on Elite.",
    features: [
      "Everything in Free",
      "20 meetings/month",
      "View Task Backlog (read-only)",
      "View Meeting & tool History",
      "Edit, export, share — Elite",
    ],
    limits: {
      meetingBot: true,
      transcription: true,
      summary: true,
      actionItems: true,
      actionItemsManage: false,
      history: true,
      exportShareDownload: false,
      meetingsPerMonth: 20,
      unlimited: false,
      teamWorkspace: false,
    },
  },
  elite: {
    id: "elite",
    name: "Elite",
    price: 199,
    badge: "Best Value",
    badgeTone: "accent",
    description: "Unlimited meetings, full edit/export/share, and team workspaces.",
    features: [
      "Everything in Pro",
      "Unlimited meetings",
      "Edit, export & share action items",
      "Download & share meetings & history",
      "Team workspace (shared meetings & invites)",
      "Priority support",
    ],
    limits: {
      meetingBot: true,
      transcription: true,
      summary: true,
      actionItems: true,
      actionItemsManage: true,
      history: true,
      exportShareDownload: true,
      meetingsPerMonth: 999999,
      unlimited: true,
      teamWorkspace: true,
    },
  },
  trial: {
    id: "trial",
    name: "Trial",
    price: 0,
    badge: "30 Days",
    badgeTone: "pending",
    description: "Full Elite-level access during your trial.",
    features: [
      "Everything in Elite",
      "Team workspace & invites",
      "Unlimited meetings during trial",
      "30-day free trial",
    ],
    limits: {
      meetingBot: true,
      transcription: true,
      summary: true,
      actionItems: true,
      actionItemsManage: true,
      history: true,
      exportShareDownload: true,
      meetingsPerMonth: 999999,
      unlimited: true,
      teamWorkspace: true,
    },
  },
};

/** Merge API/DB limits with plan defaults (new fields may be missing in older rows). */
export function normalizeSubscriptionLimits(
  plan: string,
  partial?: Partial<SubscriptionLimits> | null
): SubscriptionLimits {
  const key = plan in planDefinitions ? (plan as PlanId) : "free";
  return { ...planDefinitions[key].limits, ...partial };
}

export function getPlanLimits(plan: string): SubscriptionLimits {
  return planDefinitions[plan in planDefinitions ? (plan as PlanId) : "free"].limits;
}

export function getPlanDefinition(plan: string): PlanDefinition {
  return planDefinitions[plan in planDefinitions ? (plan as PlanId) : "free"];
}

export function canUseMeetingBot(plan: string) {
  return getPlanLimits(plan).meetingBot;
}

/** View action items hub (Pro+). */
export function canViewActionItems(plan: string) {
  return getPlanLimits(plan).actionItems;
}

/** @deprecated Use canViewActionItems */
export function canUseActionItems(plan: string) {
  return canViewActionItems(plan);
}

export function canManageActionItems(plan: string) {
  return getPlanLimits(plan).actionItemsManage;
}

export function canViewHistory(plan: string) {
  return getPlanLimits(plan).history;
}

/** @deprecated Use canViewHistory */
export function canUseHistory(plan: string) {
  return canViewHistory(plan);
}

export function canExportShareDownload(plan: string) {
  return getPlanLimits(plan).exportShareDownload;
}

export function canUseTeamWorkspace(plan: string) {
  return getPlanLimits(plan).teamWorkspace;
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
