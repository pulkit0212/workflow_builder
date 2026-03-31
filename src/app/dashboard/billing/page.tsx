"use client";

import Script from "next/script";
import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import {
  ArrowRight,
  Check,
  Clock3,
  Crown,
  ShieldCheck,
  Sparkles,
  Zap
} from "lucide-react";
import { SectionHeader } from "@/components/shared/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { planDefinitions } from "@/lib/subscription";

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

type PlanId = "free" | "pro" | "elite" | "trial";

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
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function renderFeatureValue(value: boolean | string) {
  if (value === true) {
    return <Check className="h-4 w-4 text-[#16a34a]" />;
  }

  if (value === false) {
    return <span className="text-[#ef4444]">✕</span>;
  }

  return <span className="font-semibold text-[#6b7280]">{value}</span>;
}

function planButtonStyle(plan: PlanId) {
  switch (plan) {
    case "pro":
      return "bg-[#6c63ff] text-white hover:bg-[#5b52ee]";
    case "elite":
      return "bg-[#1f1147] text-white hover:bg-[#140b33]";
    default:
      return "bg-[#f3f4f6] text-[#374151]";
  }
}

export default function BillingPage() {
  const { user } = useUser();
  const [subscription, setSubscription] = useState<SubscriptionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<"pro" | "elite" | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadSubscription() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/subscription", { cache: "no-store" });
        const payload = (await response.json()) as SubscriptionResponse | { success?: false; message?: string };

        if (!isMounted) {
          return;
        }

        if (!response.ok || !("success" in payload) || !payload.success) {
          throw new Error("message" in payload ? payload.message || "Failed to load billing data." : "Failed to load billing data.");
        }

        setSubscription(payload);
      } catch (fetchError) {
        if (isMounted) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load billing data.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadSubscription();

    return () => {
      isMounted = false;
    };
  }, []);

  const currentPlan = subscription?.plan ?? "free";
  const currentPlanDefinition = planDefinitions[currentPlan];
  const trialProgress = useMemo(() => {
    if (!subscription || subscription.plan !== "trial") {
      return 0;
    }

    const started = new Date(subscription.trialStartedAt).getTime();
    const ended = new Date(subscription.trialEndsAt).getTime();
    const total = Math.max(ended - started, 1);
    const elapsed = Math.min(Date.now() - started, total);
    return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
  }, [subscription]);

  async function handleUpgrade(plan: "pro" | "elite") {
    try {
      setActivePlan(plan);

      const res = await fetch("/api/payment/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan })
      });

      const data = (await res.json()) as
        | { success: true; orderId: string; amount: number; currency: string; keyId: string }
        | { success?: false; message?: string };

      if (!("success" in data) || !data.success) {
        window.alert("Payment error: " + ("message" in data ? data.message : "Failed to create payment order"));
        setActivePlan(null);
        return;
      }

      if (!window.Razorpay) {
        await new Promise<void>((resolve) => {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.onload = () => resolve();
          document.body.appendChild(script);
        });
      }

      const options = {
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        name: "Artiva",
        description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan - Monthly`,
        order_id: data.orderId,
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          const verifyRes = await fetch("/api/payment/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...response, plan })
          });

          const verifyData = (await verifyRes.json()) as { success?: boolean; message?: string };

          if (verifyData.success) {
            window.alert(`🎉 Payment successful! You are now on ${plan} plan.`);
            window.location.reload();
          } else {
            window.alert("Payment verification failed: " + verifyData.message);
          }
        },
        prefill: {
          name: user?.fullName || "",
          email: user?.primaryEmailAddress?.emailAddress || ""
        },
        theme: {
          color: "#6c63ff"
        },
        modal: {
          ondismiss: () => setActivePlan(null)
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (response: any) => {
        window.alert("Payment failed: " + response.error.description);
        setActivePlan(null);
      });
      rzp.open();
    } catch (upgradeError) {
      console.error("Payment error:", upgradeError);
      window.alert(
        "Something went wrong: " +
          (upgradeError instanceof Error ? upgradeError.message : "Failed to create payment order.")
      );
      setActivePlan(null);
    }
  }

  return (
    <div className="space-y-8">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />

      <SectionHeader
        eyebrow="Billing"
        title="Choose your Artiva plan"
        description="Free keeps the writing tools open. Pro unlocks meeting intelligence. Elite adds unlimited meetings and priority support."
      />

      {isLoading ? (
        <Card className="p-6">
          <div className="space-y-4">
            <div className="shimmer h-5 w-40 rounded-full" />
            <div className="shimmer h-28 rounded-3xl" />
            <div className="grid gap-4 md:grid-cols-3">
              {[0, 1, 2].map((index) => (
                <div key={index} className="shimmer h-64 rounded-3xl" />
              ))}
            </div>
          </div>
        </Card>
      ) : error ? (
        <Card className="border-[#fecaca] bg-[#fef2f2] p-6">
          <p className="font-semibold text-[#991b1b]">Unable to load billing data</p>
          <p className="mt-2 text-sm text-[#991b1b]">{error}</p>
        </Card>
      ) : subscription ? (
        <div className="space-y-8">
          <Card className="overflow-hidden border-[#dbeafe] bg-gradient-to-r from-[#eff6ff] via-white to-[#f5f3ff] p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={currentPlan === "elite" ? "accent" : currentPlan === "pro" ? "available" : "neutral"}>
                    {currentPlanDefinition.name}
                  </Badge>
                  <Badge variant="pending">{subscription.status}</Badge>
                </div>
                <h2 className="text-[28px] font-bold tracking-tight text-[#111827]">
                  {currentPlanDefinition.name} plan is active
                </h2>
                <p className="max-w-2xl text-sm leading-6 text-[#4b5563]">
                  {currentPlan === "trial"
                    ? `You have ${subscription.trialDaysLeft} days left in your free trial.`
                    : currentPlan === "free"
                      ? "Upgrade to unlock meeting features."
                      : subscription.planEndsAt
                        ? `Renews on ${formatDate(subscription.planEndsAt)}.`
                        : "Your subscription is active."}
                </p>
              </div>
              <div className="grid min-w-[220px] gap-3 rounded-3xl border border-white/70 bg-white/80 p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#111827]">
                  <ShieldCheck className="h-4 w-4 text-[#6c63ff]" />
                  Meetings used this month
                </div>
                <div className="flex items-end justify-between">
                  <p className="text-3xl font-bold text-[#111827]">{subscription.meetingsUsedThisMonth}</p>
                  <p className="text-sm text-[#6b7280]">
                    / {subscription.limits.unlimited ? "∞" : subscription.limits.meetingsPerMonth}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {subscription.plan === "trial" ? (
            <Card className="border-[#fde68a] bg-[#fffbeb] p-5">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-[#a16207]">
                  <Sparkles className="h-5 w-5" />
                  <p className="font-semibold">Free Trial</p>
                </div>
                <p className="text-sm text-[#92400e]">
                  You have full access to all features until {formatDate(subscription.trialEndsAt)}.
                </p>
                <div className="h-2 overflow-hidden rounded-full bg-[#fef3c7]">
                  <div className="h-full rounded-full bg-[#f59e0b]" style={{ width: `${trialProgress}%` }} />
                </div>
                <p className="text-xs text-[#a16207]">{trialProgress}% of your trial period has elapsed.</p>
              </div>
            </Card>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-3">
            {(["free", "pro", "elite"] as const).map((planId) => {
              const plan = planDefinitions[planId];
              const isCurrent = currentPlan === planId;

              return (
                <Card
                  key={planId}
                  className={cn(
                    "flex h-full flex-col p-6",
                    planId === "pro" && "border-[#c7d2fe] bg-gradient-to-b from-white to-[#f8f7ff]",
                    planId === "elite" && "border-[#ddd6fe] bg-gradient-to-b from-white to-[#f5f3ff]"
                  )}
                >
                  <div className="space-y-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <h3 className="text-2xl font-bold text-[#111827]">{plan.name}</h3>
                        <p className="text-sm leading-6 text-[#4b5563]">{plan.description}</p>
                      </div>
                      <Badge
                        variant={
                          planId === "elite"
                            ? "accent"
                            : planId === "pro"
                              ? "pending"
                              : "neutral"
                        }
                      >
                        {isCurrent ? "Current" : plan.badge}
                      </Badge>
                    </div>

                    <div className="flex items-end gap-2">
                      <p className="text-4xl font-bold text-[#111827]">₹{plan.price}</p>
                      <span className="pb-1 text-sm text-[#6b7280]">/month</span>
                    </div>

                    <div className="space-y-2">
                      {plan.features.map((feature) => (
                        <div key={feature} className="flex items-center gap-3 rounded-2xl bg-[#f9fafb] px-4 py-3 text-sm text-[#374151]">
                          <Check className="h-4 w-4 text-[#16a34a]" />
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>

                    <Button
                      type="button"
                      className="w-full"
                      variant={planId === "free" ? "outline" : "default"}
                      style={
                        planId === "pro"
                          ? { backgroundColor: "#6c63ff", color: "#ffffff" }
                          : planId === "elite"
                            ? { backgroundColor: "#1f1147", color: "#ffffff" }
                            : undefined
                      }
                      disabled={isCurrent || (planId === "free" && currentPlan === "free")}
                      onClick={() => {
                        if (planId === "pro" || planId === "elite") {
                          void handleUpgrade(planId);
                        }
                      }}
                    >
                      {isCurrent
                        ? "Current Plan"
                        : planId === "free"
                          ? "Downgrade"
                          : activePlan === planId
                            ? "Opening checkout..."
                            : `Upgrade to ${plan.name} →`}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-[#e5e7eb] px-6 py-4">
              <h2 className="text-lg font-semibold text-[#111827]">Feature comparison</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#f9fafb] text-[#6b7280]">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Feature</th>
                    <th className="px-6 py-4 font-semibold">Free</th>
                    <th className="px-6 py-4 font-semibold">Pro</th>
                    <th className="px-6 py-4 font-semibold">Elite</th>
                  </tr>
                </thead>
                <tbody>
                  {featureRows.map((row, index) => (
                    <tr key={row.feature} className={index % 2 === 0 ? "bg-white" : "bg-[#fafafa]"}>
                      <td className="px-6 py-4 font-medium text-[#111827]">{row.feature}</td>
                      <td className="px-6 py-4">{renderFeatureValue(row.free)}</td>
                      <td className="px-6 py-4">{renderFeatureValue(row.pro)}</td>
                      <td className="px-6 py-4">{renderFeatureValue(row.elite)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-0">
            <div className="border-b border-[#e5e7eb] px-6 py-4">
              <h2 className="text-lg font-semibold text-[#111827]">Payment history</h2>
            </div>
            {subscription.payments.length === 0 ? (
              <div className="px-6 py-8 text-sm text-[#6b7280]">No payment history yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#f9fafb] text-[#6b7280]">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Date</th>
                      <th className="px-6 py-4 font-semibold">Plan</th>
                      <th className="px-6 py-4 font-semibold">Amount</th>
                      <th className="px-6 py-4 font-semibold">Status</th>
                      <th className="px-6 py-4 font-semibold">Invoice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscription.payments.map((payment, index) => (
                      <tr key={payment.id} className={index % 2 === 0 ? "bg-white" : "bg-[#fafafa]"}>
                        <td className="px-6 py-4 text-[#374151]">{formatDate(payment.date)}</td>
                        <td className="px-6 py-4 font-medium text-[#111827]">{payment.plan}</td>
                        <td className="px-6 py-4 text-[#374151]">
                          {formatCurrency(payment.amount / 100)}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={payment.status === "paid" ? "available" : "pending"}>{payment.status}</Badge>
                        </td>
                        <td className="px-6 py-4 text-[#6c63ff]">{payment.invoice}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      ) : null}

      <div className="rounded-2xl border border-[#e5e7eb] bg-white px-5 py-4 text-sm text-[#4b5563]">
        <div className="flex items-center gap-2 font-medium text-[#111827]">
          <Clock3 className="h-4 w-4 text-[#6c63ff]" />
          Need help choosing?
        </div>
        <p className="mt-2">
          Free users keep unlimited access to the three core generators. Pro unlocks the AI Notetaker and monthly
          meeting automation. Elite removes meeting caps and keeps future feature drops open.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild variant="secondary">
            <a href="/dashboard/meetings">
              View meetings
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
          <Button asChild variant="ghost">
            <a href="/dashboard/tools">
              Explore tools
              <Zap className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
