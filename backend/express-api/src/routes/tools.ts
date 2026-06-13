import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { pool } from "../db/client";
import { config } from "../config";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { canUseActionItems } from "../lib/subscription";
import { buildMeetingSummaryEmailHtml } from "../lib/meeting-summary-email-html";
import { sendHtmlViaGmailIntegration } from "../lib/gmail-integration-outbound";
import { slackHeaderPlainText, slackMrkdwnText } from "../lib/slack-block-limits";
import { extractTextFromUploadedFile } from "../lib/document-upload-text";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

export const toolsRouter = Router();

const PLAN_IDS = ["free", "pro", "elite", "trial"] as const;
type PlanId = (typeof PLAN_IDS)[number];

function normalizePlan(plan: string | undefined | null): PlanId {
  const p = String(plan ?? "free").toLowerCase();
  return (PLAN_IDS as readonly string[]).includes(p) ? (p as PlanId) : "free";
}

// ─── Auto-share helper (mirrors meeting-sessions.ts triggerAutoShare) ─────────

async function triggerAutoShareForTool(userId: string, data: {
  title: string;
  summary: string;
  transcript: string;
  action_items: Array<{ task?: string; owner?: string; deadline?: string; priority?: string }>;
  key_points: string[];
}) {
  const prefResult = await pool.query(
    `SELECT key, value FROM user_settings WHERE user_id = $1 AND key LIKE 'autoShareTargets.%'`,
    [userId]
  );
  const enabledTargets = prefResult.rows
    .filter((r) => Boolean(r.value))
    .map((r) => String(r.key).split(".")[1] ?? "")
    .filter(Boolean);
  if (enabledTargets.length === 0) return;

  // Filter out integrations disabled by catalog (if present)
  try {
    const { rows: allowed } = await pool.query<{ integration_type: string }>(
      `SELECT integration_type FROM integration_catalog
       WHERE category = 'productivity'
         AND integration_type = ANY($1)
         AND is_active = true`,
      [enabledTargets]
    );
    const allowedSet = new Set(allowed.map((r) => r.integration_type));
    const filtered = enabledTargets.filter((t) => allowedSet.has(t));
    enabledTargets.length = 0;
    enabledTargets.push(...filtered);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code !== "42P01") throw e;
  }

  const intResult = await pool.query(
    `SELECT type, config FROM integrations WHERE user_id = $1 AND enabled = true AND type = ANY($2)`,
    [userId, enabledTargets]
  );
  if (intResult.rows.length === 0) return;

  const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";
  const actionItemsText = data.action_items.length > 0
    ? data.action_items.map((i) => `• *${i.task}* — ${i.owner ?? "Unassigned"} (${i.deadline ?? "No deadline"})`).join("\n")
    : "_No action items_";
  const keyPointsText = data.key_points.length > 0
    ? data.key_points.map((p) => `• ${p}`).join("\n")
    : "_No key points_";

  for (const integration of intResult.rows) {
    const type: string = integration.type;
    const cfg = (integration.config ?? {}) as Record<string, unknown>;
    try {
      if (type === "slack" && cfg.webhookUrl) {
        const slackRes = await fetch(String(cfg.webhookUrl), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            blocks: [
              { type: "header", text: { type: "plain_text", text: slackHeaderPlainText(`📋 Meeting Summary: ${data.title}`), emoji: true } },
              { type: "section", text: { type: "mrkdwn", text: slackMrkdwnText(data.summary || "No summary available") } },
              { type: "divider" },
              { type: "section", text: { type: "mrkdwn", text: slackMrkdwnText(`*💡 Key Points*\n${keyPointsText}`) } },
              { type: "divider" },
              { type: "section", text: { type: "mrkdwn", text: slackMrkdwnText(`*✅ Action Items*\n${actionItemsText}`) } },
              { type: "context", elements: [{ type: "mrkdwn", text: `_Auto-shared by Artivaa Meeting Summarizer — <${FRONTEND_URL}/dashboard/tools/meeting-summarizer|View Tool>_` }] },
            ],
          }),
        });
        if (!slackRes.ok) console.error(`[AutoShare] Slack failed: ${slackRes.status}`);
      } else if (type === "gmail") {
        const footerLine = `Auto-shared by Artivaa Meeting Summarizer — ${FRONTEND_URL}/dashboard/tools/meeting-summarizer`;
        const htmlBody = buildMeetingSummaryEmailHtml({
          title: data.title,
          summaryText: data.summary || "No summary available",
          keyPoints: data.key_points,
          actionItems: data.action_items.map((i) => ({
            task: String(i.task ?? ""),
            owner: String(i.owner ?? "Unassigned"),
            due_date: String(i.deadline ?? "No deadline"),
          })),
          footerLine,
        });
        const subject = `Meeting Summary: ${data.title}`;
        const sent = await sendHtmlViaGmailIntegration({
          userId,
          config: cfg,
          subject,
          html: htmlBody,
        });
        if (!sent.ok) throw new Error(sent.message);
        console.log(`[AutoShare] Email (${sent.via}) ✓ meeting summarizer`);
      } else if (type === "notion" && cfg.webhookUrl) {
        await fetch(String(cfg.webhookUrl), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: data.title,
            summary: data.summary,
            action_items: data.action_items,
            key_points: data.key_points,
            transcript: data.transcript.substring(0, 5000),
            source: "artivaa_tool",
            timestamp: new Date().toISOString(),
          }),
        });
      } else if (type === "jira" && cfg.webhookUrl && data.action_items.length > 0) {
        await fetch(String(cfg.webhookUrl), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: data.title,
            summary: data.summary,
            action_items: data.action_items,
            source: "artivaa_tool",
            timestamp: new Date().toISOString(),
          }),
        });
      }
    } catch (err) {
      console.error(`[AutoShare] ${type} failed:`, err instanceof Error ? err.message : err);
    }
  }
}

