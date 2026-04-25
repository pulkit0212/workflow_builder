import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../db/client";
import { NotFoundError, ForbiddenError, BadRequestError } from "../lib/errors";

export const aiRunsRouter = Router();

const VALID_TOOL_SLUGS = [
  "meeting-summarizer",
  "email-generator",
  "task-generator",
  "document-analyzer",
];

const HISTORY_PLANS = ["pro", "elite", "trial"];

function canUseHistory(plan: string): boolean {
  return HISTORY_PLANS.includes(plan);
}

// GET /api/ai-runs
aiRunsRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;
    const plan = req.appUser.plan ?? "free";

    if (!canUseHistory(plan)) {
      return res.status(403).json({
        error: "Meeting history requires Pro or Elite plan.",
        details: { error: "upgrade_required", currentPlan: plan },
      });
    }

    const toolSlug = (req.query.toolSlug as string) ?? undefined;
    if (toolSlug && !VALID_TOOL_SLUGS.includes(toolSlug)) {
      throw new BadRequestError("Invalid tool slug filter.");
    }

    const { rows } = toolSlug
      ? await pool.query(
          `SELECT ar.id, ar.title, ar.status, ar.input_json, ar.output_json,
                  ar.model, ar.tokens_used, ar.created_at, ar.updated_at,
                  t.slug AS tool_slug, t.name AS tool_name, t.description AS tool_description
           FROM ai_runs ar
           INNER JOIN tools t ON ar.tool_id = t.id
           WHERE ar.user_id = $1 AND t.slug = $2
           ORDER BY ar.created_at DESC`,
          [userId, toolSlug]
        )
      : await pool.query(
          `SELECT ar.id, ar.title, ar.status, ar.input_json, ar.output_json,
                  ar.model, ar.tokens_used, ar.created_at, ar.updated_at,
                  t.slug AS tool_slug, t.name AS tool_name, t.description AS tool_description
           FROM ai_runs ar
           INNER JOIN tools t ON ar.tool_id = t.id
           WHERE ar.user_id = $1
           ORDER BY ar.created_at DESC`,
          [userId]
        );

    return res.json({
      success: true,
      runs: rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        inputJson: r.input_json,
        outputJson: r.output_json,
        model: r.model,
        tokensUsed: r.tokens_used,
        createdAt: new Date(r.created_at as string).toISOString(),
        updatedAt: new Date(r.updated_at as string).toISOString(),
        tool: {
          slug: r.tool_slug,
          name: r.tool_name,
          description: r.tool_description,
        },
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/ai-runs/:id
aiRunsRouter.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;
    const plan = req.appUser.plan ?? "free";
    const { id } = req.params;

    if (!canUseHistory(plan)) {
      return res.status(403).json({
        error: "Meeting history requires Pro or Elite plan.",
        details: { error: "upgrade_required", currentPlan: plan },
      });
    }

    const { rows } = await pool.query(
      `SELECT ar.id, ar.title, ar.status, ar.input_json, ar.output_json,
              ar.model, ar.tokens_used, ar.created_at, ar.updated_at,
              t.slug AS tool_slug, t.name AS tool_name, t.description AS tool_description
       FROM ai_runs ar
       INNER JOIN tools t ON ar.tool_id = t.id
       WHERE ar.id = $1 AND ar.user_id = $2
       LIMIT 1`,
      [id, userId]
    );

    if (rows.length === 0) throw new NotFoundError("Run not found.");

    const r = rows[0] as Record<string, unknown>;

    // Strip provider field from inputJson
    let inputJson = r.input_json;
    if (inputJson && typeof inputJson === "object") {
      const { provider: _p, ...rest } = inputJson as Record<string, unknown>;
      inputJson = rest;
    }

    return res.json({
      success: true,
      run: {
        id: r.id,
        title: r.title,
        status: r.status,
        inputJson,
        outputJson: r.output_json,
        model: r.model,
        tokensUsed: r.tokens_used,
        createdAt: new Date(r.created_at as string).toISOString(),
        updatedAt: new Date(r.updated_at as string).toISOString(),
        tool: {
          slug: r.tool_slug,
          name: r.tool_name,
          description: r.tool_description,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai-runs/:id/share — trigger integrations for this run
aiRunsRouter.post("/:id/share", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;
    const { id } = req.params;
    const { targets } = req.body as { targets: string[] };

    // Fetch the run
    const { rows } = await pool.query(
      `SELECT ar.id, ar.title, ar.output_json FROM ai_runs ar WHERE ar.id = $1 AND ar.user_id = $2 LIMIT 1`,
      [id, userId]
    );
    if (rows.length === 0) throw new NotFoundError("Run not found.");
    const run = rows[0] as { id: string; title: string; output_json: Record<string, unknown> | null };

    // Fetch enabled integrations
    const intResult = await pool.query(
      `SELECT type, config FROM integrations WHERE user_id = $1 AND enabled = true`,
      [userId]
    );
    const configMap: Record<string, Record<string, unknown>> = {};
    for (const row of intResult.rows) {
      configMap[row.type as string] = (row.config as Record<string, unknown>) ?? {};
    }

    const output = run.output_json ?? {};
    const title = String(run.title ?? "AI Run");
    const summary = String(output.summary ?? output.content ?? "No summary available.");
    const actionItems = Array.isArray(output.action_items) ? output.action_items as Array<Record<string, unknown>> : [];

    const results: Record<string, { success: boolean; message: string }> = {};

    for (const target of targets) {
      const config = configMap[target] ?? {};
      try {
        if (target === "slack") {
          const webhookUrl = String(config.webhookUrl ?? "");
          if (!webhookUrl) { results[target] = { success: false, message: "Slack webhook URL not configured." }; continue; }
          const aiText = actionItems.length > 0
            ? actionItems.map((i) => `• *${String(i.task ?? "")}*`).join("\n")
            : "_No action items_";
          const slackRes = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blocks: [
              { type: "header", text: { type: "plain_text", text: `📋 ${title}`, emoji: true } },
              { type: "section", text: { type: "mrkdwn", text: summary } },
              { type: "section", text: { type: "mrkdwn", text: `*✅ Action Items*\n${aiText}` } },
            ]}),
          });
          results[target] = slackRes.ok ? { success: true, message: "Posted to Slack." } : { success: false, message: `Slack error: ${slackRes.status}` };
        } else if (target === "jira") {
          const webhookUrl = String(config.webhookUrl ?? "");
          if (!webhookUrl) { results[target] = { success: false, message: "Jira webhook URL not configured." }; continue; }
          if (actionItems.length === 0) { results[target] = { success: false, message: "No action items to create tickets for." }; continue; }
          const jiraRes = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, summary, action_items: actionItems, source: "artivaa", timestamp: new Date().toISOString() }),
          });
          results[target] = jiraRes.ok ? { success: true, message: `${actionItems.length} ticket(s) queued.` } : { success: false, message: `Jira error: ${jiraRes.status}` };
        } else if (target === "notion") {
          const webhookUrl = String(config.webhookUrl ?? "");
          if (!webhookUrl) { results[target] = { success: false, message: "Notion webhook URL not configured." }; continue; }
          const notionRes = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, summary, action_items: actionItems, source: "artivaa", timestamp: new Date().toISOString() }),
          });
          results[target] = notionRes.ok ? { success: true, message: "Notion page created." } : { success: false, message: `Notion error: ${notionRes.status}` };
        } else if (target === "gmail") {
          results[target] = { success: false, message: "Gmail requires Google account. Connect Google in Integrations → Google Calendar." };
        } else {
          results[target] = { success: false, message: "Unknown integration." };
        }
      } catch (err) {
        results[target] = { success: false, message: err instanceof Error ? err.message : "Unknown error." };
      }
    }

    res.json({ results });
  } catch (err) {
    next(err);
  }
});

// GET /api/ai-runs/:id/share
aiRunsRouter.get("/:id/share", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;
    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT ar.id, ar.title, ar.output_json, ar.user_id
       FROM ai_runs ar
       WHERE ar.id = $1
       LIMIT 1`,
      [id]
    );

    if (rows.length === 0) throw new NotFoundError("Run not found.");

    const r = rows[0] as Record<string, unknown>;
    if (r.user_id !== userId) throw new ForbiddenError();

    return res.json({
      success: true,
      runId: r.id,
      title: r.title,
      hasOutput: r.output_json !== null,
    });
  } catch (err) {
    next(err);
  }
});
