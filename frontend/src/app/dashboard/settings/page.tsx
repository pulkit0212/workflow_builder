"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useClerk, useSession, useUser } from "@clerk/nextjs";
import {
  Bell,
  Check,
  Crown,
  Gauge,
  Link2,
  Lock,
  Pencil,
  Trash2,
  User,
  X,
} from "lucide-react";
import { SectionHeader } from "@/components/shared/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useApiFetch, useIsAuthReady } from "@/hooks/useApiFetch";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  limits: {
    meetingsPerMonth: number;
    unlimited: boolean;
  };
};

type ApiPreferencesResponse = {
  success: true;
  preferences: {
    emailNotifications: {
      meetingSummary: boolean;
      actionItems: boolean;
      weeklyDigest: boolean;
      productUpdates: boolean;
    };
    defaultEmailTone: "professional" | "friendly" | "formal" | "concise";
    summaryLength: "brief" | "standard" | "detailed";
    language: "en" | "hi";
    botDisplayName: string;
    audioSource: string;
    autoShareTargets: {
      slack: boolean;
      gmail: boolean;
      notion: boolean;
      jira: boolean;
    };
  };
};

type PaymentRecord = {
  id: string;
  date: string;
  plan: string;
  amount: number;
  currency: string;
  status: string;
  invoice: string;
};

type ToastType = "success" | "error" | "info" | "warning";
type ToastState = { message: string; type: ToastType };

type PreferencesState = {
  meetingSummaryEmail: boolean;
  actionItemsEmail: boolean;
  weeklyDigest: boolean;
  productUpdates: boolean;
  defaultTone: "Professional" | "Friendly" | "Formal" | "Concise";
  language: "English" | "Hindi";
  summaryLength: "brief" | "standard" | "detailed";
  botDisplayName: string;
  autoShareSlack: boolean;
  autoShareGmail: boolean;
  autoShareNotion: boolean;
  autoShareJira: boolean;
};

type ActiveTab = "profile" | "account" | "subscription" | "preferences" | "integrations" | "usage";

// ─── Tab config ───────────────────────────────────────────────────────────────

const tabs: Array<{ id: ActiveTab; label: string; icon: typeof User }> = [
  { id: "profile", label: "Profile", icon: User },
  { id: "account", label: "Account", icon: Lock },
  { id: "subscription", label: "Subscription", icon: Crown },
  { id: "preferences", label: "Preferences", icon: Bell },
  { id: "integrations", label: "Integrations", icon: Link2 },
  { id: "usage", label: "Usage & Limits", icon: Gauge },
];

