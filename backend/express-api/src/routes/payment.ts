import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { pool } from "../db/client";
import { config } from "../config";
import { BadRequestError } from "../lib/errors";

export const paymentRouter = Router();

const PLAN_PRICES: Record<string, number> = {
  pro: 9900,
  elite: 19900,
};

// ─── POST /api/payment/create-order ──────────────────────────────────────────

paymentRouter.post("/create-order", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { plan } = req.body as { plan?: string };

    if (!plan || !PLAN_PRICES[plan]) {
      return next(new BadRequestError("Invalid plan selected."));
    }

    const keyId = config.razorpayKeyId;
    const keySecret = config.razorpayKeySecret;

    if (!keyId || !keySecret) {
      return res.status(500).json({ success: false, message: "Razorpay keys not configured." });
    }

    const amount = PLAN_PRICES[plan];
    const credentials = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        currency: "INR",
        receipt: `ord_${Date.now()}`,
        notes: { userId: req.appUser.id, plan },
      }),
    });

    const order = (await response.json()) as {
      id?: string;
      error?: { description?: string };
    };

    if (!response.ok) {
      return res.status(500).json({
        success: false,
        message: order.error?.description ?? "Failed to create payment order.",
      });
    }

    res.json({
      success: true,
      orderId: order.id,
      amount,
      currency: "INR",
      keyId,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/payment/verify ─────────────────────────────────────────────────

paymentRouter.post("/verify", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      plan,
    } = req.body as {
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
      plan?: string;
    };

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return next(new BadRequestError("Missing payment verification fields."));
    }

    if (plan !== "pro" && plan !== "elite") {
      return next(new BadRequestError("Invalid plan selected."));
    }

    const keySecret = config.razorpayKeySecret;
    if (!keySecret) {
      return res.status(500).json({ success: false, message: "Payment configuration error." });
    }

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Invalid payment signature." });
    }

    const userId = req.appUser.id;
    const amount = PLAN_PRICES[plan];
    const now = new Date();
    const planEndsAt = new Date(now);
    planEndsAt.setMonth(planEndsAt.getMonth() + 1);

    // Upsert subscription
    await pool.query(
      `INSERT INTO subscriptions (user_id, plan, status, plan_started_at, plan_ends_at, razorpay_order_id, razorpay_payment_id, updated_at)
       VALUES ($1, $2, 'active', $3, $4, $5, $6, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         plan = EXCLUDED.plan,
         status = 'active',
         plan_started_at = EXCLUDED.plan_started_at,
         plan_ends_at = EXCLUDED.plan_ends_at,
         razorpay_order_id = EXCLUDED.razorpay_order_id,
         razorpay_payment_id = EXCLUDED.razorpay_payment_id,
         updated_at = EXCLUDED.updated_at`,
      [userId, plan, now, planEndsAt, razorpay_order_id, razorpay_payment_id]
    );

    // Upsert payment record
    const existingPayment = await pool.query(
      `SELECT id FROM subscription_payments WHERE user_id = $1 AND razorpay_order_id = $2 LIMIT 1`,
      [userId, razorpay_order_id]
    );

    if (existingPayment.rows.length > 0) {
      await pool.query(
        `UPDATE subscription_payments SET
           plan = $1, amount = $2, status = 'paid',
           razorpay_payment_id = $3, razorpay_signature = $4, updated_at = $5
         WHERE id = $6`,
        [plan, amount, razorpay_payment_id, razorpay_signature, now, existingPayment.rows[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO subscription_payments
           (user_id, plan, amount, currency, status, razorpay_order_id, razorpay_payment_id, razorpay_signature)
         VALUES ($1, $2, $3, 'INR', 'paid', $4, $5, $6)`,
        [userId, plan, amount, razorpay_order_id, razorpay_payment_id, razorpay_signature]
      );
    }

    res.json({ success: true, plan });
  } catch (err) {
    next(err);
  }
});
