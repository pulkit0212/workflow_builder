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
  /** Team / shared workspace (invite members, workspace-scoped meetings) — Elite only */
  teamWorkspace: boolean;
};

export const planDefinitions: Record<PlanId, { limits: SubscriptionLimits }> = {
  free: {
    limits: {
      meetingBot: false,
      transcription: false,
      summary: false,
      actionItems: false,
      history: false,
      meetingsPerMonth: 7,
      unlimited: false,
      teamWorkspace: false,
    },
  },
  pro: {
    limits: {
      meetingBot: true,
      transcription: true,
      summary: true,
      actionItems: true,
      history: true,
      meetingsPerMonth: 20,
      unlimited: false,
      teamWorkspace: false,
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
      teamWorkspace: true,
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
      teamWorkspace: true,
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

export function canUseTeamWorkspace(plan: string) {
  return getPlanLimits(plan).teamWorkspace;
}
