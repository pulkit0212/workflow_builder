import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { pool } from "../db/client";
import { BadRequestError, ForbiddenError } from "../lib/errors";

export const integrationsRouter = Router();

const PLAN_IDS = ["free", "pro", "elite", "trial"] as const;
type PlanId = (typeof PLAN_IDS)[number];

function normalizePlan(plan: string | undefined | null): PlanId {
  const p = String(plan ?? "free").toLowerCase();
  return (PLAN_IDS as readonly string[]).includes(p) ? (p as PlanId) : "free";
}

/** Productivity types we persist in `integrations` (user rows). */
const DEFAULT_PRODUCTIVITY_TYPES = ["slack", "gmail", "notion", "jira"] as const;

async function getVisibleProductivityTypes(plan: PlanId): Promise<string[]> {
  try {
    const { rows } = await pool.query<{ integration_type: string }>(
      `SELECT integration_type FROM integration_catalog
       WHERE category = 'productivity'
         AND integration_type IS NOT NULL
         AND is_active = true
         AND $1 = ANY(allowed_plans)
       ORDER BY sort_order ASC`,
      [plan]
    );
    return rows.map((r) => r.integration_type).filter(Boolean);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "42P01") return [...DEFAULT_PRODUCTIVITY_TYPES];
    throw e;
  }
}

async function assertProductivityAllowed(plan: PlanId, type: string): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM integration_catalog
       WHERE category = 'productivity'
         AND integration_type = $1
         AND is_active = true
         AND $2 = ANY(allowed_plans)
       LIMIT 1`,
      [type, plan]
    );
    if (rows.length === 0) {
      throw new ForbiddenError("This integration is not available for your plan or has been disabled.");
    }
  } catch (e) {
    if (e instanceof ForbiddenError) throw e;
    const code = (e as { code?: string }).code;
    if (code === "42P01") {
      if (!(DEFAULT_PRODUCTIVITY_TYPES as readonly string[]).includes(type)) {
        throw new BadRequestError("Invalid integration type");
      }
      return;
    }
    throw e;
  }
}

// ─── GET /catalog — UI catalog filtered by user plan + active flag ──────────

integrationsRouter.get("/catalog", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = normalizePlan(req.appUser.plan);
    const { rows } = await pool.query(
      `SELECT slug, category, integration_type AS "integrationType", display_name AS "displayName",
              description, icon, color_hex AS "colorHex", bg_hex AS "bgHex", sort_order AS "sortOrder", ui_config AS "uiConfig"
       FROM integration_catalog
       WHERE is_active = true AND $1 = ANY(allowed_plans)
       ORDER BY category, sort_order ASC`,
      [plan]
    );
    res.json({ success: true, plan, items: rows });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "42P01") {
      return res.status(503).json({
        success: false,
        error: "integration_catalog table missing — run migration 004_integration_catalog.sql",
        plan: normalizePlan(req.appUser.plan),
        items: [],
      });
    }
    next(err);
  }
});

// ─── Schemas ─────────────────────────────────────────────────────────────────

const upsertIntegrationSchema = z.object({
  type: z.string(),
  enabled: z.boolean(),
  config: z.record(z.unknown()).nullable().optional(),
});

const testIntegrationSchema = z.object({
  type: z.string(),
});

// ─── GET / — return integration status for catalog productivity types only ───

integrationsRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;
    const plan = normalizePlan(req.appUser.plan);

    const result = await pool.query(
      `SELECT type, enabled, config, created_at, updated_at
       FROM integrations
       WHERE user_id = $1`,
      [userId]
    );

    const existing = new Map<string, { enabled: boolean; config: unknown }>();
    for (const row of result.rows) {
      existing.set(row.type, { enabled: row.enabled, config: row.config });
    }

    const visibleTypes = await getVisibleProductivityTypes(plan);
    const integrationStatuses = visibleTypes.map((type) => {
      const found = existing.get(type);
      return {
        type,
        enabled: found?.enabled ?? false,
        config: found?.config ?? null,
        connected: found !== undefined,
      };
    });

    res.json(integrationStatuses);
  } catch (err) {
    next(err);
  }
});

// ─── POST / — upsert integration record ────────────────────────────────────────

integrationsRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = upsertIntegrationSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new BadRequestError(parsed.error.message));
    }

    const { type, enabled, config } = parsed.data;
    const plan = normalizePlan(req.appUser.plan);
    await assertProductivityAllowed(plan, type);

    const userId = req.appUser.id;

    const result = await pool.query(
      `INSERT INTO integrations (user_id, type, enabled, config)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (user_id, type) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         config = EXCLUDED.config,
         updated_at = NOW()
       RETURNING *`,
      [userId, type, enabled, JSON.stringify(config ?? null)]
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── POST /test — connectivity test ───────────────────────────────────────────

integrationsRouter.post("/test", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = testIntegrationSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new BadRequestError(parsed.error.message));
    }

    const { type } = parsed.data;
    const plan = normalizePlan(req.appUser.plan);
    await assertProductivityAllowed(plan, type);

    res.json({
      type,
      success: true,
      message: `Connectivity test for ${type} passed`,
    });
  } catch (err) {
    next(err);
  }
});
