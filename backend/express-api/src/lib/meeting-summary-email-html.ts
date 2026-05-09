/** HTML body for meeting summary auto-share emails (Resend or Gmail). */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildMeetingSummaryEmailHtml(opts: {
  title: string;
  summaryText: string;
  keyPoints: string[];
  actionItems: Array<{ task: string; owner: string; due_date: string }>;
  footerLine: string;
  decisions?: string[];
  risks?: string[];
}): string {
  const actionItemsHtml =
    opts.actionItems.length > 0
      ? opts.actionItems
          .map(
            (i) =>
              `<li><b>${escapeHtml(i.task)}</b> — ${escapeHtml(i.owner)} (Due: ${escapeHtml(i.due_date)})</li>`
          )
          .join("")
      : "<li>No action items</li>";

  const keyPointsHtml =
    opts.keyPoints.length > 0
      ? `<ul>${opts.keyPoints.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>`
      : "<p><i>No key points</i></p>";

  const summaryBlock = escapeHtml(opts.summaryText || "No summary available.").replace(/\n/g, "<br/>");

  const decisions = opts.decisions?.filter(Boolean) ?? [];
  const risks = opts.risks?.filter(Boolean) ?? [];
  const decisionsBlock =
    decisions.length > 0
      ? `<h3 style="margin:16px 0 8px;">🎯 Decisions</h3><ul>${decisions.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}</ul>`
      : "";
  const risksBlock =
    risks.length > 0
      ? `<h3 style="margin:16px 0 8px;">⚠️ Risks & blockers</h3><ul>${risks.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>`
      : "";

  return `
<div style="font-family:system-ui,-apple-system,sans-serif;max-width:640px;line-height:1.5;color:#202124;">
  <h2 style="margin:0 0 12px;">📋 ${escapeHtml(opts.title)}</h2>
  <div style="margin-bottom:20px;">${summaryBlock}</div>
  <h3 style="margin:16px 0 8px;">💡 Key points</h3>
  ${keyPointsHtml}
  <h3 style="margin:16px 0 8px;">✅ Action items</h3>
  <ul>${actionItemsHtml}</ul>
  ${decisionsBlock}
  ${risksBlock}
  <p style="color:#9AA0A6;font-size:12px;margin-top:24px;">${escapeHtml(opts.footerLine)}</p>
</div>`.trim();
}
