import { Router, Request, Response, NextFunction } from "express";
import { Webhook } from "svix";
import { config } from "../config";
import { pool } from "../db/client";

export const webhooksRouter = Router();

// POST /clerk — Svix-signed Clerk webhook
// Uses express.raw() to get the raw body needed for signature verification.
// This route does NOT use clerkAuth middleware.
webhooksRouter.post(
  "/clerk",
  // Override global express.json() — Svix needs the raw body to verify the signature
  (req: Request, res: Response, next: NextFunction) => {
    if (req.is("application/json")) {
      let data = "";
      req.setEncoding("utf8");
      req.on("data", (chunk: string) => { data += chunk; });
      req.on("end", () => {
        (req as Request & { rawBody: string }).rawBody = data;
        next();
      });
      req.on("error", next);
    } else {
      next();
    }
  },
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 6.3 — return 503 if webhook secret is not configured
      if (!config.clerkWebhookSecret) {
        return res.status(503).json({ error: "Webhook secret is not configured." });
      }

      // Extract Svix headers
      const svixId = req.headers["svix-id"] as string | undefined;
      const svixTimestamp = req.headers["svix-timestamp"] as string | undefined;
      const svixSignature = req.headers["svix-signature"] as string | undefined;

      // 6.4 — return 400 if headers are missing
      if (!svixId || !svixTimestamp || !svixSignature) {
        return res.status(400).json({ error: "Invalid webhook signature" });
      }

      // Get raw body — either from our middleware above or from the already-parsed buffer
      const rawBody: string =
        (req as Request & { rawBody?: string }).rawBody ??
        (Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body));

      // 6.4 — verify Svix signature; throws on invalid
      let event: { type?: string; data?: Record<string, unknown> };
      try {
        const wh = new Webhook(config.clerkWebhookSecret);
        event = wh.verify(rawBody, {
          "svix-id": svixId,
          "svix-timestamp": svixTimestamp,
          "svix-signature": svixSignature,
        }) as { type?: string; data?: Record<string, unknown> };
      } catch {
        return res.status(400).json({ error: "Invalid webhook signature" });
      }

      // 6.2 — handle user.created: upsert user + initialize default subscription
      if (event.type === "user.created" && event.data?.id) {
        const clerkUserId = event.data.id as string;

        // Extract primary email from Clerk's email_addresses array
        const emailAddresses = (event.data.email_addresses as Array<{ email_address: string; id: string }> | undefined) ?? [];
        const primaryEmailAddressId = event.data.primary_email_address_id as string | undefined;
        const primaryEmailObj = primaryEmailAddressId
          ? emailAddresses.find((e) => e.id === primaryEmailAddressId)
          : emailAddresses[0];
        const email = primaryEmailObj?.email_address ?? "";

        const firstName = (event.data.first_name as string | null) ?? null;
        const lastName = (event.data.last_name as string | null) ?? null;
        const fullName = [firstName, lastName].filter(Boolean).join(" ") || null;

        // Upsert user record
        await pool.query(
          `INSERT INTO users (clerk_user_id, email, full_name, plan, created_at, updated_at)
           VALUES ($1, $2, $3, 'free', NOW(), NOW())
           ON CONFLICT (clerk_user_id) DO UPDATE SET
             email = EXCLUDED.email,
             full_name = EXCLUDED.full_name,
             updated_at = NOW()`,
          [clerkUserId, email, fullName]
        );

        // Initialize default subscription (trial, 30 days)
        const now = new Date();
        const trialEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        await pool.query(
          `INSERT INTO subscriptions (user_id, plan, status, trial_started_at, trial_ends_at, last_reset_date, created_at, updated_at)
           VALUES ($1, 'trial', 'active', $2, $3, $2, NOW(), NOW())
           ON CONFLICT (user_id) DO NOTHING`,
          [clerkUserId, now.toISOString(), trialEndsAt.toISOString()]
        );
      }

      // 6.1 — return 200 on success
      return res.status(200).json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);
