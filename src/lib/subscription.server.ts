import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { subscriptions, subscriptionPayments } from "@/db/schema";
import { db } from "@/lib/db/client";
import type { SubscriptionRecord } from "@/lib/subscription";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function getDbOrThrow() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return db;
}

function monthHasRolledOver(lastResetDate: Date, now: Date) {
  return lastResetDate.getUTCFullYear() !== now.getUTCFullYear() || lastResetDate.getUTCMonth() !== now.getUTCMonth();
}

async function createSubscription(userId: string) {
  const database = getDbOrThrow();
  const now = new Date();

  const [subscription] = await database
    .insert(subscriptions)
    .values({
      userId,
      plan: "trial",
      status: "active",
      trialStartedAt: now,
      trialEndsAt: new Date(now.getTime() + THIRTY_DAYS_MS),
      lastResetDate: now
    })
    .returning();

  if (!subscription) {
    throw new Error("Failed to create subscription.");
  }

  return subscription;
}

export async function getUserSubscription(userId: string): Promise<SubscriptionRecord> {
  const database = getDbOrThrow();
  const [foundSubscription] = await database
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  let subscription = foundSubscription ?? null;

  if (!subscription) {
    subscription = await createSubscription(userId);
  }

  const now = new Date();
  let shouldUpdate = false;
  const updates: Partial<SubscriptionRecord> & Record<string, unknown> = {};

  if (subscription.plan === "trial" && new Date(subscription.trialEndsAt) < now) {
    updates.plan = "free";
    updates.status = "active";
    shouldUpdate = true;
  }

  if (
    ["pro", "elite"].includes(subscription.plan) &&
    subscription.planEndsAt &&
    new Date(subscription.planEndsAt) < now
  ) {
    updates.plan = "free";
    updates.status = "expired";
    shouldUpdate = true;
  }

  if (monthHasRolledOver(new Date(subscription.lastResetDate), now) && subscription.meetingsUsedThisMonth > 0) {
    updates.meetingsUsedThisMonth = 0;
    updates.lastResetDate = now;
    shouldUpdate = true;
  }

  if (shouldUpdate) {
    const [updatedSubscription] = await database
      .update(subscriptions)
      .set({
        ...updates,
        updatedAt: now
      })
      .where(eq(subscriptions.userId, userId))
      .returning();

    if (!updatedSubscription) {
      throw new Error("Failed to refresh subscription.");
    }

    return updatedSubscription;
  }

  return subscription;
}

export async function getPaymentHistory(userId: string) {
  const database = getDbOrThrow();

  return database
    .select()
    .from(subscriptionPayments)
    .where(eq(subscriptionPayments.userId, userId))
    .orderBy(desc(subscriptionPayments.createdAt));
}

export async function createPaymentRecord(values: {
  userId: string;
  plan: "pro" | "elite";
  amount: number;
  currency?: string;
  status?: string;
  razorpayOrderId: string;
  razorpayPaymentId?: string | null;
  razorpaySignature?: string | null;
  invoiceNumber?: string | null;
}) {
  const database = getDbOrThrow();
  const [payment] = await database
    .insert(subscriptionPayments)
    .values({
      userId: values.userId,
      plan: values.plan,
      amount: values.amount,
      currency: values.currency ?? "INR",
      status: values.status ?? "created",
      razorpayOrderId: values.razorpayOrderId,
      razorpayPaymentId: values.razorpayPaymentId ?? null,
      razorpaySignature: values.razorpaySignature ?? null,
      invoiceNumber: values.invoiceNumber ?? null
    })
    .returning();

  if (!payment) {
    throw new Error("Failed to create payment record.");
  }

  return payment;
}

export async function markPaymentCompleted(values: {
  userId: string;
  plan: "pro" | "elite";
  amount: number;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}) {
  const database = getDbOrThrow();
  const now = new Date();
  const planEndsAt = new Date(now);
  planEndsAt.setMonth(planEndsAt.getMonth() + 1);

  const [existingPayment] = await database
    .select()
    .from(subscriptionPayments)
    .where(
      and(eq(subscriptionPayments.userId, values.userId), eq(subscriptionPayments.razorpayOrderId, values.razorpayOrderId))
    )
    .limit(1);

  if (existingPayment) {
    const [updatedPayment] = await database
      .update(subscriptionPayments)
      .set({
        plan: values.plan,
        amount: values.amount,
        status: "paid",
        razorpayPaymentId: values.razorpayPaymentId,
        razorpaySignature: values.razorpaySignature,
        updatedAt: now
      })
      .where(eq(subscriptionPayments.id, existingPayment.id))
      .returning();

    if (!updatedPayment) {
      throw new Error("Failed to update payment record.");
    }
  } else {
    await createPaymentRecord({
      userId: values.userId,
      plan: values.plan,
      amount: values.amount,
      status: "paid",
      razorpayOrderId: values.razorpayOrderId,
      razorpayPaymentId: values.razorpayPaymentId,
      razorpaySignature: values.razorpaySignature
    });
  }

  const [subscription] = await database
    .update(subscriptions)
    .set({
      plan: values.plan,
      status: "active",
      planStartedAt: now,
      planEndsAt,
      razorpayOrderId: values.razorpayOrderId,
      razorpayPaymentId: values.razorpayPaymentId,
      updatedAt: now
    })
    .where(eq(subscriptions.userId, values.userId))
    .returning();

  if (!subscription) {
    throw new Error("Failed to upgrade subscription.");
  }

  return subscription;
}

export async function incrementMeetingUsage(userId: string) {
  const database = getDbOrThrow();
  const now = new Date();
  const [subscription] = await database
    .update(subscriptions)
    .set({
      meetingsUsedThisMonth: sql`${subscriptions.meetingsUsedThisMonth} + 1`,
      updatedAt: now
    })
    .where(eq(subscriptions.userId, userId))
    .returning();

  if (!subscription) {
    throw new Error("Failed to update subscription usage.");
  }

  return subscription;
}
