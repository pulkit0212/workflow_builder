import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../db/client";

export const profileRouter = Router();

// GET /me — return authenticated user's profile and subscription
profileRouter.get("/me", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.appUser;

    const subResult = await pool.query(
      `SELECT plan, status, trial_started_at, trial_ends_at,
              plan_started_at, plan_ends_at, meetings_used_this_month,
              created_at, updated_at
       FROM subscriptions
       WHERE user_id = $1
       LIMIT 1`,
      [user.clerkUserId]
    );

    const subscription = subResult.rows[0] ?? null;

    res.json({
      user: { ...user },
      subscription: subscription
        ? {
            plan: subscription.plan,
            status: subscription.status,
            trialStartedAt: subscription.trial_started_at,
            trialEndsAt: subscription.trial_ends_at,
            planStartedAt: subscription.plan_started_at,
            planEndsAt: subscription.plan_ends_at,
            meetingsUsedThisMonth: subscription.meetings_used_this_month,
            createdAt: subscription.created_at,
            updatedAt: subscription.updated_at,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});
