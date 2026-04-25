// Plan definitions and helpers — pure business logic, no DB or framework dependencies.
// Duplicated from frontend/src/lib/subscription.ts intentionally so both repos are independent.

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

export const planDefinitions: Record<PlanId, { limits: SubscriptionLimits }> = {
  free: {
    limits: {
      meetingBot: false,
      transcription: false,
      summary: false,
      actionItems: false,
      history: false,
      meetingsPerMonth: 3,
      unlimited: false,
    },
  },
  pro: {
    limits: {
      meetingBot: true,
      transcription: true,
      summary: true,
      actionItems: true,
      history: true,
      meetingsPerMonth: 10,
      unlimited: false,
    },
  },
  elite: {
    limits: {
      meetingBot: true,
      transcription: true,
      summary: true,
      actionItems: true,
      history: true,
      meetingsPerMonth: 999999,
      unlimited: true,
    },
  },
  trial: {
    limits: {
      meetingBot: true,
      transcription: true,
      summary: true,
      actionItems: true,
      history: true,
      meetingsPerMonth: 999999,
      unlimited: true,
    },
  },
};

export function getPlanLimits(plan: string): SubscriptionLimits {
  const key = plan in planDefinitions ? (plan as PlanId) : "free";
  return planDefinitions[key].limits;
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
