/** API responses when a feature is blocked by subscription plan. */

export type PlanGateErrorCode = "upgrade_required" | "elite_required" | "limit_reached";

export type PlanGatePayload = {
  error?: string;
  code?: string;
  currentPlan?: string;
  message?: string;
  feature?: string;
};

const FEATURE_MESSAGES: Record<string, string> = {
  action_items:
    "Action items are available on Pro and Elite. Upgrade your plan to view your task backlog.",
  action_items_view:
    "Task Backlog is available on Pro and Elite. Upgrade to Pro to view your action items.",
  action_items_manage:
    "Editing action items requires Elite. Upgrade to create, update, or delete tasks.",
  export_share_download:
    "Export and share requires Elite. Upgrade to download or share this content.",
  meeting_bot:
    "The AI Notetaker is available on all plans with monthly limits. Upgrade for more meetings.",
  history: "Meeting and tool history is available on Pro and Elite. Upgrade to access past runs.",
  team_workspace:
    "Shared team workspaces are available on Elite. Upgrade to invite members and collaborate.",
};

export function isPlanGatePayload(payload: unknown): payload is PlanGatePayload {
  return typeof payload === "object" && payload !== null;
}

export function isUpgradeRequired(payload: unknown): boolean {
  if (!isPlanGatePayload(payload)) return false;
  return payload.error === "upgrade_required" || payload.code === "upgrade_required";
}

export function isEliteRequired(payload: unknown): boolean {
  if (!isPlanGatePayload(payload)) return false;
  return payload.error === "elite_required" || payload.code === "elite_required";
}

export function isLimitReached(payload: unknown): boolean {
  if (!isPlanGatePayload(payload)) return false;
  return payload.error === "limit_reached" || payload.code === "limit_reached";
}

export function isPlanGatedResponse(status: number, payload: unknown): boolean {
  if (status !== 403) return false;
  return isUpgradeRequired(payload) || isEliteRequired(payload) || isLimitReached(payload);
}

/** User-facing copy for plan-gated API errors. */
export function getPlanGateUserMessage(
  payload: PlanGatePayload,
  feature?: string
): string {
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }

  const key = payload.feature ?? feature;
  if (key && FEATURE_MESSAGES[key]) {
    return FEATURE_MESSAGES[key];
  }

  if (isLimitReached(payload)) {
    return "You've reached your plan limit for this month. Upgrade for more capacity.";
  }

  if (isEliteRequired(payload)) {
    return "This feature requires Elite. Upgrade in Billing to unlock export, share, and edit.";
  }

  return "This feature requires a Pro or Elite plan. Upgrade in Billing to continue.";
}

export async function readJsonPayload(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export type PlanGateHandleResult =
  | { ok: true }
  | { ok: false; upgradeRequired: boolean; eliteRequired: boolean; message: string };

/** Parse a failed API response; returns a friendly message when plan-gated. */
export async function handlePlanGatedApiResponse(
  res: Response,
  options?: { feature?: string; fallbackMessage?: string }
): Promise<PlanGateHandleResult> {
  const payload = (await readJsonPayload(res)) as PlanGatePayload;

  if (isPlanGatedResponse(res.status, payload)) {
    return {
      ok: false,
      upgradeRequired: isUpgradeRequired(payload),
      eliteRequired: isEliteRequired(payload),
      message: getPlanGateUserMessage(payload, options?.feature),
    };
  }

  const fallback = options?.fallbackMessage ?? "Something went wrong. Please try again.";
  const message =
    typeof payload.message === "string" && payload.message.trim()
      ? payload.message.trim()
      : typeof payload.error === "string" &&
          payload.error !== "upgrade_required" &&
          payload.error !== "elite_required" &&
          payload.error !== "limit_reached"
        ? payload.error
        : fallback;

  return { ok: false, upgradeRequired: false, eliteRequired: false, message };
}
