import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../db/client";
import { BadRequestError } from "../lib/errors";

// Protected routes (require Clerk auth)
export const calendarRouter = Router();

// Public routes (OAuth redirects — no auth token available)
export const calendarPublicRouter = Router();

const VALID_PROVIDERS = ["google", "microsoft_teams", "microsoft_outlook"] as const;
type CalendarProvider = (typeof VALID_PROVIDERS)[number];

function isValidProvider(p: string): p is CalendarProvider {
  return (VALID_PROVIDERS as readonly string[]).includes(p);
}

async function getValidToken(
  userId: string,
  provider: CalendarProvider
): Promise<{ accessToken: string | null; expiresAt: Date | null }> {
  const result = await pool.query(
    "SELECT access_token, refresh_token, expiry FROM user_integrations WHERE user_id = $1 AND provider = $2 LIMIT 1",
    [userId, provider]
  );
  const row = result.rows[0] ?? null;
  if (!row) return { accessToken: null, expiresAt: null };
  return { accessToken: row.access_token, expiresAt: row.expiry };
}

// ─── PUBLIC: GET /connect/:provider — initiates OAuth (no Clerk auth needed) ──

calendarPublicRouter.get("/connect/:provider", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { provider } = req.params;

    if (!isValidProvider(provider)) {
      return next(new BadRequestError(
        `Unsupported calendar provider "${provider}". Valid providers: ${VALID_PROVIDERS.join(", ")}`
      ));
    }

    const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";

    if (provider === "google") {
      return res.redirect(`${frontendUrl}/api/auth/signin/google?callbackUrl=/dashboard/integrations`);
    }

    return res.redirect(`${frontendUrl}/api/calendar/oauth/microsoft?provider=${provider}`);
  } catch (err) {
    next(err);
  }
});

// ─── PROTECTED: GET /status ───────────────────────────────────────────────────

calendarRouter.get("/status", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;

    const defaultStatus = VALID_PROVIDERS.reduce<Record<string, boolean>>((acc, p) => {
      acc[p] = false;
      return acc;
    }, {});

    let rows: Array<{ provider: string }> = [];
    try {
      const result = await pool.query(
        "SELECT provider FROM user_integrations WHERE user_id = $1",
        [userId]
      );
      rows = result.rows;
    } catch (dbErr: unknown) {
      if (
        typeof dbErr === "object" && dbErr !== null && "code" in dbErr &&
        (dbErr as { code: string }).code === "42P01"
      ) {
        return res.json({ success: true, connections: defaultStatus });
      }
      throw dbErr;
    }

    const connections = { ...defaultStatus };
    for (const row of rows) {
      if (isValidProvider(row.provider)) connections[row.provider] = true;
    }

    res.json({ success: true, connections });
  } catch (err) {
    next(err);
  }
});

// ─── PROTECTED: POST /save-connection ────────────────────────────────────────

calendarRouter.post("/save-connection", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { provider, accessToken, refreshToken, expiresAt } = req.body as {
      provider: string;
      accessToken: string;
      refreshToken: string | null;
      expiresAt: string | null;
    };

    if (!isValidProvider(provider)) {
      return res.status(400).json({ error: "Invalid provider" });
    }

    const userId = req.appUser.id;

    await pool.query(
      `INSERT INTO user_integrations (user_id, provider, access_token, refresh_token, expiry)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, provider) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         expiry = EXCLUDED.expiry,
         updated_at = NOW()`,
      [userId, provider, accessToken, refreshToken, expiresAt]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── PROTECTED: POST /disconnect/:provider ────────────────────────────────────

calendarRouter.post("/disconnect/:provider", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { provider } = req.params;

    if (!isValidProvider(provider)) {
      return next(new BadRequestError(
        `Unsupported calendar provider "${provider}". Valid providers: ${VALID_PROVIDERS.join(", ")}`
      ));
    }

    const userId = req.appUser.id;

    try {
      await pool.query(
        "DELETE FROM user_integrations WHERE user_id = $1 AND provider = $2",
        [userId, provider]
      );
    } catch (dbErr: unknown) {
      if (
        typeof dbErr === "object" && dbErr !== null && "code" in dbErr &&
        (dbErr as { code: string }).code === "42P01"
      ) {
        return res.json({ success: true, provider, disconnected: false });
      }
      throw dbErr;
    }

    res.json({ success: true, provider, disconnected: true });
  } catch (err) {
    next(err);
  }
});

export { getValidToken };
