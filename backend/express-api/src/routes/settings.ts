import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { pool } from "../db/client";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { getPlanLimits } from "../lib/subscription";

export const settingsRouter = Router();

// ─── Schemas ────────────────────────────────────────────────────────────────

const accountUpdateSchema = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email().optional(),
}).strict();

const botSettingsSchema = z.object({
  botDisplayName: z.string().min(1, "Bot display name cannot be empty"),
  audioSource: z.string().optional(),
});

const preferencesUpdateSchema = z.object({
  emailNotifications: z.object({
    meetingSummary: z.boolean().optional(),
    actionItems: z.boolean().optional(),
    weeklyDigest: z.boolean().optional(),
    productUpdates: z.boolean().optional(),
  }).optional(),
  defaultEmailTone: z.enum(["professional", "friendly", "formal", "concise"]).optional(),
  summaryLength: z.enum(["brief", "standard", "detailed"]).optional(),
  language: z.enum(["en", "hi"]).optional(),
  autoShareTargets: z.object({
    slack: z.boolean().optional(),
    gmail: z.boolean().optional(),
    notion: z.boolean().optional(),
    jira: z.boolean().optional(),
  }).optional(),
});

// ─── GET /account ─────────────────────────────────────────────────────────────

settingsRouter.get("/account", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.appUser;
    res.json({
      id: user.id,
      clerkUserId: user.clerkUserId,
      email: user.email,
      fullName: user.fullName,
      plan: user.plan,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /account ───────────────────────────────────────────────────────────

settingsRouter.patch("/account", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = accountUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new BadRequestError(parsed.error.message));
    }

    const updates = parsed.data;
    if (Object.keys(updates).length === 0) {
      return res.json({ success: true, user: req.appUser });
    }

    // Build SET clause dynamically with parameterized values
    const setClauses: string[] = ["updated_at = NOW()"];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (updates.fullName !== undefined) {
      setClauses.push(`full_name = $${paramIdx++}`);
      values.push(updates.fullName);
    }
    if (updates.email !== undefined) {
      setClauses.push(`email = $${paramIdx++}`);
      values.push(updates.email);
    }

    values.push(req.appUser.id);
    const result = await pool.query(
      `UPDATE users SET ${setClauses.join(", ")} WHERE id = $${paramIdx} RETURNING *`,
      values
    );

    const updated = result.rows[0] ?? null;

    if (!updated) {
      return next(new NotFoundError("User not found"));
    }

    res.json({ success: true, user: updated });
  } catch (err) {
    next(err);
  }
});

// ─── GET /bot ─────────────────────────────────────────────────────────────────

