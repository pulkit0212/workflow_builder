import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import {
  canUseActionItems,
  canUseHistory,
  getPlanDefinition,
  getPlanLimits,
  getTrialDaysLeft,
} from "@/lib/subscription";
import { getPaymentHistory, getUserSubscription } from "@/lib/subscription.server";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  try {
    const subscription = await getUserSubscription(userId);
    const payments = await getPaymentHistory(userId);
    const planDefinition = getPlanDefinition(subscription.plan);

    return apiSuccess({
      success: true,
      plan: subscription.plan,
      status: subscription.status,
      subscription,
      trialStartedAt: subscription.trialStartedAt.toISOString(),
      trialDaysLeft: getTrialDaysLeft(subscription),
      trialEndsAt: subscription.trialEndsAt.toISOString(),
      planStartedAt: subscription.planStartedAt ? subscription.planStartedAt.toISOString() : null,
      planEndsAt: subscription.planEndsAt ? subscription.planEndsAt.toISOString() : null,
      limits: {
        ...getPlanLimits(subscription.plan),
        actionItems: canUseActionItems(subscription.plan),
        history: canUseHistory(subscription.plan)
      },
      meetingsUsedThisMonth: subscription.meetingsUsedThisMonth,
      planDefinition,
      payments: payments.map((payment) => ({
        id: payment.id,
        date: payment.createdAt.toISOString(),
        plan: payment.plan,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        invoice: payment.invoiceNumber ?? payment.razorpayPaymentId ?? payment.razorpayOrderId
      }))
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to load subscription.", 500);
  }
}
