import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { pool } from "../db/client";
import { BadRequestError, NotFoundError } from "../lib/errors";
import * as botClient from "../lib/bot-client";

export const meetingsRouter = Router();

// ─── camelCase transformer ────────────────────────────────────────────────────
// PostgreSQL returns snake_case columns; frontend expects camelCase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toCamel(row: Record<string, any>): Record<string, any> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    result[camel] = row[key];
  }
  return result;
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createMeetingSchema = z.object({
  title: z.string().min(1, "Title is required"),
  meetingLink: z.string().min(1, "Meeting link is required"),
  workspaceId: z.string().uuid().optional().nullable(),
  provider: z.string().optional(),
  scheduledStartTime: z.string().optional().nullable(),
  scheduledEndTime: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.string().optional(),
  visibility: z.string().optional(),
});

const patchMeetingSchema = z.object({
  title: z.string().min(1).optional(),
  meetingLink: z.string().min(1).optional(),
  workspaceId: z.string().uuid().nullable().optional(),
  provider: z.string().optional(),
  scheduledStartTime: z.string().nullable().optional(),
  scheduledEndTime: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.string().optional(),
  visibility: z.string().optional(),
}).strict();

// ─── Helper: check workspace membership ──────────────────────────────────────

async function isActiveWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT id FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND status = 'active' LIMIT 1`,
    [workspaceId, userId]
  );
  return result.rows.length > 0;
}

// ─── GET / ────────────────────────────────────────────────────────────────────

meetingsRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;
    const { workspaceId } = req.query as { workspaceId?: string };
    let result;
    if (workspaceId) {
      result = await pool.query(`SELECT * FROM meeting_sessions WHERE workspace_id = $1 ORDER BY created_at DESC`, [workspaceId]);
    } else {
      result = await pool.query(`SELECT * FROM meeting_sessions WHERE user_id = $1 AND status NOT IN ('draft', 'deleted') ORDER BY created_at DESC`, [userId]);
    }
    res.json(result.rows.map(toCamel));
  } catch (err) { next(err); }
});

// ─── POST / ───────────────────────────────────────────────────────────────────

meetingsRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createMeetingSchema.safeParse(req.body);
    if (!parsed.success) return next(new BadRequestError(parsed.error.message));
    const userId = req.appUser.id;
    const { title, meetingLink, workspaceId = null, provider = "google_meet", scheduledStartTime = null, scheduledEndTime = null, notes = null, status = "draft", visibility = "workspace" } = parsed.data;

    // ── Upsert: reuse existing record if one exists for this calendar event or meeting link ──
    const externalId = (req.body as Record<string, unknown>).externalCalendarEventId as string | undefined;
    let existingRow: Record<string, unknown> | null = null;

    if (externalId) {
      const existing = await pool.query(
        `SELECT * FROM meeting_sessions WHERE external_calendar_event_id = $1 AND user_id = $2 LIMIT 1`,
        [externalId, userId]
      );
      existingRow = existing.rows[0] ?? null;
    }
    // Fallback: match by meeting_link (catches bot-recorded meetings with no externalCalendarEventId)
    if (!existingRow && meetingLink) {
      const existing = await pool.query(
        `SELECT * FROM meeting_sessions WHERE meeting_link = $1 AND user_id = $2 AND status NOT IN ('deleted') ORDER BY created_at DESC LIMIT 1`,
        [meetingLink, userId]
      );
      existingRow = existing.rows[0] ?? null;
    }

    if (existingRow) {
      // Reuse existing record — only reset status if it was failed/deleted
      const updated = await pool.query(
        `UPDATE meeting_sessions SET title = $1, status = CASE WHEN status IN ('failed','deleted') THEN $2 ELSE status END, updated_at = NOW() WHERE id = $3 RETURNING *`,
        [title, status, existingRow.id]
      );
      return res.status(200).json(toCamel(updated.rows[0]));
    }

    const result = await pool.query(
      `INSERT INTO meeting_sessions (user_id, workspace_id, title, meeting_link, provider, scheduled_start_time, scheduled_end_time, external_calendar_event_id, notes, status, visibility) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [userId, workspaceId, title, meetingLink, provider, scheduledStartTime, scheduledEndTime, externalId ?? null, notes, status, visibility]
    );
    res.status(201).json(toCamel(result.rows[0]));
  } catch (err) { next(err); }
});

