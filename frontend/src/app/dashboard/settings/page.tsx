"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useClerk, useSession, useUser } from "@clerk/nextjs";
import {
  Check, Crown, Lock, Pencil, Trash2, X,
  Download, Star, Calendar, Globe, ChevronRight, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiFetch } from "@/hooks/useApiFetch";

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

const tabs: Array<{ id: ActiveTab; label: string; icon: string }> = [
  { id: "profile",       label: "Profile",       icon: "person" },
  { id: "account",       label: "Account",       icon: "lock" },
  { id: "subscription",  label: "Subscription",  icon: "credit_card" },
  { id: "preferences",   label: "Preferences",   icon: "tune" },
  { id: "integrations",  label: "Integrations",  icon: "link" },
  { id: "usage",         label: "Usage & Limits", icon: "speed" },
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
  if (usage >= 90) return "bg-[#EA4335]";
  if (usage >= 75) return "bg-[#B06000]";
  return "bg-[#6C3FF5]";
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
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-[#6C3FF5]" : "bg-[#DADCE0]",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}

function ProgressBar({ value, colorClass = "bg-[#6C3FF5]" }: { value: number; colorClass?: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-[#EDE9FE]">
      <div
        className={cn("h-2 rounded-full transition-all", colorClass)}
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}

function Toast({ toast }: { toast: ToastState | null }) {
  if (!toast) return null;
  const tone =
    toast.type === "success" ? "border-[#E6F4EA] bg-[#E6F4EA] text-[#137333]"
    : toast.type === "error" ? "border-[#FCE8E6] bg-[#FCE8E6] text-[#C5221F]"
    : toast.type === "warning" ? "border-[#FEF7E0] bg-[#FEF7E0] text-[#B06000]"
    : "border-[#EDE9FE] bg-[#EDE9FE] text-[#6C3FF5]";
  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm">
      <div className={cn("rounded-xl border px-4 py-3 shadow-lg text-sm font-medium", tone)}>
        {toast.message}
      </div>
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
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-[#DADCE0]">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-base font-semibold text-[#202124]">{title}</h2>
          <button type="button" onClick={onCancel} className="text-[#9AA0A6] hover:text-[#5F6368]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-3 text-sm leading-6 text-[#5F6368]">{description}</p>
        {requireTyping ? (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-[#5F6368]">
              Type <span className="font-bold text-[#202124]">{requireTyping}</span> to confirm
            </p>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={requireTyping}
              className="w-full rounded-xl border border-[#DADCE0] px-4 py-3 text-sm outline-none focus:border-[#6C3FF5]"
            />
          </div>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-[#DADCE0] px-4 py-2 text-sm font-semibold text-[#5F6368] hover:bg-[#F8F9FA] transition"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={onConfirm}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-semibold transition",
              destructive
                ? "bg-[#EA4335] text-white hover:bg-[#C5221F] disabled:opacity-50"
                : "bg-[#6C3FF5] text-white hover:bg-[#5B2FE0] disabled:opacity-50"
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Chip selector ────────────────────────────────────────────────────────────

function ChipSelector<T extends string>({
  options,
  value,
  onChange,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-semibold transition",
            value === opt
              ? "border-[#6C3FF5] bg-[#EDE9FE] text-[#6C3FF5]"
              : "border-[#DADCE0] bg-white text-[#5F6368] hover:bg-[#F8F9FA]"
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

// ─── Material Symbol icon ─────────────────────────────────────────────────────

function MSIcon({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("material-symbols-outlined select-none", className)} aria-hidden="true">
      {name}
    </span>
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
  const currentPlanLabel = currentPlan === "trial" ? "Trial" : currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1);
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

  // ─── Plan badge pill ─────────────────────────────────────────────────────────

  const PlanPill = () => (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#6C3FF5] to-[#5B2FE0] px-3 py-1 text-xs font-semibold text-white">
      <Star className="h-3 w-3 fill-white" />
      {currentPlanLabel} Plan
    </span>
  );

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-['Work_Sans',sans-serif] text-[22px] font-bold text-[#202124]">Settings</h1>
          <p className="mt-0.5 text-sm text-[#5F6368]">Manage your profile, plan, preferences, and more.</p>
        </div>
        <PlanPill />
      </div>

      <div className="flex gap-6 items-start">
        {/* ── Left Sidebar ── */}
        <aside className="sticky top-6 hidden w-[220px] shrink-0 md:block">
          <div className="rounded-xl border border-[#DADCE0] bg-white p-2 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <nav className="space-y-0.5">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border-l-4 px-3 py-2.5 text-left text-sm transition",
                      isActive
                        ? "border-l-[#6C3FF5] bg-[#EDE9FE] font-semibold text-[#6C3FF5]"
                        : "border-l-transparent font-normal text-[#5F6368] hover:bg-[#F8F9FA]"
                    )}
                  >
                    <MSIcon
                      name={tab.icon}
                      className={cn(
                        "text-[20px] leading-none",
                        isActive ? "text-[#6C3FF5]" : "text-[#9AA0A6]"
                      )}
                    />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Mobile tab strip */}
        <div className="mb-4 flex gap-2 overflow-x-auto md:hidden">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
                  isActive
                    ? "border-[#6C3FF5] bg-[#EDE9FE] text-[#6C3FF5]"
                    : "border-[#DADCE0] bg-white text-[#5F6368] hover:bg-[#F8F9FA]"
                )}
              >
                <MSIcon name={tab.icon} className="text-[18px] leading-none" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── Main content ── */}
        <div className="min-w-0 flex-1 space-y-5">
          {isLoading ? (
            <div className="rounded-xl border border-[#DADCE0] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              <div className="flex items-center gap-3 text-sm text-[#5F6368]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#6C3FF5]" />
                Loading settings…
              </div>
            </div>
          ) : null}

          {/* ══════════════════════════════════════════════════════════════════
              PROFILE TAB
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "profile" ? (
            <section className="space-y-4">
              {/* Profile card with avatar */}
              <div className="rounded-xl border border-[#DADCE0] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <div className="flex items-center gap-5">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#6C3FF5] to-[#8b5cf6] text-2xl font-bold text-white shadow-md">
                    {getInitials(displayName)}
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-[#202124]">{displayName}</p>
                    <p className="mt-0.5 text-xs text-[#9AA0A6]">Account avatar</p>
                  </div>
                </div>
              </div>

              {/* Full Name card */}
              <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9AA0A6]">Full Name</p>
                    {isEditingName ? (
                      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                        <input
                          value={nameDraft}
                          onChange={(e) => setNameDraft(e.target.value)}
                          className="w-full rounded-xl border border-[#6C3FF5] bg-white px-4 py-2.5 text-sm text-[#202124] outline-none focus:ring-2 focus:ring-[#EDE9FE]"
                          placeholder="Enter your name"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void saveName()}
                            disabled={isSavingName}
                            className="rounded-xl bg-[#6C3FF5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5B2FE0] disabled:opacity-50 transition"
                          >
                            {isSavingName ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelNameEdit}
                            className="rounded-xl border border-[#DADCE0] px-4 py-2 text-sm font-semibold text-[#5F6368] hover:bg-[#F8F9FA] transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-base font-medium text-[#202124]">{displayName}</p>
                    )}
                  </div>
                  {!isEditingName && (
                    <button
                      type="button"
                      onClick={() => setIsEditingName(true)}
                      className="flex items-center gap-1.5 rounded-xl border border-[#DADCE0] px-3 py-1.5 text-xs font-semibold text-[#5F6368] hover:bg-[#F8F9FA] transition"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  )}
                </div>
              </div>

              {/* Email Address card */}
              <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9AA0A6]">Email Address</p>
                    <p className="mt-2 break-all text-base font-medium text-[#202124]">{emailAddress}</p>
                    <p className="mt-1 text-xs text-[#9AA0A6]">Managed by your auth provider.</p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#E6F4EA] px-2.5 py-1 text-[11px] font-semibold text-[#137333]">
                    <Check className="h-3 w-3" />
                    VERIFIED
                  </span>
                </div>
              </div>

              {/* Member Since card */}
              <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9AA0A6]">Member Since</p>
                <div className="mt-2 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[#9AA0A6]" />
                  <p className="text-base font-medium text-[#202124]">{memberSince}</p>
                </div>
              </div>

              {/* Timezone card */}
              <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9AA0A6]">Timezone</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Globe className="h-4 w-4 text-[#9AA0A6]" />
                      <p className="text-base font-medium text-[#202124]">{timezone}</p>
                    </div>
                    <p className="mt-1 text-xs text-[#9AA0A6]">Detected from your browser.</p>
                  </div>
                  <button
                    type="button"
                    className="rounded-xl border border-[#DADCE0] px-3 py-1.5 text-xs font-semibold text-[#5F6368] hover:bg-[#F8F9FA] transition"
                  >
                    Update
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {/* ══════════════════════════════════════════════════════════════════
              ACCOUNT TAB
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "account" ? (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-['Work_Sans',sans-serif] text-lg font-bold text-[#202124]">Account</h2>
              </div>

              {/* Password */}
              <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-[#202124]">Password</p>
                    <p className="mt-1 text-sm tracking-[0.2em] text-[#5F6368]">••••••••••••</p>
                    <p className="mt-1 text-xs text-[#9AA0A6]">Managed by Clerk secure authentication.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void openPasswordFlow()}
                    className="rounded-xl border border-[#DADCE0] px-4 py-2 text-sm font-semibold text-[#5F6368] hover:bg-[#F8F9FA] transition"
                  >
                    Change Password
                  </button>
                </div>
              </div>

              {/* Connected accounts */}
              <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <p className="text-sm font-semibold text-[#202124]">Connected Accounts</p>
                <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-[#DADCE0] bg-[#F8F9FA] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e8f0fe] text-sm font-bold text-[#4285f4]">G</div>
                    <div>
                      <p className="text-sm font-medium text-[#202124]">Google Account</p>
                      <p className="text-xs text-[#5F6368]">{emailAddress}</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#E6F4EA] px-2.5 py-1 text-[11px] font-semibold text-[#137333]">
                    <Check className="h-3 w-3" />
                    Connected
                  </span>
                </div>
              </div>

              {/* Active sessions */}
              <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-[#202124]">Active Sessions</p>
                    <p className="mt-1 text-sm text-[#5F6368]">Sign out of other devices without affecting this session.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void signOutOtherSessions()}
                    className="rounded-xl border border-[#DADCE0] px-4 py-2 text-sm font-semibold text-[#5F6368] hover:bg-[#F8F9FA] transition whitespace-nowrap"
                  >
                    Sign out other devices
                  </button>
                </div>
              </div>

              {/* Danger zone */}
              <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <p className="mb-4 text-sm font-semibold text-[#EA4335]">Danger Zone</p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-[#FCE8E6] bg-[#FCE8E6]/30 px-4 py-4">
                    <div>
                      <p className="text-sm font-medium text-[#202124]">Delete all meeting data</p>
                      <p className="mt-1 text-xs text-[#5F6368]">Permanently removes all transcripts, summaries, and action items.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsDeleteDataOpen(true)}
                      className="flex items-center gap-2 rounded-xl border border-[#EA4335] px-4 py-2 text-sm font-semibold text-[#EA4335] transition hover:bg-[#FCE8E6] whitespace-nowrap"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Data
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-4 rounded-xl border border-[#FCE8E6] bg-[#FCE8E6]/30 px-4 py-4">
                    <div>
                      <p className="text-sm font-medium text-[#202124]">Delete account</p>
                      <p className="mt-1 text-xs text-[#5F6368]">Permanently deletes your account and all associated data. This cannot be undone.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsDeleteAccountOpen(true)}
                      className="flex items-center gap-2 rounded-xl bg-[#EA4335] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#C5221F] whitespace-nowrap"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Account
                    </button>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {/* ══════════════════════════════════════════════════════════════════
              SUBSCRIPTION TAB
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "subscription" ? (
            <section className="space-y-5">
              {/* Header row */}
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-['Work_Sans',sans-serif] text-lg font-bold text-[#202124]">Subscription</h2>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-xl bg-[#6C3FF5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5B2FE0] transition"
                >
                  <Download className="h-4 w-4" />
                  Download Statement
                </button>
              </div>

              {/* Active plan banner */}
              <div className={cn(
                "rounded-xl border p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
                currentPlan === "elite" ? "border-[#EDE9FE] bg-gradient-to-r from-[#EDE9FE] to-[#f5f3ff]"
                : currentPlan === "pro" ? "border-[#DBEAFE] bg-gradient-to-r from-[#DBEAFE] to-[#eff6ff]"
                : isTrialActive ? "border-[#FEF7E0] bg-gradient-to-r from-[#FEF7E0] to-[#fffdf5]"
                : "border-[#DADCE0] bg-[#F8F9FA]"
              )}>
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {currentPlan === "elite" && <span className="material-symbols-outlined text-[#6C3FF5] text-[20px]">workspace_premium</span>}
                      {currentPlan === "pro" && <span className="material-symbols-outlined text-[#2563EB] text-[20px]">verified</span>}
                      {currentPlan === "free" && <span className="material-symbols-outlined text-[#5F6368] text-[20px]">person</span>}
                      {isTrialActive && <span className="material-symbols-outlined text-[#B06000] text-[20px]">hourglass_top</span>}
                      <h3 className="text-xl font-bold text-[#202124]">{currentPlanLabel} Plan is active</h3>
                    </div>

                    {/* Dynamic per-plan description */}
                    {currentPlan === "elite" && (
                      <div className="space-y-3">
                        <p className="text-sm text-[#5F6368]">You&apos;re on our most powerful plan. Enjoy unlimited meetings, all AI features, and priority support.</p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {[
                            { icon: "all_inclusive", label: "Unlimited meetings" },
                            { icon: "smart_toy", label: "AI Notetaker" },
                            { icon: "summarize", label: "Auto summaries" },
                            { icon: "task_alt", label: "Action items" },
                            { icon: "share", label: "Auto-share integrations" },
                            { icon: "support_agent", label: "Priority support" },
                          ].map((f) => (
                            <div key={f.label} className="flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2">
                              <span className="material-symbols-outlined text-[#6C3FF5] text-[16px]">{f.icon}</span>
                              <span className="text-xs font-medium text-[#202124]">{f.label}</span>
                            </div>
                          ))}
                        </div>
                        {subscription?.planEndsAt && (
                          <p className="text-xs text-[#5F6368]">
                            <span className="material-symbols-outlined text-[14px] align-middle mr-1">calendar_today</span>
                            Renews on {formatDate(planEndsAt)}
                          </p>
                        )}
                      </div>
                    )}

                    {currentPlan === "pro" && (
                      <div className="space-y-3">
                        <p className="text-sm text-[#5F6368]">You&apos;re on the Pro plan — 10 meetings/month with full AI capabilities and priority support.</p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {[
                            { icon: "videocam", label: "10 meetings/month" },
                            { icon: "smart_toy", label: "AI Notetaker" },
                            { icon: "summarize", label: "Auto summaries" },
                            { icon: "task_alt", label: "Action items" },
                            { icon: "history", label: "Meeting history" },
                            { icon: "support_agent", label: "Priority support" },
                          ].map((f) => (
                            <div key={f.label} className="flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2">
                              <span className="material-symbols-outlined text-[#2563EB] text-[16px]">{f.icon}</span>
                              <span className="text-xs font-medium text-[#202124]">{f.label}</span>
                            </div>
                          ))}
                        </div>
                        {subscription?.planEndsAt && (
                          <p className="text-xs text-[#5F6368]">
                            <span className="material-symbols-outlined text-[14px] align-middle mr-1">calendar_today</span>
                            Renews on {formatDate(planEndsAt)}
                          </p>
                        )}
                        <a href="/dashboard/billing" className="inline-flex items-center gap-1.5 rounded-lg bg-[#6C3FF5] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#5B2FE0] transition">
                          <span className="material-symbols-outlined text-[14px]">upgrade</span>
                          Upgrade to Elite for unlimited meetings
                        </a>
                      </div>
                    )}

                    {currentPlan === "free" && !isTrialActive && (
                      <div className="space-y-3">
                        <p className="text-sm text-[#5F6368]">You&apos;re on the Free plan. Upgrade to unlock the AI Notetaker, transcription, and meeting history.</p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {[
                            { icon: "check_circle", label: "3 meetings/month", enabled: true },
                            { icon: "check_circle", label: "Email generator", enabled: true },
                            { icon: "check_circle", label: "Task generator", enabled: true },
                            { icon: "lock", label: "AI Notetaker", enabled: false },
                            { icon: "lock", label: "Transcription", enabled: false },
                            { icon: "lock", label: "Meeting history", enabled: false },
                          ].map((f) => (
                            <div key={f.label} className={cn("flex items-center gap-2 rounded-lg px-3 py-2", f.enabled ? "bg-[#E6F4EA]" : "bg-[#F1F3F4]")}>
                              <span className={cn("material-symbols-outlined text-[16px]", f.enabled ? "text-[#34A853]" : "text-[#9AA0A6]")}>{f.icon}</span>
                              <span className={cn("text-xs font-medium", f.enabled ? "text-[#202124]" : "text-[#9AA0A6]")}>{f.label}</span>
                            </div>
                          ))}
                        </div>
                        <a href="/dashboard/billing" className="inline-flex items-center gap-1.5 rounded-lg bg-[#6C3FF5] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#5B2FE0] transition">
                          <span className="material-symbols-outlined text-[14px]">upgrade</span>
                          Upgrade to Pro — ₹99/month
                        </a>
                      </div>
                    )}

                    {isTrialActive && (
                      <div className="space-y-3">
                        <p className="text-sm text-[#5F6368]">You&apos;re on a free trial with full access to all features. Your trial ends in {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"}.</p>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs text-[#5F6368]">
                            <span>{trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} remaining</span>
                            <span>Expires {formatDate(trialEndsAt)}</span>
                          </div>
                          <ProgressBar value={trialProgress} colorClass={trialDaysLeft < 7 ? "bg-[#B06000]" : "bg-[#6C3FF5]"} />
                        </div>
                        <a href="/dashboard/billing" className="inline-flex items-center gap-1.5 rounded-lg bg-[#6C3FF5] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#5B2FE0] transition">
                          <span className="material-symbols-outlined text-[14px]">upgrade</span>
                          Upgrade before trial ends
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 rounded-xl border border-[#DADCE0] bg-white p-4 text-center min-w-[160px]">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9AA0A6]">Meetings Used</p>
                    <p className="mt-1 text-3xl font-bold text-[#202124]">
                      {meetingsUsed}
                      <span className="text-lg font-normal text-[#9AA0A6]"> / {subscription?.limits.unlimited ? "∞" : meetingsLimit}</span>
                    </p>
                    <div className="mt-2">
                      <ProgressBar value={subscription?.limits.unlimited ? 0 : meetingUsagePercent} colorClass={progressColor(meetingUsagePercent)} />
                    </div>
                    <p className="mt-1.5 text-xs text-[#5F6368]">
                      {subscription?.limits.unlimited
                        ? "Unlimited"
                        : `${Math.max(0, meetingsLimit - meetingsUsed)} remaining`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Plan cards */}
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  {
                    id: "free" as PlanId,
                    name: "Free",
                    desc: "Get started with basic features",
                    price: "₹0",
                    period: "/mo",
                    features: ["3 meetings/month", "Basic transcription", "AI summaries", "Email support"],
                    cta: "Downgrade",
                    ctaHref: "/dashboard/billing",
                  },
                  {
                    id: "pro" as PlanId,
                    name: "Pro",
                    desc: "For professionals and small teams",
                    price: "₹99",
                    period: "/mo",
                    features: ["10 meetings/month", "Full transcription", "AI summaries + action items", "Priority support"],
                    cta: "Upgrade to Pro",
                    ctaHref: "/dashboard/billing",
                  },
                  {
                    id: "elite" as PlanId,
                    name: "Elite",
                    desc: "Unlimited power for power users",
                    price: "₹199",
                    period: "/mo",
                    features: ["Unlimited meetings", "All AI features", "Auto-share integrations", "Dedicated support"],
                    cta: "Upgrade to Elite",
                    ctaHref: "/dashboard/billing",
                  },
                ].map((plan) => {
                  const isCurrent = currentPlan === plan.id;
                  return (
                    <div
                      key={plan.id}
                      className={cn(
                        "relative rounded-xl border bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition",
                        isCurrent ? "border-[#6C3FF5]" : "border-[#DADCE0]"
                      )}
                    >
                      {isCurrent && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                          <span className="rounded-full bg-[#6C3FF5] px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                            Current Plan
                          </span>
                        </div>
                      )}
                      <h4 className="text-base font-bold text-[#202124]">{plan.name}</h4>
                      <p className="mt-0.5 text-xs text-[#5F6368]">{plan.desc}</p>
                      <p className="mt-3 text-2xl font-bold text-[#202124]">
                        {plan.price}
                        <span className="text-sm font-normal text-[#9AA0A6]">{plan.period}</span>
                      </p>
                      <ul className="mt-4 space-y-2">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-center gap-2 text-xs text-[#5F6368]">
                            <Check className="h-3.5 w-3.5 shrink-0 text-[#34A853]" />
                            {f}
                          </li>
                        ))}
                      </ul>
                      <a
                        href={plan.ctaHref}
                        className={cn(
                          "mt-5 flex w-full items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition",
                          isCurrent
                            ? "border border-[#6C3FF5] text-[#6C3FF5] hover:bg-[#EDE9FE]"
                            : "bg-[#6C3FF5] text-white hover:bg-[#5B2FE0]"
                        )}
                      >
                        {isCurrent ? "Current Plan" : plan.cta}
                      </a>
                    </div>
                  );
                })}
              </div>

              {/* Payment history table */}
              <div className="overflow-hidden rounded-xl border border-[#DADCE0] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <div className="border-b border-[#DADCE0] px-5 py-4">
                  <p className="text-sm font-semibold text-[#202124]">Payment History</p>
                </div>
                {payments.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-[#F8F9FA]">
                        <tr>
                          {["Date", "Plan", "Amount", "Status", "Invoice"].map((h) => (
                            <th key={h} className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[#9AA0A6]">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F8F9FA]">
                        {payments.map((p) => (
                          <tr key={p.id} className="bg-white hover:bg-[#F8F9FA]">
                            <td className="px-5 py-3 text-[#5F6368]">{formatDate(p.date)}</td>
                            <td className="px-5 py-3 font-medium text-[#202124]">{p.plan}</td>
                            <td className="px-5 py-3 text-[#5F6368]">{formatCurrency(p.amount / 100)}</td>
                            <td className="px-5 py-3">
                              {p.status === "paid" ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[#E6F4EA] px-2.5 py-0.5 text-[11px] font-semibold text-[#137333]">
                                  <Check className="h-3 w-3" />
                                  PAID
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-[#FEF7E0] px-2.5 py-0.5 text-[11px] font-semibold text-[#B06000]">
                                  {p.status}
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3">
                              {p.invoice ? (
                                <a
                                  href={p.invoice}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-[#6C3FF5] hover:text-[#5B2FE0] text-xs font-medium"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  Invoice
                                </a>
                              ) : (
                                <span className="text-xs text-[#9AA0A6]">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="px-5 py-6 text-sm text-[#9AA0A6]">No payments yet.</p>
                )}
              </div>
            </section>
          ) : null}

          {/* ══════════════════════════════════════════════════════════════════
              PREFERENCES TAB
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "preferences" ? (
            <section className="space-y-5 pb-24">
              {/* Header */}
              <div className="flex items-center gap-3">
                <h2 className="font-['Work_Sans',sans-serif] text-lg font-bold text-[#202124]">Preferences</h2>
              </div>

              {/* Two-column: Email Notifications + AI Behavior */}
              <div className="grid gap-5 lg:grid-cols-2">
                {/* Email Notifications card */}
                <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                  <p className="mb-4 text-sm font-semibold text-[#202124]">Email Notifications</p>
                  <div className="space-y-4">
                    {[
                      { key: "meetingSummaryEmail" as const, label: "Meeting Summary", desc: "Receive an email when your meeting summary is ready." },
                      { key: "actionItemsEmail" as const, label: "Action Items", desc: "Get emailed your action items after each meeting." },
                      { key: "weeklyDigest" as const, label: "Weekly Digest", desc: "A weekly roundup of all your meetings and insights." },
                      { key: "productUpdates" as const, label: "Product Updates", desc: "New features, improvements, and announcements." },
                    ].map((item) => (
                      <div key={item.key} className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#202124]">{item.label}</p>
                          <p className="mt-0.5 text-xs text-[#9AA0A6]">{item.desc}</p>
                        </div>
                        <Toggle
                          checked={preferences[item.key]}
                          onChange={(v) => setPreferences((p) => ({ ...p, [item.key]: v }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* AI Behavior card */}
                <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                  <p className="mb-4 text-sm font-semibold text-[#202124]">AI Behavior</p>
                  <div className="space-y-5">
                    {/* Preferred Email Tone */}
                    <div>
                      <p className="mb-2 text-xs font-semibold text-[#5F6368]">Preferred Email Tone</p>
                      <ChipSelector
                        options={["Professional", "Friendly", "Concise", "Formal"] as const}
                        value={preferences.defaultTone}
                        onChange={(v) => setPreferences((p) => ({ ...p, defaultTone: v }))}
                      />
                    </div>
                    {/* Summary Length */}
                    <div>
                      <p className="mb-2 text-xs font-semibold text-[#5F6368]">Summary Length</p>
                      <ChipSelector
                        options={["brief", "standard", "detailed"] as const}
                        value={preferences.summaryLength}
                        onChange={(v) => setPreferences((p) => ({ ...p, summaryLength: v }))}
                      />
                    </div>
                    {/* Primary Language */}
                    <div>
                      <p className="mb-2 text-xs font-semibold text-[#5F6368]">Primary Language</p>
                      <ChipSelector
                        options={["English", "Hindi"] as const}
                        value={preferences.language}
                        onChange={(v) => setPreferences((p) => ({ ...p, language: v }))}
                      />
                    </div>
                    {/* Bot display name */}
                    <div>
                      <p className="mb-2 text-xs font-semibold text-[#5F6368]">Notetaker Display Name</p>
                      <input
                        value={preferences.botDisplayName}
                        onChange={(e) => setPreferences((p) => ({ ...p, botDisplayName: e.target.value }))}
                        className="w-full rounded-xl border border-[#DADCE0] bg-white px-3 py-2 text-sm text-[#202124] outline-none focus:border-[#6C3FF5]"
                        placeholder="Artiva Notetaker"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Auto-share Integrations card */}
              <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <p className="mb-1 text-sm font-semibold text-[#202124]">Auto-share Integrations</p>
                <p className="mb-5 text-xs text-[#9AA0A6]">Automatically send the summary to selected destinations as soon as it&apos;s generated.</p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {([
                    { key: "autoShareSlack" as const,  label: "Slack",  emoji: "💬", desc: "Post to your channel" },
                    { key: "autoShareGmail" as const,  label: "Gmail",  emoji: "📧", desc: "Email to recipients" },
                    { key: "autoShareNotion" as const, label: "Notion", emoji: "📝", desc: "Create a Notion page" },
                    { key: "autoShareJira" as const,   label: "Jira",   emoji: "🎯", desc: "Create tickets" },
                  ]).map((item) => (
                    <div
                      key={item.key}
                      className={cn(
                        "flex flex-col items-center rounded-xl border p-4 text-center transition",
                        preferences[item.key] ? "border-[#6C3FF5] bg-[#EDE9FE]/30" : "border-[#DADCE0] bg-[#F8F9FA]"
                      )}
                    >
                      <span className="text-2xl">{item.emoji}</span>
                      <p className="mt-2 text-sm font-semibold text-[#202124]">{item.label}</p>
                      <p className="mt-0.5 text-xs text-[#9AA0A6]">{item.desc}</p>
                      <div className="mt-3">
                        <Toggle
                          checked={preferences[item.key]}
                          onChange={(v) => setPreferences((p) => ({ ...p, [item.key]: v }))}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {/* ══════════════════════════════════════════════════════════════════
              INTEGRATIONS TAB
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "integrations" ? (
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <h2 className="font-['Work_Sans',sans-serif] text-lg font-bold text-[#202124]">Integrations</h2>
              </div>

              <div className="rounded-xl border border-[#DADCE0] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden divide-y divide-[#F8F9FA]">
                {/* Google Calendar */}
                <div className="p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e8f0fe] text-sm font-bold text-[#4285f4]">G</div>
                      <div>
                        <p className="text-sm font-semibold text-[#202124]">Google Calendar</p>
                        <p className="text-xs text-[#5F6368]">Auto-detect and join scheduled meetings.</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#E6F4EA] px-2.5 py-1 text-[11px] font-semibold text-[#137333]">
                      <Check className="h-3 w-3" />
                      Connected
                    </span>
                  </div>
                </div>

                <div className="p-5">
                  <p className="text-sm text-[#5F6368]">
                    Configure Slack, Gmail, Notion, Jira, and more to run automatically after meetings complete.
                  </p>
                  <div className="mt-4">
                    <a
                      href="/dashboard/integrations"
                      className="inline-flex items-center gap-2 rounded-xl bg-[#6C3FF5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5B2FE0] transition"
                    >
                      Open Integrations
                      <ChevronRight className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {/* ══════════════════════════════════════════════════════════════════
              USAGE & LIMITS TAB
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "usage" ? (
            <section className="space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <h2 className="font-['Work_Sans',sans-serif] text-lg font-bold text-[#202124]">Usage &amp; Limits</h2>
                </div>
                <a
                  href="/dashboard/billing"
                  className="flex items-center gap-2 rounded-xl bg-[#6C3FF5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5B2FE0] transition"
                >
                  <Crown className="h-4 w-4" />
                  Upgrade Plan
                </a>
              </div>

              {/* Stats grid 2×3 */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {/* Meetings This Month */}
                <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#9AA0A6]">Meetings This Month</p>
                  <p className="mt-2 text-3xl font-bold text-[#202124]">{usageStats?.meetingsThisMonth ?? 0}</p>
                  <p className="mt-1 text-xs font-semibold text-[#EA4335]">
                    Limit {subscription?.limits.unlimited ? "∞" : meetingsLimit}
                  </p>
                  <div className="mt-3">
                    <ProgressBar
                      value={subscription?.limits.unlimited ? 0 : meetingUsagePercent}
                      colorClass={progressColor(meetingUsagePercent)}
                    />
                  </div>
                </div>

                {/* Meetings All Time */}
                <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#9AA0A6]">Meetings All Time</p>
                  <p className="mt-2 text-3xl font-bold text-[#202124]">{usageStats?.meetingsAllTime ?? 0}</p>
                  <p className="mt-1 text-xs text-[#5F6368]">total recorded</p>
                </div>

                {/* Transcripts */}
                <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#9AA0A6]">Transcripts</p>
                  <p className="mt-2 text-3xl font-bold text-[#202124]">{usageStats?.transcriptsGenerated ?? 0}</p>
                  <p className="mt-1 text-xs text-[#5F6368]">auto-generated</p>
                  <div className="mt-3">
                    <ProgressBar value={Math.min(100, (usageStats?.transcriptsGenerated ?? 0) * 10)} />
                  </div>
                </div>

                {/* Action Items */}
                <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#9AA0A6]">Action Items</p>
                  <p className="mt-2 text-3xl font-bold text-[#202124]">{usageStats?.actionItemsCreated ?? 0}</p>
                  <p className="mt-1 text-xs text-[#5F6368]">extracted by AI</p>
                  <div className="mt-3">
                    <ProgressBar value={Math.min(100, (usageStats?.actionItemsCreated ?? 0) * 5)} />
                  </div>
                </div>

                {/* Documents Analyzed */}
                <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#9AA0A6]">Documents Analyzed</p>
                  <p className="mt-2 text-3xl font-bold text-[#202124]">{usageStats?.documentsAnalyzed ?? 0}</p>
                  <p className="mt-1 text-xs text-[#5F6368]">uploaded files</p>
                  <div className="mt-3">
                    <ProgressBar value={Math.min(100, (usageStats?.documentsAnalyzed ?? 0) * 10)} />
                  </div>
                </div>

                {/* Member Since */}
                <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#9AA0A6]">Member Since</p>
                  <p className="mt-2 text-xl font-bold text-[#202124]">{memberSince}</p>
                  <p className="mt-1 text-xs text-[#5F6368]">account created</p>
                </div>
              </div>

              {/* Usage Monitor card */}
              <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <p className="text-sm font-semibold text-[#202124]">Usage Monitor</p>
                {meetingUsagePercent >= 75 && !subscription?.limits.unlimited && (
                  <div className="mt-3 flex items-start gap-2 rounded-xl bg-[#FEF7E0] px-4 py-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B06000]" />
                    <p className="text-xs text-[#B06000]">
                      You&apos;ve used {meetingUsagePercent}% of your monthly meeting limit. Consider upgrading your plan.
                    </p>
                  </div>
                )}
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-[#202124]">Meetings usage</span>
                    <span className="font-semibold text-[#202124]">
                      {meetingsUsed} / {subscription?.limits.unlimited ? "∞" : meetingsLimit} meetings
                    </span>
                  </div>
                  <ProgressBar
                    value={subscription?.limits.unlimited ? 0 : meetingUsagePercent}
                    colorClass={progressColor(meetingUsagePercent)}
                  />
                  {subscription?.planEndsAt && (
                    <p className="text-xs text-[#9AA0A6]">Resets on {formatDate(planEndsAt)}</p>
                  )}
                </div>
              </div>

              {/* Feature Entitlements */}
              <div className="rounded-xl border border-[#DADCE0] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
                <div className="border-b border-[#DADCE0] px-5 py-4">
                  <p className="text-sm font-semibold text-[#202124]">Feature Entitlements</p>
                  <p className="mt-0.5 text-xs text-[#9AA0A6]">What&apos;s enabled on your current plan.</p>
                </div>
                <div className="divide-y divide-[#F8F9FA]">
                  {[
                    { label: "Meeting Bot",      key: "meetingBot" as const,      icon: "smart_toy",    desc: "AI bot joins your meetings automatically" },
                    { label: "Transcription",    key: "transcription" as const,   icon: "transcribe",   desc: "Real-time speech-to-text transcription" },
                    { label: "AI Summary",       key: "summary" as const,         icon: "summarize",    desc: "Automatic meeting summaries" },
                    { label: "Action Items",     key: "actionItems" as const,     icon: "task_alt",     desc: "AI-extracted tasks and follow-ups" },
                    { label: "Meeting History",  key: "history" as const,         icon: "history",      desc: "Access past meetings and recordings" },
                  ].map((feature) => {
                    const enabled = subscription?.limits[feature.key] ?? false;
                    return (
                      <div key={feature.key} className="flex items-center gap-4 px-5 py-4">
                        <div className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                          enabled ? "bg-[#EDE9FE]" : "bg-[#F8F9FA]"
                        )}>
                          <MSIcon
                            name={feature.icon}
                            className={cn("text-[18px] leading-none", enabled ? "text-[#6C3FF5]" : "text-[#9AA0A6]")}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[#202124]">{feature.label}</p>
                          <p className="text-xs text-[#9AA0A6]">{feature.desc}</p>
                        </div>
                        {enabled ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#E6F4EA] px-2.5 py-0.5 text-[11px] font-semibold text-[#137333]">
                            <Check className="h-3 w-3" />
                            Enabled
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-[#F8F9FA] px-2.5 py-0.5 text-[11px] font-semibold text-[#9AA0A6]">
                            Pro Plan Only
                          </span>
                        )}
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between px-5 py-4">
                    <p className="text-sm font-medium text-[#202124]">Meetings per month</p>
                    <p className="text-sm font-semibold text-[#202124]">
                      {subscription?.limits.unlimited ? "Unlimited" : meetingsLimit}
                    </p>
                  </div>
                </div>
              </div>

              {/* Delete data */}
              <div className="flex items-center justify-between gap-4 rounded-xl border border-[#FCE8E6] bg-[#FCE8E6]/30 px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-[#EA4335]">Delete All Meeting Data</p>
                  <p className="mt-1 text-xs text-[#5F6368]">Permanently removes all transcripts, summaries, and action items.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDeleteDataOpen(true)}
                  className="flex items-center gap-2 rounded-xl border border-[#EA4335] px-4 py-2 text-sm font-semibold text-[#EA4335] transition hover:bg-[#FCE8E6] whitespace-nowrap"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Data
                </button>
              </div>
            </section>
          ) : null}

        </div>{/* end main content */}
      </div>{/* end flex layout */}

      {/* ── Sticky save bar (Preferences) ── */}
      {activeTab === "preferences" && prefsChanged ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#DADCE0] bg-white px-6 py-3 shadow-[0_-1px_4px_rgba(0,0,0,0.08)]">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
            <p className="text-sm text-[#5F6368]">You have unsaved changes…</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPreferences(savedPreferences)}
                className="rounded-xl border border-[#DADCE0] px-4 py-2 text-sm font-semibold text-[#5F6368] hover:bg-[#F8F9FA] transition"
              >
                Reset to Defaults
              </button>
              <button
                type="button"
                disabled={isSavingPrefs}
                onClick={() => void savePreferences()}
                className="rounded-xl bg-[#6C3FF5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5B2FE0] disabled:opacity-50 transition"
              >
                {isSavingPrefs ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
