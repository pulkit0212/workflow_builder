export async function sendSlackSummary(
  config: { webhookUrl?: string },
  meetingTitle: string,
  summary: Record<string, unknown>
) {
  if (!config.webhookUrl) {
    throw new Error("Slack webhook URL not configured");
  }

  const actionItems = Array.isArray(summary.action_items) ? summary.action_items : [];
  const keyDecisions = Array.isArray(summary.key_decisions) ? summary.key_decisions : [];
  const actionItemsText =
    actionItems.length > 0
      ? actionItems
          .map((item) => {
            const typedItem = item as {
              task?: string;
              owner?: string;
              due_date?: string;
            };
            return `• *${typedItem.task || "Untitled task"}* — ${typedItem.owner || "Unassigned"} (${typedItem.due_date || "Not specified"})`;
          })
          .join("\n")
      : "_No action items_";

  const decisionsText =
    keyDecisions.length > 0
      ? keyDecisions.map((decision) => `• ${String(decision)}`).join("\n")
      : "_No decisions recorded_";

  const message = {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `📋 Meeting Summary: ${meetingTitle}`,
          emoji: true
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: String(summary.summary || "No summary available")
        }
      },
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*✅ Action Items*\n${actionItemsText}`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*🎯 Key Decisions*\n${decisionsText}`
        }
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "_Powered by Artivaa — From meetings to meaningful work_"
          }
        ]
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
