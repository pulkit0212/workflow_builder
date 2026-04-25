"use client";

import Script from "next/script";
import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { ArrowRight, Check, Clock3, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
  { feature: "Email Generator", free: true, pro: true, elite: true },
  { feature: "Task Generator", free: true, pro: true, elite: true },
  { feature: "Document Analyzer", free: true, pro: true, elite: true },
  { feature: "Meeting Bot", free: false, pro: true, elite: true },
  { feature: "Transcription", free: false, pro: true, elite: true },
  { feature: "Auto Summary", free: false, pro: true, elite: true },
  { feature: "Action Items", free: false, pro: true, elite: true },
  { feature: "Meeting History", free: false, pro: true, elite: true },
  { feature: "Meetings/month", free: "3", pro: "10", elite: "∞" },
  { feature: "Priority Support", free: false, pro: false, elite: true },
  { feature: "Team Workspace", free: false, pro: false, elite: "Soon" }
] as const;

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
}

function FeatureValue({ value }: { value: boolean | string }) {
  if (value === true) return <Check className="h-4 w-4 text-emerald-500" />;
  if (value === false) return <span className="text-slate-300">—</span>;
  return <span className="text-xs font-semibold text-slate-500">{value}</span>;
}

export default function BillingPage() {
  const { user } = useUser();
  const apiFetch = useApiFetch();
  const isAuthReady = useIsAuthReady();
  const [subscription, setSubscription] = useState<SubscriptionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<"pro" | "elite" | null>(null);

  useEffect(() => {
    if (!isAuthReady) return;
    let isMounted = true;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await apiFetch("/api/subscription", { cache: "no-store" });
        const payload = await res.json() as SubscriptionResponse | { success?: false; message?: string };
        if (!isMounted) return;
        if (!res.ok || !("success" in payload) || !payload.success) {
          throw new Error("message" in payload ? payload.message || "Failed to load." : "Failed to load.");
        }
        setSubscription(payload);
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
        body: JSON.stringify({ plan })
      });
      const data = await res.json() as { success: true; orderId: string; amount: number; currency: string; keyId: string } | { success?: false; message?: string };
      if (!("success" in data) || !data.success) {
        alert("Payment error: " + ("message" in data ? data.message : "Failed to create order"));
        setActivePlan(null); return;
      }
      if (!(window as any).Razorpay) {
        await new Promise<void>((resolve) => {
          const s = document.createElement("script");
          s.src = "https://checkout.razorpay.com/v1/checkout.js";
          s.onload = () => resolve();
          document.body.appendChild(s);
        });
      }
      const rzp = new (window as any).Razorpay({
        key: data.keyId, amount: data.amount, currency: data.currency,
        name: "Artivaa", description: `${plan} Plan - Monthly`, order_id: data.orderId,
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          const v = await apiFetch("/api/payment/verify", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...response, plan })
          });
          const vd = await v.json() as { success?: boolean; message?: string };
          if (vd.success) { alert(`🎉 You are now on ${plan} plan.`); window.location.reload(); }
          else alert("Verification failed: " + vd.message);
        },
        prefill: { name: user?.fullName || "", email: user?.primaryEmailAddress?.emailAddress || "" },
        theme: { color: "#6c63ff" },
        modal: { ondismiss: () => setActivePlan(null) }
      });
      rzp.on("payment.failed", (r: any) => { alert("Payment failed: " + r.error.description); setActivePlan(null); });
      rzp.open();
    } catch (e) {
      alert("Error: " + (e instanceof Error ? e.message : "Unknown error"));
      setActivePlan(null);
    }
  }

  return (
    <div className="space-y-8">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />

      {/* Page header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-[#6c63ff]">Billing</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Choose your Artivaa plan</h1>
        <p className="mt-1 text-sm text-slate-400">Free keeps the writing tools open. Pro unlocks meeting intelligence. Elite adds unlimited meetings.</p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-64 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <p className="text-sm font-semibold text-red-700">Unable to load billing data</p>
          <p className="mt-1 text-sm text-red-500">{error}</p>
        </div>
      ) : subscription ? (
        <div className="space-y-8">

          {/* Active plan banner */}
          <div className="rounded-2xl border border-[#6c63ff]/20 bg-gradient-to-br from-[#faf9ff] to-white p-6 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-[#6c63ff]/10 px-2.5 py-0.5 text-xs font-semibold text-[#6c63ff] ring-1 ring-[#6c63ff]/20">
                    {currentPlanDef.name}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                    {subscription.status}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-slate-900">{currentPlanDef.name} plan is active</h2>
                <p className="text-sm text-slate-400">
                  {currentPlan === "trial"
                    ? `${subscription.trialDaysLeft} days left in your free trial.`
                    : currentPlan === "free"
                      ? "Upgrade to unlock meeting features."
                      : subscription.planEndsAt
                        ? `Renews on ${formatDate(subscription.planEndsAt)}.`
                        : "Your subscription is active."}
                </p>
              </div>
              <div className="flex min-w-[200px] flex-col gap-1 rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#6c63ff]" />
                  Meetings used this month
                </div>
                <div className="flex items-end justify-between">
                  <p className="text-3xl font-bold text-slate-900">{subscription.meetingsUsedThisMonth}</p>
                  <p className="text-sm text-slate-400">/ {subscription.limits.unlimited ? "∞" : subscription.limits.meetingsPerMonth}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Trial progress */}
          {subscription.plan === "trial" && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-center gap-2 text-amber-700">
                <Sparkles className="h-4 w-4" />
                <p className="text-sm font-semibold">Free Trial — full access until {formatDate(subscription.trialEndsAt)}</p>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-amber-100">
                <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${trialProgress}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-amber-600">{trialProgress}% of trial elapsed</p>
            </div>
          )}

          {/* Plan cards */}
          <div className="grid gap-4 xl:grid-cols-3">
            {(["free", "pro", "elite"] as const).map((planId) => {
              const plan = planDefinitions[planId];
              const isCurrent = currentPlan === planId;
              const isPopular = planId === "pro";

              return (
                <div
                  key={planId}
                  className={cn(
                    "group relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm transition-all",
                    isCurrent
                      ? "border-[#6c63ff]/40 bg-[#faf9ff] shadow-md shadow-[#6c63ff]/10"
                      : "border-slate-200 hover:border-[#6c63ff]/40 hover:bg-[#faf9ff] hover:shadow-lg hover:shadow-[#6c63ff]/10"
                  )}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="rounded-full bg-amber-400 px-3 py-0.5 text-xs font-bold text-white shadow-sm">Most Popular</span>
                    </div>
                  )}

                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                    {isCurrent && (
                      <span className="rounded-full bg-[#6c63ff]/10 px-2 py-0.5 text-[11px] font-semibold text-[#6c63ff] ring-1 ring-[#6c63ff]/20">Current</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-400">{plan.description}</p>

                  {/* Price */}
                  <div className="mt-4 flex items-end gap-1">
                    <span className="text-3xl font-bold text-slate-900">₹{plan.price}</span>
                    <span className="mb-0.5 text-sm text-slate-400">/month</span>
                  </div>

                  {/* Features */}
                  <ul className="mt-5 flex-1 space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2.5 text-sm text-slate-600">
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <div className="mt-6 border-t border-slate-100 pt-5">
                    {isCurrent ? (
                      <div className="flex h-10 items-center justify-center rounded-xl bg-slate-100 text-sm font-semibold text-slate-400">
                        Current Plan
                      </div>
                    ) : planId === "free" ? (
                      <button
                        disabled
                        className="flex h-10 w-full items-center justify-center rounded-xl border border-slate-200 text-sm font-semibold text-slate-400"
                      >
                        Downgrade
                      </button>
                    ) : (
                      <button
                        onClick={() => void handleUpgrade(planId)}
                        disabled={activePlan === planId}
                        className={cn(
                          "flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60",
                          planId === "pro" ? "bg-[#6c63ff] hover:bg-[#5b52e0]" : "bg-slate-900 hover:bg-slate-800"
                        )}
                      >
                        {activePlan === planId ? "Opening checkout…" : `Upgrade to ${plan.name}`}
                        {activePlan !== planId && <ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Feature comparison */}
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-4">
              <p className="text-sm font-semibold text-slate-800">Feature comparison</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500">Feature</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500">Free</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-[#6c63ff]">Pro</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500">Elite</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {featureRows.map((row) => (
                    <tr key={row.feature} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 text-sm font-medium text-slate-700">{row.feature}</td>
                      <td className="px-6 py-3"><FeatureValue value={row.free} /></td>
                      <td className="px-6 py-3"><FeatureValue value={row.pro} /></td>
                      <td className="px-6 py-3"><FeatureValue value={row.elite} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Payment history */}
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-4">
              <p className="text-sm font-semibold text-slate-800">Payment history</p>
            </div>
            {subscription.payments.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-slate-400">No payment history yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {["Date", "Plan", "Amount", "Status", "Invoice"].map((h) => (
                        <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {subscription.payments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-3 text-slate-600">{formatDate(p.date)}</td>
                        <td className="px-6 py-3 font-medium text-slate-800">{p.plan}</td>
                        <td className="px-6 py-3 text-slate-600">{formatCurrency(p.amount / 100)}</td>
                        <td className="px-6 py-3">
                          <span className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
                            p.status === "paid"
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                              : "bg-slate-100 text-slate-500 ring-slate-200"
                          )}>{p.status}</span>
                        </td>
                        <td className="px-6 py-3 text-[#6c63ff]">{p.invoice}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

        </div>
      ) : null}

      {/* Help footer */}
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Clock3 className="h-4 w-4 text-[#6c63ff]" />
          Need help choosing?
        </div>
        <p className="mt-1.5 text-sm text-slate-400">
          Free users keep unlimited access to the three core generators. Pro unlocks the AI Notetaker. Elite removes meeting caps.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href="/dashboard/meetings"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
            View meetings <ArrowRight className="h-3.5 w-3.5" />
          </a>
          <a href="/dashboard/tools"
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 transition-colors">
            Explore tools <Zap className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
