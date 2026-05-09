export async function sendSlackSummary(
  config: { webhookUrl?: string },
  meetingTitle: string,
  summary: Record<string, unknown>
) {
  if (!config.webhookUrl) {
    throw new Error("Slack webhook URL not configured");
  }

  const actionItems = Array.isArray(summary.action_items) ? summary.action_items : [];
  const keyPoints = Array.isArray(summary.key_points) ? summary.key_points : [];

  const MAX_ITEMS = 20;
  const displayItems = actionItems.slice(0, MAX_ITEMS);
  const remaining = actionItems.length - displayItems.length;

  const actionItemsText =
    displayItems.length > 0
      ? displayItems
          .map((item) => {
            const typedItem = item as { task?: string; owner?: string; due_date?: string };
            return `• *${String(typedItem.task || "Untitled task").slice(0, 80)}* — ${typedItem.owner || "Unassigned"}`;
          })
          .join("\n")
          + (remaining > 0 ? `\n_...and ${remaining} more item${remaining !== 1 ? "s" : ""}_` : "")
      : "_No action items_";

  const keyPointsText =
    keyPoints.length > 0
      ? keyPoints.map((p) => `• ${String(p)}`).join("\n")
      : "_No key points_";

  const message = {
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `📋 Meeting Summary: ${meetingTitle}`, emoji: true }
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: String(summary.summary || "No summary available").slice(0, 2900) }
      },
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*💡 Key Points*\n${keyPointsText}` }
      },
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*✅ Action Items*\n${actionItemsText}` }
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: "_Powered by Artivaa — From meetings to meaningful work_" }]
      }
    ]
  };

  const response = await fetch(config.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message)
  });

  if (!response.ok) {
    throw new Error(`Slack webhook failed: ${response.status} ${response.statusText}`);
  }

  console.log("[Slack] Summary sent successfully");
  return true;
}

export async function testSlackWebhook(webhookUrl: string) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "✅ Artivaa is connected! Meeting summaries will be posted here."
    })
  });

  return response.ok;
}
