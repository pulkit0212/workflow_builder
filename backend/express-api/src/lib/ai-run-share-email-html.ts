/** Build subject + HTML for History / manual share emails from ai_runs.output_json. */

import { buildMeetingSummaryEmailHtml } from "./meeting-summary-email-html";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeActionRows(
  items: unknown[],
  mapFn: (row: Record<string, unknown>) => { task: string; owner: string; due_date: string }
): Array<{ task: string; owner: string; due_date: string }> {
  return items
    .map((raw) => mapFn(raw as Record<string, unknown>))
    .filter((r) => r.task.trim().length > 0);
}

export function buildAiRunShareEmail(params: {
  runTitle: string;
  toolSlug: string;
  output: Record<string, unknown>;
  footerLine: string;
}): { subject: string; html: string } {
  const { runTitle, toolSlug, output: o, footerLine } = params;
  const title = runTitle.trim() || "AI run";

  if (toolSlug === "email-generator") {
    const subjectLine = String(o.subject ?? title).trim() || "Generated email";
    const body = String(o.body ?? "").trim();
    const html = `
<div style="font-family:system-ui,-apple-system,sans-serif;max-width:640px;line-height:1.5;color:#202124;">
  <h2 style="margin:0 0 12px;">✉️ ${escapeHtml(subjectLine)}</h2>
  <div style="white-space:pre-wrap;">${escapeHtml(body || "(empty body)").replace(/\n/g, "<br/>")}</div>
  <p style="color:#9AA0A6;font-size:12px;margin-top:24px;">${escapeHtml(footerLine)}</p>
</div>`.trim();
    const subject = `Artivaa: ${subjectLine}`.slice(0, 250);
    return { subject, html };
  }

  const summaryText = String(
    typeof o.summary === "string" && o.summary.trim()
      ? o.summary
      : typeof o.content === "string"
        ? o.content
        : typeof o.text === "string"
          ? o.text
          : "No summary available."
  );

  const keyPoints = Array.isArray(o.key_points)
    ? (o.key_points as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  let actionItems: Array<{ task: string; owner: string; due_date: string }> = [];

  if (Array.isArray(o.action_items)) {
    actionItems = normalizeActionRows(o.action_items as unknown[], (row) => ({
      task: String(row.task ?? ""),
      owner: String(row.owner ?? "Unassigned"),
      due_date: String(row.due_date ?? row.dueDate ?? "Not specified"),
    }));
  } else if (toolSlug === "task-generator" && Array.isArray(o.tasks)) {
    actionItems = normalizeActionRows(o.tasks as unknown[], (row) => ({
      task: String(row.task ?? ""),
      owner: String(row.owner ?? "Unassigned"),
      due_date: String(row.due_date ?? "Not specified"),
    }));
  }

  const decisions =
    toolSlug === "document-analyzer" && Array.isArray(o.decisions)
      ? (o.decisions as unknown[]).filter((x): x is string => typeof x === "string")
      : undefined;
  const risks =
    toolSlug === "document-analyzer" && Array.isArray(o.risks)
      ? (o.risks as unknown[]).filter((x): x is string => typeof x === "string")
      : undefined;

  const html = buildMeetingSummaryEmailHtml({
    title,
    summaryText,
    keyPoints,
    actionItems,
    footerLine,
    decisions,
    risks,
  });

  return { subject: `Artivaa: ${title}`.slice(0, 250), html };
}
