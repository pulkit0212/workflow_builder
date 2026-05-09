import { Router, Request, Response } from "express";
import crypto from "crypto";
import { config } from "../config";

export const razorpayWebhooksRouter = Router();

function timingSafeEqualHexDigest(expectedHex: string, receivedHex: string): boolean {
  try {
    const a = Buffer.from(expectedHex, "hex");
    const b = Buffer.from(receivedHex, "hex");
    return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Razorpay pushes signed JSON to this endpoint.
 * Configure URL in Dashboard → Account & Settings → Webhooks → https://<api-host>/api/webhooks/razorpay
 */
razorpayWebhooksRouter.post("/", (req: Request, res: Response) => {
  const secret = config.razorpayWebhookSecret;
  if (!secret) {
    res.status(503).json({ error: "RAZORPAY_WEBHOOK_SECRET is not configured" });
    return;
  }

  const signature = req.headers["x-razorpay-signature"];
  if (typeof signature !== "string") {
    res.status(400).json({ error: "Missing X-Razorpay-Signature" });
    return;
  }

  const raw = req.body;
  if (!Buffer.isBuffer(raw)) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  if (!timingSafeEqualHexDigest(expected, signature)) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  let payload: { event?: string; payload?: unknown };
  try {
    payload = JSON.parse(raw.toString("utf8")) as { event?: string; payload?: unknown };
  } catch {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  const event = payload.event ?? "unknown";
  // Foundation: acknowledge + structured log. Extend here for payment.captured → subscription sync, refunds, etc.
  console.log(`[RazorpayWebhook] event=${event}`);

  res.status(200).json({ received: true, event });
});