const defaultPreferences: PreferencesState = {
  meetingSummaryEmail: true,
  actionItemsEmail: false,
  weeklyDigest: false,
  productUpdates: true,
  defaultTone: "Professional",
  language: "English",
  summaryLength: "standard",
  botDisplayName: "Artiva Notetaker",
  autoShareSlack: false,
  autoShareGmail: false,
  autoShareNotion: false,
  autoShareJira: false,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(value: string | number | Date | null | undefined) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function getInitials(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A";
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function getDisplayName(
  userName?: string | null,
  firstName?: string | null,
  lastName?: string | null
) {
  const composed = [firstName, lastName].filter(Boolean).join(" ").trim();
  return composed || userName || "Artivaa User";
}

function splitDisplayName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  const [firstName, ...rest] = trimmed.split(/\s+/);
  return { firstName, lastName: rest.join(" ") };
}

function planBadgeVariant(plan: PlanId) {
  switch (plan) {
    case "elite": return "accent";
    case "pro":
    case "trial": return "pending";
    default: return "neutral";
  }
}

function progressColor(usage: number) {
  if (usage >= 90) return "bg-[#dc2626]";
  if (usage >= 75) return "bg-[#f59e0b]";
  return "bg-[#6c63ff]";
}

// ─── Shared UI components ─────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled = false,
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
      onClick={() => { if (!disabled) onChange(!checked); }}
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

function ProgressBar({ value, colorClass = "bg-[#6c63ff]" }: { value: number; colorClass?: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-[#ede9fe]">
      <div className={cn("h-2 rounded-full transition-all", colorClass)} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

function InfoRow({ label, description, control }: { label: string; description: string; control: ReactNode }) {
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
    toast.type === "success" ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]"
    : toast.type === "error" ? "border-[#fecaca] bg-[#fef2f2] text-[#991b1b]"
    : toast.type === "warning" ? "border-[#fde68a] bg-[#fefce8] text-[#92400e]"
    : "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]";
  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm">
      <div className={cn("rounded-2xl border px-4 py-3 shadow-lg", tone)}>{toast.message}</div>
    </div>
  );
}

// ─── ConfirmModal ─────────────────────────────────────────────────────────────

function ConfirmModal({
  isOpen,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  requireTyping,
  destructive = true,
}: {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  requireTyping?: string;
  destructive?: boolean;
}) {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!isOpen) setTyped("");
  }, [isOpen]);

  if (!isOpen) return null;

  const canConfirm = !requireTyping || typed === requireTyping;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-base font-semibold text-[#111827]">{title}</h2>
          <button type="button" onClick={onCancel} className="text-[#9ca3af] hover:text-[#374151]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-3 text-sm leading-6 text-[#6b7280]">{description}</p>
        {requireTyping ? (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-[#374151]">
              Type <span className="font-bold text-[#111827]">{requireTyping}</span> to confirm
            </p>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={requireTyping}
              className="w-full rounded-xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none focus:border-[#6c63ff]"
            />
          </div>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={onConfirm}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-semibold transition",
              destructive
                ? "bg-[#dc2626] text-white hover:bg-[#b91c1c] disabled:opacity-50"
                : "bg-[#6c63ff] text-white hover:bg-[#5b52e0] disabled:opacity-50"
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, isLoaded } = useUser();
  const clerk = useClerk();
  const { session } = useSession();
  const toastTimer = useRef<number | null>(null);
  const apiFetch = useApiFetch();

  const [activeTab, setActiveTab] = useState<ActiveTab>("profile");
  const [subscription, setSubscription] = useState<SubscriptionResponse | null>(null);
  const [usageStats, setUsageStats] = useState<UsageStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Profile
  const [isSavingName, setIsSavingName] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [nameDraft, setNameDraft] = useState("");

  // Preferences
  const [preferences, setPreferences] = useState<PreferencesState>(defaultPreferences);
  const [savedPreferences, setSavedPreferences] = useState<PreferencesState>(defaultPreferences);
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);

  // Modals
  const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false);
  const [isDeleteDataOpen, setIsDeleteDataOpen] = useState(false);

  const emailAddress =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    "Unavailable";

  const memberSince = useMemo(() => {
    if (!user?.createdAt) return "Not available";
    return formatDate(user.createdAt);
  }, [user?.createdAt]);

  const timezone = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "Unknown"; }
  }, []);

  const trialEndsAt = subscription?.trialEndsAt ? new Date(subscription.trialEndsAt) : null;
  const planEndsAt = subscription?.planEndsAt ? new Date(subscription.planEndsAt) : null;
  const trialDaysLeft = subscription?.trialDaysLeft ?? 0;
  const isTrialActive = Boolean(subscription?.plan === "trial" && trialEndsAt && trialEndsAt.getTime() > Date.now());
  const currentPlan = subscription?.plan ?? "free";
  const currentPlanLabel = currentPlan === "trial" ? "Trial" : currentPlan.toUpperCase();
  const meetingsLimit = subscription?.limits?.meetingsPerMonth ?? 0;
  const meetingsUsed = subscription?.meetingsUsedThisMonth ?? 0;
  const meetingUsagePercent = subscription
    ? subscription.limits.unlimited ? 0 : Math.min(100, Math.round((meetingsUsed / Math.max(meetingsLimit, 1)) * 100))
    : 0;

  const trialProgress = useMemo(() => {
    if (!subscription || subscription.plan !== "trial") return 0;
    const started = new Date(subscription.trialStartedAt).getTime();
    const ended = new Date(subscription.trialEndsAt).getTime();
    const total = Math.max(ended - started, 1);
    const elapsed = Math.min(Date.now() - started, total);
    return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
  }, [subscription]);

  const prefsChanged = useMemo(() => {
    return JSON.stringify(preferences) !== JSON.stringify(savedPreferences);
  }, [preferences, savedPreferences]);

  const canUpgradeToPro = currentPlan !== "pro" && currentPlan !== "elite";
  const canUpgradeToElite = currentPlan !== "elite";

  // ─── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isLoaded || !user) return;
    const name = getDisplayName(user.fullName, user.firstName, user.lastName);
    setDisplayName(name);
    setNameDraft(name);
  }, [isLoaded, user]);

  useEffect(() => {
    if (!isLoaded) return;
    let isMounted = true;

    async function loadData() {
      setIsLoading(true);
      try {
        const [subRes, usageRes, prefsRes] = await Promise.all([
          apiFetch("/api/subscription", { cache: "no-store" }),
          apiFetch("/api/settings/usage", { cache: "no-store" }),
          apiFetch("/api/settings/preferences", { cache: "no-store" }),
        ]);

        if (!isMounted) return;

        if (subRes.ok) {
          const payload = (await subRes.json()) as SubscriptionResponse | { success?: false };
          if (payload.success) {
            setSubscription(payload as SubscriptionResponse);
            setPayments((payload as SubscriptionResponse).payments ?? []);
          }
        }

        if (usageRes.ok) {
          const payload = (await usageRes.json()) as UsageStatsResponse | { success?: false };
          if (payload.success) setUsageStats(payload as UsageStatsResponse);
        }

        if (prefsRes.ok) {
          const payload = (await prefsRes.json()) as ApiPreferencesResponse | { success?: false };
          if (payload.success) {
            const p = (payload as ApiPreferencesResponse).preferences;
            const mapped: PreferencesState = {
              meetingSummaryEmail: p.emailNotifications.meetingSummary,
              actionItemsEmail: p.emailNotifications.actionItems,
              weeklyDigest: p.emailNotifications.weeklyDigest,
              productUpdates: p.emailNotifications.productUpdates,
              defaultTone: (p.defaultEmailTone.charAt(0).toUpperCase() + p.defaultEmailTone.slice(1)) as PreferencesState["defaultTone"],
              summaryLength: p.summaryLength,
              language: p.language === "hi" ? "Hindi" : "English",
              botDisplayName: p.botDisplayName ?? "Artiva Notetaker",
              autoShareSlack: p.autoShareTargets?.slack ?? false,
              autoShareGmail: p.autoShareTargets?.gmail ?? false,
              autoShareNotion: p.autoShareTargets?.notion ?? false,
              autoShareJira: p.autoShareTargets?.jira ?? false,
            };
            setPreferences(mapped);
            setSavedPreferences(mapped);
          }
        }

      } catch {
        showToast("Failed to load settings data.", "error");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadData();
    return () => { isMounted = false; };
  }, [isLoaded]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  function showToast(message: string, type: ToastType) {
    setToast({ message, type });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), type === "error" ? 5000 : 3000);
  }

  async function saveName() {
    if (!user) return;
    const nextName = nameDraft.trim();
    if (!nextName) { showToast("Name cannot be empty.", "error"); return; }
    const parsed = splitDisplayName(nextName);
    setIsSavingName(true);
    try {
      await user.update({ firstName: parsed.firstName, lastName: parsed.lastName });
      setDisplayName(nextName);
      setIsEditingName(false);
      showToast("Name updated successfully.", "success");
    } catch {
      showToast("Failed to update name.", "error");
    } finally {
      setIsSavingName(false);
    }
  }

  function cancelNameEdit() {
    setNameDraft(displayName);
    setIsEditingName(false);
  }

  async function savePreferences() {
    setIsSavingPrefs(true);
    try {
      const prefsBody = {
        emailNotifications: {
          meetingSummary: preferences.meetingSummaryEmail,
          actionItems: preferences.actionItemsEmail,
          weeklyDigest: preferences.weeklyDigest,
          productUpdates: preferences.productUpdates,
        },
        defaultEmailTone: preferences.defaultTone.toLowerCase() as "professional" | "friendly" | "formal" | "concise",
        summaryLength: preferences.summaryLength,
        language: preferences.language === "Hindi" ? "hi" : "en",
        autoShareTargets: {
          slack: preferences.autoShareSlack,
          gmail: preferences.autoShareGmail,
          notion: preferences.autoShareNotion,
          jira: preferences.autoShareJira,
        },
      };

      const botBody = {
        botDisplayName: preferences.botDisplayName,
        audioSource: "default",
      };

      const [prefsRes, botRes] = await Promise.all([
        apiFetch("/api/settings/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(prefsBody),
        }),
        apiFetch("/api/settings/bot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(botBody),
        }),
      ]);

      if (prefsRes.ok && botRes.ok) {
        setSavedPreferences(preferences);
        showToast("Preferences saved.", "success");
      } else {
        showToast("Failed to save preferences.", "error");
      }
    } catch {
      showToast("Failed to save preferences.", "error");
    } finally {
      setIsSavingPrefs(false);
    }
  }

  async function openPasswordFlow() {
    const profileOpener = clerk as typeof clerk & { openUserProfile?: () => void };
    if (profileOpener.openUserProfile) {
      profileOpener.openUserProfile();
      return;
    }
    showToast("Clerk profile flow is unavailable right now.", "error");
  }

  async function signOutOtherSessions() {
    const clientSessions = ((clerk as typeof clerk & { client?: { sessions?: Array<{ id: string }> } }).client?.sessions ?? []) as Array<{ id: string }>;
    const currentSessionId = session?.id;
    const otherSessions = clientSessions.filter((s) => s.id !== currentSessionId);
    if (otherSessions.length === 0) { showToast("No other active sessions found.", "info"); return; }
    try {
      await Promise.all(otherSessions.map((s) => clerk.signOut({ sessionId: s.id })));
      showToast("Signed out of other devices.", "success");
    } catch {
      showToast("Failed to sign out other devices.", "error");
    }
  }

  async function deleteAccount() {
    try {
      const res = await fetch("/api/settings/account", { method: "DELETE" });
      if (!res.ok) throw new Error();
      window.location.href = "/";
    } catch {
      showToast("Failed to delete account.", "error");
    }
  }

  async function deleteMeetingData() {
    try {
      const res = await apiFetch("/api/usage/data", { method: "DELETE" });
      if (!res.ok) throw new Error();
      setIsDeleteDataOpen(false);
      showToast("All meeting data deleted.", "success");
      const [subRes, usageRes] = await Promise.all([
        apiFetch("/api/subscription", { cache: "no-store" }),
        apiFetch("/api/settings/usage", { cache: "no-store" }),
      ]);
      if (subRes.ok) {
        const p = (await subRes.json()) as SubscriptionResponse | { success?: false };
        if (p.success) setSubscription(p as SubscriptionResponse);
      }
      if (usageRes.ok) {
        const p = (await usageRes.json()) as UsageStatsResponse | { success?: false };
        if (p.success) setUsageStats(p as UsageStatsResponse);
      }
    } catch {
      showToast("Failed to delete meeting data.", "error");
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#111827]">Settings</h1>
            <p className="mt-1 text-sm text-[#6b7280]">Manage your profile, plan, preferences, and more.</p>
          </div>
          <Badge variant={planBadgeVariant(currentPlan)}>{currentPlanLabel}</Badge>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(220px,22%)_minmax(0,1fr)]">
        {/* Sidebar */}
        <aside className="md:sticky md:top-6 md:h-fit">
          <div className="hidden rounded-2xl border border-[#e5e7eb] bg-white p-2 md:block">
            <nav className="space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border-l-4 px-4 py-3 text-left text-sm font-medium transition",
                      isActive
                        ? "border-l-[#6c63ff] bg-[#f5f3ff] text-[#6c63ff]"
                        : "border-l-transparent text-[#374151] hover:bg-[#f9fafb]"
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-[#6c63ff]" : "text-[#6b7280]")} />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Mobile tabs */}
          <div className="flex gap-2 overflow-x-auto rounded-2xl border border-[#e5e7eb] bg-white p-2 md:hidden">
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
                      ? "border-[#6c63ff] bg-[#f5f3ff] text-[#6c63ff]"
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

        {/* Content */}
        <div className="min-w-0 space-y-6">
          {isLoading ? (
            <Card className="p-6">
              <div className="flex items-center gap-3 text-sm text-[#6b7280]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#6c63ff]" />
                Loading settings…
              </div>
            </Card>
          ) : null}

          {/* ── Profile tab ── */}
          {activeTab === "profile" ? (
            <section className="space-y-6">
              <SectionHeader title="Profile" description="Manage your public profile and display name." />
              <Card className="p-6">
                <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
                  {/* Avatar */}
                  <div className="flex flex-col items-center gap-4 rounded-2xl border border-[#ede9fe] bg-[#f5f3ff] p-6 text-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#6c63ff] to-[#8b5cf6] text-2xl font-bold text-white shadow-lg">
                      {getInitials(displayName)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#111827]">{displayName}</p>
                      <p className="mt-1 text-xs text-[#6b7280]">Account avatar</p>
                    </div>
                  </div>

                  {/* Fields */}
                  <div className="space-y-4">
                    {/* Full name */}
                    <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
                      <p className="text-sm font-semibold text-[#111827]">Full Name</p>
                      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                        <input
                          value={nameDraft}
                          readOnly={!isEditingName}
                          onChange={(e) => setNameDraft(e.target.value)}
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
                              <Button type="button" onClick={() => void saveName()} disabled={isSavingName}>
                                {isSavingName ? "Saving…" : "Save"}
                              </Button>
                              <Button type="button" variant="outline" onClick={cancelNameEdit}>Cancel</Button>
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

                    <div className="grid gap-4 md:grid-cols-2">
                      {/* Email */}
                      <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#111827]">Email Address</p>
                            <p className="mt-2 break-all text-sm text-[#6b7280]">{emailAddress}</p>
                            <p className="mt-1 text-xs text-[#9ca3af]">Managed by your auth provider.</p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <Badge variant="available">Verified ✓</Badge>
                            <Lock className="h-4 w-4 text-[#9ca3af]" />
                          </div>
                        </div>
                      </div>

                      {/* Member since + timezone */}
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
                          <p className="text-sm font-semibold text-[#111827]">Member Since</p>
                          <p className="mt-2 text-sm text-[#6b7280]">{memberSince}</p>
                        </div>
                        <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
                          <p className="text-sm font-semibold text-[#111827]">Timezone</p>
                          <p className="mt-2 text-sm text-[#6b7280]">{timezone}</p>
                          <p className="mt-1 text-xs text-[#9ca3af]">Detected from your browser.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </section>
          ) : null}

          {/* ── Account tab ── */}
          {activeTab === "account" ? (
            <section className="space-y-6">
              <SectionHeader title="Account" description="Manage your account security and connected services." />
              <Card className="divide-y divide-slate-100 p-0 overflow-hidden">
                {/* Password */}
                <div className="p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-[#111827]">Password</p>
                      <p className="mt-1 text-sm tracking-[0.2em] text-[#6b7280]">••••••••••••</p>
                      <p className="mt-1 text-xs text-[#9ca3af]">Managed by Clerk secure authentication.</p>
                    </div>
                    <Button type="button" variant="outline" onClick={() => void openPasswordFlow()}>
                      Change Password
                    </Button>
                  </div>
                </div>

                {/* Connected accounts */}
                <div className="p-5">
                  <p className="text-sm font-semibold text-[#111827]">Connected Accounts</p>
                  <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e8f0fe] text-sm font-bold text-[#4285f4]">G</div>
                      <div>
                        <p className="text-sm font-medium text-[#111827]">Google Account</p>
                        <p className="text-xs text-[#6b7280]">{emailAddress}</p>
                      </div>
                    </div>
                    <Badge variant="available">Connected ✓</Badge>
                  </div>
                </div>

                {/* Active sessions */}
                <div className="p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-[#111827]">Active Sessions</p>
                      <p className="mt-1 text-sm text-[#6b7280]">Sign out of other devices without affecting this session.</p>
                    </div>
                    <Button type="button" variant="outline" onClick={() => void signOutOtherSessions()}>
                      Sign out other devices
                    </Button>
                  </div>
                </div>

                {/* Danger zone */}
                <div className="p-5">
                  <p className="mb-4 text-sm font-semibold text-[#b91c1c]">Danger Zone</p>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#fecaca] bg-[#fff5f5] px-4 py-4">
                      <div>
                        <p className="text-sm font-medium text-[#111827]">Delete all meeting data</p>
                        <p className="mt-1 text-xs text-[#6b7280]">Permanently removes all transcripts, summaries, and action items.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsDeleteDataOpen(true)}
                        className="flex items-center gap-2 rounded-xl border border-[#dc2626] px-4 py-2 text-sm font-semibold text-[#dc2626] transition hover:bg-[#fef2f2]"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete Data
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#fecaca] bg-[#fff5f5] px-4 py-4">
                      <div>
                        <p className="text-sm font-medium text-[#111827]">Delete account</p>
                        <p className="mt-1 text-xs text-[#6b7280]">Permanently deletes your account and all associated data. This cannot be undone.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsDeleteAccountOpen(true)}
                        className="flex items-center gap-2 rounded-xl bg-[#dc2626] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#b91c1c]"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete Account
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            </section>
          ) : null}

          {/* ── Subscription tab ── */}
          {activeTab === "subscription" ? (
            <section className="space-y-6">
              <SectionHeader title="Subscription" description="Manage your plan and billing details." />
              <Card className="space-y-6 p-6">
                {/* Current plan */}
                <div className="rounded-2xl border border-[#ede9fe] bg-[#f5f3ff] p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-[#6c63ff]">Current Plan</p>
                      <h3 className="mt-2 text-3xl font-bold text-[#111827]">{currentPlanLabel}</h3>
                      <p className="mt-1 text-sm text-[#6b7280]">
                        {isTrialActive
                          ? "Free trial active — explore all features."
                          : currentPlan === "free"
                          ? "Free plan — upgrade to unlock more."
                          : currentPlan === "pro"
                          ? "Pro plan is active."
                          : "Elite plan is active."}
                      </p>
                    </div>
                    <Badge variant={planBadgeVariant(currentPlan)}>{currentPlanLabel}</Badge>
                  </div>

                  {isTrialActive ? (
                    <div className="mt-5 space-y-2">
                      <div className="flex items-center justify-between text-sm text-[#4b5563]">
                        <span>{trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} remaining</span>
                        <span>Expires {formatDate(trialEndsAt)}</span>
                      </div>
                      <ProgressBar value={trialProgress} colorClass={trialDaysLeft < 7 ? "bg-[#f59e0b]" : "bg-[#6c63ff]"} />
                    </div>
                  ) : null}

                  {(currentPlan === "pro" || currentPlan === "elite") ? (
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-white px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-[#6b7280]">Next billing</p>
                        <p className="mt-1 text-sm font-medium text-[#111827]">{formatDate(planEndsAt)}</p>
                      </div>
                      <div className="rounded-xl bg-white px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-[#6b7280]">Amount</p>
                        <p className="mt-1 text-sm font-medium text-[#111827]">
                          {currentPlan === "pro" ? "₹99/month" : "₹199/month"}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Usage meters */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
                    <p className="text-sm font-semibold text-[#111827]">Meetings this month</p>
                    <p className="mt-3 text-3xl font-bold text-[#111827]">{meetingsUsed}</p>
                    <p className="mt-1 text-xs text-[#6b7280]">
                      {subscription?.limits.unlimited ? "Unlimited" : `of ${meetingsLimit} allowed`}
                    </p>
                    <div className="mt-3">
                      <ProgressBar value={subscription?.limits.unlimited ? 100 : meetingUsagePercent} colorClass={progressColor(meetingUsagePercent)} />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
                    <p className="text-sm font-semibold text-[#111827]">Action Items</p>
                    <p className="mt-3 text-3xl font-bold text-[#111827]">{usageStats?.actionItemsCreated ?? 0}</p>
                    <p className="mt-1 text-xs text-[#6b7280]">extracted all-time</p>
                    <div className="mt-3">
                      <ProgressBar value={Math.min(100, (usageStats?.actionItemsCreated ?? 0) * 5)} />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
                    <p className="text-sm font-semibold text-[#111827]">Documents Analyzed</p>
                    <p className="mt-3 text-3xl font-bold text-[#111827]">{usageStats?.documentsAnalyzed ?? 0}</p>
                    <p className="mt-1 text-xs text-[#6b7280]">uploaded files</p>
                    <div className="mt-3">
                      <ProgressBar value={Math.min(100, (usageStats?.documentsAnalyzed ?? 0) * 10)} />
                    </div>
                  </div>
                </div>

                {/* Upgrade cards */}
                {canUpgradeToPro || canUpgradeToElite ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {canUpgradeToPro ? (
                      <Card className="space-y-4 border-[#c7d2fe] bg-gradient-to-b from-white to-[#f5f3ff] p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="text-xl font-bold text-[#111827]">Pro</h4>
                            <p className="mt-1 text-sm text-[#6b7280]">10 meetings/month + all AI features</p>
                          </div>
                          <Badge variant="pending">Popular</Badge>
                        </div>
                        <p className="text-3xl font-bold text-[#111827]">₹99<span className="text-base font-normal text-[#6b7280]">/mo</span></p>
                        <Button asChild className="w-full"><a href="/dashboard/billing">Upgrade to Pro</a></Button>
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
                        <p className="text-3xl font-bold text-[#111827]">₹199<span className="text-base font-normal text-[#6b7280]">/mo</span></p>
                        <Button asChild className="w-full"><a href="/dashboard/billing">Upgrade to Elite</a></Button>
                      </Card>
                    ) : null}
                  </div>
                ) : null}

                {/* Payment history */}
                <div className="overflow-hidden rounded-2xl border border-[#e5e7eb]">
                  <div className="border-b border-[#e5e7eb] px-5 py-4">
                    <p className="text-sm font-semibold text-[#111827]">Payment History</p>
                  </div>
                  {payments.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-[#f9fafb] text-[#6b7280]">
                          <tr>
                            <th className="px-5 py-3 font-semibold">Date</th>
                            <th className="px-5 py-3 font-semibold">Plan</th>
                            <th className="px-5 py-3 font-semibold">Amount</th>
                            <th className="px-5 py-3 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#f3f4f6]">
                          {payments.map((p) => (
                            <tr key={p.id} className="bg-white hover:bg-[#fafafa]">
                              <td className="px-5 py-3 text-[#374151]">{formatDate(p.date)}</td>
                              <td className="px-5 py-3 font-medium text-[#111827]">{p.plan}</td>
                              <td className="px-5 py-3 text-[#374151]">{formatCurrency(p.amount / 100)}</td>
                              <td className="px-5 py-3">
                                <Badge variant={p.status === "paid" ? "available" : "pending"}>{p.status}</Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="px-5 py-6 text-sm text-[#6b7280]">No payments yet.</p>
                  )}
                </div>
              </Card>
            </section>
          ) : null}

          {/* ── Preferences tab ── */}
          {activeTab === "preferences" ? (
            <section className="space-y-6">
              <SectionHeader title="Preferences" description="Customize how Artivaa works for you. Changes are saved when you click Save." />
              <Card className="space-y-6 p-6">
                {/* Email notifications */}
                <div>
                  <p className="mb-3 text-sm font-semibold text-[#111827]">Email Notifications</p>
                  <div className="space-y-3">
                    <InfoRow
                      label="Meeting Summary"
                      description="Receive an email when your meeting summary is ready."
                      control={
                        <Toggle
                          checked={preferences.meetingSummaryEmail}
                          onChange={(v) => setPreferences((p) => ({ ...p, meetingSummaryEmail: v }))}
                        />
                      }
                    />
                    <InfoRow
                      label="Action Items"
                      description="Get emailed your action items after each meeting."
                      control={
                        <Toggle
                          checked={preferences.actionItemsEmail}
                          onChange={(v) => setPreferences((p) => ({ ...p, actionItemsEmail: v }))}
                        />
                      }
                    />
                    <InfoRow
                      label="Weekly Digest"
                      description="A weekly roundup of all your meetings and insights."
                      control={
                        <Toggle
                          checked={preferences.weeklyDigest}
                          onChange={(v) => setPreferences((p) => ({ ...p, weeklyDigest: v }))}
                        />
                      }
                    />
                    <InfoRow
                      label="Product Updates"
                      description="New features, improvements, and announcements."
                      control={
                        <Toggle
                          checked={preferences.productUpdates}
                          onChange={(v) => setPreferences((p) => ({ ...p, productUpdates: v }))}
                        />
                      }
                    />
                  </div>
                </div>

                {/* AI output settings */}
                <div>
                  <p className="mb-3 text-sm font-semibold text-[#111827]">AI Output Settings</p>
                  <div className="grid gap-4 md:grid-cols-2">
                    {/* Default email tone */}
                    <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
                      <p className="text-sm font-semibold text-[#111827]">Default Email Tone</p>
                      <p className="mt-1 text-xs text-[#9ca3af]">Applied when generating follow-up emails.</p>
                      <div className="mt-4 space-y-3">
                        {(["Professional", "Friendly", "Formal", "Concise"] as const).map((tone) => (
                          <label key={tone} className="flex cursor-pointer items-center gap-3 text-sm text-[#374151]">
                            <input
                              type="radio"
                              name="defaultTone"
                              checked={preferences.defaultTone === tone}
                              onChange={() => setPreferences((p) => ({ ...p, defaultTone: tone }))}
                              className="h-4 w-4 accent-[#6c63ff]"
                            />
                            {tone}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Summary length */}
                    <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
                      <p className="text-sm font-semibold text-[#111827]">Summary Length</p>
                      <p className="mt-1 text-xs text-[#9ca3af]">Controls how detailed AI summaries are.</p>
                      <div className="mt-4 space-y-3">
                        {[
                          { id: "brief" as const, label: "Brief", desc: "2–3 sentences" },
                          { id: "standard" as const, label: "Standard", desc: "1 paragraph" },
                          { id: "detailed" as const, label: "Detailed", desc: "Full breakdown" },
                        ].map((opt) => (
                          <label key={opt.id} className="flex cursor-pointer items-center gap-3 text-sm text-[#374151]">
                            <input
                              type="radio"
                              name="summaryLength"
                              checked={preferences.summaryLength === opt.id}
                              onChange={() => setPreferences((p) => ({ ...p, summaryLength: opt.id }))}
                              className="h-4 w-4 accent-[#6c63ff]"
                            />
                            <span>{opt.label} <span className="text-[#9ca3af]">— {opt.desc}</span></span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Language */}
                  <div className="mt-4 rounded-2xl border border-[#e5e7eb] bg-white p-5">
                    <p className="text-sm font-semibold text-[#111827]">Language</p>
                    <p className="mt-1 text-xs text-[#9ca3af]">Affects AI output language for summaries and emails.</p>
                    <select
                      value={preferences.language}
                      onChange={(e) => setPreferences((p) => ({ ...p, language: e.target.value as PreferencesState["language"] }))}
                      className="mt-3 w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] outline-none focus:border-[#6c63ff]"
                    >
                      <option value="English">English</option>
                      <option value="Hindi">Hindi</option>
                    </select>
                  </div>
                </div>

                {/* Notetaker display name */}
                <div>
                  <p className="mb-3 text-sm font-semibold text-[#111827]">Notetaker Display Name</p>
                  <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
                    <p className="text-xs text-[#9ca3af]">This name appears in the participants list when the AI joins your meeting.</p>
                    <input
                      value={preferences.botDisplayName}
                      onChange={(e) => setPreferences((p) => ({ ...p, botDisplayName: e.target.value }))}
                      className="mt-3 w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] outline-none focus:border-[#6c63ff]"
                      placeholder="Artiva Notetaker"
                    />
                  </div>
                </div>

                {/* Auto-share */}
                <div>
                  <p className="mb-1 text-sm font-semibold text-[#111827]">Auto-share after Summary</p>
                  <p className="mb-3 text-xs text-[#9ca3af]">Automatically send the summary to selected destinations as soon as it&apos;s generated. Only enabled integrations will receive it.</p>
                  <div className="space-y-3">
                    {([
                      { key: "autoShareSlack" as const,  label: "Slack",  icon: "💬", desc: "Post summary + action items to your channel" },
                      { key: "autoShareGmail" as const,  label: "Gmail",  icon: "📧", desc: "Email summary to configured recipients" },
                      { key: "autoShareNotion" as const, label: "Notion", icon: "📝", desc: "Create a Notion page with full summary" },
                      { key: "autoShareJira" as const,   label: "Jira",   icon: "🎯", desc: "Create tickets from action items" },
                    ]).map((item) => (
                      <InfoRow
                        key={item.key}
                        label={`${item.icon} ${item.label}`}
                        description={item.desc}
                        control={
                          <Toggle
                            checked={preferences[item.key]}
                            onChange={(v) => setPreferences((p) => ({ ...p, [item.key]: v }))}
                          />
                        }
                      />
                    ))}
                  </div>
                </div>

                <Button
                  type="button"
                  className="w-full"
                  disabled={!prefsChanged || isSavingPrefs}
                  onClick={() => void savePreferences()}
                >
                  {isSavingPrefs ? "Saving…" : prefsChanged ? "Save Preferences" : "Preferences Saved"}
                </Button>
              </Card>
            </section>
          ) : null}

          {/* ── Integrations tab ── */}
          {activeTab === "integrations" ? (
            <section className="space-y-6">
              <SectionHeader
                title="Integrations"
                description="Connect Artivaa with your favourite tools for automatic meeting follow-up."
              />
              <Card className="divide-y divide-slate-100 p-0 overflow-hidden">
                {/* Google Calendar */}
                <div className="p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e8f0fe] text-sm font-bold text-[#4285f4]">G</div>
                      <div>
                        <p className="text-sm font-semibold text-[#111827]">Google Calendar</p>
                        <p className="text-xs text-[#6b7280]">Auto-detect and join scheduled meetings.</p>
                      </div>
                    </div>
                    <Badge variant="available">Connected ✓</Badge>
                  </div>
                </div>

                {/* All integrations link */}
                <div className="p-5">
                  <p className="text-sm text-[#6b7280]">
                    Configure Slack, Gmail, Notion, Jira, and more to run automatically after meetings complete.
                  </p>
                  <div className="mt-4">
                    <Button asChild>
                      <a href="/dashboard/integrations">Open Integrations</a>
                    </Button>
                  </div>
                </div>
              </Card>
            </section>
          ) : null}

          {/* ── Usage & Limits tab ── */}
          {activeTab === "usage" ? (
            <section className="space-y-6">
              <SectionHeader title="Usage & Limits" description="Monitor your Artivaa usage and feature availability." />
              <Card className="space-y-6 p-6">
                {/* Stats grid */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {/* Meetings this month */}
                  <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
                    <p className="text-sm font-semibold text-[#111827]">Meetings This Month</p>
                    <p className="mt-3 text-3xl font-bold text-[#111827]">{usageStats?.meetingsThisMonth ?? 0}</p>
                    <p className="mt-1 text-xs text-[#6b7280]">
                      {subscription?.limits.unlimited
                        ? "Unlimited available"
                        : `of ${meetingsLimit} allowed`}
                    </p>
                    <div className="mt-3">
                      <ProgressBar
                        value={subscription?.limits.unlimited ? 100 : meetingUsagePercent}
                        colorClass={progressColor(meetingUsagePercent)}
                      />
                    </div>
                  </div>

                  {/* All-time meetings */}
                  <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
                    <p className="text-sm font-semibold text-[#111827]">All-Time Meetings</p>
                    <p className="mt-3 text-3xl font-bold text-[#111827]">{usageStats?.meetingsAllTime ?? 0}</p>
                    <p className="mt-1 text-xs text-[#6b7280]">total recorded</p>
                  </div>

                  {/* Transcripts */}
                  <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
                    <p className="text-sm font-semibold text-[#111827]">Transcripts Generated</p>
                    <p className="mt-3 text-3xl font-bold text-[#111827]">{usageStats?.transcriptsGenerated ?? 0}</p>
                    <p className="mt-1 text-xs text-[#6b7280]">auto-generated</p>
                    <div className="mt-3">
                      <ProgressBar value={Math.min(100, (usageStats?.transcriptsGenerated ?? 0) * 10)} />
                    </div>
                  </div>

                  {/* Action items */}
                  <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
                    <p className="text-sm font-semibold text-[#111827]">Action Items Created</p>
                    <p className="mt-3 text-3xl font-bold text-[#111827]">{usageStats?.actionItemsCreated ?? 0}</p>
                    <p className="mt-1 text-xs text-[#6b7280]">extracted by AI</p>
                    <div className="mt-3">
                      <ProgressBar value={Math.min(100, (usageStats?.actionItemsCreated ?? 0) * 5)} />
                    </div>
                  </div>

                  {/* Documents */}
                  <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
                    <p className="text-sm font-semibold text-[#111827]">Documents Analyzed</p>
                    <p className="mt-3 text-3xl font-bold text-[#111827]">{usageStats?.documentsAnalyzed ?? 0}</p>
                    <p className="mt-1 text-xs text-[#6b7280]">uploaded files</p>
                    <div className="mt-3">
                      <ProgressBar value={Math.min(100, (usageStats?.documentsAnalyzed ?? 0) * 10)} />
                    </div>
                  </div>

                  {/* Member since */}
                  <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
                    <p className="text-sm font-semibold text-[#111827]">Member Since</p>
                    <p className="mt-3 text-lg font-bold text-[#111827]">{memberSince}</p>
                    <p className="mt-1 text-xs text-[#6b7280]">account created</p>
                  </div>
                </div>

                {/* Feature availability table */}
                <div className="overflow-hidden rounded-2xl border border-[#e5e7eb]">
                  <div className="border-b border-[#e5e7eb] px-5 py-4">
                    <p className="text-sm font-semibold text-[#111827]">Feature Availability</p>
                    <p className="mt-1 text-xs text-[#9ca3af]">What&apos;s enabled on your current plan.</p>
                  </div>
                  <div className="divide-y divide-[#f3f4f6]">
                    {[
                      { label: "Meeting Bot", key: "meetingBot" as const },
                      { label: "Transcription", key: "transcription" as const },
                      { label: "AI Summary", key: "summary" as const },
                      { label: "Action Items", key: "actionItems" as const },
                      { label: "Meeting History", key: "history" as const },
                    ].map((feature) => {
                      const enabled = subscription?.limits[feature.key] ?? false;
                      return (
                        <div key={feature.key} className="flex items-center justify-between px-5 py-3">
                          <p className="text-sm text-[#374151]">{feature.label}</p>
                          {enabled ? (
                            <span className="flex items-center gap-1 text-xs font-medium text-[#16a34a]">
                              <Check className="h-4 w-4" /> Enabled
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-[#9ca3af]">Not available</span>
                          )}
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between px-5 py-3">
                      <p className="text-sm text-[#374151]">Meetings per month</p>
                      <p className="text-sm font-semibold text-[#111827]">
                        {subscription?.limits.unlimited ? "Unlimited" : meetingsLimit}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Delete data */}
                <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#fecaca] bg-[#fff5f5] px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-[#b91c1c]">Delete All Meeting Data</p>
                    <p className="mt-1 text-xs text-[#6b7280]">Permanently removes all transcripts, summaries, and action items.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsDeleteDataOpen(true)}
                    className="flex items-center gap-2 rounded-xl border border-[#dc2626] px-4 py-2 text-sm font-semibold text-[#dc2626] transition hover:bg-[#fef2f2]"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Data
                  </button>
                </div>
              </Card>
            </section>
          ) : null}
        </div>
      </div>

      {/* Modals */}
      <ConfirmModal
        isOpen={isDeleteDataOpen}
        title="Delete all meeting data?"
        description="This will permanently delete all your transcripts, summaries, and action items. Your account will remain active. This action cannot be undone."
        confirmLabel="Delete Data"
        requireTyping="DELETE"
        onConfirm={() => void deleteMeetingData()}
        onCancel={() => setIsDeleteDataOpen(false)}
      />

      <ConfirmModal
        isOpen={isDeleteAccountOpen}
        title="Delete your account?"
        description="This will permanently delete your Artivaa account and all associated data including meetings, transcripts, and preferences. This action cannot be undone."
        confirmLabel="Delete Account"
        requireTyping="DELETE"
        onConfirm={() => void deleteAccount()}
        onCancel={() => setIsDeleteAccountOpen(false)}
      />

      <Toast toast={toast} />
    </div>
  );
}
