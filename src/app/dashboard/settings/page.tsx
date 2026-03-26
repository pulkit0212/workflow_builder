"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useClerk, useSession, useUser } from "@clerk/nextjs";
import {
  AlertTriangle,
  Bell,
  Bot,
  Check,
  Copy,
  Crown,
  Download,
  Gauge,
  Lock,
  Pencil,
  Trash2,
  User,
} from "lucide-react";
import { SectionHeader } from "@/components/shared/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type PlanId = "free" | "pro" | "elite" | "trial";

type SubscriptionResponse = {
  success: true;
  plan: PlanId;
  status: string;
  trialStartedAt: string;
  trialEndsAt: string;
  planStartedAt: string | null;
  planEndsAt: string | null;
  trialDaysLeft: number;
  meetingsUsedThisMonth: number;
  limits: {
    meetingBot: boolean;
    transcription: boolean;
    summary: boolean;
    actionItems: boolean;
    history: boolean;
    meetingsPerMonth: number;
    unlimited: boolean;
  };
  payments: Array<{
    id: string;
    date: string;
    plan: string;
    amount: number;
    currency: string;
    status: string;
    invoice: string;
  }>;
};

type UsageStatsResponse = {
  success: true;
  meetingsThisMonth: number;
  meetingsAllTime: number;
  transcriptsGenerated: number;
  actionItemsCreated: number;
  documentsAnalyzed: number;
  memberSince: string;
};

type BotProfileStatusResponse = {
  configured: boolean;
};

type ToastType = "success" | "error" | "info";

type ToastState = {
  message: string;
  type: ToastType;
};

type PreferencesState = {
  meetingSummaryEmail: boolean;
  actionItemsEmail: boolean;
  weeklyDigest: boolean;
  productUpdates: boolean;
  defaultTone: "Professional" | "Friendly" | "Formal" | "Concise";
  language: "English" | "Hindi";
  summaryLength: "brief" | "standard" | "detailed";
};

type ActiveTab = "profile" | "account" | "subscription" | "preferences" | "bot" | "usage";

const tabs: Array<{
  id: ActiveTab;
  label: string;
  icon: typeof User;
}> = [
  { id: "profile", label: "Profile", icon: User },
  { id: "account", label: "Account", icon: Lock },
  { id: "subscription", label: "Subscription", icon: Crown },
  { id: "preferences", label: "Preferences", icon: Bell },
  { id: "bot", label: "Bot Settings", icon: Bot },
  { id: "usage", label: "Usage & Limits", icon: Gauge }
];

const defaultPreferences: PreferencesState = {
  meetingSummaryEmail: true,
  actionItemsEmail: false,
  weeklyDigest: false,
  productUpdates: true,
  defaultTone: "Professional",
  language: "English",
  summaryLength: "standard"
};

const preferencesStorageKey = "artiva.settings.preferences.v1";
const botSettingsStorageKey = "artiva.settings.bot.v1";

function formatDate(value: string | number | Date | null | undefined) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);
}

function getInitials(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function getDisplayName(userName?: string | null, firstName?: string | null, lastName?: string | null) {
  const composed = [firstName, lastName].filter(Boolean).join(" ").trim();
  return composed || userName || "Artiva User";
}

function splitDisplayName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return { firstName: "", lastName: "" };
  }

  const [firstName, ...rest] = trimmed.split(/\s+/);
  return {
    firstName,
    lastName: rest.join(" ")
  };
}

function planBadgeVariant(plan: PlanId) {
  switch (plan) {
    case "elite":
      return "accent";
    case "pro":
    case "trial":
      return "pending";
    default:
      return "neutral";
  }
}

function progressColor(usage: number) {
  if (usage >= 90) return "bg-[#dc2626]";
  if (usage >= 75) return "bg-[#f59e0b]";
  return "bg-[#6c63ff]";
}

function Toggle({
  checked,
  onChange,
  disabled = false
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          onChange(!checked);
        }
      }}
      className={cn(
        "relative inline-flex h-8 w-14 items-center rounded-full border transition",
        checked ? "border-[#6c63ff] bg-[#6c63ff]" : "border-[#d1d5db] bg-[#e5e7eb]",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <span
        className={cn(
          "inline-block h-6 w-6 rounded-full bg-white shadow-sm transition",
          checked ? "translate-x-7" : "translate-x-1"
        )}
      />
    </button>
  );
}

function ProgressBar({
  value,
  colorClass = "bg-[#6c63ff]"
}: {
  value: number;
  colorClass?: string;
}) {
  return (
    <div className="h-2 w-full rounded-full bg-[#ede9fe]">
      <div className={cn("h-2 rounded-full transition-all", colorClass)} style={{ width: `${value}%` }} />
    </div>
  );
}

