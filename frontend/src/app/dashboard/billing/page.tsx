"use client";

import Script from "next/script";
import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Download, Sparkles, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { planDefinitions } from "@/lib/subscription";
import { useApiFetch, useIsAuthReady } from "@/hooks/useApiFetch";

type SubscriptionResponse = {
  success: true;
  plan: keyof typeof planDefinitions;
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
    teamWorkspace?: boolean;
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

const featureRows = [
  { feature: "Email Generator",  free: true,  pro: true,  elite: true  },
  { feature: "Task Generator",   free: true,  pro: true,  elite: true  },
  { feature: "Document Analyzer",free: true,  pro: true,  elite: true  },
  { feature: "Meeting Bot",      free: false, pro: true,  elite: true  },
  { feature: "Transcription",    free: false, pro: true,  elite: true  },
  { feature: "Auto Summary",     free: false, pro: true,  elite: true  },
  { feature: "Action Items",     free: false, pro: true,  elite: true  },
  { feature: "Meeting History",  free: false, pro: true,  elite: true  },
  { feature: "Meetings/month",   free: "7",   pro: "20",  elite: "∞"   },
  { feature: "Priority Support", free: false, pro: false, elite: true  },
  { feature: "Team Workspace",   free: false, pro: false, elite: true  },
] as const;

type PlanCard = {
  id: "trial" | "free" | "pro" | "elite";
  name: string;
  price: number;
  badge?: string | null;
  badgeTone?: "neutral" | "accent" | "pending" | "dark";
  description: string;
  features: string[];
  limits: SubscriptionResponse["limits"];
  sortOrder?: number;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
}

type BillingFeedbackModal =
  | null
  | { variant: "success"; planLabel: string }
  | { variant: "error"; title: string; message: string };

function BillingFeedbackModalView({
  state,
  onDismiss,
}: {
  state: BillingFeedbackModal;
  onDismiss: () => void;
}) {
  if (!state) return null;
  const isSuccess = state.variant === "success";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="billing-feedback-title"
    >
      <div className="w-full max-w-md rounded-xl border border-[#DADCE0] bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                isSuccess ? "bg-[#E6F4EA] text-[#137333]" : "bg-[#FCE8E6] text-[#C5221F]"
              )}
            >
              {isSuccess ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            </div>
            <div>
              <h2 id="billing-feedback-title" className="text-base font-semibold text-[#202124]">
                {isSuccess ? "Payment successful" : state.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#5F6368]">
                {isSuccess
                  ? `You're now on the ${state.planLabel} plan. Your subscription is active.`
                  : state.message}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 text-[#9AA0A6] transition hover:text-[#5F6368]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className={cn(
              "rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition",
              isSuccess ? "bg-[#6C3FF5] hover:bg-[#5B2FE0]" : "border border-[#DADCE0] bg-white text-[#202124] hover:bg-[#F8F9FA]"
            )}
          >
            {isSuccess ? "Continue" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FeatureValue({ value, highlight }: { value: boolean | string; highlight?: boolean }) {
  if (value === true) return (
    <span className="flex justify-center">
      <Check className={cn("h-4 w-4", highlight ? "text-[#6C3FF5]" : "text-[#34A853]")} />
    </span>
  );
  if (value === false) return <span className="flex justify-center text-[#DADCE0]">—</span>;
  return <span className={cn("flex justify-center text-xs font-semibold", highlight ? "text-[#6C3FF5]" : "text-[#5F6368]")}>{value}</span>;
}

export default function BillingPage() {
  const { user } = useUser();
  const apiFetch = useApiFetch();
  const isAuthReady = useIsAuthReady();
  const [subscription, setSubscription] = useState<SubscriptionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<"pro" | "elite" | null>(null);
  const [plans, setPlans] = useState<PlanCard[] | null>(null);
  const [billingFeedback, setBillingFeedback] = useState<BillingFeedbackModal>(null);

  function dismissBillingFeedback() {
    const wasSuccess = billingFeedback?.variant === "success";
    setBillingFeedback(null);
    if (wasSuccess) window.location.reload();
  }

  useEffect(() => {
    if (!isAuthReady) return;
    let isMounted = true;
    async function load() {
      setIsLoading(true); setError(null);
      try {
        const [res, plansRes] = await Promise.all([
          apiFetch("/api/subscription", { cache: "no-store" }),
          apiFetch("/api/subscription/plans", { cache: "no-store" }),
        ]);
        const payload = await res.json() as SubscriptionResponse | { success?: false; message?: string };
        if (!isMounted) return;
        if (!res.ok || !("success" in payload) || !payload.success) {
          throw new Error("message" in payload ? payload.message || "Failed to load." : "Failed to load.");
        }
        setSubscription(payload);

        if (plansRes.ok) {
          const p = await plansRes.json() as { success?: boolean; plans?: PlanCard[] };
          if (p.success && Array.isArray(p.plans)) {
            const sorted = [...p.plans].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
            setPlans(sorted);
          }
        }
      } catch (e) {
        if (isMounted) setError(e instanceof Error ? e.message : "Failed to load billing data.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    void load();
    return () => { isMounted = false; };
  }, [isAuthReady]);

  const currentPlan = subscription?.plan ?? "free";
  const currentPlanDef = planDefinitions[currentPlan];
  const planCards = plans ?? (["free", "pro", "elite"] as const).map((id) => ({
    id,
    name: planDefinitions[id].name,
    price: planDefinitions[id].price,
    badge: planDefinitions[id].badge,
    badgeTone: planDefinitions[id].badgeTone,
    description: planDefinitions[id].description,
    features: planDefinitions[id].features,
    limits: subscription?.limits ?? planDefinitions[id].limits,
    sortOrder: 0,
  }));

  const trialProgress = useMemo(() => {
    if (!subscription || subscription.plan !== "trial") return 0;
    const started = new Date(subscription.trialStartedAt).getTime();
    const ended = new Date(subscription.trialEndsAt).getTime();
    const total = Math.max(ended - started, 1);
    return Math.min(100, Math.max(0, Math.round(((Date.now() - started) / total) * 100)));
  }, [subscription]);

  async function handleUpgrade(plan: "pro" | "elite") {
    try {
      setActivePlan(plan);
      const res = await apiFetch("/api/payment/create-order", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json() as { success: true; orderId: string; amount: number; currency: string; keyId: string } | { success?: false; message?: string };
      if (!("success" in data) || !data.success) {
        setBillingFeedback({
          variant: "error",
          title: "Couldn't start checkout",
          message: "message" in data && data.message ? data.message : "Failed to create order.",
        });
        setActivePlan(null);
        return;
      }
      if (!(window as unknown as Record<string, unknown>).Razorpay) {
        await new Promise<void>((resolve) => {
          const s = document.createElement("script");
          s.src = "https://checkout.razorpay.com/v1/checkout.js";
          s.onload = () => resolve();
          document.body.appendChild(s);
        });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rzp = new (window as any).Razorpay({
        key: data.keyId, amount: data.amount, currency: data.currency,
        name: "Artivaa", description: `${plan} Plan - Monthly`, order_id: data.orderId,
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          const v = await apiFetch("/api/payment/verify", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...response, plan }),
          });
          const vd = await v.json() as { success?: boolean; message?: string };
          setActivePlan(null);
          if (vd.success) {
            const planLabel = plan === "elite" ? "Elite" : "Pro";
            setBillingFeedback({ variant: "success", planLabel });
          } else {
            setBillingFeedback({
              variant: "error",
              title: "Verification failed",
              message: vd.message ?? "We couldn't confirm your payment. If you were charged, contact support.",
            });
          }
        },
        prefill: { name: user?.fullName || "", email: user?.primaryEmailAddress?.emailAddress || "" },
        theme: { color: "#6C3FF5" },
        modal: { ondismiss: () => setActivePlan(null) },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rzp.on("payment.failed", (r: any) => {
        setActivePlan(null);
        setBillingFeedback({
          variant: "error",
          title: "Payment failed",
          message: r?.error?.description ?? "Your payment did not go through. You can try again.",
        });
      });
      rzp.open();
    } catch (e) {
      setBillingFeedback({
        variant: "error",
        title: "Something went wrong",
        message: e instanceof Error ? e.message : "Unknown error.",
      });
      setActivePlan(null);
    }
  }

  return (
    <div className="space-y-6">
      <BillingFeedbackModalView state={billingFeedback} onDismiss={dismissBillingFeedback} />
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />

      {/* Page header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-[#6C3FF5]">Billing</p>
        <h1 className="mt-1 text-[22px] font-bold text-[#202124]" style={{ fontFamily: "'Work Sans', sans-serif" }}>
          Choose your Artivaa plan
        </h1>
        <p className="mt-1 text-sm text-[#5F6368]">
          Free keeps the writing tools open. Pro unlocks meeting intelligence. Elite adds unlimited meetings.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-64 animate-pulse rounded-xl bg-white border border-[#DADCE0]" />)}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-[#FCE8E6] bg-[#FCE8E6] p-5">
          <p className="text-sm font-semibold text-[#C5221F]">Unable to load billing data</p>
          <p className="mt-1 text-sm text-[#C5221F]">{error}</p>
        </div>
      ) : subscription ? (
        <div className="space-y-6">

          {/* Active plan banner */}
          <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-[#EDE9FE] px-2.5 py-0.5 text-xs font-semibold text-[#6C3FF5]">
                    {currentPlanDef.name}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-[#E6F4EA] px-2.5 py-0.5 text-xs font-semibold text-[#137333]">
                    {subscription.status}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-[#202124]">{currentPlanDef.name} plan is active</h2>
                <p className="text-sm text-[#5F6368]">
                  {currentPlan === "trial"
                    ? `${subscription.trialDaysLeft} days left in your free trial.`
                    : currentPlan === "free"
                      ? "Upgrade to unlock meeting features."
                      : subscription.planEndsAt
                        ? `Renews on ${formatDate(subscription.planEndsAt)}.`
                        : "Your subscription is active."}
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-1 rounded-xl border border-[#DADCE0] bg-[#F8F9FA] px-5 py-4 min-w-[200px]">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#5F6368]">
                  <span className="material-symbols-outlined text-[#6C3FF5] text-[16px]">videocam</span>
                  Meetings used this month
                </div>
                <div className="flex items-end justify-between">
                  <p className="text-3xl font-bold text-[#202124]">{subscription.meetingsUsedThisMonth}</p>
                  <p className="text-sm text-[#9AA0A6]">/ {subscription.limits.unlimited ? "∞" : subscription.limits.meetingsPerMonth}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Trial progress */}
          {subscription.plan === "trial" && (
            <div className="rounded-xl border border-[#FEF7E0] bg-[#FFFDF5] p-5">
              <div className="flex items-center gap-2 text-[#B06000]">
                <Sparkles className="h-4 w-4" />
                <p className="text-sm font-semibold">Free Trial — full access until {formatDate(subscription.trialEndsAt)}</p>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#FEF7E0]">
                <div className="h-full rounded-full bg-[#B06000] transition-all" style={{ width: `${trialProgress}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-[#B06000]">{trialProgress}% of trial elapsed</p>
            </div>
          )}

          {/* Plan cards */}
          <div className="grid gap-4 xl:grid-cols-3">
            {planCards.filter((p) => p.id !== "trial").map((plan) => {
              const isCurrent = currentPlan === plan.id;
              const isPopular = plan.id === "pro";

              return (
                <div
                  key={plan.id}
                  className={cn(
                    "group relative flex flex-col rounded-xl border bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all",
                    isCurrent
                      ? "border-[#6C3FF5] shadow-md shadow-[#6C3FF5]/10"
                      : "border-[#DADCE0] hover:border-[#6C3FF5]/40 hover:shadow-md hover:shadow-[#6C3FF5]/10"
                  )}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="rounded-full bg-[#B06000] px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
                        Most Popular
                      </span>
                    </div>
                  )}

                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-[#202124]">{plan.name}</h3>
                      <p className="mt-0.5 text-xs text-[#5F6368]">{plan.description}</p>
                    </div>
                    {isCurrent && (
                      <span className="rounded-full bg-[#EDE9FE] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#6C3FF5]">
                        Current
                      </span>
                    )}
                  </div>

                  {/* Price */}
                  <div className="mt-4 flex items-end gap-1">
                    <span className="text-3xl font-bold text-[#202124]">₹{plan.price}</span>
                    <span className="mb-0.5 text-sm text-[#9AA0A6]">/month</span>
                  </div>

                  {/* Features */}
                  <ul className="mt-4 flex-1 space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-[#5F6368]">
                        <Check className="h-3.5 w-3.5 shrink-0 text-[#34A853]" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <div className="mt-5 border-t border-[#DADCE0] pt-4">
                    {isCurrent ? (
                      <div className="flex h-10 items-center justify-center rounded-xl border border-[#6C3FF5] text-sm font-semibold text-[#6C3FF5]">
                        Current Plan
                      </div>
                    ) : plan.id === "free" ? (
                      <button
                        disabled
                        className="flex h-10 w-full items-center justify-center rounded-xl border border-[#DADCE0] text-sm font-semibold text-[#9AA0A6]"
                      >
                        Downgrade
                      </button>
                    ) : (
                      <button
                        onClick={() => void handleUpgrade(plan.id as "pro" | "elite")}
                        disabled={activePlan === (plan.id as "pro" | "elite")}
                        className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#6C3FF5] text-sm font-semibold text-white transition hover:bg-[#5B2FE0] disabled:opacity-60"
                      >
                        {activePlan === (plan.id as "pro" | "elite") ? "Opening checkout…" : `Upgrade to ${plan.name}`}
                        {activePlan !== (plan.id as "pro" | "elite") && <ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Feature comparison */}
          <div className="overflow-hidden rounded-xl border border-[#DADCE0] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <div className="border-b border-[#DADCE0] px-6 py-4">
              <p className="text-sm font-semibold text-[#202124]">Feature comparison</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[#DADCE0] bg-[#F8F9FA]">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#9AA0A6]">Feature</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[#9AA0A6]">Free</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[#6C3FF5]">Pro</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[#9AA0A6]">Elite</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F8F9FA]">
                  {featureRows.map((row) => (
                    <tr key={row.feature} className="hover:bg-[#F8F9FA] transition-colors">
                      <td className="px-6 py-3 text-sm font-medium text-[#202124]">{row.feature}</td>
                      <td className="px-6 py-3"><FeatureValue value={row.free} /></td>
                      <td className="px-6 py-3 bg-[#EDE9FE]/20"><FeatureValue value={row.pro} highlight /></td>
                      <td className="px-6 py-3"><FeatureValue value={row.elite} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment history */}
          <div className="overflow-hidden rounded-xl border border-[#DADCE0] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <div className="border-b border-[#DADCE0] px-6 py-4">
              <p className="text-sm font-semibold text-[#202124]">Payment history</p>
            </div>
            {subscription.payments.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-[#9AA0A6]">No payment history yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#DADCE0] bg-[#F8F9FA]">
                      {["Date", "Plan", "Amount", "Status", "Invoice"].map((h) => (
                        <th key={h} className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#9AA0A6]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F8F9FA]">
                    {subscription.payments.map((p) => (
                      <tr key={p.id} className="hover:bg-[#F8F9FA] transition-colors">
                        <td className="px-6 py-3 text-[#5F6368]">{formatDate(p.date)}</td>
                        <td className="px-6 py-3 font-medium text-[#202124]">{p.plan}</td>
                        <td className="px-6 py-3 text-[#5F6368]">{formatCurrency(p.amount / 100)}</td>
                        <td className="px-6 py-3">
                          <span className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                            p.status === "paid"
                              ? "bg-[#E6F4EA] text-[#137333]"
                              : "bg-[#F1F3F4] text-[#5F6368]"
                          )}>
                            {p.status === "paid" && <Check className="h-3 w-3" />}
                            {p.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          {p.invoice ? (
                            <a href={p.invoice} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-[#6C3FF5] hover:text-[#5B2FE0] transition-colors">
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
            )}
          </div>

        </div>
      ) : null}

      {/* Help footer */}
      <div className="rounded-xl border border-[#DADCE0] bg-white px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#202124]">
          <span className="material-symbols-outlined text-[#6C3FF5] text-[18px]">help_outline</span>
          Need help choosing?
        </div>
        <p className="mt-1.5 text-sm text-[#5F6368]">
          Free users keep unlimited access to the three core generators. Pro unlocks the AI Notetaker. Elite removes meeting caps.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href="/dashboard/meetings"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#DADCE0] bg-white px-4 py-2 text-sm font-semibold text-[#5F6368] hover:bg-[#F8F9FA] transition-colors">
            View meetings <ArrowRight className="h-3.5 w-3.5" />
          </a>
          <a href="/dashboard/tools"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#F8F9FA] px-4 py-2 text-sm font-semibold text-[#5F6368] hover:bg-[#F1F3F4] transition-colors">
            Explore tools <Zap className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
