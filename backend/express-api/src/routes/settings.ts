import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { pool } from "../db/client";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { getPlanLimits } from "../lib/subscription";

export const settingsRouter = Router();

const PLAN_IDS = ["free", "pro", "elite", "trial"] as const;
type PlanId = (typeof PLAN_IDS)[number];

function normalizePlan(plan: string | undefined | null): PlanId {
  const p = String(plan ?? "free").toLowerCase();
  return (PLAN_IDS as readonly string[]).includes(p) ? (p as PlanId) : "free";
}

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

type PreferenceCatalogRow = {
  key: string;
  group_key: string;
  label: string;
  description: string;
  field_type: "boolean" | "enum" | "string";
  enum_options: unknown | null;
  default_value: unknown;
  sort_order: number;
  ui_config: unknown | null;
};

async function fetchUserSettingsMap(userId: string, keys: string[]): Promise<Map<string, unknown>> {
  if (keys.length === 0) return new Map();
  try {
    const { rows } = await pool.query<{ key: string; value: unknown }>(
      `SELECT key, value FROM user_settings WHERE user_id = $1 AND key = ANY($2)`,
      [userId, keys]
    );
    return new Map(rows.map((r) => [r.key, r.value]));
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "42P01") return new Map(); // user_settings table not migrated yet
    throw e;
  }
}