// ─── GET /today ───────────────────────────────────────────────────────────────

meetingsRouter.get("/today", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;
    const result = await pool.query(
      `SELECT * FROM meeting_sessions WHERE user_id = $1 AND scheduled_start_time >= date_trunc('day', NOW() AT TIME ZONE 'UTC') AND scheduled_start_time < date_trunc('day', NOW() AT TIME ZONE 'UTC') + INTERVAL '1 day' ORDER BY scheduled_start_time ASC`,
      [userId]
    );
    res.json(result.rows.map(toCamel));
  } catch (err) { next(err); }
});

// ─── GET /upcoming ────────────────────────────────────────────────────────────

meetingsRouter.get("/upcoming", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;
    const result = await pool.query(`SELECT * FROM meeting_sessions WHERE user_id = $1 AND scheduled_start_time > NOW() ORDER BY scheduled_start_time ASC`, [userId]);
    res.json(result.rows.map(toCamel));
  } catch (err) { next(err); }
});

// ─── GET /calendar-feed ───────────────────────────────────────────────────────

meetingsRouter.get("/calendar-feed", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;

    // ── 1. Fetch connected calendar tokens ──────────────────────────────────
    const tokenRows = await pool.query(
      `SELECT provider, access_token, refresh_token, expiry FROM user_integrations
       WHERE user_id = $1 AND provider IN ('google', 'microsoft_teams', 'microsoft_outlook')`,
      [userId]
    );
    const tokenMap = new Map<string, { accessToken: string; refreshToken: string | null; expiry: Date | null }>();
    for (const row of tokenRows.rows) {
      if (row.access_token) {
        tokenMap.set(row.provider, {
          accessToken: row.access_token,
          refreshToken: row.refresh_token ?? null,
          expiry: row.expiry ? new Date(row.expiry) : null,
        });
      }
    }

    const meetings: Array<{
      id: string; title: string; startTime: string; endTime: string;
      meetLink: string | null; provider: string; source: string;
    }> = [];
    const failedProviders: Array<{ provider: string; error: string }> = [];

    // ── 2. Fetch Google Calendar events ─────────────────────────────────────
    const googleToken = tokenMap.get("google");
    if (googleToken) {
      try {
        const timeMin = start ? start.toISOString() : new Date().toISOString();
        const timeMax = end ? end.toISOString() : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
          `?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}` +
          `&maxResults=50&singleEvents=true&orderBy=startTime`;

        let accessToken = googleToken.accessToken;

        // Try to refresh if token is expired or close to expiry
        const isExpired = !googleToken.expiry || googleToken.expiry.getTime() < Date.now() + 5 * 60 * 1000;
        if (isExpired && googleToken.refreshToken) {
          try {
            const clientId = process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID ?? "";
            const clientSecret = process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "";
            const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: "refresh_token",
                refresh_token: googleToken.refreshToken,
              }),
            });
            if (refreshRes.ok) {
              const refreshed = await refreshRes.json() as { access_token?: string; expires_in?: number };
              if (refreshed.access_token) {
                accessToken = refreshed.access_token;
                const newExpiry = refreshed.expires_in
                  ? new Date(Date.now() + refreshed.expires_in * 1000)
                  : null;
                await pool.query(
                  `UPDATE user_integrations SET access_token = $1, expiry = $2, updated_at = NOW()
                   WHERE user_id = $3 AND provider = 'google'`,
                  [accessToken, newExpiry, userId]
                );
              }
            }
          } catch { /* use existing token */ }
        }

        const gcalRes = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (gcalRes.ok) {
          const gcalData = await gcalRes.json() as { items?: Array<{
            id?: string; summary?: string;
            start?: { dateTime?: string; date?: string };
            end?: { dateTime?: string; date?: string };
            hangoutLink?: string;
            conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
          }> };
          for (const item of gcalData.items ?? []) {
            const startTime = item.start?.dateTime ?? item.start?.date ?? "";
            const endTime = item.end?.dateTime ?? item.end?.date ?? "";
            const meetLink = item.hangoutLink ??
              item.conferenceData?.entryPoints?.find(e => e.entryPointType === "video")?.uri ?? null;
            meetings.push({
              id: `google_${item.id ?? Math.random()}`,
              title: item.summary ?? "Untitled",
              startTime,
              endTime,
              meetLink,
              provider: "google",
              source: "google_calendar",
            });
          }
        } else if (gcalRes.status === 401 || gcalRes.status === 403) {
          // Only delete if no refresh token — otherwise just report partial failure
          if (!googleToken.refreshToken) {
            await pool.query(`DELETE FROM user_integrations WHERE user_id = $1 AND provider = 'google'`, [userId]);
          }
          failedProviders.push({ provider: "google", error: "Google token expired. Please reconnect Google Calendar." });
        } else {
          failedProviders.push({ provider: "google", error: "Failed to fetch Google Calendar events." });
        }
      } catch {
        failedProviders.push({ provider: "google", error: "Google Calendar request failed." });
      }
    }

    // ── 3. Fetch Microsoft Calendar events (Teams + Outlook share same token) ─
    const msProviders = ["microsoft_teams", "microsoft_outlook"] as const;
    let msFetched = false;
    for (const msProvider of msProviders) {
      const msToken = tokenMap.get(msProvider);
      if (!msToken || msFetched) continue;
      msFetched = true; // both providers use same MS Graph token — fetch once
      try {
        const timeMin = start ? start.toISOString() : new Date().toISOString();
        const timeMax = end ? end.toISOString() : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const url = `https://graph.microsoft.com/v1.0/me/calendarView` +
          `?startDateTime=${encodeURIComponent(timeMin)}&endDateTime=${encodeURIComponent(timeMax)}` +
          `&$top=50&$select=id,subject,start,end,onlineMeeting,webLink`;

        const msRes = await fetch(url, {
          headers: { Authorization: `Bearer ${msToken.accessToken}` },
        });

        if (msRes.ok) {
          const msData = await msRes.json() as { value?: Array<{
            id?: string; subject?: string;
            start?: { dateTime?: string };
            end?: { dateTime?: string };
            onlineMeeting?: { joinUrl?: string };
            webLink?: string;
          }> };
          for (const item of msData.value ?? []) {
            const startTime = item.start?.dateTime ? new Date(item.start.dateTime + "Z").toISOString() : "";
            const endTime = item.end?.dateTime ? new Date(item.end.dateTime + "Z").toISOString() : "";
            meetings.push({
              id: `ms_${item.id ?? Math.random()}`,
              title: item.subject ?? "Untitled",
              startTime,
              endTime,
              meetLink: item.onlineMeeting?.joinUrl ?? item.webLink ?? null,
              provider: msProvider,
              source: msProvider,
            });
          }
        } else if (msRes.status === 401 || msRes.status === 403) {
          for (const p of msProviders) {
            await pool.query(`DELETE FROM user_integrations WHERE user_id = $1 AND provider = $2`, [userId, p]);
          }
          failedProviders.push({ provider: msProvider, error: "Token expired. Please reconnect Microsoft Calendar." });
        } else {
          failedProviders.push({ provider: msProvider, error: "Failed to fetch Microsoft Calendar events." });
        }
      } catch {
        failedProviders.push({ provider: msProvider, error: "Microsoft Calendar request failed." });
      }
    }

    // ── 4. Sort by startTime ─────────────────────────────────────────────────
    meetings.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    return res.json({
      meetings,
      ...(failedProviders.length > 0 ? { partialFailure: { failedProviders } } : {}),
    });
  } catch (err) { next(err); }
});

