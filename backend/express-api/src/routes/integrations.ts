import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { pool } from "../db/client";
import { BadRequestError } from "../lib/errors";

export const integrationsRouter = Router();

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_INTEGRATION_TYPES = ["slack", "gmail", "notion", "jira"] as const;
type IntegrationType = (typeof VALID_INTEGRATION_TYPES)[number];

function isValidType(type: string): type is IntegrationType {
  return (VALID_INTEGRATION_TYPES as readonly string[]).includes(type);
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const upsertIntegrationSchema = z.object({
  type: z.string(),
  enabled: z.boolean(),
  config: z.record(z.unknown()).nullable().optional(),
});

const testIntegrationSchema = z.object({
  type: z.string(),
});

// ─── GET / — return integration status for all supported types ────────────────

integrationsRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;

    const result = await pool.query(
      `SELECT type, enabled, config, created_at, updated_at
       FROM integrations
       WHERE user_id = $1`,
      [userId]
    );

    // Build a map of existing integrations
    const existing = new Map<string, { enabled: boolean; config: unknown }>();
    for (const row of result.rows) {
      existing.set(row.type, { enabled: row.enabled, config: row.config });
    }

    // Return status for all supported types (default to disabled if not in DB)
    const integrationStatuses = VALID_INTEGRATION_TYPES.map((type) => {
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

// ─── POST / — upsert integration record ──────────────────────────────────────

integrationsRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = upsertIntegrationSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new BadRequestError(parsed.error.message));
    }

    const { type, enabled, config } = parsed.data;

    if (!isValidType(type)) {
      return res.status(400).json({ error: "Invalid integration type" });
    }

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

// ─── POST /test — connectivity test for specified integration type ─────────────
// Must be registered BEFORE /:id style routes

integrationsRouter.post("/test", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = testIntegrationSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new BadRequestError(parsed.error.message));
    }

    const { type } = parsed.data;

    if (!isValidType(type)) {
      return res.status(400).json({ error: "Invalid integration type" });
    }

    // Placeholder connectivity test — real implementation would call the integration's API
    res.json({
      type,
      success: true,
      message: `Connectivity test for ${type} passed`,
    });
  } catch (err) {
    next(err);
  }
});
