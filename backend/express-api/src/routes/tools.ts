import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { pool } from "../db/client";
import { config } from "../config";
import { BadRequestError, NotFoundError } from "../lib/errors";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

export const toolsRouter = Router();

// ─── Auto-share helper (mirrors meeting-sessions.ts triggerAutoShare) ─────────

async function triggerAutoShareForTool(userId: string, data: {
  title: string;
  summary: string;
  transcript: string;
  action_items: Array<{ task?: string; owner?: string; deadline?: string; priority?: string }>;
  key_points: string[];
}) {
  const prefResult = await pool.query(
    `SELECT auto_share_targets FROM user_preferences WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  const autoShareTargets = (prefResult.rows[0]?.auto_share_targets ?? {}) as Record<string, boolean>;
  const enabledTargets = Object.entries(autoShareTargets).filter(([, v]) => v).map(([k]) => k);
  if (enabledTargets.length === 0) return;

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
              { type: "header", text: { type: "plain_text", text: `📋 Meeting Summary: ${data.title}`, emoji: true } },
              { type: "section", text: { type: "mrkdwn", text: data.summary || "No summary available" } },
              { type: "divider" },
              { type: "section", text: { type: "mrkdwn", text: `*💡 Key Points*\n${keyPointsText}` } },
              { type: "divider" },
              { type: "section", text: { type: "mrkdwn", text: `*✅ Action Items*\n${actionItemsText}` } },
              { type: "context", elements: [{ type: "mrkdwn", text: `_Auto-shared by Artivaa Meeting Summarizer — <${FRONTEND_URL}/dashboard/tools/meeting-summarizer|View Tool>_` }] },
            ],
          }),
        });
        if (!slackRes.ok) console.error(`[AutoShare] Slack failed: ${slackRes.status}`);
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

// ─── GET /api/tools ───────────────────────────────────────────────────────────

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

toolsRouter.post("/meeting-summarizer/run", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;
    const { transcript, provider = "gemini", inputType = "transcript", originalTranscript, audioFileName, audioMimeType, transcriptionProvider } = req.body as {
      transcript?: string;
      provider?: string;
      inputType?: string;
      originalTranscript?: string;
      audioFileName?: string;
      audioMimeType?: string;
      transcriptionProvider?: string;
    };

    if (!transcript?.trim()) {
      return next(new BadRequestError("transcript is required."));
    }

    if (transcript.trim().length < 80) {
      return next(new BadRequestError("Transcript must be at least 80 characters long to generate a useful summary."));
    }

    const rawText = await callGeminiStructured(meetingSummarizerPrompt(transcript));
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

    // Upsert ai_run record
    const toolResult = await pool.query(
      `SELECT id FROM tools WHERE slug = 'meeting-summarizer' LIMIT 1`
    );
    const toolId = toolResult.rows[0]?.id ?? null;

    const inputJson: Record<string, unknown> = {
      inputType,
      provider,
      transcript,
    };
    if (originalTranscript) inputJson.originalTranscript = originalTranscript;
    if (audioFileName) inputJson.audioFileName = audioFileName;
    if (audioMimeType) inputJson.audioMimeType = audioMimeType;
    if (transcriptionProvider) inputJson.transcriptionProvider = transcriptionProvider;

    const runResult = await pool.query(
      `INSERT INTO ai_runs (user_id, tool_id, title, status, input_json, output_json, model, tokens_used)
       VALUES ($1, $2, $3, 'completed', $4, $5, $6, 0)
       RETURNING id, title, status, input_json, output_json, created_at`,
      [
        userId,
        toolId,
        "Meeting Summary",
        JSON.stringify(inputJson),
        JSON.stringify({ summary, key_points: keyPoints, action_items: actionItems }),
        provider === "openai" ? "gpt-4o" : "gemini-2.5-flash",
      ]
    );

    const run = runResult.rows[0];

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

toolsRouter.post("/document-analyzer", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { text, extractOptions } = req.body as {
      text?: string;
      extractOptions?: ExtractOption[];
    };

    const documentText = (text ?? "").trim();
    if (documentText.length < 10) {
      return next(new BadRequestError("Text content is too short to analyze."));
    }

    const options: ExtractOption[] = Array.isArray(extractOptions) && extractOptions.length > 0
      ? extractOptions
      : defaultExtractOptions;

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

    res.json({ success: true, result });
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

    res.json({
      success: true,
      tasks,
      summary: parsed.summary ?? "",
      total_tasks: parsed.total_tasks ?? tasks.length,
      unextractable: parsed.unextractable ?? "",
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

    res.json({
      success: true,
      result: {
        email: `Subject: ${(parsed.subject ?? "").trim()}\n\n${(parsed.body ?? "").replace(/\r\n/g, "\n").trim()}`,
      },
      subject: (parsed.subject ?? "").trim(),
      body: (parsed.body ?? "").replace(/\r\n/g, "\n").trim(),
    });
  } catch (err) {
    next(err);
  }
});