settingsRouter.get("/bot", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      "SELECT bot_display_name, audio_source FROM user_preferences WHERE user_id = $1 LIMIT 1",
      [req.appUser.id]
    );
    const prefs = result.rows[0] ?? null;

    if (!prefs) {
      // Return defaults if no preferences row exists yet
      return res.json({ botDisplayName: "Artiva Notetaker", audioSource: "default" });
    }

    res.json({
      botDisplayName: prefs.bot_display_name,
      audioSource: prefs.audio_source,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /bot ────────────────────────────────────────────────────────────────

settingsRouter.post("/bot", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = botSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new BadRequestError(parsed.error.message));
    }

    const { botDisplayName, audioSource } = parsed.data;
    const resolvedAudioSource = audioSource ?? "default";

    await pool.query(
      `INSERT INTO user_preferences (user_id, bot_display_name, audio_source,
        email_notifications, default_email_tone, summary_length, language, auto_share_targets)
      VALUES ($1, $2, $3, $4::jsonb, 'professional', 'standard', 'en', $5::jsonb)
      ON CONFLICT (user_id) DO UPDATE SET
        bot_display_name = EXCLUDED.bot_display_name,
        audio_source = EXCLUDED.audio_source,
        updated_at = NOW()`,
      [
        req.appUser.id,
        botDisplayName,
        resolvedAudioSource,
        JSON.stringify({ meetingSummary: true, actionItems: false, weeklyDigest: false, productUpdates: true }),
        JSON.stringify({ slack: false, gmail: false, notion: false, jira: false }),
      ]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── GET /preferences ─────────────────────────────────────────────────────────

settingsRouter.get("/preferences", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      "SELECT * FROM user_preferences WHERE user_id = $1 LIMIT 1",
      [req.appUser.id]
    );
    let prefs = result.rows[0] ?? null;

    if (!prefs) {
      // Create default preferences
      const insertResult = await pool.query(
        `INSERT INTO user_preferences (user_id, email_notifications, default_email_tone,
          summary_length, language, bot_display_name, audio_source, auto_share_targets)
        VALUES ($1, $2::jsonb, 'professional', 'standard', 'en', 'Artiva Notetaker', 'default', $3::jsonb)
        RETURNING *`,
        [
          req.appUser.id,
          JSON.stringify({ meetingSummary: true, actionItems: false, weeklyDigest: false, productUpdates: true }),
          JSON.stringify({ slack: false, gmail: false, notion: false, jira: false }),
        ]
      );
      prefs = insertResult.rows[0] ?? null;
    }

    res.json({
      success: true,
      preferences: {
        emailNotifications: prefs.email_notifications,
        defaultEmailTone: prefs.default_email_tone,
        summaryLength: prefs.summary_length,
        language: prefs.language,
        botDisplayName: prefs.bot_display_name,
        audioSource: prefs.audio_source,
        autoShareTargets: prefs.auto_share_targets,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /preferences ───────────────────────────────────────────────────────

settingsRouter.patch("/preferences", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = preferencesUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new BadRequestError(parsed.error.message));
    }

    const updates = parsed.data;

    // Fetch existing prefs (or create defaults)
    const fetchResult = await pool.query(
      "SELECT * FROM user_preferences WHERE user_id = $1 LIMIT 1",
      [req.appUser.id]
    );
    let existing = fetchResult.rows[0] ?? null;

    if (!existing) {
      const insertResult = await pool.query(
        `INSERT INTO user_preferences (user_id, email_notifications, default_email_tone,
          summary_length, language, bot_display_name, audio_source, auto_share_targets)
        VALUES ($1, $2::jsonb, 'professional', 'standard', 'en', 'Artiva Notetaker', 'default', $3::jsonb)
        RETURNING *`,
        [
          req.appUser.id,
          JSON.stringify({ meetingSummary: true, actionItems: false, weeklyDigest: false, productUpdates: true }),
          JSON.stringify({ slack: false, gmail: false, notion: false, jira: false }),
        ]
      );
      existing = insertResult.rows[0] ?? null;
    }

    const setClauses: string[] = ["updated_at = NOW()"];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (updates.emailNotifications) {
      const merged = { ...existing.email_notifications, ...updates.emailNotifications };
      setClauses.push(`email_notifications = $${paramIdx++}::jsonb`);
      values.push(JSON.stringify(merged));
    }
    if (updates.defaultEmailTone !== undefined) {
      setClauses.push(`default_email_tone = $${paramIdx++}`);
      values.push(updates.defaultEmailTone);
    }
    if (updates.summaryLength !== undefined) {
      setClauses.push(`summary_length = $${paramIdx++}`);
      values.push(updates.summaryLength);
    }
    if (updates.language !== undefined) {
      setClauses.push(`language = $${paramIdx++}`);
      values.push(updates.language);
    }
    if (updates.autoShareTargets) {
      const merged = { ...existing.auto_share_targets, ...updates.autoShareTargets };
      setClauses.push(`auto_share_targets = $${paramIdx++}::jsonb`);
      values.push(JSON.stringify(merged));
    }

    values.push(req.appUser.id);
    const updateResult = await pool.query(
      `UPDATE user_preferences SET ${setClauses.join(", ")} WHERE user_id = $${paramIdx} RETURNING *`,
      values
    );
    const updated = updateResult.rows[0] ?? null;

    res.json({
      success: true,
      preferences: {
        emailNotifications: updated.email_notifications,
        defaultEmailTone: updated.default_email_tone,
        summaryLength: updated.summary_length,
        language: updated.language,
        botDisplayName: updated.bot_display_name,
        audioSource: updated.audio_source,
        autoShareTargets: updated.auto_share_targets,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /usage ───────────────────────────────────────────────────────────────

settingsRouter.get("/usage", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.appUser;

    // Get or create subscription
    const subResult = await pool.query(
      "SELECT * FROM subscriptions WHERE user_id = $1 LIMIT 1",
      [user.clerkUserId]
    );
    let subscription = subResult.rows[0] ?? null;

    if (!subscription) {
      const now = new Date();
      const trialEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const insertResult = await pool.query(
        `INSERT INTO subscriptions (user_id, plan, status, trial_started_at, trial_ends_at, last_reset_date)
        VALUES ($1, 'trial', 'active', $2, $3, $4)
        ON CONFLICT (user_id) DO NOTHING
        RETURNING *`,
        [user.clerkUserId, now.toISOString(), trialEndsAt.toISOString(), now.toISOString()]
      );
      subscription = insertResult.rows[0] ?? null;

      // If conflict happened, re-fetch
      if (!subscription) {
        const refetchResult = await pool.query(
          "SELECT * FROM subscriptions WHERE user_id = $1 LIMIT 1",
          [user.clerkUserId]
        );
        subscription = refetchResult.rows[0] ?? null;
      }
    }

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [
      meetingsThisMonthResult,
      meetingsAllTimeResult,
      transcriptsResult,
      actionItemsResult,
      documentsResult,
    ] = await Promise.all([
      pool.query(
        "SELECT COUNT(*)::int AS value FROM meeting_sessions WHERE user_id = $1 AND created_at >= $2",
        [user.id, monthStart.toISOString()]
      ),
      pool.query(
        "SELECT COUNT(*)::int AS value FROM meeting_sessions WHERE user_id = $1",
        [user.id]
      ),
      pool.query(
        "SELECT COUNT(*)::int AS value FROM meeting_sessions WHERE user_id = $1 AND transcript IS NOT NULL AND transcript != ''",
        [user.id]
      ),
      pool.query(
        "SELECT COUNT(*)::int AS value FROM action_items WHERE user_id = $1",
        [user.id]
      ),
      pool.query(
        "SELECT COUNT(DISTINCT meeting_id)::int AS value FROM action_items WHERE user_id = $1 AND source = 'document'",
        [user.id]
      ),
    ]);

    const getCount = (result: { rows: Array<{ value: number }> }) =>
      result.rows[0]?.value ?? 0;

    const limits = getPlanLimits(subscription?.plan ?? "free");

    res.json({
      success: true,
      meetingsThisMonth: getCount(meetingsThisMonthResult),
      meetingsAllTime: getCount(meetingsAllTimeResult),
      transcriptsGenerated: getCount(transcriptsResult),
      actionItemsCreated: getCount(actionItemsResult),
      documentsAnalyzed: getCount(documentsResult),
      memberSince: user.createdAt.toISOString(),
      limits,
    });
  } catch (err) {
    next(err);
  }
});