function InfoRow({
  label,
  description,
  control
}: {
  label: string;
  description: string;
  control: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-[#e5e7eb] bg-white px-4 py-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#111827]">{label}</p>
        <p className="mt-1 text-sm leading-6 text-[#6b7280]">{description}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function Toast({ toast }: { toast: ToastState | null }) {
  if (!toast) return null;

  const tone =
    toast.type === "success"
      ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]"
      : toast.type === "error"
        ? "border-[#fecaca] bg-[#fef2f2] text-[#991b1b]"
        : "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]";

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm">
      <div className={cn("rounded-2xl border px-4 py-3 shadow-lg", tone)}>{toast.message}</div>
    </div>
  );
}

export default function SettingsPage() {
  const { user, isLoaded } = useUser();
  const clerk = useClerk();
  const { session } = useSession();
  const toastTimer = useRef<number | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>("profile");
  const [subscription, setSubscription] = useState<SubscriptionResponse | null>(null);
  const [usageStats, setUsageStats] = useState<UsageStatsResponse | null>(null);
  const [botStatus, setBotStatus] = useState<BotProfileStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [preferences, setPreferences] = useState<PreferencesState>(defaultPreferences);
  const [botName, setBotName] = useState("AI Notetaker");
  const [audioSource, setAudioSource] = useState(process.env.NEXT_PUBLIC_MEETING_AUDIO_SOURCE ?? "default");
  const [deleteAccountConfirm, setDeleteAccountConfirm] = useState("");
  const [deleteDataConfirm, setDeleteDataConfirm] = useState("");
  const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false);
  const [isDeleteDataOpen, setIsDeleteDataOpen] = useState(false);

  const emailAddress =
    user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? "Unavailable";
  const memberSince = useMemo(() => {
    if (!user?.createdAt) return "Not available";
    return formatDate(user.createdAt);
  }, [user?.createdAt]);

  const trialEndsAt = subscription?.trialEndsAt ? new Date(subscription.trialEndsAt) : null;
  const planEndsAt = subscription?.planEndsAt ? new Date(subscription.planEndsAt) : null;
  const trialDaysLeft = subscription?.trialDaysLeft ?? 0;
  const isTrialActive = Boolean(subscription?.plan === "trial" && trialEndsAt && trialEndsAt.getTime() > Date.now());
  const currentPlan = subscription?.plan ?? "free";
  const currentPlanLabel = currentPlan === "trial" ? "Trial" : currentPlan.toUpperCase();
  const meetingsLimit = subscription?.limits?.meetingsPerMonth ?? 0;
  const meetingsUsed = subscription?.meetingsUsedThisMonth ?? 0;
  const meetingUsagePercent = subscription
    ? subscription.limits.unlimited
      ? 0
      : Math.min(100, Math.round((meetingsUsed / Math.max(meetingsLimit, 1)) * 100))
    : 0;
  const trialProgress = useMemo(() => {
    if (!subscription || subscription.plan !== "trial") return 0;
    const started = new Date(subscription.trialStartedAt).getTime();
    const ended = new Date(subscription.trialEndsAt).getTime();
    const total = Math.max(ended - started, 1);
    const elapsed = Math.min(Date.now() - started, total);
    return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
  }, [subscription]);

  useEffect(() => {
    if (!isLoaded || !user) return;

    setDisplayName(getDisplayName(user.fullName, user.firstName, user.lastName));
    setNameDraft(getDisplayName(user.fullName, user.firstName, user.lastName));

    const storedPreferences = window.localStorage.getItem(preferencesStorageKey);
    if (storedPreferences) {
      try {
        const parsed = JSON.parse(storedPreferences) as Partial<PreferencesState>;
        setPreferences((current) => ({ ...current, ...parsed }));
      } catch {
        window.localStorage.removeItem(preferencesStorageKey);
      }
    }

    const storedBot = window.localStorage.getItem(botSettingsStorageKey);
    if (storedBot) {
      try {
        const parsed = JSON.parse(storedBot) as { botName?: string; audioSource?: string };
        if (parsed.botName) setBotName(parsed.botName);
        if (parsed.audioSource) setAudioSource(parsed.audioSource);
      } catch {
        window.localStorage.removeItem(botSettingsStorageKey);
      }
    }
  }, [isLoaded, user]);

  useEffect(() => {
    if (!isLoaded) return;

    let isMounted = true;

    async function loadData() {
      setIsLoading(true);

      try {
        const [subscriptionResponse, usageResponse, botResponse] = await Promise.all([
          fetch("/api/subscription", { cache: "no-store" }),
          fetch("/api/usage/stats", { cache: "no-store" }),
          fetch("/api/bot/profile-status", { cache: "no-store" })
        ]);

        if (!isMounted) return;

        if (subscriptionResponse.ok) {
          const payload = (await subscriptionResponse.json()) as SubscriptionResponse | { success?: false };
          if (payload.success) {
            setSubscription(payload);
          }
        }

        if (usageResponse.ok) {
          const payload = (await usageResponse.json()) as UsageStatsResponse | { success?: false };
          if (payload.success) {
            setUsageStats(payload);
          }
        }

        if (botResponse.ok) {
          const payload = (await botResponse.json()) as BotProfileStatusResponse;
          setBotStatus(payload);
        }
      } catch {
        showToast("Failed to load settings data.", "error");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      isMounted = false;
    };
  }, [isLoaded]);

  function showToast(message: string, type: ToastType) {
    setToast({ message, type });
    if (toastTimer.current) {
      window.clearTimeout(toastTimer.current);
    }
    toastTimer.current = window.setTimeout(() => {
      setToast(null);
    }, type === "error" ? 5000 : 3000);
  }

  async function saveName() {
    if (!user) return;
    const nextName = nameDraft.trim();
    if (!nextName) {
      showToast("Name cannot be empty.", "error");
      return;
    }

    const parsed = splitDisplayName(nextName);
    setIsSavingName(true);

    try {
      await user.update({
        firstName: parsed.firstName,
        lastName: parsed.lastName
      });
      setDisplayName(nextName);
      setIsEditingName(false);
      showToast("Name updated successfully", "success");
    } catch {
      showToast("Failed to update name", "error");
    } finally {
      setIsSavingName(false);
    }
  }

  function cancelNameEdit() {
    setNameDraft(displayName);
    setIsEditingName(false);
  }

  function savePreferences() {
    window.localStorage.setItem(preferencesStorageKey, JSON.stringify(preferences));
    showToast("Preferences saved", "success");
  }

  function saveBotSettings() {
    window.localStorage.setItem(
      botSettingsStorageKey,
      JSON.stringify({
        botName,
        audioSource
      })
    );
    showToast("Bot settings saved", "success");
  }

  async function copyCommand(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      showToast("Command copied to clipboard", "success");
    } catch {
      showToast("Failed to copy command", "error");
    }
  }

  async function signOutOtherSessions() {
    const clientSessions = ((clerk as typeof clerk & { client?: { sessions?: Array<{ id: string }> } }).client
      ?.sessions ?? []) as Array<{ id: string }>;
    const currentSessionId = session?.id;
    const otherSessions = clientSessions.filter((entry) => entry.id !== currentSessionId);

    if (otherSessions.length === 0) {
      showToast("No other active sessions found.", "info");
      return;
    }

    try {
      await Promise.all(otherSessions.map((entry) => clerk.signOut({ sessionId: entry.id })));
      showToast("Signed out of other devices", "success");
    } catch {
      showToast("Failed to sign out other devices", "error");
    }
  }

  async function openPasswordFlow() {
    const profileOpener = clerk as typeof clerk & { openUserProfile?: () => void };
    if (profileOpener.openUserProfile) {
      profileOpener.openUserProfile();
      showToast("Opening Clerk account settings", "info");
      return;
    }

    showToast("Clerk profile flow is unavailable right now.", "error");
  }

  async function deleteAccount() {
    if (!user) return;
    if (deleteAccountConfirm !== "DELETE") {
      showToast("Type DELETE to confirm.", "error");
      return;
    }

    try {
      await user.delete();
      window.location.href = "/";
    } catch {
      showToast("Failed to delete account", "error");
    }
  }

  async function deleteMeetingData() {
    if (deleteDataConfirm !== "DELETE") {
      showToast("Type DELETE to confirm.", "error");
      return;
    }

    try {
      const response = await fetch("/api/usage/data", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        throw new Error("Failed to delete meeting data.");
      }

      setIsDeleteDataOpen(false);
      setDeleteDataConfirm("");
      showToast("Meeting data deleted", "success");
      void (async () => {
        const [subscriptionResponse, usageResponse] = await Promise.all([
          fetch("/api/subscription", { cache: "no-store" }),
          fetch("/api/usage/stats", { cache: "no-store" })
        ]);

        if (subscriptionResponse.ok) {
          const payload = (await subscriptionResponse.json()) as SubscriptionResponse | { success?: false };
          if (payload.success) setSubscription(payload);
        }

        if (usageResponse.ok) {
          const payload = (await usageResponse.json()) as UsageStatsResponse | { success?: false };
          if (payload.success) setUsageStats(payload);
        }
      })();
    } catch {
      showToast("Failed to delete meeting data", "error");
    }
  }

  const connectedEmail = emailAddress;

  const canUpgradeToPro = currentPlan !== "pro" && currentPlan !== "elite";
  const canUpgradeToElite = currentPlan !== "elite";

  return (
    <div className="space-y-8">
      <div className="rounded-[28px] border border-[#e5e7eb] bg-[radial-gradient(circle_at_top_left,_rgba(108,99,255,0.10),_transparent_42%),linear-gradient(180deg,_#ffffff_0%,_#faf7ff_100%)] p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#6c63ff]">Settings</p>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight text-[#111827]">Workspace configuration</h1>
              <p className="max-w-3xl text-sm leading-6 text-[#4b5563]">
                Manage your profile, plan, bot behavior, preferences, and usage controls from one place.
              </p>
            </div>
            <Badge variant={planBadgeVariant(currentPlan)}>{currentPlanLabel}</Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(260px,25%)_minmax(0,1fr)]">
        <aside className="md:sticky md:top-6 md:h-fit">
          <div className="hidden rounded-[28px] border border-[#e5e7eb] bg-white p-2 md:block">
            <div className="space-y-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border-l-4 px-4 py-3 text-left text-sm font-medium transition",
                      isActive
                        ? "border-l-[#6c63ff] bg-[#f8f7ff] text-[#6c63ff]"
                        : "border-l-transparent text-[#374151] hover:bg-[#f9fafb]"
                    )}
                  >
                    <Icon className={cn("h-4 w-4", isActive ? "text-[#6c63ff]" : "text-[#6b7280]")} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto rounded-[28px] border border-[#e5e7eb] bg-white p-2 md:hidden">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
                    isActive
                      ? "border-[#6c63ff] bg-[#f8f7ff] text-[#6c63ff]"
                      : "border-[#e5e7eb] bg-white text-[#374151] hover:bg-[#f9fafb]"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </aside>

        <div className="space-y-6">
          {isLoading ? (
            <Card className="p-6">
              <div className="flex items-center gap-3 text-sm text-[#6b7280]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#6c63ff]" />
                Loading settings data...
              </div>
            </Card>
          ) : null}

          {activeTab === "profile" ? (
            <section className="space-y-6">
              <SectionHeader
                title="Profile"
                description="Manage your public profile and display name."
              />

              <Card className="p-6">
                <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
                  <div className="flex flex-col items-center gap-4 rounded-[24px] border border-[#ede9fe] bg-[#faf7ff] p-6 text-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[linear-gradient(135deg,_#6c63ff,_#8b5cf6)] text-2xl font-bold text-white shadow-lg">
                      {getInitials(displayName)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#111827]">{displayName}</p>
                      <p className="mt-1 text-xs text-[#6b7280]">Your account avatar</p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => showToast("Coming soon", "info")}
                    >
                      Change Avatar
                    </Button>
                  </div>

                  <div className="space-y-5">
                    <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1 space-y-2">
                          <p className="text-sm font-semibold text-[#111827]">Full Name</p>
                          <div className="flex flex-col gap-3 sm:flex-row">
                            <input
                              value={nameDraft}
                              readOnly={!isEditingName}
                              onChange={(event) => setNameDraft(event.target.value)}
                              className={cn(
                                "w-full rounded-xl border px-4 py-3 text-sm outline-none transition",
                                isEditingName
                                  ? "border-[#c4b5fd] bg-white text-[#111827] focus:border-[#6c63ff]"
                                  : "border-[#e5e7eb] bg-[#f9fafb] text-[#111827]"
                              )}
                              placeholder="Enter your name"
                            />
                            <div className="flex gap-2">
                              {isEditingName ? (
                                <>
                                  <Button type="button" onClick={saveName} disabled={isSavingName}>
                                    {isSavingName ? "Saving..." : "Save"}
                                  </Button>
                                  <Button type="button" variant="outline" onClick={cancelNameEdit}>
                                    Cancel
                                  </Button>
                                </>
                              ) : (
                                <Button type="button" variant="outline" onClick={() => setIsEditingName(true)}>
                                  <Pencil className="h-4 w-4" />
                                  Edit
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-5 md:grid-cols-2">
                      <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#111827]">Email Address</p>
                            <p className="mt-2 break-all text-sm text-[#6b7280]">{connectedEmail}</p>
                            <p className="mt-2 text-xs text-[#6b7280]">
                              Email cannot be changed. Contact support if needed.
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <Badge variant="available">Verified ✓</Badge>
                            <Lock className="h-4 w-4 text-[#9ca3af]" />
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-5">
                        <p className="text-sm font-semibold text-[#111827]">Member Since</p>
                        <p className="mt-2 text-sm text-[#6b7280]">{memberSince}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </section>
          ) : null}

          {activeTab === "account" ? (
            <section className="space-y-6">
              <SectionHeader title="Account" description="Manage your account security and data." />

              <Card className="space-y-4 p-6">
                <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-[#111827]">Password</p>
                      <p className="mt-2 text-sm tracking-[0.2em] text-[#6b7280]">••••••••••••</p>
                      <p className="mt-2 text-xs text-[#6b7280]">Managed by Clerk secure authentication.</p>
                    </div>
                    <Button type="button" variant="outline" onClick={openPasswordFlow}>
                      Change Password
                    </Button>
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-5">
                  <p className="text-sm font-semibold text-[#111827]">Connected Accounts</p>
                    <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e8f0fe] text-[#4285f4] font-semibold">
                        G
                      </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[#111827]">Google Account</p>
                          <p className="truncate text-xs text-[#6b7280]">{connectedEmail}</p>
                        </div>
                      </div>
                    <Badge variant="available">Connected ✓</Badge>
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-[#111827]">Active Sessions</p>
                      <p className="mt-2 text-sm text-[#6b7280]">Sign out of other devices without affecting this session.</p>
                    </div>
                    <Button type="button" variant="outline" onClick={() => void signOutOtherSessions()}>
                      Sign out of all other devices
                    </Button>
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#fecaca] bg-[#fffafa] p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-[#b91c1c]">Danger Zone</p>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#7f1d1d]">
                        This will permanently delete your account and all related meeting data.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => {
                        setDeleteAccountConfirm("");
                        setIsDeleteAccountOpen(true);
                      }}
                    >
                      Delete Account
                    </Button>
                  </div>
                </div>
              </Card>
            </section>
          ) : null}

          {activeTab === "subscription" ? (
            <section className="space-y-6">
              <SectionHeader title="Subscription" description="Manage your plan and billing." />

              <Card className="space-y-6 p-6">
                <div className="rounded-[28px] border border-[#ede9fe] bg-[linear-gradient(135deg,_#faf7ff,_#ffffff)] p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#6c63ff]">Current Plan</p>
                      <h3 className="mt-2 text-3xl font-bold text-[#111827]">
                        {subscription?.plan
                          ? subscription.plan === "trial"
                            ? "Trial"
                            : subscription.plan.toUpperCase()
                          : "Loading..."}
                      </h3>
                      <p className="mt-2 text-sm text-[#6b7280]">
                        {isTrialActive
                          ? "🎉 Free Trial Active"
                          : currentPlan === "free"
                            ? "Free Plan"
                            : currentPlan === "pro"
                              ? "Pro plan is active"
                              : "Elite plan is active"}
                      </p>
                    </div>
                    <Badge variant={planBadgeVariant(currentPlan)}>{currentPlanLabel}</Badge>
                  </div>

                  <div className="mt-6 space-y-3">
                    {isTrialActive ? (
                      <>
                        <div className="flex items-center justify-between text-sm text-[#4b5563]">
                          <span>
                            {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} remaining
                          </span>
                          <span>Expires {formatDate(trialEndsAt)}</span>
                        </div>
                        <ProgressBar value={trialProgress} colorClass={trialDaysLeft < 7 ? "bg-[#f59e0b]" : "bg-[#6c63ff]"} />
                      </>
                    ) : null}

                    {currentPlan === "free" ? (
                      <p className="text-sm text-[#6b7280]">Upgrade to unlock meeting features.</p>
                    ) : null}

                    {currentPlan === "pro" || currentPlan === "elite" ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl bg-white px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b7280]">
                            Next billing
                          </p>
                          <p className="mt-2 text-sm font-medium text-[#111827]">{formatDate(planEndsAt)}</p>
                        </div>
                        <div className="rounded-2xl bg-white px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b7280]">Amount</p>
                          <p className="mt-2 text-sm font-medium text-[#111827]">
                            {currentPlan === "pro" ? "₹99/month" : "₹199/month"}
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#111827]">Meetings Recorded</p>
                      <Badge variant="neutral">
                        {subscription?.limits.unlimited ? "Unlimited" : `${meetingsUsed}/${meetingsLimit || 0}`}
                      </Badge>
                    </div>
                    <p className="mt-3 text-3xl font-bold text-[#111827]">{meetingsUsed}</p>
                    <p className="mt-1 text-sm text-[#6b7280]">
                      {subscription?.limits.unlimited
                        ? "Unlimited meeting recordings"
                        : `${meetingsUsed} of ${meetingsLimit} meetings used this month`}
                    </p>
                    <div className="mt-4">
                      <ProgressBar value={subscription?.limits.unlimited ? 100 : meetingUsagePercent} />
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#111827]">Action Items Generated</p>
                      <Badge variant="available">AI enabled</Badge>
                    </div>
                    <p className="mt-3 text-3xl font-bold text-[#111827]">{usageStats?.actionItemsCreated ?? 0}</p>
                    <p className="mt-1 text-sm text-[#6b7280]">
                      {usageStats?.actionItemsCreated ?? 0} action items extracted
                    </p>
                    <div className="mt-4">
                      <ProgressBar value={Math.min(100, (usageStats?.actionItemsCreated ?? 0) * 5)} />
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#111827]">Documents Analyzed</p>
                      <Badge variant="info">Tools</Badge>
                    </div>
                    <p className="mt-3 text-3xl font-bold text-[#111827]">{usageStats?.documentsAnalyzed ?? 0}</p>
                    <p className="mt-1 text-sm text-[#6b7280]">
                      {usageStats?.documentsAnalyzed ?? 0} documents analyzed
                    </p>
                    <div className="mt-4">
                      <ProgressBar value={Math.min(100, (usageStats?.documentsAnalyzed ?? 0) * 10)} />
                    </div>
                  </div>
                </div>

                {canUpgradeToPro || canUpgradeToElite ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {canUpgradeToPro ? (
                      <Card className="space-y-4 border-[#c7d2fe] bg-gradient-to-b from-white to-[#f8f7ff] p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="text-xl font-bold text-[#111827]">Pro</h4>
                            <p className="mt-1 text-sm text-[#6b7280]">10 meetings + all AI features</p>
                          </div>
                          <Badge variant="pending">Most Popular</Badge>
                        </div>
                        <p className="text-3xl font-bold text-[#111827]">₹99/month</p>
                        <Button asChild className="w-full">
                          <a href="/dashboard/billing">Upgrade to Pro</a>
                        </Button>
                      </Card>
                    ) : null}

                    {canUpgradeToElite ? (
                      <Card className="space-y-4 border-[#ddd6fe] bg-gradient-to-b from-white to-[#f5f3ff] p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="text-xl font-bold text-[#111827]">Elite</h4>
                            <p className="mt-1 text-sm text-[#6b7280]">Unlimited meetings + priority support</p>
                          </div>
                          <Badge variant="accent">Best Value</Badge>
                        </div>
                        <p className="text-3xl font-bold text-[#111827]">₹199/month</p>
                        <Button asChild className="w-full">
                          <a href="/dashboard/billing">Upgrade to Elite</a>
                        </Button>
                      </Card>
                    ) : null}
                  </div>
                ) : null}

                <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-0">
                  <div className="border-b border-[#e5e7eb] px-5 py-4">
                    <p className="text-sm font-semibold text-[#111827]">Payment History</p>
                  </div>
                  {subscription?.payments && subscription.payments.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-[#f9fafb] text-[#6b7280]">
                          <tr>
                            <th className="px-5 py-4 font-semibold">Date</th>
                            <th className="px-5 py-4 font-semibold">Plan</th>
                            <th className="px-5 py-4 font-semibold">Amount</th>
                            <th className="px-5 py-4 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {subscription.payments.map((payment, index) => (
                            <tr key={payment.id} className={index % 2 === 0 ? "bg-white" : "bg-[#fafafa]"}>
                              <td className="px-5 py-4 text-[#374151]">{formatDate(payment.date)}</td>
                              <td className="px-5 py-4 font-medium text-[#111827]">{payment.plan}</td>
                              <td className="px-5 py-4 text-[#374151]">{formatCurrency(payment.amount / 100)}</td>
                              <td className="px-5 py-4">
                                <Badge variant={payment.status === "paid" ? "available" : "pending"}>
                                  {payment.status}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="px-5 py-6 text-sm text-[#6b7280]">No payments yet.</div>
                  )}
                </div>
              </Card>
            </section>
          ) : null}

          {activeTab === "preferences" ? (
            <section className="space-y-6">
              <SectionHeader title="Preferences" description="Customize how Artiva works for you." />

              <Card className="space-y-5 p-6">
                <div className="space-y-3">
                  <InfoRow
                    label="Meeting Summary Email"
                    description="Receive email when meeting summary is ready."
                    control={
                      <Toggle
                        checked={preferences.meetingSummaryEmail}
                        onChange={(checked) => setPreferences((current) => ({ ...current, meetingSummaryEmail: checked }))}
                      />
                    }
                  />
                  <InfoRow
                    label="Action Items Email"
                    description="Get emailed your action items after each meeting."
                    control={
                      <Toggle
                        checked={preferences.actionItemsEmail}
                        onChange={(checked) => setPreferences((current) => ({ ...current, actionItemsEmail: checked }))}
                      />
                    }
                  />
                  <InfoRow
                    label="Weekly Digest"
                    description="Weekly summary of all your meetings."
                    control={
                      <Toggle
                        checked={preferences.weeklyDigest}
                        onChange={(checked) => setPreferences((current) => ({ ...current, weeklyDigest: checked }))}
                      />
                    }
                  />
                  <InfoRow
                    label="Product Updates"
                    description="New features and announcements."
                    control={
                      <Toggle
                        checked={preferences.productUpdates}
                        onChange={(checked) => setPreferences((current) => ({ ...current, productUpdates: checked }))}
                      />
                    }
                  />
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-5">
                    <p className="text-sm font-semibold text-[#111827]">Default tone for Email Generator</p>
                    <div className="mt-4 space-y-3">
                      {(["Professional", "Friendly", "Formal", "Concise"] as const).map((tone) => (
                        <label key={tone} className="flex cursor-pointer items-center gap-3 text-sm text-[#374151]">
                          <input
                            type="radio"
                            name="defaultTone"
                            checked={preferences.defaultTone === tone}
                            onChange={() =>
                              setPreferences((current) => ({
                                ...current,
                                defaultTone: tone
                              }))
                            }
                            className="h-4 w-4 accent-[#6c63ff]"
                          />
                          <span>{tone}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-5">
                    <p className="text-sm font-semibold text-[#111827]">Preferred Language</p>
                    <select
                      value={preferences.language}
                      onChange={(event) =>
                        setPreferences((current) => ({
                          ...current,
                          language: event.target.value as PreferencesState["language"]
                        }))
                      }
                      className="mt-4 w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] outline-none focus:border-[#6c63ff]"
                    >
                      <option value="English">English</option>
                      <option value="Hindi">Hindi</option>
                      <option value="coming-soon" disabled>
                        More coming soon
                      </option>
                    </select>
                    <p className="mt-3 text-xs text-[#6b7280]">Affects AI output language.</p>
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-5">
                  <p className="text-sm font-semibold text-[#111827]">Meeting summary length</p>
                  <div className="mt-4 space-y-3">
                    {[
                      { id: "brief", label: "Brief (2-3 sentences)" },
                      { id: "standard", label: "Standard (1 paragraph)" },
                      { id: "detailed", label: "Detailed (full breakdown)" }
                    ].map((option) => (
                      <label key={option.id} className="flex cursor-pointer items-center gap-3 text-sm text-[#374151]">
                        <input
                          type="radio"
                          name="summaryLength"
                          checked={preferences.summaryLength === option.id}
                          onChange={() =>
                            setPreferences((current) => ({
                              ...current,
                              summaryLength: option.id as PreferencesState["summaryLength"]
                            }))
                          }
                          className="h-4 w-4 accent-[#6c63ff]"
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <Button type="button" className="w-full" onClick={savePreferences}>
                  Save Preferences
                </Button>
              </Card>
            </section>
          ) : null}

          {activeTab === "bot" ? (
            <section className="space-y-6">
              <SectionHeader title="Bot Settings" description="Configure your AI Notetaker behavior." />

              <Card className="space-y-5 p-6">
                <div className="rounded-[28px] border border-[#e5e7eb] bg-white p-6">
                  {botStatus?.configured ? (
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f0fdf4] text-[#16a34a]">
                          <Check className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-[#111827]">Bot profile is configured ✓</p>
                          <p className="mt-1 text-sm text-[#6b7280]">Your AI Notetaker is ready to join meetings.</p>
                        </div>
                      </div>
                      <div className="rounded-2xl bg-[#f9fafb] px-4 py-3 text-sm text-[#374151]">
                        Logged in as: {connectedEmail}
                      </div>
                      <Button type="button" variant="outline" onClick={() => showToast("Coming soon", "info")}>
                        Reconfigure Profile
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#fffbeb] text-[#d97706]">
                          <AlertTriangle className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-[#111827]">Bot profile not set up</p>
                          <p className="mt-1 text-sm text-[#6b7280]">
                            Your AI Notetaker needs a Google account to join meetings.
                          </p>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-[#e5e7eb] bg-[#0f172a] px-4 py-3 font-mono text-sm text-[#e2e8f0]">
                        npm run setup:bot-profile
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Button type="button" variant="outline" onClick={() => void copyCommand("npm run setup:bot-profile")}>
                          <Copy className="h-4 w-4" />
                          Copy Command
                        </Button>
                      </div>
                      <p className="text-xs text-[#6b7280]">
                        Run this in your terminal, then refresh this page.
                      </p>
                    </div>
                  )}
                </div>

                <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-5">
                  <p className="text-sm font-semibold text-[#111827]">Bot Display Name</p>
                  <input
                    value={botName}
                    onChange={(event) => setBotName(event.target.value)}
                    className="mt-3 w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] outline-none focus:border-[#6c63ff]"
                    placeholder="AI Notetaker"
                  />
                  <p className="mt-2 text-xs text-[#6b7280]">This name will appear in the participants list.</p>
                </div>

                <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-5">
                  <p className="text-sm font-semibold text-[#111827]">Audio Source</p>
                  <input
                    value={audioSource}
                    onChange={(event) => setAudioSource(event.target.value)}
                    className="mt-3 w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] outline-none focus:border-[#6c63ff]"
                    placeholder="default"
                  />
                  <p className="mt-3 text-xs text-[#6b7280]">Run this command to find your Linux audio source.</p>
                  <div className="mt-3 rounded-2xl bg-[#0f172a] px-4 py-3 font-mono text-sm text-[#e2e8f0]">
                    pactl list short sources
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3"
                    onClick={() => void copyCommand("pactl list short sources")}
                  >
                    <Copy className="h-4 w-4" />
                    Copy
                  </Button>
                  <p className="mt-2 text-xs text-[#6b7280]">Requires server restart to take effect.</p>
                </div>

                <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-[#111827]">Auto-join meetings</p>
                      <p className="mt-1 text-sm text-[#6b7280]">Automatically join calendar meetings. Coming soon.</p>
                    </div>
                    <Toggle checked={false} onChange={() => undefined} disabled />
                  </div>
                </div>

                <Button type="button" className="w-full" onClick={saveBotSettings}>
                  Save Bot Settings
                </Button>
              </Card>
            </section>
          ) : null}

          {activeTab === "usage" ? (
            <section className="space-y-6">
              <SectionHeader title="Usage & Limits" description="Monitor your Artiva usage." />

              <Card className="space-y-6 p-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#111827]">Meetings Recorded</p>
                      <Badge variant="info">
                        {subscription?.limits.unlimited ? "Unlimited" : `${usageStats?.meetingsThisMonth ?? 0}/${meetingsLimit || 0}`}
                      </Badge>
                    </div>
                    <p className="mt-3 text-3xl font-bold text-[#111827]">{usageStats?.meetingsThisMonth ?? 0}</p>
                    <p className="mt-1 text-sm text-[#6b7280]">
                      {subscription?.limits.unlimited
                        ? "Unlimited meetings available"
                        : `${usageStats?.meetingsThisMonth ?? 0} of ${meetingsLimit} meetings used this month`}
                    </p>
                    <div className="mt-4">
                      <ProgressBar value={subscription?.limits.unlimited ? 100 : meetingUsagePercent} colorClass={progressColor(meetingUsagePercent)} />
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#111827]">Transcripts Generated</p>
                      <Badge variant="available">Auto</Badge>
                    </div>
                    <p className="mt-3 text-3xl font-bold text-[#111827]">{usageStats?.transcriptsGenerated ?? 0}</p>
                    <p className="mt-1 text-sm text-[#6b7280]">
                      {usageStats?.transcriptsGenerated ?? 0} transcripts generated
                    </p>
                    <div className="mt-4">
                      <ProgressBar value={Math.min(100, (usageStats?.transcriptsGenerated ?? 0) * 10)} />
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#111827]">Action Items Created</p>
                      <Badge variant="available">AI</Badge>
                    </div>
                    <p className="mt-3 text-3xl font-bold text-[#111827]">{usageStats?.actionItemsCreated ?? 0}</p>
                    <p className="mt-1 text-sm text-[#6b7280]">
                      {usageStats?.actionItemsCreated ?? 0} action items extracted
                    </p>
                    <div className="mt-4">
                      <ProgressBar value={Math.min(100, (usageStats?.actionItemsCreated ?? 0) * 5)} />
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#111827]">Documents Analyzed</p>
                      <Badge variant="neutral">Tools</Badge>
                    </div>
                    <p className="mt-3 text-3xl font-bold text-[#111827]">{usageStats?.documentsAnalyzed ?? 0}</p>
                    <p className="mt-1 text-sm text-[#6b7280]">
                      {usageStats?.documentsAnalyzed ?? 0} documents analyzed
                    </p>
                    <div className="mt-4">
                      <ProgressBar value={Math.min(100, (usageStats?.documentsAnalyzed ?? 0) * 10)} />
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-5">
                  <p className="text-sm font-semibold text-[#111827]">All Time Stats</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl bg-[#f9fafb] px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b7280]">Total Meetings</p>
                      <p className="mt-2 text-lg font-semibold text-[#111827]">{usageStats?.meetingsAllTime ?? 0}</p>
                    </div>
                    <div className="rounded-2xl bg-[#f9fafb] px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b7280]">
                        Total Action Items
                      </p>
                      <p className="mt-2 text-lg font-semibold text-[#111827]">{usageStats?.actionItemsCreated ?? 0}</p>
                    </div>
                    <div className="rounded-2xl bg-[#f9fafb] px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b7280]">Member Since</p>
                      <p className="mt-2 text-lg font-semibold text-[#111827]">{usageStats?.memberSince ? formatDate(usageStats.memberSince) : memberSince}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-5">
                  <p className="text-sm font-semibold text-[#111827]">Data & Storage</p>
                  <div className="mt-4 space-y-2 text-sm leading-6 text-[#6b7280]">
                    <p>Your meeting recordings are stored temporarily and deleted after transcription.</p>
                    <p>Transcripts are stored indefinitely.</p>
                    <p>Summaries are stored indefinitely.</p>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Button type="button" variant="outline" onClick={() => showToast("Coming soon", "info")}>
                      <Download className="h-4 w-4" />
                      Download My Data
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => {
                        setDeleteDataConfirm("");
                        setIsDeleteDataOpen(true);
                      }}
                    >
                      Delete All Meeting Data
                    </Button>
                  </div>
                </div>
              </Card>
            </section>
          ) : null}
        </div>
      </div>

      {isDeleteAccountOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-[28px] border border-[#fecaca] bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#fef2f2] text-[#dc2626]">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-[#111827]">Delete Account</h3>
                <p className="mt-2 text-sm leading-6 text-[#6b7280]">
                  Are you sure? Type DELETE to confirm. This will permanently delete all your meetings, transcripts,
                  and data.
                </p>
              </div>
            </div>
            <input
              value={deleteAccountConfirm}
              onChange={(event) => setDeleteAccountConfirm(event.target.value)}
              className="mt-5 w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] outline-none focus:border-[#dc2626]"
              placeholder="DELETE"
            />
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setIsDeleteAccountOpen(false)}>
                Cancel
              </Button>
              <Button type="button" variant="danger" onClick={() => void deleteAccount()}>
                Confirm Delete
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {isDeleteDataOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-[28px] border border-[#fecaca] bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#fef2f2] text-[#dc2626]">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-[#111827]">Delete All Meeting Data</h3>
                <p className="mt-2 text-sm leading-6 text-[#6b7280]">
                  Are you sure? Type DELETE to confirm. This will permanently remove meeting recordings, transcripts,
                  summaries, and related action items.
                </p>
              </div>
            </div>
            <input
              value={deleteDataConfirm}
              onChange={(event) => setDeleteDataConfirm(event.target.value)}
              className="mt-5 w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] outline-none focus:border-[#dc2626]"
              placeholder="DELETE"
            />
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setIsDeleteDataOpen(false)}>
                Cancel
              </Button>
              <Button type="button" variant="danger" onClick={() => void deleteMeetingData()}>
                Confirm Delete
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Toast toast={toast} />
    </div>
  );
}
