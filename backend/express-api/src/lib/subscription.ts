// Plan definitions and helpers — pure business logic, no DB or framework dependencies.
// Duplicated from frontend/src/lib/subscription.ts intentionally so both repos are independent.

export type PlanId = "free" | "pro" | "elite" | "trial";

export type SubscriptionLimits = {
  meetingBot: boolean;
  transcription: boolean;
  summary: boolean;
  actionItems: boolean;
  actionItemsManage: boolean;
  history: boolean;
  exportShareDownload: boolean;
  meetingsPerMonth: number;
  unlimited: boolean;
  teamWorkspace: boolean;
};

export const planDefinitions: Record<PlanId, { limits: SubscriptionLimits }> = {
  free: {
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

export function normalizeSubscriptionLimits(
  plan: string,
  partial?: Partial<SubscriptionLimits> | null
): SubscriptionLimits {
  const key = plan in planDefinitions ? (plan as PlanId) : "free";
  return { ...planDefinitions[key].limits, ...partial };
}

export function getPlanLimits(plan: string): SubscriptionLimits {
  const key = plan in planDefinitions ? (plan as PlanId) : "free";
  return planDefinitions[key].limits;
}

export function canUseMeetingBot(plan: string) {
  return getPlanLimits(plan).meetingBot;
}

export function canViewActionItems(plan: string) {
  return getPlanLimits(plan).actionItems;
}

export function canUseActionItems(plan: string) {
  return canViewActionItems(plan);
}

export function canManageActionItems(plan: string) {
  return getPlanLimits(plan).actionItemsManage;
}

export function canViewHistory(plan: string) {
  return getPlanLimits(plan).history;
}

export function canUseHistory(plan: string) {
  return canViewHistory(plan);
}

export function canExportShareDownload(plan: string) {
  return getPlanLimits(plan).exportShareDownload;
}

export function canUseTeamWorkspace(plan: string) {
  return getPlanLimits(plan).teamWorkspace;
}
