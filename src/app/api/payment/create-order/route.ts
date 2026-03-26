import { auth } from "@clerk/nextjs/server";
import Razorpay from "razorpay";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { createPaymentRecord, getUserSubscription } from "@/lib/subscription.server";

export const runtime = "nodejs";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID ?? "",
  key_secret: process.env.RAZORPAY_KEY_SECRET ?? ""
});

const PLAN_PRICES: Record<"pro" | "elite", number> = {
  pro: 9900,
  elite: 19900
};

export async function POST(req: Request) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return apiError("Razorpay is not configured.", 503);
  }

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return apiError("Request body must be valid JSON.", 400);
  }

  const plan = (body as { plan?: string } | null)?.plan;

  if (plan !== "pro" && plan !== "elite") {
    return apiError("Invalid plan.", 400);
  }

  try {
    const subscription = await getUserSubscription(userId);
    const amount = PLAN_PRICES[plan];
    const order = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: `artiva_${userId}_${Date.now()}`,
      notes: {
        userId,
        plan,
        currentPlan: subscription.plan
      }
    });

    await createPaymentRecord({
      userId,
      plan,
      amount,
      status: "created",
      razorpayOrderId: order.id
    });

    return apiSuccess({
      success: true,
      orderId: order.id,
      amount,
      currency: "INR",
      keyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to create payment order.", 500);
  }
}
