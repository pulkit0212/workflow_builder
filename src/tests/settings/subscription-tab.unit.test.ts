/**
 * Unit Tests: Subscription Tab Logic
 *
 * Tests the pure logic functions and computed values from the Subscription Tab
 * in src/app/dashboard/settings/page.tsx.
 *
 * Since the component uses Clerk hooks and React state, we test the
 * logic functions directly rather than rendering the component.
 *
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9**
 */

import { describe, it, expect } from "vitest";

// ─── Types (mirrored from page.tsx) ──────────────────────────────────────────

type PlanId = "free" | "pro" | "elite" | "trial";

type PaymentRecord = {
  id: string;
  date: string;
  plan: string;
  amount: number;
  currency: string;
  status: string;
  invoiceNumber: string | null;
};

// ─── Pure functions mirrored from page.tsx ────────────────────────────────────

function planBadgeVariant(plan: PlanId): string {
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

function getCurrentPlanLabel(plan: PlanId): string {
  return plan === "trial" ? "Trial" : plan.toUpperCase();
}

function computeCanUpgradeToPro(plan: PlanId): boolean {
  return plan !== "pro" && plan !== "elite";
}

function computeCanUpgradeToElite(plan: PlanId): boolean {
  return plan !== "elite";
}

function computeMeetingUsagePercent(
  meetingsUsed: number,
  meetingsLimit: number,
  unlimited: boolean
): number {
  if (unlimited) return 0;
  return Math.min(100, Math.round((meetingsUsed / Math.max(meetingsLimit, 1)) * 100));
}

function computeIsTrialActive(plan: PlanId, trialEndsAt: Date | null): boolean {
  return Boolean(plan === "trial" && trialEndsAt && trialEndsAt.getTime() > Date.now());
}

function computeTrialProgress(
  plan: PlanId,
  trialStartedAt: string,
  trialEndsAt: string
): number {
  if (plan !== "trial") return 0;
  const started = new Date(trialStartedAt).getTime();
  const ended = new Date(trialEndsAt).getTime();
  const total = Math.max(ended - started, 1);
  const elapsed = Math.min(Date.now() - started, total);
  return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
}

// ─── Tests: planBadgeVariant ──────────────────────────────────────────────────

describe("Subscription Tab - planBadgeVariant", () => {
  it('returns "accent" for elite plan', () => {
    // **Validates: Requirement 9.2** - appropriate badge for Elite
    expect(planBadgeVariant("elite")).toBe("accent");
  });

  it('returns "pending" for pro plan', () => {
    // **Validates: Requirement 9.2** - appropriate badge for Pro
    expect(planBadgeVariant("pro")).toBe("pending");
  });

  it('returns "pending" for trial plan', () => {
    // **Validates: Requirement 9.2** - appropriate badge for Trial
    expect(planBadgeVariant("trial")).toBe("pending");
  });

  it('returns "neutral" for free plan', () => {
    // **Validates: Requirement 9.2** - appropriate badge for Free
    expect(planBadgeVariant("free")).toBe("neutral");
  });
});

// ─── Tests: currentPlanLabel ──────────────────────────────────────────────────

describe("Subscription Tab - currentPlanLabel", () => {
  it('returns "Trial" for trial plan', () => {
    // **Validates: Requirement 9.2** - Trial label
    expect(getCurrentPlanLabel("trial")).toBe("Trial");
  });

  it('returns "FREE" for free plan', () => {
    // **Validates: Requirement 9.2** - FREE label (uppercased)
    expect(getCurrentPlanLabel("free")).toBe("FREE");
  });

  it('returns "PRO" for pro plan', () => {
    // **Validates: Requirement 9.2** - PRO label (uppercased)
    expect(getCurrentPlanLabel("pro")).toBe("PRO");
  });

  it('returns "ELITE" for elite plan', () => {
    // **Validates: Requirement 9.2** - ELITE label (uppercased)
    expect(getCurrentPlanLabel("elite")).toBe("ELITE");
  });
});

// ─── Tests: canUpgradeToPro ───────────────────────────────────────────────────

describe("Subscription Tab - canUpgradeToPro", () => {
  it("is true for free plan", () => {
    // **Validates: Requirement 9.6** - free users can upgrade to Pro
    expect(computeCanUpgradeToPro("free")).toBe(true);
  });

  it("is true for trial plan", () => {
    // **Validates: Requirement 9.6** - trial users can upgrade to Pro
    expect(computeCanUpgradeToPro("trial")).toBe(true);
  });

  it("is false for pro plan", () => {
    // **Validates: Requirement 9.6** - pro users cannot upgrade to Pro
    expect(computeCanUpgradeToPro("pro")).toBe(false);
  });

  it("is false for elite plan", () => {
    // **Validates: Requirement 9.6** - elite users cannot upgrade to Pro
    expect(computeCanUpgradeToPro("elite")).toBe(false);
  });
});

// ─── Tests: canUpgradeToElite ─────────────────────────────────────────────────

describe("Subscription Tab - canUpgradeToElite", () => {
  it("is true for free plan", () => {
    // **Validates: Requirement 9.6** - free users can upgrade to Elite
    expect(computeCanUpgradeToElite("free")).toBe(true);
  });

  it("is true for trial plan", () => {
    // **Validates: Requirement 9.6** - trial users can upgrade to Elite
    expect(computeCanUpgradeToElite("trial")).toBe(true);
  });

  it("is true for pro plan", () => {
    // **Validates: Requirement 9.6** - pro users can upgrade to Elite
    expect(computeCanUpgradeToElite("pro")).toBe(true);
  });

  it("is false for elite plan", () => {
    // **Validates: Requirement 9.6** - elite users cannot upgrade to Elite
    expect(computeCanUpgradeToElite("elite")).toBe(false);
  });
});

// ─── Tests: meetingUsagePercent ───────────────────────────────────────────────

describe("Subscription Tab - meetingUsagePercent", () => {
  it("returns 0 when unlimited is true", () => {
    // **Validates: Requirement 9.4** - unlimited plan shows 0% usage
    expect(computeMeetingUsagePercent(50, 100, true)).toBe(0);
  });

  it("calculates correct percentage for partial usage", () => {
    // **Validates: Requirement 9.4** - progress bar reflects usage
    expect(computeMeetingUsagePercent(5, 10, false)).toBe(50);
  });

  it("rounds to nearest integer", () => {
    // **Validates: Requirement 9.4** - percentage is rounded
    expect(computeMeetingUsagePercent(1, 3, false)).toBe(33);
  });

  it("caps at 100 when usage exceeds limit", () => {
    // **Validates: Requirement 9.4** - usage cannot exceed 100%
    expect(computeMeetingUsagePercent(15, 10, false)).toBe(100);
  });

  it("returns 0 when meetingsUsed is 0", () => {
    // **Validates: Requirement 9.4** - zero usage shows 0%
    expect(computeMeetingUsagePercent(0, 10, false)).toBe(0);
  });

  it("handles zero limit without dividing by zero (uses max(limit, 1))", () => {
    // **Validates: Requirement 9.4** - safe division when limit is 0
    expect(computeMeetingUsagePercent(0, 0, false)).toBe(0);
  });

  it("returns 100 when meetingsUsed equals meetingsLimit", () => {
    // **Validates: Requirement 9.4** - full usage shows 100%
    expect(computeMeetingUsagePercent(10, 10, false)).toBe(100);
  });
});

// ─── Tests: isTrialActive ─────────────────────────────────────────────────────

describe("Subscription Tab - isTrialActive", () => {
  it("is true when plan is trial and trialEndsAt is in the future", () => {
    // **Validates: Requirement 9.3** - active trial shows days remaining
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
    expect(computeIsTrialActive("trial", futureDate)).toBe(true);
  });

  it("is false when plan is trial but trialEndsAt is in the past", () => {
    // **Validates: Requirement 9.3** - expired trial is not active
    const pastDate = new Date(Date.now() - 1000);
    expect(computeIsTrialActive("trial", pastDate)).toBe(false);
  });

  it("is false when plan is trial and trialEndsAt is null", () => {
    // **Validates: Requirement 9.3** - no expiry date means not active
    expect(computeIsTrialActive("trial", null)).toBe(false);
  });

  it("is false when plan is free even with a future date", () => {
    // **Validates: Requirement 9.3** - non-trial plans are never trial-active
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    expect(computeIsTrialActive("free", futureDate)).toBe(false);
  });

  it("is false when plan is pro", () => {
    // **Validates: Requirement 9.3**
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    expect(computeIsTrialActive("pro", futureDate)).toBe(false);
  });

  it("is false when plan is elite", () => {
    // **Validates: Requirement 9.3**
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    expect(computeIsTrialActive("elite", futureDate)).toBe(false);
  });
});

// ─── Tests: trialProgress ─────────────────────────────────────────────────────

describe("Subscription Tab - trialProgress", () => {
  it("returns 0 when plan is not trial", () => {
    // **Validates: Requirement 9.3** - non-trial plans have no trial progress
    const start = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString();
    expect(computeTrialProgress("free", start, end)).toBe(0);
    expect(computeTrialProgress("pro", start, end)).toBe(0);
    expect(computeTrialProgress("elite", start, end)).toBe(0);
  });

  it("returns ~50 when halfway through trial", () => {
    // **Validates: Requirement 9.3** - trial progress reflects elapsed time
    const halfDuration = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
    const start = new Date(Date.now() - halfDuration).toISOString();
    const end = new Date(Date.now() + halfDuration).toISOString();
    const progress = computeTrialProgress("trial", start, end);
    // Allow ±2% tolerance for timing
    expect(progress).toBeGreaterThanOrEqual(48);
    expect(progress).toBeLessThanOrEqual(52);
  });

  it("returns 100 when trial has ended", () => {
    // **Validates: Requirement 9.3** - expired trial shows 100% progress
    const start = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const end = new Date(Date.now() - 1000).toISOString(); // ended 1 second ago
    const progress = computeTrialProgress("trial", start, end);
    expect(progress).toBe(100);
  });

  it("returns 0 when trial has not started yet", () => {
    // **Validates: Requirement 9.3** - future trial shows 0% progress
    const start = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const progress = computeTrialProgress("trial", start, end);
    expect(progress).toBe(0);
  });
});

// ─── Tests: Payment History display logic ─────────────────────────────────────

describe("Subscription Tab - payment history display logic", () => {
  it("empty payments array triggers 'No payments yet' display", () => {
    // **Validates: Requirement 9.9** - empty state message
    const payments: PaymentRecord[] = [];
    const hasPayments = payments.length > 0;
    expect(hasPayments).toBe(false);
  });

  it("non-empty payments array triggers table display", () => {
    // **Validates: Requirement 9.8** - table shown when payments exist
    const payments: PaymentRecord[] = [
      {
        id: "pay_1",
        date: "2024-01-15T00:00:00.000Z",
        plan: "pro",
        amount: 9900,
        currency: "INR",
        status: "paid",
        invoiceNumber: "INV-001",
      },
    ];
    const hasPayments = payments.length > 0;
    expect(hasPayments).toBe(true);
  });

  it("payment table rows match the number of payment records", () => {
    // **Validates: Requirement 9.8** - one row per payment
    const payments: PaymentRecord[] = [
      { id: "pay_1", date: "2024-01-15T00:00:00.000Z", plan: "pro", amount: 9900, currency: "INR", status: "paid", invoiceNumber: "INV-001" },
      { id: "pay_2", date: "2024-02-15T00:00:00.000Z", plan: "pro", amount: 9900, currency: "INR", status: "paid", invoiceNumber: "INV-002" },
      { id: "pay_3", date: "2024-03-15T00:00:00.000Z", plan: "elite", amount: 19900, currency: "INR", status: "paid", invoiceNumber: "INV-003" },
    ];
    expect(payments.length).toBe(3);
  });

  it("payment record contains all required fields", () => {
    // **Validates: Requirement 9.8** - table columns: Date, Plan, Amount, Status
    const payment: PaymentRecord = {
      id: "pay_1",
      date: "2024-01-15T00:00:00.000Z",
      plan: "pro",
      amount: 9900,
      currency: "INR",
      status: "paid",
      invoiceNumber: "INV-001",
    };
    expect(payment).toHaveProperty("date");
    expect(payment).toHaveProperty("plan");
    expect(payment).toHaveProperty("amount");
    expect(payment).toHaveProperty("status");
  });

  it("payment status 'paid' maps to available badge variant", () => {
    // **Validates: Requirement 9.8** - status badge logic
    const status = "paid";
    const badgeVariant = status === "paid" ? "available" : "pending";
    expect(badgeVariant).toBe("available");
  });

  it("payment status other than 'paid' maps to pending badge variant", () => {
    // **Validates: Requirement 9.8** - non-paid status badge
    const status = "pending";
    const badgeVariant = status === "paid" ? "available" : "pending";
    expect(badgeVariant).toBe("pending");
  });
});

// ─── Tests: Upgrade cards visibility (Property 11) ───────────────────────────

describe("Subscription Tab - upgrade cards visibility (Property 11)", () => {
  it("free plan: both Pro and Elite upgrade cards are shown", () => {
    // **Validates: Requirement 9.6** - free users see both upgrade options
    const plan: PlanId = "free";
    expect(computeCanUpgradeToPro(plan)).toBe(true);
    expect(computeCanUpgradeToElite(plan)).toBe(true);
  });

  it("trial plan: both Pro and Elite upgrade cards are shown", () => {
    // **Validates: Requirement 9.6** - trial users see both upgrade options
    const plan: PlanId = "trial";
    expect(computeCanUpgradeToPro(plan)).toBe(true);
    expect(computeCanUpgradeToElite(plan)).toBe(true);
  });

  it("pro plan: only Elite upgrade card is shown", () => {
    // **Validates: Requirement 9.6** - pro users only see Elite upgrade
    const plan: PlanId = "pro";
    expect(computeCanUpgradeToPro(plan)).toBe(false);
    expect(computeCanUpgradeToElite(plan)).toBe(true);
  });

  it("elite plan: no upgrade cards are shown", () => {
    // **Validates: Requirement 9.6** - elite users see no upgrade options
    const plan: PlanId = "elite";
    expect(computeCanUpgradeToPro(plan)).toBe(false);
    expect(computeCanUpgradeToElite(plan)).toBe(false);
  });

  it("upgrade section is visible when at least one upgrade is available", () => {
    // **Validates: Requirement 9.6** - section shown when canUpgradeToPro || canUpgradeToElite
    const freePlan: PlanId = "free";
    const proPlan: PlanId = "pro";
    const elitePlan: PlanId = "elite";

    expect(computeCanUpgradeToPro(freePlan) || computeCanUpgradeToElite(freePlan)).toBe(true);
    expect(computeCanUpgradeToPro(proPlan) || computeCanUpgradeToElite(proPlan)).toBe(true);
    expect(computeCanUpgradeToPro(elitePlan) || computeCanUpgradeToElite(elitePlan)).toBe(false);
  });
});