async function upsertUserSetting(userId: string, key: string, value: unknown): Promise<void> {
  await pool.query(
    `INSERT INTO user_settings (user_id, key, value)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [userId, key, JSON.stringify(value)]
  );
}

async function getActiveProductivityTypesForPlan(plan: PlanId): Promise<Set<string>> {
  try {
    const { rows } = await pool.query<{ integration_type: string }>(
      `SELECT integration_type FROM integration_catalog
       WHERE category = 'productivity'
         AND integration_type IS NOT NULL
         AND is_active = true
         AND $1 = ANY(allowed_plans)`,
      [plan]
    );
    return new Set(rows.map((r) => r.integration_type).filter(Boolean));
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "42P01") {
      // If integration_catalog is missing, don't hide anything.
      return new Set(["slack", "gmail", "notion", "jira"]);
    }
    throw e;
  }
}

async function fetchPreferencesCatalog(plan: PlanId): Promise<PreferenceCatalogRow[]> {
  try {
    const { rows } = await pool.query<PreferenceCatalogRow>(
      `SELECT key, group_key, label, description, field_type, enum_options, default_value, sort_order, ui_config
       FROM preferences_catalog
       WHERE is_active = true AND $1 = ANY(allowed_plans)
       ORDER BY group_key, sort_order ASC`,
      [plan]
    );
    return rows;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "42P01") return [];
    throw e;
  }
}

function getNested(obj: any, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function setNested(obj: any, path: string, value: unknown): void {
  const parts = path.split(".").filter(Boolean);
  let cur = obj;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    if (i === parts.length - 1) {
      cur[p] = value;
      return;
    }
    if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p];
  }
}

function coerceDefault(fieldType: PreferenceCatalogRow["field_type"], v: unknown): unknown {
  if (fieldType === "boolean") return typeof v === "boolean" ? v : Boolean(v);
  if (fieldType === "string") return typeof v === "string" ? v : String(v ?? "");
  // enum: keep string
  return typeof v === "string" ? v : String(v ?? "");
}

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
    const plan = normalizePlan(req.appUser.plan);
    const catalog = await fetchPreferencesCatalog(plan);
    const keys = catalog.map((c) => c.key);
    const map = await fetchUserSettingsMap(req.appUser.id, keys);
    const displayName = map.get("botDisplayName");
    const audioSource = map.get("audioSource");
    res.json({
      botDisplayName: typeof displayName === "string" ? displayName : "Artiva Notetaker",
      audioSource: typeof audioSource === "string" ? audioSource : "default",
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
    await upsertUserSetting(req.appUser.id, "botDisplayName", botDisplayName);
    await upsertUserSetting(req.appUser.id, "audioSource", resolvedAudioSource);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── GET /preferences ─────────────────────────────────────────────────────────

settingsRouter.get("/preferences", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = normalizePlan(req.appUser.plan);
    const catalog = await fetchPreferencesCatalog(plan);
    const keys = catalog.map((c) => c.key);
    const map = await fetchUserSettingsMap(req.appUser.id, keys);
    const activeProductivityTypes = await getActiveProductivityTypesForPlan(plan);

    const resolved: any = {
      emailNotifications: {},
      defaultEmailTone: null,
      summaryLength: null,
      language: null,
      botDisplayName: null,
      audioSource: null,
      autoShareTargets: {},
    };

    for (const row of catalog) {
      // Auto-share options should disappear if integration_catalog disables them.
      if (row.key.startsWith("autoShareTargets.")) {
        const type = row.key.split(".")[1] ?? "";
        if (!activeProductivityTypes.has(type)) continue;
      }
      const userV = map.get(row.key);
      const v = userV === undefined || userV === null ? row.default_value : userV;
      setNested(resolved, row.key, coerceDefault(row.field_type, v));
    }

    res.json({
      success: true,
      preferences: {
        emailNotifications: resolved.emailNotifications ?? {},
        defaultEmailTone: resolved.defaultEmailTone ?? "professional",
        summaryLength: resolved.summaryLength ?? "standard",
        language: resolved.language ?? "en",
        botDisplayName: resolved.botDisplayName ?? "Artiva Notetaker",
        audioSource: resolved.audioSource ?? "default",
        autoShareTargets: resolved.autoShareTargets ?? {},
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /preferences/catalog — admin-managed metadata + resolved defaults ────

settingsRouter.get("/preferences/catalog", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = normalizePlan(req.appUser.plan);
    const catalog = await fetchPreferencesCatalog(plan);
    const activeProductivityTypes = await getActiveProductivityTypesForPlan(plan);
    const keys = catalog.map((c) => c.key);
    const map = await fetchUserSettingsMap(req.appUser.id, keys);

    const resolved: any = {
      emailNotifications: {},
      defaultEmailTone: null,
      summaryLength: null,
      language: null,
      botDisplayName: null,
      audioSource: null,
      autoShareTargets: {},
    };

    for (const row of catalog) {
      if (row.key.startsWith("autoShareTargets.")) {
        const type = row.key.split(".")[1] ?? "";
        if (!activeProductivityTypes.has(type)) continue;
      }
      const userV = map.get(row.key);
      const v = userV === undefined || userV === null ? row.default_value : userV;
      setNested(resolved, row.key, coerceDefault(row.field_type, v));
    }

    res.json({
      success: true,
      plan,
      catalog: catalog
        .filter((r) => {
          if (!r.key.startsWith("autoShareTargets.")) return true;
          const type = r.key.split(".")[1] ?? "";
          return activeProductivityTypes.has(type);
        })
        .map((r) => ({
          key: r.key,
          groupKey: r.group_key,
          label: r.label,
          description: r.description,
          fieldType: r.field_type,
          enumOptions: r.enum_options,
          defaultValue: r.default_value,
          sortOrder: r.sort_order,
          uiConfig: r.ui_config,
        })),
      values: resolved,
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
    const plan = normalizePlan(req.appUser.plan);
    const catalog = await fetchPreferencesCatalog(plan);
    const activeProductivityTypes = await getActiveProductivityTypesForPlan(plan);

    // Validate enums against catalog
    if (updates.defaultEmailTone !== undefined) {
      const f = catalog.find((c) => c.key === "defaultEmailTone");
      const allowed = Array.isArray(f?.enum_options) ? f?.enum_options : null;
      if (allowed && !allowed.includes(updates.defaultEmailTone)) {
        return next(new BadRequestError("Invalid defaultEmailTone option"));
      }
      await upsertUserSetting(req.appUser.id, "defaultEmailTone", updates.defaultEmailTone);
    }
    if (updates.summaryLength !== undefined) {
      const f = catalog.find((c) => c.key === "summaryLength");
      const allowed = Array.isArray(f?.enum_options) ? f?.enum_options : null;
      if (allowed && !allowed.includes(updates.summaryLength)) {
        return next(new BadRequestError("Invalid summaryLength option"));
      }
      await upsertUserSetting(req.appUser.id, "summaryLength", updates.summaryLength);
    }
    if (updates.language !== undefined) {
      const f = catalog.find((c) => c.key === "language");
      const allowed = Array.isArray(f?.enum_options) ? f?.enum_options : null;
      if (allowed && !allowed.includes(updates.language)) {
        return next(new BadRequestError("Invalid language option"));
      }
      await upsertUserSetting(req.appUser.id, "language", updates.language);
    }
    if (updates.emailNotifications) {
      for (const [k, v] of Object.entries(updates.emailNotifications)) {
        if (typeof v === "boolean") {
          await upsertUserSetting(req.appUser.id, `emailNotifications.${k}`, v);
        }
      }
    }
    if (updates.autoShareTargets) {
      for (const [k, v] of Object.entries(updates.autoShareTargets)) {
        if (typeof v !== "boolean") continue;
        if (!activeProductivityTypes.has(k)) continue; // don't allow toggling disabled integrations
        await upsertUserSetting(req.appUser.id, `autoShareTargets.${k}`, v);
      }
    }

    // Return resolved preferences (same shape)
    const keys = catalog.map((c) => c.key);
    const map = await fetchUserSettingsMap(req.appUser.id, keys);
    const resolved: any = {
      emailNotifications: {},
      defaultEmailTone: null,
      summaryLength: null,
      language: null,
      botDisplayName: null,
      audioSource: null,
      autoShareTargets: {},
    };
    for (const row of catalog) {
      if (row.key.startsWith("autoShareTargets.")) {
        const type = row.key.split(".")[1] ?? "";
        if (!activeProductivityTypes.has(type)) continue;
      }
      const userV = map.get(row.key);
      const v = userV === undefined || userV === null ? row.default_value : userV;
      setNested(resolved, row.key, coerceDefault(row.field_type, v));
    }

    res.json({
      success: true,
      preferences: {
        emailNotifications: resolved.emailNotifications ?? {},
        defaultEmailTone: resolved.defaultEmailTone ?? "professional",
        summaryLength: resolved.summaryLength ?? "standard",
        language: resolved.language ?? "en",
        botDisplayName: resolved.botDisplayName ?? "Artiva Notetaker",
        audioSource: resolved.audioSource ?? "default",
        autoShareTargets: resolved.autoShareTargets ?? {},
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
        "SELECT COUNT(*)::int AS value FROM action_items WHERE reporter_id = $1",
        [user.id]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS value
         FROM ai_runs ar
         INNER JOIN tools t ON ar.tool_id = t.id
         WHERE ar.user_id = $1 AND t.slug = 'document-analyzer' AND ar.status = 'completed'`,
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
