import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import crypto from "crypto";
import { markPaymentCompleted } from "@/lib/subscription.server";

export const runtime = "nodejs";

const PLAN_PRICES = {
  pro: 9900,
  elite: 19900
} as const;

type PlanType = keyof typeof PLAN_PRICES;

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      plan
    }: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
      plan: string;
    } = await req.json();

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return NextResponse.json(
        { success: false, message: "Payment configuration error" },
        { status: 500 }
      );
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return NextResponse.json(
        { success: false, message: "Invalid payment signature" },
        { status: 400 }
      );
    }

    // ✅ Strong type guard
    if (plan !== "pro" && plan !== "elite") {
      return NextResponse.json(
        { success: false, message: "Invalid plan selected" },
        { status: 400 }
      );
    }

    const typedPlan: PlanType = plan;

    await markPaymentCompleted({
      userId,
      plan: typedPlan,
      amount: PLAN_PRICES[typedPlan],
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature
    });

    console.log("[Payment] Payment verified, plan upgraded:", typedPlan);

    return NextResponse.json({
      success: true,
      plan: typedPlan,
      message: "Payment successful! Plan upgraded."
    });
  } catch (error: any) {
    console.error("[Payment] Verify error:", error.message);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}