// ─── Gemini helper ────────────────────────────────────────────────────────────

async function callGemini(prompt: string): Promise<string> {
  const apiKey = config.geminiApiKey;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!response.ok) {
    const errPayload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    const msg = errPayload?.error?.message ?? "Gemini API request failed.";
    throw new Error(msg);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = payload.candidates
    ?.flatMap((c) => c.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

async function callGeminiStructured(prompt: string): Promise<string> {
  const apiKey = config.geminiApiKey;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );

  if (!response.ok) {
    const errPayload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    const msg = errPayload?.error?.message ?? "Gemini API request failed.";
    throw new Error(msg);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = payload.candidates
    ?.flatMap((c) => c.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

function cleanJson(text: string) {
  return text.replace(/```json/g, "").replace(/```/g, "").trim();
}

/** Persist a completed tool run for /dashboard/history (ai_runs + tools.slug). */
async function insertCompletedAiRun(params: {
  userId: string;
  toolSlug: string;
  title: string;
  inputJson: Record<string, unknown>;
  outputJson: Record<string, unknown>;
  model?: string;
}): Promise<{
  id: string;
  title: string;
  status: string;
  input_json: unknown;
  output_json: unknown;
  created_at: Date;
} | null> {
  const toolResult = await pool.query(`SELECT id FROM tools WHERE slug = $1 LIMIT 1`, [params.toolSlug]);
  const toolId = toolResult.rows[0]?.id as string | undefined;
  if (!toolId) {
    console.warn(`[tools] ai_runs not saved — missing tools row for slug=${params.toolSlug}`);
    return null;
  }
  const title = params.title.trim().slice(0, 255) || "AI run";
  const runResult = await pool.query(
    `INSERT INTO ai_runs (user_id, tool_id, title, status, input_json, output_json, model, tokens_used)
     VALUES ($1, $2, $3, 'completed', $4::jsonb, $5::jsonb, $6, 0)
     RETURNING id, title, status, input_json, output_json, created_at`,
    [
      params.userId,
      toolId,
      title,
      JSON.stringify(params.inputJson),
      JSON.stringify(params.outputJson),
      params.model ?? "gemini-2.5-flash",
    ]
  );
  const row = runResult.rows[0] as
    | {
        id: string;
        title: string;
        status: string;
        input_json: unknown;
        output_json: unknown;
        created_at: Date;
      }
    | undefined;
  return row ?? null;
}

function normalizeMeetingSummarizerAssignee(owner: string | undefined): string {
  const t = (owner ?? "").trim();
  return t.length > 0 ? t : "Unassigned";
}

function normalizeMeetingSummarizerPriority(p: string | undefined): string {
  return p === "High" || p === "Low" || p === "Medium" ? p : "Medium";
}

function normalizeMeetingSummarizerDueDate(deadline: string | undefined): string {
  const t = (deadline ?? "").trim();
  return t.length > 0 ? t : "Not specified";
}

/** Active workspace from header — must be a member. */
async function resolveWorkspaceIdFromHeader(req: Request, userId: string): Promise<string | null> {
  const raw = req.headers["x-workspace-id"];
  const workspaceId = typeof raw === "string" ? raw.trim() : "";
  if (!workspaceId) return null;
  const r = await pool.query(
    "SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND status = 'active' LIMIT 1",
    [workspaceId, userId]
  );
  return r.rows.length > 0 ? workspaceId : null;
}

async function resolveMeetingSummarizerMeetingContext(
  userId: string,
  meetingIdRaw: string | undefined,
  meetingTitleRaw: string | undefined
): Promise<{
  meetingId: string | null;
  meetingTitle: string;
  meetingWorkspaceId: string | null;
  /** meeting_sessions.user_id — reporter for workspace meeting action items (admin starter) */
  sessionUserId: string | null;
}> {
  const fallbackTitle = (meetingTitleRaw ?? "").trim() || "Meeting Summary";
  const id = (meetingIdRaw ?? "").trim();
  if (!id) {
    return { meetingId: null, meetingTitle: fallbackTitle, meetingWorkspaceId: null, sessionUserId: null };
  }
  const r = await pool.query<{ id: string; title: string | null; workspace_id: string | null; user_id: string }>(
    "SELECT id, title, workspace_id, user_id FROM meeting_sessions WHERE id = $1 AND user_id = $2 LIMIT 1",
    [id, userId]
  );
  const row = r.rows[0];
  if (!row) {
    return { meetingId: null, meetingTitle: fallbackTitle, meetingWorkspaceId: null, sessionUserId: null };
  }
  const title = (meetingTitleRaw ?? "").trim() || row.title?.trim() || "Meeting Summary";
  return {
    meetingId: row.id,
    meetingTitle: title,
    meetingWorkspaceId: row.workspace_id ?? null,
    sessionUserId: row.user_id ?? null,
  };
}

/** Prefer workspace from linked meeting (when member); else optional header workspace. */
async function resolveActionItemWorkspaceForSummarizer(
  req: Request,
  userId: string,
  meetingWorkspaceId: string | null
): Promise<string | null> {
  if (meetingWorkspaceId) {
    const r = await pool.query(
      "SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND status = 'active' LIMIT 1",
      [meetingWorkspaceId, userId]
    );
    if (r.rows.length > 0) return meetingWorkspaceId;
  }
  return resolveWorkspaceIdFromHeader(req, userId);
}

async function persistMeetingSummarizerActionItems(params: {
  plan: string;
  workspaceId: string | null;
  meetingId: string | null;
  meetingTitle: string;
  /** Workspace-linked meetings: meeting_sessions.user_id (starter); else summarizer user */
  reporterUserId: string;
  items: Array<{ task?: string; owner?: string; deadline?: string; priority?: string }>;
}): Promise<void> {
  const rows = params.items
    .map((item) => ({
      task: (item.task ?? "").trim(),
      assignee: normalizeMeetingSummarizerAssignee(item.owner),
      dueDate: normalizeMeetingSummarizerDueDate(item.deadline),
      priority: normalizeMeetingSummarizerPriority(item.priority),
    }))
    .filter((row) => row.task.length > 0);

  if (rows.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const row of rows) {
      await client.query(
        `INSERT INTO action_items (task, assignee, due_date, priority, completed, status, source, reporter_id, meeting_id, meeting_title, workspace_id, assignee_id)
         VALUES ($1, $2, $3, $4, false, 'pending', 'meeting', $5, $6, $7, $8, NULL)`,
        [
          row.task,
          row.assignee,
          row.dueDate,
          row.priority,
          params.reporterUserId,
          params.meetingId,
          params.meetingTitle,
          params.workspaceId,
        ]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[MeetingSummarizer] Failed to persist action items:", e instanceof Error ? e.message : e);
  } finally {
    client.release();
  }
}

// ─── GET /api/tools ───────────────────────────────────────────────────────────

// ─── GET /api/tools/catalog — UI catalog filtered by plan + active flag ──────

toolsRouter.get("/catalog", async (req: Request, res: Response, next: NextFunction) => {
  const plan = normalizePlan(req.appUser.plan);
  try {
    // Preferred schema (plan + active gating)
    const { rows } = await pool.query(
      `SELECT slug,
              name,
              description,
              status,
              is_active AS "isActive",
              allowed_plans AS "allowedPlans",
              sort_order AS "sortOrder",
              category,
              badge,
              ui_config AS "uiConfig"
       FROM tools
       WHERE is_active = true
         AND $1 = ANY(allowed_plans)
       ORDER BY category NULLS LAST, sort_order NULLS LAST, name ASC`,
      [plan]
    );
    return res.json({ success: true, plan, items: rows });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "42P01") {
      return res.status(503).json({
        success: false,
        error: "tools table missing",
        plan,
        items: [],
      });
    }

    // Back-compat: older tools table schema (no gating columns)
    if (code === "42703") {
      try {
        const { rows } = await pool.query(`SELECT * FROM tools ORDER BY name ASC`);
        const items = rows
          .map((r: Record<string, unknown>) => {
            const slug = String(r.slug ?? r.tool_slug ?? r.name ?? "").trim();
            return {
              slug,
              name: String(r.name ?? slug),
              description: String(r.description ?? ""),
              status: String(r.status ?? "available"),
              isActive: Boolean(r.is_active ?? true),
              allowedPlans: r.allowed_plans ?? PLAN_IDS,
              sortOrder: r.sort_order ?? null,
              category: r.category ?? null,
              badge: r.badge ?? null,
              uiConfig: r.ui_config ?? null,
            };
          })
          .filter((i) => i.slug.length > 0 && i.isActive);

        return res.json({ success: true, plan, items });
      } catch (fallbackErr) {
        return next(fallbackErr);
      }
    }

    return next(err);
  }
});

toolsRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(`SELECT * FROM tools ORDER BY name ASC`);
    res.json({ success: true, tools: result.rows });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/tools/meeting-summarizer/run ───────────────────────────────────

const meetingSummarizerPrompt = (transcript: string) => `
You analyze meeting transcripts for an AI workflow product.
Return a concise, factual summary of the meeting.
Extract key discussion points as short standalone strings.
Extract action items from explicit commitments and clearly implied next steps.

Meeting transcript:
${transcript}

Return ONLY valid JSON with this exact structure:
{
  "summary": "2-4 sentence factual summary",
  "key_points": ["point 1", "point 2"],
  "action_items": [
    {
      "task": "concrete task starting with verb",
      "owner": "person name or empty string",
      "deadline": "deadline or empty string",
      "priority": "High or Medium or Low"
    }
  ]
}
`;

async function getUserSettingString(userId: string, key: string): Promise<string | null> {
  try {
    const { rows } = await pool.query<{ value: unknown }>(
      "SELECT value FROM user_settings WHERE user_id = $1 AND key = $2 LIMIT 1",
      [userId, key]
    );
    const v = rows[0]?.value;
    if (v === null || v === undefined) return null;
    return typeof v === "string" ? v : String(v);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "42P01") return null; // user_settings not migrated yet
    throw e;
  }
}

function applySummaryLengthInstruction(summaryLength: string | null): string {
  const s = String(summaryLength ?? "standard").toLowerCase();
  if (s === "brief") return "Keep the summary very brief (1-2 sentences).";
  if (s === "detailed") return "Write a detailed summary (5-8 sentences) including key context.";
  return "Write a standard summary (2-4 sentences).";
}

function applyLanguageInstruction(language: string | null): string {
  return String(language ?? "en").toLowerCase() === "hi"
    ? "Write all output text in Hindi."
    : "Write all output text in English.";
}

toolsRouter.post("/meeting-summarizer/run", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;
    const userPlan = req.appUser.plan;
    const {
      transcript,
      provider = "gemini",
      inputType = "transcript",
      originalTranscript,
      audioFileName,
      audioMimeType,
      transcriptionProvider,
      meetingId: meetingIdBody,
      meetingTitle: meetingTitleBody,
    } = req.body as {
      transcript?: string;
      provider?: string;
      inputType?: string;
      originalTranscript?: string;
      audioFileName?: string;
      audioMimeType?: string;
      transcriptionProvider?: string;
      meetingId?: string;
      meetingTitle?: string;
    };

    if (!transcript?.trim()) {
      return next(new BadRequestError("transcript is required."));
    }

    if (transcript.trim().length < 80) {
      return next(new BadRequestError("Transcript must be at least 80 characters long to generate a useful summary."));
    }

    const [summaryLengthPref, languagePref] = await Promise.all([
      getUserSettingString(userId, "summaryLength"),
      getUserSettingString(userId, "language"),
    ]);

    const prompt = [
      meetingSummarizerPrompt(transcript),
      "",
      "Additional user preferences:",
      `- ${applySummaryLengthInstruction(summaryLengthPref)}`,
      `- ${applyLanguageInstruction(languagePref)}`,
    ].join("\n");

    const rawText = await callGeminiStructured(prompt);
    const cleaned = cleanJson(rawText);

    let parsed: {
      summary?: string;
      key_points?: string[];
      action_items?: Array<{ task?: string; owner?: string; deadline?: string; priority?: string }>;
    };

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return next(new Error("Failed to parse AI response."));
    }

    const summary = parsed.summary ?? "";
    const keyPoints = Array.isArray(parsed.key_points) ? parsed.key_points : [];
    const actionItems = Array.isArray(parsed.action_items) ? parsed.action_items : [];

    const inputJson: Record<string, unknown> = {
      inputType,
      provider,
      transcript,
    };
    if (originalTranscript) inputJson.originalTranscript = originalTranscript;
    if (audioFileName) inputJson.audioFileName = audioFileName;
    if (audioMimeType) inputJson.audioMimeType = audioMimeType;
    if (transcriptionProvider) inputJson.transcriptionProvider = transcriptionProvider;

    const run = await insertCompletedAiRun({
      userId,
      toolSlug: "meeting-summarizer",
      title: "Meeting Summary",
      inputJson,
      outputJson: { summary, key_points: keyPoints, action_items: actionItems },
      model: provider === "openai" ? "gpt-4o" : "gemini-2.5-flash",
    });

    if (!run) {
      return next(new Error("Could not save meeting run — meeting-summarizer tool may be missing from the database."));
    }

    const meetingCtx = await resolveMeetingSummarizerMeetingContext(userId, meetingIdBody, meetingTitleBody);
    const workspaceIdForItems = await resolveActionItemWorkspaceForSummarizer(
      req,
      userId,
      meetingCtx.meetingWorkspaceId
    );
    const reporterUserId =
      workspaceIdForItems && meetingCtx.sessionUserId ? meetingCtx.sessionUserId : userId;
    await persistMeetingSummarizerActionItems({
      plan: userPlan,
      workspaceId: workspaceIdForItems,
      meetingId: meetingCtx.meetingId,
      meetingTitle: meetingCtx.meetingTitle,
      reporterUserId,
      items: actionItems,
    });

    // ── Fire-and-forget auto-share (same as bot meetings) ────────────────────
    void triggerAutoShareForTool(userId, {
      title: "Meeting Summary",
      summary,
      transcript: transcript.trim(),
      action_items: actionItems,
      key_points: keyPoints,
    }).catch((err: unknown) => {
      console.error("[AutoShare] Meeting summarizer tool failed:", err instanceof Error ? err.message : err);
    });

    res.json({
      success: true,
      run: {
        id: run.id,
        title: run.title,
        status: run.status,
        tool: { slug: "meeting-summarizer", name: "Meeting Summarizer" },
        inputJson: run.input_json,
        outputJson: run.output_json,
        createdAt: run.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/tools/meeting-summarizer/transcribe ────────────────────────────

toolsRouter.post(
  "/meeting-summarizer/transcribe",
  upload.single("audio"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = req.file;
      if (!file) {
        return next(new BadRequestError("audio file is required."));
      }

      const apiKey = config.geminiApiKey;
      if (!apiKey) {
        return next(new Error("GEMINI_API_KEY is not configured."));
      }

      // Upload audio to Gemini Files API
      const uploadRes = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
        method: "POST",
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-Upload-Command": "start, upload, finalize",
          "X-Goog-Upload-Header-Content-Length": String(file.size),
          "X-Goog-Upload-Header-Content-Type": file.mimetype,
          "Content-Type": file.mimetype,
        },
        body: file.buffer,
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text().catch(() => "");
        throw new Error(`Gemini file upload failed: ${errText}`);
      }

      const uploadData = (await uploadRes.json()) as { file?: { uri?: string; name?: string } };
      const fileUri = uploadData.file?.uri;
      if (!fileUri) {
        throw new Error("Gemini file upload did not return a file URI.");
      }

      // Transcribe using Gemini
      const transcribeRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    fileData: {
                      mimeType: file.mimetype,
                      fileUri,
                    },
                  },
                  {
                    text: "Transcribe this audio recording verbatim. Include speaker names if identifiable (e.g. 'Speaker 1:', 'Speaker 2:'). Return only the transcript text, no commentary.",
                  },
                ],
              },
            ],
          }),
        }
      );

      if (!transcribeRes.ok) {
        const errPayload = (await transcribeRes.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(errPayload?.error?.message ?? "Gemini transcription failed.");
      }

      const transcribeData = (await transcribeRes.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };

      const transcript = transcribeData.candidates
        ?.flatMap((c) => c.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join("")
        .trim() ?? "";

      if (!transcript) {
        throw new Error("Transcription returned empty text. The audio may be too short or unclear.");
      }

      res.json({
        success: true,
        transcript,
        provider: "gemini",
        transcriptionProvider: "gemini",
        metadata: null,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/tools/document-analyzer ───────────────────────────────────────

type ExtractOption = "summary" | "actionItems" | "keyPoints" | "decisions" | "risks" | "rawInsights";

const defaultExtractOptions: ExtractOption[] = ["summary", "actionItems", "keyPoints", "decisions", "risks"];

function buildDocumentAnalyzerPrompt(documentText: string, extractOptions: ExtractOption[]) {
  return `You are an expert document analyst.

Analyze this document and extract structured information.

${extractOptions.includes("summary") ? "Include a concise 2-4 sentence summary." : ""}
${extractOptions.includes("actionItems") ? "Extract action items with task, owner, due date, and priority." : ""}
${extractOptions.includes("keyPoints") ? "Extract at least 3 specific key points when possible." : ""}
${extractOptions.includes("decisions") ? "Extract decisions that were made." : ""}
${extractOptions.includes("risks") ? "Extract risks, blockers, or concerns." : ""}
${extractOptions.includes("rawInsights") ? "Add extra observations in raw_insights." : ""}

Document content:
${documentText.substring(0, 15000)}

Return ONLY valid JSON:
{
  "summary": "2-4 sentence overview",
  "action_items": [
    {
      "task": "Task",
      "owner": "Person or Unassigned",
      "due_date": "Deadline or Not specified",
      "priority": "High or Medium or Low"
    }
  ],
  "key_points": ["Point 1"],
  "decisions": [],
  "risks": [],
  "raw_insights": null
}`;
}

const documentAnalyzerAllowedOptions = new Set<ExtractOption>([
  "summary",
  "actionItems",
  "keyPoints",
  "decisions",
  "risks",
  "rawInsights",
]);

function documentAnalyzerUpload(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (err: unknown) => {
    if (err && typeof err === "object" && "code" in err) {
      const code = String((err as { code?: string }).code);
      if (code === "LIMIT_FILE_SIZE") {
        return next(new BadRequestError("File too large (max 25MB)."));
      }
      if (err instanceof Error) return next(new BadRequestError(err.message));
    }
    next(err);
  });
}

toolsRouter.post("/document-analyzer", documentAnalyzerUpload, async (req: Request, res: Response, next: NextFunction) => {
  try {
    let documentText = "";
    let extractOptionsRaw: unknown;

    if (req.file) {
      const rawOpt = req.body?.extractOptions;
      if (typeof rawOpt === "string") {
        try {
          extractOptionsRaw = JSON.parse(rawOpt) as unknown;
        } catch {
          return next(new BadRequestError("Invalid extractOptions."));
        }
      } else {
        extractOptionsRaw = rawOpt;
      }
      try {
        documentText = (await extractTextFromUploadedFile(req.file)).trim();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return next(new BadRequestError(msg));
      }
    } else {
      const body = req.body as { text?: string; extractOptions?: ExtractOption[] };
      extractOptionsRaw = body.extractOptions;
      documentText = (body.text ?? "").trim();
    }

    if (documentText.length < 10) {
      return next(
        new BadRequestError(
          "Text content is too short to analyze. For uploads, use PDF/DOCX/TXT with real text; scanned PDFs need OCR or Paste Text."
        )
      );
    }

    const parsedOpts = Array.isArray(extractOptionsRaw)
      ? extractOptionsRaw.filter(
          (x): x is ExtractOption =>
            typeof x === "string" && documentAnalyzerAllowedOptions.has(x as ExtractOption)
        )
      : [];

    const options: ExtractOption[] = parsedOpts.length > 0 ? parsedOpts : defaultExtractOptions;

    const rawText = await callGeminiStructured(buildDocumentAnalyzerPrompt(documentText, options));
    const cleaned = cleanJson(rawText);

    let parsed: {
      summary?: string | null;
      action_items?: Array<{ task?: string; owner?: string; due_date?: string; priority?: string }>;
      key_points?: string[];
      decisions?: string[];
      risks?: string[];
      raw_insights?: string | null;
    };

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return next(new Error("Failed to parse AI response."));
    }

    const result = {
      summary: typeof parsed.summary === "string" ? parsed.summary : null,
      action_items: Array.isArray(parsed.action_items)
        ? parsed.action_items
            .map((item) => ({
              task: item?.task ?? "",
              owner: item?.owner ?? "",
              due_date: item?.due_date ?? "",
              priority:
                item?.priority === "High" || item?.priority === "Low" || item?.priority === "Medium"
                  ? item.priority
                  : "Medium",
            }))
            .filter((i) => i.task.trim().length > 0)
        : [],
      key_points: Array.isArray(parsed.key_points)
        ? parsed.key_points.filter((i): i is string => typeof i === "string")
        : [],
      decisions: Array.isArray(parsed.decisions)
        ? parsed.decisions.filter((i): i is string => typeof i === "string")
        : [],
      risks: Array.isArray(parsed.risks)
        ? parsed.risks.filter((i): i is string => typeof i === "string")
        : [],
      raw_insights: typeof parsed.raw_insights === "string" ? parsed.raw_insights : null,
    };

    const userId = req.appUser.id;
    const docTitle =
      (typeof result.summary === "string" && result.summary.trim().slice(0, 120)) || "Document analysis";
    const source = req.file ? "upload" : "paste";
    const inputMeta: Record<string, unknown> = {
      extractOptions: options,
      source,
      textLength: documentText.length,
      excerpt: documentText.slice(0, 6000),
    };
    if (req.file?.originalname) inputMeta.fileName = req.file.originalname;

    const run = await insertCompletedAiRun({
      userId,
      toolSlug: "document-analyzer",
      title: docTitle,
      inputJson: inputMeta,
      outputJson: result as Record<string, unknown>,
    });

    res.json({
      success: true,
      result,
      ...(run && {
        run: {
          id: run.id,
          title: run.title,
          status: run.status,
          tool: { slug: "document-analyzer", name: "Document Analyzer" },
          inputJson: run.input_json,
          outputJson: run.output_json,
          createdAt: run.created_at,
        },
      }),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/tools/task-generator ──────────────────────────────────────────

function buildTaskGeneratorPrompt(
  input: string,
  mode: string,
  teamMembers: string,
  dateContext: string,
  outputFormat: string,
  autoPriority: boolean
) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  return `You are an expert project manager and task extraction AI.

Extract ALL tasks, action items, and to-dos from this input text.

Input text:
${input}

Context:
- Today's date: ${dateContext || today}
- Team members available: ${teamMembers || "Not specified — use names mentioned in text"}
- Mode: ${mode === "voice" ? "Voice transcript — ignore filler words" : mode === "meeting" ? "Meeting transcript or notes" : "Written notes"}
- Format: ${outputFormat}
- Priority inference: ${autoPriority ? "Enabled - infer urgency from language used" : "Disabled - default to Medium"}

Return ONLY valid JSON, no markdown, no backticks:
{
  "tasks": [
    {
      "task": "Clear actionable task description starting with verb",
      "owner": "Person name or Unassigned",
      "due_date": "Specific date or ASAP or Not specified",
      "priority": "High or Medium or Low",
      "type": "Task or Bug or Story",
      "notes": "Any additional context"
    }
  ],
  "summary": "One line: what this set of tasks is about",
  "total_tasks": 5,
  "unextractable": "Any text that seemed important but wasn't a task"
}`;
}

toolsRouter.post("/task-generator", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      input,
      mode = "raw",
      teamMembers = "",
      dateContext = "",
      outputFormat = "detailed",
      autoPriority = true,
    } = req.body as {
      input?: string;
      mode?: string;
      teamMembers?: string;
      dateContext?: string;
      outputFormat?: string;
      autoPriority?: boolean;
    };

    if (!input?.trim()) {
      return next(new BadRequestError("input is required."));
    }

    const rawText = await callGeminiStructured(
      buildTaskGeneratorPrompt(input, mode, teamMembers, dateContext, outputFormat, autoPriority)
    );
    const cleaned = cleanJson(rawText);

    let parsed: {
      tasks?: Array<{ task?: string; owner?: string; due_date?: string; priority?: string; type?: string; notes?: string }>;
      summary?: string;
      total_tasks?: number;
      unextractable?: string;
    };

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return next(new Error("Failed to parse AI response."));
    }

    const tasks = Array.isArray(parsed.tasks)
      ? parsed.tasks.map((t) => ({
          task: t.task ?? "",
          owner: t.owner ?? "Unassigned",
          due_date: t.due_date ?? "Not specified",
          priority: (["High", "Medium", "Low"].includes(t.priority ?? "") ? t.priority : "Medium") as string,
          type: t.type ?? "Task",
          notes: t.notes ?? "",
        })).filter((t) => t.task.trim().length > 0)
      : [];

    const summaryLine = (parsed.summary ?? "").trim().slice(0, 255) || "Task extraction";
    const userId = req.appUser.id;
    const outputPayload = {
      tasks,
      summary: parsed.summary ?? "",
      total_tasks: parsed.total_tasks ?? tasks.length,
      unextractable: parsed.unextractable ?? "",
    };
    const run = await insertCompletedAiRun({
      userId,
      toolSlug: "task-generator",
      title: summaryLine,
      inputJson: {
        mode,
        teamMembers,
        dateContext,
        outputFormat,
        autoPriority,
        inputExcerpt: input.trim().slice(0, 12000),
      },
      outputJson: outputPayload,
    });

    res.json({
      success: true,
      tasks,
      summary: parsed.summary ?? "",
      total_tasks: parsed.total_tasks ?? tasks.length,
      unextractable: parsed.unextractable ?? "",
      ...(run && {
        run: {
          id: run.id,
          title: run.title,
          status: run.status,
          tool: { slug: "task-generator", name: "Task Generator" },
          inputJson: run.input_json,
          outputJson: run.output_json,
          createdAt: run.created_at,
        },
      }),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/tools/email-generator ─────────────────────────────────────────

function buildEmailGeneratorPrompt(
  context: string,
  emailType: string,
  tone: string,
  recipients: string
) {
  return `You are a professional email writer.

Generate a ${emailType} email based on this meeting context:
${context}

${recipients ? `Recipients/audience: ${recipients}` : ""}

Tone: ${tone}

Return ONLY valid JSON, no markdown, no backticks:
{
  "subject": "Email subject line here",
  "body": "Full email body here with proper line breaks using \\n"
}

Rules:
- Subject should be specific and professional
- Body should have proper greeting, content, and sign-off
- Use [Your Name] as placeholder for sender
- Keep it concise but complete
- ${tone === "Concise" ? "Keep under 150 words" : ""}
- ${tone === "Friendly" ? "Use warm, conversational language" : ""}
- ${tone === "Formal" ? "Use formal business language" : ""}`;
}

toolsRouter.post("/email-generator", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      context,
      emailType = "Follow-up",
      tone = "Professional",
      recipients = "",
    } = req.body as {
      context?: string;
      emailType?: string;
      tone?: string;
      recipients?: string;
    };

    if (!context?.trim()) {
      return next(new BadRequestError("context is required."));
    }

    const rawText = await callGeminiStructured(
      buildEmailGeneratorPrompt(context, emailType, tone, recipients)
    );
    const cleaned = cleanJson(rawText);

    let parsed: { subject?: string; body?: string };

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return next(new Error("Failed to parse AI response."));
    }

    const subject = (parsed.subject ?? "").trim();
    const body = (parsed.body ?? "").replace(/\r\n/g, "\n").trim();
    const userId = req.appUser.id;
    const outputPayload = {
      subject,
      body,
      email: `Subject: ${subject}\n\n${body}`,
    };
    const run = await insertCompletedAiRun({
      userId,
      toolSlug: "email-generator",
      title: subject.slice(0, 255) || "Generated email",
      inputJson: {
        emailType,
        tone,
        recipients,
        contextExcerpt: context.trim().slice(0, 12000),
      },
      outputJson: outputPayload,
    });

    res.json({
      success: true,
      result: {
        email: outputPayload.email,
      },
      subject,
      body,
      ...(run && {
        run: {
          id: run.id,
          title: run.title,
          status: run.status,
          tool: { slug: "email-generator", name: "Email Generator" },
          inputJson: run.input_json,
          outputJson: run.output_json,
          createdAt: run.created_at,
        },
      }),
    });
  } catch (err) {
    next(err);
  }
});
