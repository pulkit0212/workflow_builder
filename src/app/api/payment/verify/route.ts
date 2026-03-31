import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import crypto from "crypto";
import { markPaymentCompleted } from "@/lib/subscription.server";

export const runtime = "nodejs";

const PLAN_PRICES: Record<"pro" | "elite", number> = {
  pro: 9900,
  elite: 19900
};

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
    } = await req.json();

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return NextResponse.json(
        {
          success: false,
          message: "Payment configuration error"
        },
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
        {
          success: false,
          message: "Invalid payment signature"
        },
        { status: 400 }
      );
    }

    if (plan !== "pro" && plan !== "elite") {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid plan selected"
        },
        { status: 400 }
      );
    }

    await markPaymentCompleted({
      userId,
      plan,
      amount: PLAN_PRICES[plan],
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature
    });

    console.log("[Payment] Payment verified, plan upgraded:", plan);

    return NextResponse.json({
      success: true,
      plan,
      message: "Payment successful! Plan upgraded."
    });
  } catch (error: any) {
    console.error("[Payment] Verify error:", error.message);
    return NextResponse.json(
      {
        success: false,
        message: error.message
      },
      { status: 500 }
    );
  }
}
