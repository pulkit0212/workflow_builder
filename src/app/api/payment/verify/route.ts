import crypto from "crypto";
import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { markPaymentCompleted } from "@/lib/subscription.server";

export const runtime = "nodejs";

const PLAN_PRICES: Record<"pro" | "elite", number> = {
  pro: 9900,
  elite: 19900
};

export async function POST(req: Request) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  if (!process.env.RAZORPAY_KEY_SECRET) {
    return apiError("Razorpay is not configured.", 503);
  }

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return apiError("Request body must be valid JSON.", 400);
  }

  const payload = body as {
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
    plan?: "pro" | "elite";
  };

  if (!payload.razorpay_order_id || !payload.razorpay_payment_id || !payload.razorpay_signature) {
    return apiError("Incomplete payment payload.", 400);
  }

  if (payload.plan !== "pro" && payload.plan !== "elite") {
    return apiError("Invalid plan.", 400);
  }

  const bodyToSign = `${payload.razorpay_order_id}|${payload.razorpay_payment_id}`;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(bodyToSign)
    .digest("hex");

  if (expectedSignature !== payload.razorpay_signature) {
    return apiError("Invalid payment signature.", 400);
  }

  try {
    const subscription = await markPaymentCompleted({
      userId,
      plan: payload.plan,
      amount: PLAN_PRICES[payload.plan],
      razorpayOrderId: payload.razorpay_order_id,
      razorpayPaymentId: payload.razorpay_payment_id,
      razorpaySignature: payload.razorpay_signature
    });

    return apiSuccess({
      success: true,
      plan: subscription.plan,
      status: subscription.status
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to verify payment.", 500);
  }
}
