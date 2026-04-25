import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../db/client";
import { config } from "../config";
import { NotFoundError } from "../lib/errors";

export const googleRouter = Router();

// ─── GET /api/google/access-token ────────────────────────────────────────────

googleRouter.get("/access-token", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;
    const result = await pool.query(
      `SELECT id, access_token, refresh_token, expiry FROM user_integrations WHERE user_id = $1 AND provider = 'google' ORDER BY expiry DESC LIMIT 1`,
      [userId]
    );
    const row = result.rows[0] ?? null;
    if (!row) return res.json({ accessToken: null });

    // Check if token is still valid (with 5 min buffer)
    const expiry = row.expiry ? new Date(row.expiry) : null;
    const isExpired = !expiry || expiry.getTime() < Date.now() + 5 * 60 * 1000;

    if (!isExpired) {
      return res.json({ accessToken: row.access_token });
    }

    // Token expired — try to refresh
    if (!row.refresh_token) {
      return res.json({ accessToken: null });
    }

    const clientId = process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID ?? "";
    const clientSecret = process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "";

    const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: row.refresh_token,
      }),
    });

    if (!refreshRes.ok) {
      // Refresh token is invalid — delete stale record so UI shows disconnected
      await pool.query(`DELETE FROM user_integrations WHERE id = $1`, [row.id]);
      return res.json({ accessToken: null });
    }

    const refreshed = await refreshRes.json() as { access_token?: string; expires_in?: number };
    if (!refreshed.access_token) return res.json({ accessToken: null });

    const newExpiry = refreshed.expires_in
      ? new Date(Date.now() + refreshed.expires_in * 1000)
      : null;

    // Persist refreshed token
    await pool.query(
      `UPDATE user_integrations SET access_token = $1, expiry = $2, updated_at = NOW() WHERE id = $3`,
      [refreshed.access_token, newExpiry, row.id]
    );

    res.json({ accessToken: refreshed.access_token });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/google/integration ─────────────────────────────────────────────

googleRouter.get("/integration", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;

    const result = await pool.query(
      `SELECT provider, access_token, expiry FROM user_integrations
       WHERE user_id = $1 AND provider = 'google'
       LIMIT 1`,
      [userId]
    );

    const integration = result.rows[0] ?? null;

    res.json({
      success: true,
      integration: {
        provider: "google",
        connected: Boolean(integration),
        expiry: integration?.expiry ? new Date(integration.expiry).toISOString() : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/google/integration — upsert Google token after OAuth ──────────

googleRouter.post("/integration", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;
    const { email, scopes, accessToken, refreshToken, expiresAt } = req.body as {
      clerkUserId?: string;
      appUserId?: string | null;
      email?: string | null;
      scopes?: string | null;
      accessToken?: string | null;
      refreshToken?: string | null;
      expiresAt?: number | null;
    };

    const expiry = typeof expiresAt === "number"
      ? new Date(expiresAt * 1000)
      : null;

    await pool.query(
      `INSERT INTO user_integrations (user_id, provider, email, scopes, access_token, refresh_token, expiry)
       VALUES ($1, 'google', $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, provider) DO UPDATE SET
         email = COALESCE(EXCLUDED.email, user_integrations.email),
         scopes = COALESCE(EXCLUDED.scopes, user_integrations.scopes),
         access_token = COALESCE(EXCLUDED.access_token, user_integrations.access_token),
         refresh_token = COALESCE(EXCLUDED.refresh_token, user_integrations.refresh_token),
         expiry = COALESCE(EXCLUDED.expiry, user_integrations.expiry),
         updated_at = NOW()`,
      [userId, email ?? null, scopes ?? null, accessToken ?? null, refreshToken ?? null, expiry]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/google/integration ──────────────────────────────────────────

googleRouter.delete("/integration", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;

    await pool.query(
      `DELETE FROM user_integrations WHERE user_id = $1 AND provider = 'google'`,
      [userId]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/google/calendar ─────────────────────────────────────────────────

googleRouter.get("/calendar", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;

    const result = await pool.query(
      `SELECT access_token FROM user_integrations
       WHERE user_id = $1 AND provider = 'google'
       LIMIT 1`,
      [userId]
    );

    const integration = result.rows[0] ?? null;

    if (!integration?.access_token) {
      return next(new NotFoundError("Google is not connected."));
    }

    const timeMin = new Date().toISOString();
    const calendarUrl =
      `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
      `?timeMin=${encodeURIComponent(timeMin)}&maxResults=20&singleEvents=true&orderBy=startTime`;

    const calResponse = await fetch(calendarUrl, {
      headers: {
        Authorization: `Bearer ${integration.access_token}`,
      },
    });

    if (!calResponse.ok) {
      if (calResponse.status === 401 || calResponse.status === 403) {
        return res.status(401).json({ error: "Google access token is invalid or expired. Please reconnect." });
      }
      return res.status(502).json({ error: "Failed to fetch Google Calendar events." });
    }

    const calData = (await calResponse.json()) as { items?: unknown[] };
    const meetings = calData.items ?? [];

    res.json({ success: true, meetings });
  } catch (err) {
    next(err);
  }
});
