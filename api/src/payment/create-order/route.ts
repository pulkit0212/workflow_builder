import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { plan } = await req.json();

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    console.log("[Payment] Key ID exists:", !!keyId);
    console.log("[Payment] Key Secret exists:", !!keySecret);
    console.log("[Payment] Plan:", plan);

    if (!keyId || !keySecret) {
      return NextResponse.json(
        {
          success: false,
          message: "Razorpay keys not configured"
        },
        { status: 500 }
      );
    }

    const prices: Record<string, number> = {
      pro: 9900,
      elite: 19900
    };

    const amount = prices[plan];
    if (!amount) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid plan selected"
        },
        { status: 400 }
      );
    }

    const credentials = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount,
        currency: "INR",
        receipt: `ord_${Date.now()}`,
        notes: { userId, plan }
      })
    });

    const order = await response.json();

    console.log("[Payment] Razorpay response:", JSON.stringify(order));

    if (!response.ok) {
      console.error("[Payment] Razorpay error:", order);
      return NextResponse.json(
        {
          success: false,
          message: order.error?.description || "Failed to create payment order"
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      orderId: order.id,
      amount,
      currency: "INR",
      keyId
    });
  } catch (error: any) {
    console.error("[Payment] Unexpected error:", error.message);
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Failed to create payment order."
      },
      { status: 500 }
    );
  }
}