// ─── GET /joined ──────────────────────────────────────────────────────────────

meetingsRouter.get("/joined", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;
    const workspaceId = req.headers["x-workspace-id"] as string | undefined;
    let result;
    if (workspaceId) {
      result = await pool.query(`SELECT * FROM meeting_sessions WHERE workspace_id = $1 AND status NOT IN ('draft', 'deleted') ORDER BY created_at DESC`, [workspaceId]);
    } else {
      result = await pool.query(`SELECT * FROM meeting_sessions WHERE user_id = $1 AND status NOT IN ('draft', 'deleted') ORDER BY created_at DESC`, [userId]);
    }
    res.json({ success: true, meetings: result.rows.map(toCamel) });
  } catch (err) { next(err); }
});

// ─── GET /reports ─────────────────────────────────────────────────────────────

meetingsRouter.get("/reports", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;
    const workspaceId = req.headers["x-workspace-id"] as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const status = (req.query.status as string) || "all";
    const date = (req.query.date as string) || "all";
    const search = ((req.query.search as string) || "").trim();

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (workspaceId) {
      conditions.push(`workspace_id = $${idx++}`);
      values.push(workspaceId);
    } else {
      conditions.push(`user_id = $${idx++}`);
      values.push(userId);
    }
    conditions.push(`status != 'draft'`);
    conditions.push(`status != 'deleted'`);
    if (status !== "all") {
      if (status === "recording") {
        conditions.push(`status IN ('capturing', 'recording', 'processing', 'summarizing', 'processing_transcript', 'transcribed', 'processing_summary')`); 
      } else {
        conditions.push(`status = $${idx++}`);
        values.push(status);
      }
    }
    if (date === "week") conditions.push(`created_at >= NOW() - INTERVAL '7 days'`);
    else if (date === "month") conditions.push(`created_at >= NOW() - INTERVAL '30 days'`);
    if (search) { conditions.push(`(title ILIKE $${idx} OR summary ILIKE $${idx})`); values.push(`%${search}%`); idx++; }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM meeting_sessions ${where}`, values);
    const total: number = countResult.rows[0]?.total ?? 0;
    const itemsResult = await pool.query(`SELECT * FROM meeting_sessions ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`, [...values, limit, offset]);

    res.json({ success: true, meetings: itemsResult.rows.map(toCamel), pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────

meetingsRouter.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.appUser.id;
    const result = await pool.query(`SELECT * FROM meeting_sessions WHERE id = $1 LIMIT 1`, [id]);
    const session = result.rows[0] ?? null;
    if (!session) return next(new NotFoundError("Meeting not found"));
    const isOwner = session.user_id === userId;
    let hasAccess = isOwner;
    if (!hasAccess && session.workspace_id) hasAccess = await isActiveWorkspaceMember(session.workspace_id, userId);
    if (!hasAccess) return next(new NotFoundError("Meeting not found"));

    // Parse JSON fields safely
    const parseJson = (val: unknown) => {
      if (!val) return null;
      if (typeof val === "object") return val;
      try { return JSON.parse(val as string); } catch { return null; }
    };
    const parseJsonArray = (val: unknown): unknown[] => {
      const parsed = parseJson(val);
      return Array.isArray(parsed) ? parsed : [];
    };

    const meeting = {
      id: session.id,
      meetingSessionId: session.id, // same as id in migrated system
      userId: session.user_id,
      workspaceId: session.workspace_id ?? null,
      aiRunId: session.ai_run_id ?? null,
      provider: session.provider ?? "google_meet",
      title: session.title,
      meetingLink: session.meeting_link,
      notes: session.notes ?? null,
      transcript: session.transcript ?? null,
      summary: session.summary ?? null,
      keyPoints: parseJsonArray(session.key_points),
      keyDecisions: parseJsonArray(session.key_decisions),
      actionItems: parseJsonArray(session.action_items),
      risksAndBlockers: parseJsonArray(session.risks_and_blockers),
      keyTopics: parseJsonArray(session.key_topics ?? session.key_points),
      meetingSentiment: session.meeting_sentiment ?? null,
      followUpNeeded: session.follow_up_needed ?? false,
      status: session.status,
      errorCode: session.error_code ?? null,
      failureReason: session.failure_reason ?? null,
      failedAt: session.failed_at ?? null,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      scheduledStartTime: session.scheduled_start_time ?? null,
      scheduledEndTime: session.scheduled_end_time ?? null,
      externalCalendarEventId: session.external_calendar_event_id ?? null,
      recordingUrl: session.recording_url ?? (session.recording_file_path ? `/api/recordings/${session.id}` : null),
      recordingSize: session.recording_size ?? null,
      recordingDuration: session.recording_duration ?? session.meeting_duration ?? null,
      recordingStartedAt: session.recording_started_at ?? null,
      recordingEndedAt: session.recording_ended_at ?? null,
      meetingDuration: session.meeting_duration ?? null,
      insights: parseJson(session.insights),
      chapters: parseJsonArray(session.chapters),
      participants: parseJsonArray(session.participants),
      sharedWithUserIds: parseJsonArray(session.shared_with_user_ids),
      visibility: session.visibility ?? "workspace",
      followUpEmail: session.follow_up_email ?? null,
      emailSent: Boolean(session.email_sent),
      emailSentAt: session.email_sent_at ?? null,
      workspaceMoveStatus: session.workspace_move_status ?? null,
      canJoinAndCapture: true,
      isOwner,
    };

    res.json({ success: true, meeting });
  } catch (err) { next(err); }
});

// ─── PATCH /:id ───────────────────────────────────────────────────────────────

meetingsRouter.patch("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.appUser.id;
    const existing = await pool.query(`SELECT id, user_id FROM meeting_sessions WHERE id = $1 LIMIT 1`, [id]);
    if (!existing.rows[0] || existing.rows[0].user_id !== userId) return next(new NotFoundError("Meeting not found"));
    const parsed = patchMeetingSchema.safeParse(req.body);
    if (!parsed.success) return next(new BadRequestError(parsed.error.message));
    const updates = parsed.data;
    if (Object.keys(updates).length === 0) {
      const current = await pool.query(`SELECT * FROM meeting_sessions WHERE id = $1 LIMIT 1`, [id]);
      return res.json(toCamel(current.rows[0]));
    }
    const fieldMap: Record<string, string> = { title: "title", meetingLink: "meeting_link", workspaceId: "workspace_id", provider: "provider", scheduledStartTime: "scheduled_start_time", scheduledEndTime: "scheduled_end_time", notes: "notes", status: "status", visibility: "visibility" };
    const setClauses: string[] = ["updated_at = NOW()"];
    const values: unknown[] = [];
    let paramIdx = 1;
    for (const [key, col] of Object.entries(fieldMap)) {
      if (key in updates) { setClauses.push(`${col} = $${paramIdx++}`); values.push((updates as Record<string, unknown>)[key]); }
    }
    values.push(id);
    const result = await pool.query(`UPDATE meeting_sessions SET ${setClauses.join(", ")} WHERE id = $${paramIdx} RETURNING *`, values);
    res.json(toCamel(result.rows[0]));
  } catch (err) { next(err); }
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

meetingsRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.appUser.id;
    const result = await pool.query(`DELETE FROM meeting_sessions WHERE id = $1 AND user_id = $2 RETURNING id`, [id, userId]);
    if (!result.rows[0]) return next(new NotFoundError("Meeting not found"));
    res.status(204).send();
  } catch (err) { next(err); }
});

// ─── POST /:id/bot/start ──────────────────────────────────────────────────────

meetingsRouter.post("/:id/bot/start", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.appUser.id;
    const result = await pool.query(`SELECT id FROM meeting_sessions WHERE id = $1 AND user_id = $2 LIMIT 1`, [id, userId]);
    if (!result.rows[0]) return next(new NotFoundError("Meeting not found"));
    try {
      await botClient.startBot(id);
    } catch (botErr) {
      const msg = botErr instanceof Error ? botErr.message : "Bot service unavailable";
      return res.status(503).json({ error: "Bot service unavailable. Make sure the Python bot is running.", details: msg });
    }
    res.status(202).json({ status: "accepted" });
  } catch (err) { next(err); }
});

// ─── POST /:id/bot/stop ───────────────────────────────────────────────────────

meetingsRouter.post("/:id/bot/stop", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.appUser.id;
    const result = await pool.query(`SELECT id FROM meeting_sessions WHERE id = $1 AND user_id = $2 LIMIT 1`, [id, userId]);
    if (!result.rows[0]) return next(new NotFoundError("Meeting not found"));
    await botClient.stopBot(id);
    res.status(202).json({ status: "accepted" });
  } catch (err) { next(err); }
});

// ─── POST /:id/share/integrations ────────────────────────────────────────────

meetingsRouter.post("/:id/share/integrations", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.appUser.id;
    const meetingResult = await pool.query(`SELECT id, user_id FROM meeting_sessions WHERE id = $1 LIMIT 1`, [id]);
    const session = meetingResult.rows[0] ?? null;
    if (!session || session.user_id !== userId) return next(new NotFoundError("Meeting not found"));
    const intResult = await pool.query(`SELECT type FROM integrations WHERE user_id = $1 AND enabled = true`, [userId]);
    res.json({ meetingId: id, sharedTo: intResult.rows.map((r: { type: string }) => r.type) });
  } catch (err) { next(err); }
});

// ─── GET /:id/status ──────────────────────────────────────────────────────────

meetingsRouter.get("/:id/status", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.appUser.id;
    const result = await pool.query(
      `SELECT id, user_id, workspace_id, status, error_code, failure_reason,
              transcript, summary, key_points, key_decisions, action_items,
              risks_and_blockers, recording_file_path, recording_url,
              recording_started_at, recording_ended_at, recording_duration,
              meeting_duration, insights, chapters, auto_share_failures
       FROM meeting_sessions WHERE id = $1 LIMIT 1`,
      [id]
    );
    const session = result.rows[0] ?? null;
    if (!session) return next(new NotFoundError("Meeting not found"));
    const isOwner = session.user_id === userId;
    let hasAccess = isOwner;
    if (!hasAccess && session.workspace_id) hasAccess = await isActiveWorkspaceMember(session.workspace_id, userId);
    if (!hasAccess) return next(new NotFoundError("Meeting not found"));

    res.json({
      state: session.status,
      status: session.status,
      botStatus: session.error_code ?? null,
      errorCode: session.error_code ?? null,
      failureReason: session.failure_reason ?? null,
      transcript: session.transcript ?? null,
      summary: session.summary ? (() => {
        try {
          return typeof session.summary === "string" ? JSON.parse(session.summary) : session.summary;
        } catch { return { summary: session.summary }; }
      })() : null,
      keyPoints: Array.isArray(session.key_points) ? session.key_points : [],
      keyDecisions: Array.isArray(session.key_decisions) ? session.key_decisions : [],
      actionItems: Array.isArray(session.action_items) ? session.action_items : [],
      risksAndBlockers: Array.isArray(session.risks_and_blockers) ? session.risks_and_blockers : [],
      recordingUrl: session.recording_url ?? null,
      recordingDuration: session.recording_duration ?? session.meeting_duration ?? null,
      recordingStartedAt: session.recording_started_at ?? null,
      recordingEndedAt: session.recording_ended_at ?? null,
      insights: session.insights ?? null,
      chapters: session.chapters ?? null,
      autoShareFailures: Array.isArray(session.auto_share_failures) ? session.auto_share_failures : null,
    });
  } catch (err) { next(err); }
});

// ─── POST /:id/request-move ───────────────────────────────────────────────────

meetingsRouter.post("/:id/request-move", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.appUser.id;
    const { workspaceId } = req.body as { workspaceId?: string };

    if (!workspaceId) return next(new BadRequestError("workspaceId is required."));

    // Verify meeting ownership
    const meetingResult = await pool.query(
      `SELECT id, user_id, workspace_id, workspace_move_status FROM meeting_sessions WHERE id = $1 LIMIT 1`,
      [id]
    );
    const meeting = meetingResult.rows[0] ?? null;
    if (!meeting || meeting.user_id !== userId) return next(new NotFoundError("Meeting not found"));

    // Check workspace exists and user is a member
    const memberResult = await pool.query(
      `SELECT id, role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND status = 'active' LIMIT 1`,
      [workspaceId, userId]
    );
    if (!memberResult.rows[0]) return next(new BadRequestError("You are not a member of this workspace."));

    // If already in this workspace, no-op
    if (meeting.workspace_id === workspaceId) {
      return res.json({ success: true, message: "Meeting is already in this workspace." });
    }

    // Upsert move request
    await pool.query(
      `INSERT INTO workspace_move_requests (meeting_id, workspace_id, requested_by, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT DO NOTHING`,
      [id, workspaceId, userId]
    );

    // Update meeting's workspace_move_status
    await pool.query(
      `UPDATE meeting_sessions SET workspace_move_status = 'pending', updated_at = NOW() WHERE id = $1`,
      [id]
    );

    res.json({ success: true, message: "Move request submitted." });
  } catch (err) { next(err); }
});

// ─── POST /:id/move-to-workspace ─────────────────────────────────────────────
// Admin → instant share. Member → pending approval via workspace_move_requests.

meetingsRouter.post("/:id/move-to-workspace", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.appUser.id;
    const { workspaceId } = req.body as { workspaceId?: string };

    if (!workspaceId) return next(new BadRequestError("workspaceId is required."));

    // Verify meeting ownership
    const meetingResult = await pool.query(
      `SELECT id, user_id, workspace_id FROM meeting_sessions WHERE id = $1 LIMIT 1`,
      [id]
    );
    const meeting = meetingResult.rows[0] ?? null;
    if (!meeting || meeting.user_id !== userId) return next(new NotFoundError("Meeting not found"));

    if (meeting.workspace_id === workspaceId) {
      return res.json({ success: true, message: "Already in workspace.", status: "approved" });
    }

    // Check user's role in the target workspace
    const memberResult = await pool.query(
      `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND status = 'active' LIMIT 1`,
      [workspaceId, userId]
    );
    const member = memberResult.rows[0] ?? null;
    if (!member) return res.status(403).json({ success: false, message: "Not a workspace member.", details: { error: "admin_required" } });

    if (member.role === "admin") {
      // Admin — instant share
      await pool.query(
        `UPDATE meeting_sessions SET workspace_id = $1, workspace_move_status = 'approved', workspace_moved_by = $2, workspace_moved_at = NOW(), updated_at = NOW() WHERE id = $3`,
        [workspaceId, userId, id]
      );
      return res.json({ success: true, status: "approved", message: "Meeting shared to workspace." });
    } else {
      // Member — create pending request
      await pool.query(
        `INSERT INTO workspace_move_requests (meeting_id, workspace_id, requested_by, status)
         VALUES ($1, $2, $3, 'pending')
         ON CONFLICT (meeting_id, workspace_id) DO UPDATE SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL`,
        [id, workspaceId, userId]
      );
      await pool.query(
        `UPDATE meeting_sessions SET workspace_move_status = 'pending', updated_at = NOW() WHERE id = $1`,
        [id]
      );
      return res.json({ success: true, status: "pending", message: "Move request submitted. Awaiting admin approval." });
    }
  } catch (err) { next(err); }
});

// ─── DELETE /:id/move-to-workspace ───────────────────────────────────────────

meetingsRouter.delete("/:id/move-to-workspace", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.appUser.id;

    const meetingResult = await pool.query(
      `SELECT id, user_id, workspace_id FROM meeting_sessions WHERE id = $1 LIMIT 1`,
      [id]
    );
    const meeting = meetingResult.rows[0] ?? null;
    if (!meeting) return next(new NotFoundError("Meeting not found"));

    // Allow owner or workspace admin to remove
    let canRemove = meeting.user_id === userId;
    if (!canRemove && meeting.workspace_id) {
      const adminCheck = await pool.query(
        `SELECT id FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND role = 'admin' AND status = 'active' LIMIT 1`,
        [meeting.workspace_id, userId]
      );
      canRemove = adminCheck.rows.length > 0;
    }
    if (!canRemove) return next(new NotFoundError("Meeting not found"));

    await pool.query(
      `UPDATE meeting_sessions SET workspace_id = NULL, workspace_move_status = NULL, workspace_moved_by = NULL, workspace_moved_at = NULL, updated_at = NOW() WHERE id = $1`,
      [id]
    );
    await pool.query(`DELETE FROM workspace_move_requests WHERE meeting_id = $1`, [id]);

    res.json({ success: true, message: "Meeting removed from workspace." });
  } catch (err) { next(err); }
});

// ─── POST /share-calendar ─────────────────────────────────────────────────────
// Creates a DB record for a calendar event and instantly shares it to a workspace.

meetingsRouter.post("/share-calendar", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;
    const { workspaceId, title, meetingLink, scheduledStartTime, scheduledEndTime, provider, externalCalendarEventId } =
      req.body as {
        workspaceId?: string; title?: string; meetingLink?: string;
        scheduledStartTime?: string; scheduledEndTime?: string;
        provider?: string; externalCalendarEventId?: string;
      };

    if (!workspaceId || !title || !meetingLink) {
      return next(new BadRequestError("workspaceId, title, and meetingLink are required."));
    }

    // Check user's role in workspace
    const memberResult = await pool.query(
      `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND status = 'active' LIMIT 1`,
      [workspaceId, userId]
    );
    const member = memberResult.rows[0] ?? null;
    if (!member) return res.status(403).json({ success: false, message: "Not a workspace member.", details: { error: "admin_required" } });

    // Check if a DB record already exists for this meeting
    // Priority: 1) externalCalendarEventId match, 2) meeting_link match (for bot-recorded meetings)
    let existingId: string | null = null;
    if (externalCalendarEventId) {
      const existing = await pool.query(
        `SELECT id FROM meeting_sessions WHERE external_calendar_event_id = $1 AND user_id = $2 LIMIT 1`,
        [externalCalendarEventId, userId]
      );
      existingId = existing.rows[0]?.id ?? null;
    }
    // Fallback: find by meeting_link — catches bot-recorded meetings with no externalCalendarEventId
    if (!existingId && meetingLink) {
      const existing = await pool.query(
        `SELECT id FROM meeting_sessions WHERE meeting_link = $1 AND user_id = $2 AND status NOT IN ('deleted') ORDER BY created_at DESC LIMIT 1`,
        [meetingLink, userId]
      );
      existingId = existing.rows[0]?.id ?? null;
    }

    const isAdmin = member.role === "admin";
    const moveStatus = isAdmin ? "approved" : "pending";

    if (existingId) {
      // Update existing record
      await pool.query(
        `UPDATE meeting_sessions SET workspace_id = $1, workspace_move_status = $2, updated_at = NOW() WHERE id = $3`,
        [isAdmin ? workspaceId : null, moveStatus, existingId]
      );
      if (!isAdmin) {
        await pool.query(
          `INSERT INTO workspace_move_requests (meeting_id, workspace_id, requested_by, status)
           VALUES ($1, $2, $3, 'pending')
           ON CONFLICT (meeting_id, workspace_id) DO UPDATE SET status = 'pending'`,
          [existingId, workspaceId, userId]
        );
      }
      return res.json({ success: true, meetingId: existingId, status: moveStatus });
    }

    // Create new DB record
    const insertResult = await pool.query(
      `INSERT INTO meeting_sessions (user_id, workspace_id, title, meeting_link, provider, scheduled_start_time, scheduled_end_time, external_calendar_event_id, status, workspace_move_status, visibility)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled', $9, 'workspace')
       RETURNING id`,
      [
        userId,
        isAdmin ? workspaceId : null,
        title, meetingLink,
        provider ?? "google_meet",
        scheduledStartTime ?? null,
        scheduledEndTime ?? null,
        externalCalendarEventId ?? null,
        moveStatus,
      ]
    );
    const newId: string = insertResult.rows[0].id;

    if (!isAdmin) {
      await pool.query(
        `INSERT INTO workspace_move_requests (meeting_id, workspace_id, requested_by, status) VALUES ($1, $2, $3, 'pending')`,
        [newId, workspaceId, userId]
      );
    }

    res.status(201).json({ success: true, meetingId: newId, status: moveStatus });
  } catch (err) { next(err); }
});
