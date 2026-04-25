import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { pool } from "../db/client";
import { NotFoundError, ForbiddenError, BadRequestError } from "../lib/errors";

export const meetingSessionsRouter = Router();

// ── Auto-share helper ─────────────────────────────────────────────────────────

async function triggerAutoShare(userId: string, meetingId: string, row: Record<string, unknown>) {
  // 1. Fetch user's auto-share preferences
  const prefResult = await pool.query(
    `SELECT auto_share_targets FROM user_preferences WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  const autoShareTargets = (prefResult.rows[0]?.auto_share_targets ?? {}) as Record<string, boolean>;
  const enabledTargets = Object.entries(autoShareTargets)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);

  if (enabledTargets.length === 0) return;

  // 2. Fetch enabled integrations with their configs
  const intResult = await pool.query(
    `SELECT type, config FROM integrations WHERE user_id = $1 AND enabled = true AND type = ANY($2)`,
    [userId, enabledTargets]
  );
  if (intResult.rows.length === 0) return;

  // 3. Parse meeting data
  const parseJson = (val: unknown) => {
    if (!val) return null;
    if (typeof val === "object") return val;
    try { return JSON.parse(val as string); } catch { return null; }
  };
  const parseArr = (val: unknown): unknown[] => {
    const p = parseJson(val); return Array.isArray(p) ? p : [];
  };

  const title = String(row.title ?? "Meeting");
  const transcript = String(row.transcript ?? "");
  const rawSummary = parseJson(row.summary);
  const summaryText = typeof rawSummary === "object" && rawSummary !== null
    ? String((rawSummary as Record<string, unknown>).summary ?? row.summary ?? "")
    : String(row.summary ?? "");
  const actionItems = parseArr(row.action_items).map((i) => {
    const item = i as Record<string, unknown>;
    return {
      task: String(item.task ?? ""),
      owner: String(item.owner ?? "Unassigned"),
      due_date: String(item.due_date ?? item.dueDate ?? "Not specified"),
      priority: String(item.priority ?? "Medium"),
    };
  });
  const keyPoints = parseArr(row.key_points).map(String);
  const keyDecisions = parseArr(row.key_decisions).map(String);

  const summaryObj = { summary: summaryText, action_items: actionItems, key_points: keyPoints, key_decisions: keyDecisions };

  // 4. Fire each enabled integration
  const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";
  const failures: Array<{ integration: string; error: string }> = [];

  for (const integration of intResult.rows) {
    const type: string = integration.type;
    const config = (integration.config ?? {}) as Record<string, unknown>;

    try {
      switch (type) {
        case "slack": {
          if (!config.webhookUrl) break;
          const actionItemsText = actionItems.length > 0
            ? actionItems.map((i) => `• *${i.task}* — ${i.owner} (${i.due_date})`).join("\n")
            : "_No action items_";
          const keyPointsText = keyPoints.length > 0 ? keyPoints.map((p) => `• ${p}`).join("\n") : "_No key points_";
          const slackRes = await fetch(String(config.webhookUrl), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              blocks: [
                { type: "header", text: { type: "plain_text", text: `📋 Meeting Summary: ${title}`, emoji: true } },
                { type: "section", text: { type: "mrkdwn", text: summaryText || "No summary available" } },
                { type: "divider" },
                { type: "section", text: { type: "mrkdwn", text: `*💡 Key Points*\n${keyPointsText}` } },
                { type: "divider" },
                { type: "section", text: { type: "mrkdwn", text: `*✅ Action Items*\n${actionItemsText}` } },
                { type: "context", elements: [{ type: "mrkdwn", text: `_Auto-shared by Artivaa — <${FRONTEND_URL}/dashboard/meetings/${meetingId}|View Meeting>_` }] },
              ],
            }),
          });
          if (!slackRes.ok) throw new Error(`Slack webhook returned ${slackRes.status}`);
          console.log(`[AutoShare] Slack ✓ for meeting ${meetingId}`);
          break;
        }

        case "notion": {
          const webhookUrl = String(config.webhookUrl ?? "");
          if (!webhookUrl) break;
          const notionRes = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title,
              summary: summaryText,
              action_items: actionItems,
              key_points: keyPoints,
              transcript: transcript.substring(0, 5000),
              source: "artivaa",
              timestamp: new Date().toISOString(),
            }),
          });
          if (!notionRes.ok) throw new Error(`Notion webhook returned ${notionRes.status}`);
          console.log(`[AutoShare] Notion ✓ for meeting ${meetingId}`);
          break;
        }

        case "jira": {
          const webhookUrl = String(config.webhookUrl ?? "");
          if (!webhookUrl || actionItems.length === 0) break;
          const jiraRes = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title,
              summary: summaryText,
              action_items: actionItems,
              source: "artivaa",
              timestamp: new Date().toISOString(),
            }),
          });
          if (!jiraRes.ok) throw new Error(`Jira webhook returned ${jiraRes.status}`);
          console.log(`[AutoShare] Jira ✓ for meeting ${meetingId}`);
          break;
        }

        case "gmail": {
          // Gmail requires a Google OAuth access token — fetch from user_integrations
          const tokenResult = await pool.query(
            `SELECT access_token FROM user_integrations WHERE user_id = $1 AND provider = 'google' LIMIT 1`,
            [userId]
          );
          const accessToken = tokenResult.rows[0]?.access_token;
          if (!accessToken || !config.recipients) break;

          const recipients = String(config.recipients).split(",").map((r: string) => r.trim()).filter(Boolean);
          if (recipients.length === 0) break;

          const actionItemsHtml = actionItems.length > 0
            ? actionItems.map((i) => `<li><b>${i.task}</b> — ${i.owner} (Due: ${i.due_date})</li>`).join("")
            : "<li>No action items</li>";
          const htmlBody = `<div style="font-family:Arial,sans-serif;max-width:600px"><h2>📋 ${title}</h2><p>${summaryText}</p><h3>✅ Action Items</h3><ul>${actionItemsHtml}</ul><p style="color:#9ca3af;font-size:12px">Auto-shared by Artivaa</p></div>`;
          const emailContent = [`To: ${recipients.join(", ")}`, "Content-Type: text/html; charset=utf-8", "MIME-Version: 1.0", `Subject: Meeting Summary: ${title}`, "", htmlBody].join("\n");
          const encoded = Buffer.from(emailContent).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

          await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ raw: encoded }),
          });
          console.log(`[AutoShare] Gmail ✓ for meeting ${meetingId}`);
          break;
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[AutoShare] ${type} failed for meeting ${meetingId}:`, errMsg);
      failures.push({ integration: type, error: errMsg });
    }
  }

  // Persist failures to the meeting_sessions row if any integrations failed
  if (failures.length > 0) {
    try {
      await pool.query(
        `UPDATE meeting_sessions SET auto_share_failures = $1::jsonb, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(failures), meetingId]
      );
    } catch (dbErr) {
      console.error(`[AutoShare] Failed to persist auto_share_failures for meeting ${meetingId}:`, dbErr instanceof Error ? dbErr.message : dbErr);
    }
  }
}

// ── Validation schemas ────────────────────────────────────────────────────────

const createSchema = z.object({
  title: z.string().trim().min(3, "Meeting title must be at least 3 characters long."),
  meetingLink: z.string().trim().url("Enter a valid meeting link."),
  externalCalendarEventId: z.string().trim().max(255).optional().nullable(),
  scheduledStartTime: z.string().datetime().optional().nullable(),
  scheduledEndTime: z.string().datetime().optional().nullable(),
  notes: z.string().trim().max(5000).optional().or(z.literal("")),
  provider: z.enum(["google_meet", "zoom_web", "teams_web"]).default("google_meet"),
});

const updateSchema = z.object({
  title: z.string().trim().min(3).optional(),
  provider: z.enum(["google_meet", "zoom_web", "teams_web"]).optional(),
  meetingLink: z.string().trim().url().optional(),
  externalCalendarEventId: z.string().trim().max(255).optional().nullable(),
  scheduledStartTime: z.string().datetime().optional().nullable(),
  scheduledEndTime: z.string().datetime().optional().nullable(),
  notes: z.string().trim().max(5000).optional().or(z.literal("")),
  errorCode: z.string().trim().max(100).optional().nullable(),
  failureReason: z.string().trim().max(5000).optional().nullable(),
  transcript: z.string().trim().optional(),
  summary: z.string().trim().optional(),
  keyDecisions: z.array(z.string().trim().min(1)).optional(),
  risksAndBlockers: z.array(z.string().trim().min(1)).optional(),
  keyTopics: z.array(z.string().trim().min(1)).optional(),
  meetingSentiment: z.string().trim().max(50).optional().nullable(),
  followUpNeeded: z.boolean().optional().nullable(),
  meetingDuration: z.number().int().nonnegative().optional().nullable(),
  followUpEmail: z.string().trim().optional(),
  keyPoints: z.array(z.string().trim().min(1)).optional(),
  actionItems: z.array(z.object({
    task: z.string(),
    owner: z.string(),
    deadline: z.string(),
    completed: z.boolean(),
  })).optional(),
  recordingFilePath: z.string().trim().optional().nullable(),
  recordingUrl: z.string().trim().optional().nullable(),
  recordingSize: z.number().int().nonnegative().optional().nullable(),
  recordingDuration: z.number().int().nonnegative().optional().nullable(),
  recordingStartedAt: z.string().datetime().optional().nullable(),
  recordingEndedAt: z.string().datetime().optional().nullable(),
  insights: z.record(z.any()).optional().nullable(),
  chapters: z.array(z.record(z.any())).optional().nullable(),
  emailSent: z.boolean().optional(),
  emailSentAt: z.string().trim().optional().nullable(),
  status: z.enum([
    "draft", "joining", "waiting_for_join", "waiting_for_admission", "joined",
    "capturing", "recording", "recorded", "processing_transcript", "transcribed",
    "processing_summary", "processing", "summarizing", "completed", "failed",
  ]).optional(),
  aiRunId: z.string().uuid().optional(),
});

// ── Helper: map DB row → MeetingSessionRecord ─────────────────────────────────

function toRecord(s: Record<string, unknown>) {
  const rawStatus = s.status as string;
  const normalizedStatus = rawStatus.startsWith("waiting_for_") ? "waiting_for_join" : rawStatus;

  return {
    id: s.id,
    workspaceId: s.workspace_id ?? null,
    title: s.title,
    meetingLink: s.meeting_link,
    externalCalendarEventId: s.external_calendar_event_id ?? null,
    provider: s.provider,
    scheduledStartTime: s.scheduled_start_time ? new Date(s.scheduled_start_time as string).toISOString() : null,
    scheduledEndTime: s.scheduled_end_time ? new Date(s.scheduled_end_time as string).toISOString() : null,
    notes: s.notes ?? null,
    errorCode: s.error_code ?? null,
    failureReason: s.failure_reason ?? null,
    transcript: s.transcript ?? null,
    summary: s.summary ?? null,
    keyDecisions: Array.isArray(s.key_decisions) ? s.key_decisions : [],
    risksAndBlockers: Array.isArray(s.risks_and_blockers) ? s.risks_and_blockers : [],
    keyTopics: Array.isArray(s.key_topics) ? s.key_topics : [],
    meetingSentiment: s.meeting_sentiment ?? null,
    followUpNeeded: s.follow_up_needed ?? null,
    meetingDuration: s.meeting_duration ?? null,
    followUpEmail: s.follow_up_email ?? null,
    keyPoints: Array.isArray(s.key_points) ? s.key_points : [],
    actionItems: Array.isArray(s.action_items) ? s.action_items : [],
    recordingFilePath: s.recording_file_path ?? null,
    recordingUrl: s.recording_url ?? null,
    recordingSize: s.recording_size ?? null,
    recordingDuration: s.recording_duration ?? null,
    recordingStartedAt: s.recording_started_at ? new Date(s.recording_started_at as string).toISOString() : null,
    recordingEndedAt: s.recording_ended_at ? new Date(s.recording_ended_at as string).toISOString() : null,
    insights: s.insights && typeof s.insights === "object" ? s.insights : null,
    chapters: Array.isArray(s.chapters) ? s.chapters : null,
    emailSent: Boolean(s.email_sent),
    emailSentAt: s.email_sent_at ? new Date(s.email_sent_at as string).toISOString() : null,
    status: normalizedStatus,
    createdAt: new Date(s.created_at as string).toISOString(),
    updatedAt: new Date(s.updated_at as string).toISOString(),
  };
}

// ── POST /api/meeting-sessions ────────────────────────────────────────────────

meetingSessionsRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError("Invalid meeting session input.");
    }

    const userId = req.appUser.id;
    const workspaceId = (req.query.workspaceId as string) ?? null;
    const d = parsed.data;

    const { rows } = await pool.query(
      `INSERT INTO meeting_sessions
         (user_id, workspace_id, provider, title, meeting_link, notes,
          scheduled_start_time, scheduled_end_time, external_calendar_event_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft')
       RETURNING *`,
      [
        userId,
        workspaceId,
        d.provider,
        d.title,
        d.meetingLink,
        d.notes || null,
        d.scheduledStartTime ? new Date(d.scheduledStartTime) : null,
        d.scheduledEndTime ? new Date(d.scheduledEndTime) : null,
        d.externalCalendarEventId ?? null,
      ]
    );

    return res.status(201).json({ success: true, session: toRecord(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/meeting-sessions/:id ─────────────────────────────────────────────

meetingSessionsRouter.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;
    const workspaceId = (req.query.workspaceId as string) ?? null;
    const { id } = req.params;

    // Check existence first
    const { rows: rawRows } = await pool.query(
      `SELECT * FROM meeting_sessions WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (rawRows.length === 0) throw new NotFoundError("Meeting session not found.");

    const session = rawRows[0] as Record<string, unknown>;

    // Owner always has access
    if (session.user_id === userId) {
      return res.json({ success: true, session: toRecord(session) });
    }

    // Check workspace membership for access control
    const { rows: memberRows } = await pool.query(
      `SELECT role FROM workspace_members
       WHERE workspace_id = $1 AND user_id = $2 AND status = 'active'
       LIMIT 1`,
      [workspaceId ?? session.workspace_id, userId]
    );

    const role = memberRows[0]?.role ?? null;
    const isAdminOrOwner = role === "admin" || role === "owner";
    const isActiveMember = role !== null;
    const visibility = (session.visibility as string) ?? "private";

    if (visibility === "private" && !isAdminOrOwner) throw new ForbiddenError("Access denied.");
    if (visibility === "workspace" && !isActiveMember) throw new ForbiddenError("Access denied.");
    if (visibility === "shared") {
      const sharedWith = (session.shared_with_user_ids as string[]) ?? [];
      if (!isAdminOrOwner && !sharedWith.includes(userId) && role !== "member") {
        throw new ForbiddenError("Access denied.");
      }
    }

    return res.json({ success: true, session: toRecord(session) });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/meeting-sessions/:id ──────────────────────────────────────────

meetingSessionsRouter.patch("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError("Invalid meeting session update.");
    }

    const userId = req.appUser.id;
    const workspaceId = (req.query.workspaceId as string) ?? null;
    const { id } = req.params;

    // Verify ownership / access
    const { rows: existing } = await pool.query(
      `SELECT id, user_id FROM meeting_sessions WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (existing.length === 0) throw new NotFoundError("Meeting session not found.");
    if (existing[0].user_id !== userId) throw new ForbiddenError("Access denied.");

    const d = parsed.data;
    const fields: string[] = ["updated_at = NOW()"];
    const values: unknown[] = [];
    let idx = 1;

    function addField(col: string, val: unknown) {
      fields.push(`${col} = $${idx++}`);
      values.push(val);
    }

    if (d.title !== undefined) addField("title", d.title);
    if (d.provider !== undefined) addField("provider", d.provider);
    if (d.meetingLink !== undefined) addField("meeting_link", d.meetingLink);
    if (d.notes !== undefined) addField("notes", d.notes || null);
    if (d.externalCalendarEventId !== undefined) addField("external_calendar_event_id", d.externalCalendarEventId);
    if (d.scheduledStartTime !== undefined) addField("scheduled_start_time", d.scheduledStartTime ? new Date(d.scheduledStartTime) : null);
    if (d.scheduledEndTime !== undefined) addField("scheduled_end_time", d.scheduledEndTime ? new Date(d.scheduledEndTime) : null);
    if (d.errorCode !== undefined) addField("error_code", d.errorCode || null);
    if (d.failureReason !== undefined) addField("failure_reason", d.failureReason || null);
    if (d.transcript !== undefined) addField("transcript", d.transcript);
    if (d.summary !== undefined) addField("summary", d.summary);
    if (d.keyDecisions !== undefined) addField("key_decisions", JSON.stringify(d.keyDecisions));
    if (d.risksAndBlockers !== undefined) addField("risks_and_blockers", JSON.stringify(d.risksAndBlockers));
    if (d.keyTopics !== undefined) addField("key_topics", JSON.stringify(d.keyTopics));
    if (d.meetingSentiment !== undefined) addField("meeting_sentiment", d.meetingSentiment || null);
    if (d.followUpNeeded !== undefined) addField("follow_up_needed", d.followUpNeeded);
    if (d.meetingDuration !== undefined) addField("meeting_duration", d.meetingDuration);
    if (d.followUpEmail !== undefined) addField("follow_up_email", d.followUpEmail || null);
    if (d.keyPoints !== undefined) addField("key_points", JSON.stringify(d.keyPoints));
    if (d.actionItems !== undefined) addField("action_items", JSON.stringify(d.actionItems));
    if (d.recordingFilePath !== undefined) addField("recording_file_path", d.recordingFilePath || null);
    if (d.recordingUrl !== undefined) addField("recording_url", d.recordingUrl || null);
    if (d.recordingSize !== undefined) addField("recording_size", d.recordingSize);
    if (d.recordingDuration !== undefined) addField("recording_duration", d.recordingDuration);
    if (d.recordingStartedAt !== undefined) addField("recording_started_at", d.recordingStartedAt ? new Date(d.recordingStartedAt) : null);
    if (d.recordingEndedAt !== undefined) addField("recording_ended_at", d.recordingEndedAt ? new Date(d.recordingEndedAt) : null);
    if (d.insights !== undefined) addField("insights", d.insights ? JSON.stringify(d.insights) : null);
    if (d.chapters !== undefined) addField("chapters", d.chapters ? JSON.stringify(d.chapters) : null);
    if (d.status !== undefined) addField("status", d.status);
    if (d.emailSent !== undefined) addField("email_sent", d.emailSent);
    if (d.emailSentAt !== undefined) addField("email_sent_at", d.emailSentAt ? new Date(d.emailSentAt) : null);
    if (d.aiRunId !== undefined) addField("ai_run_id", d.aiRunId);
    if (workspaceId !== undefined) addField("workspace_id", workspaceId);

    values.push(id, userId);
    const { rows } = await pool.query(
      `UPDATE meeting_sessions SET ${fields.join(", ")}
       WHERE id = $${idx++} AND user_id = $${idx++}
       RETURNING *`,
      values
    );

    if (rows.length === 0) throw new NotFoundError("Meeting session not found.");

    // ── Auto-share: fire-and-forget when meeting completes ──────────────────
    if (d.status === "completed") {
      void triggerAutoShare(userId, id, rows[0]).catch((err: unknown) => {
        console.error("[AutoShare] Failed:", err instanceof Error ? err.message : err);
      });
    }

    return res.json({ success: true, session: toRecord(rows[0]) });
  } catch (err) {
    next(err);
  }
});
