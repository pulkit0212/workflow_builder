type NotionWebhookPayload = {
  title: string;
  summary: string;
  action_items: Array<{ task: string; owner?: string; due_date?: string; priority?: string }>;
  key_points: string[];
  transcript: string;
  source: "artivaa";
  timestamp: string;
};

/**
 * Webhook-based Notion integration.
 * POSTs structured meeting data to a user-provided webhook URL (Make.com, Zapier, n8n, etc.)
 * which then creates a Notion page.
 */
export async function createNotionPage(
  config: { webhookUrl?: string; apiToken?: string; databaseId?: string },
  meetingTitle: string,
  summary: Record<string, unknown>,
  transcript: string
) {
  // Prefer webhook URL if provided (new approach)
  if (config.webhookUrl) {
    return sendNotionWebhook(config.webhookUrl, meetingTitle, summary, transcript);
  }

  // Fallback: direct Notion API (legacy)
  if (config.apiToken && config.databaseId) {
    return createNotionPageDirect(config as { apiToken: string; databaseId: string }, meetingTitle, summary, transcript);
  }

  throw new Error("Notion is not configured. Add a webhook URL or API token + database ID.");
}

async function sendNotionWebhook(
  webhookUrl: string,
  meetingTitle: string,
  summary: Record<string, unknown>,
  transcript: string
) {
  const actionItems = Array.isArray(summary.action_items) ? summary.action_items : [];
  const keyPoints = Array.isArray(summary.key_points) ? summary.key_points : [];

  const payload: NotionWebhookPayload = {
    title: meetingTitle,
    summary: String(summary.summary || ""),
    action_items: actionItems.map((item) => {
      const i = item as Record<string, unknown>;
      return {
        task: String(i.task || "Untitled task"),
        owner: String(i.owner || "Unassigned"),
        due_date: String(i.due_date || "Not specified"),
        priority: String(i.priority || "Medium"),
      };
    }),
    key_points: keyPoints.map((p) => String(p)),
    transcript: transcript ? transcript.substring(0, 5000) : "",
    source: "artivaa",
    timestamp: new Date().toISOString(),
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Notion webhook failed: ${response.status} ${response.statusText}`);
  }

  console.log("[Notion] Webhook sent successfully");
  return "";
}

async function createNotionPageDirect(
  config: { apiToken: string; databaseId: string },
  meetingTitle: string,
  summary: Record<string, unknown>,
  transcript: string
) {
  const actionItems = Array.isArray(summary.action_items) ? summary.action_items : [];
  const keyPoints = Array.isArray(summary.key_points) ? summary.key_points : [];

  const actionItemsBlocks = actionItems.map((item) => {
    const i = item as { task?: string; owner?: string; due_date?: string };
    return {
      object: "block", type: "to_do",
      to_do: {
        rich_text: [{ type: "text", text: { content: `${i.task || "Untitled task"} — ${i.owner || "Unassigned"} (Due: ${i.due_date || "Not specified"})` } }],
        checked: false,
      },
    };
  });

  const keyPointsBlocks = keyPoints.map((point) => ({
    object: "block", type: "bulleted_list_item",
    bulleted_list_item: { rich_text: [{ type: "text", text: { content: String(point) } }] },
  }));

  const blocks = [
    { object: "block", type: "heading_2", heading_2: { rich_text: [{ type: "text", text: { content: "📋 Summary" } }] } },
    { object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: String(summary.summary || "No summary") } }] } },
    { object: "block", type: "heading_2", heading_2: { rich_text: [{ type: "text", text: { content: "✅ Action Items" } }] } },
    ...actionItemsBlocks,
    { object: "block", type: "heading_2", heading_2: { rich_text: [{ type: "text", text: { content: "💡 Key Points" } }] } },
    ...keyPointsBlocks,
    { object: "block", type: "heading_2", heading_2: { rich_text: [{ type: "text", text: { content: "📝 Transcript" } }] } },
    { object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: transcript ? transcript.substring(0, 2000) + (transcript.length > 2000 ? "..." : "") : "No transcript" } }] } },
  ];

  const response = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiToken}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
    body: JSON.stringify({
      parent: { database_id: config.databaseId },
      properties: { title: { title: [{ text: { content: meetingTitle } }] } },
      children: blocks,
    }),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(`Notion API error: ${error?.message || response.statusText}`);
  }

  const page = (await response.json()) as { url?: string };
  console.log("[Notion] Page created:", page.url);
  return page.url || "";
}

export async function testNotionConnection(apiToken: string, databaseId: string) {
  const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
    headers: { Authorization: `Bearer ${apiToken}`, "Notion-Version": "2022-06-28" },
  });
  return response.ok;
}

/** Test a webhook URL by sending a test payload */
export async function testNotionWebhook(webhookUrl: string) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Test from Artivaa",
      summary: "This is a test connection from Artivaa Meeting Intelligence.",
      action_items: [{ task: "Test action item", owner: "You", due_date: "Today", priority: "Medium" }],
      key_points: ["Artivaa is connected to Notion"],
      transcript: "",
      source: "artivaa",
      timestamp: new Date().toISOString(),
    }),
  });
  return response.ok;
}
