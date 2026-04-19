type JiraWebhookPayload = {
  title: string;
  summary: string;
  action_items: Array<{ task: string; owner?: string; due_date?: string; priority?: string }>;
  source: "artivaa";
  timestamp: string;
};

/**
 * Webhook-based Jira integration.
 * POSTs action items to a user-provided webhook URL (Make.com, Zapier, n8n, etc.)
 * which then creates Jira tickets.
 */
export async function createJiraTickets(
  config: {
    webhookUrl?: string;
    domain?: string;
    email?: string;
    apiToken?: string;
    projectKey?: string;
  },
  meetingTitle: string,
  actionItems: Array<Record<string, unknown>>
) {
  // Prefer webhook URL if provided (new approach)
  if (config.webhookUrl) {
    return sendJiraWebhook(config.webhookUrl, meetingTitle, actionItems);
  }

  // Fallback: direct Jira API (legacy)
  if (config.domain && config.email && config.apiToken && config.projectKey) {
    return createJiraTicketsDirect(
      config as { domain: string; email: string; apiToken: string; projectKey: string },
      meetingTitle,
      actionItems
    );
  }

  throw new Error("Jira is not configured. Add a webhook URL or domain + credentials.");
}

async function sendJiraWebhook(
  webhookUrl: string,
  meetingTitle: string,
  actionItems: Array<Record<string, unknown>>
) {
  const payload: JiraWebhookPayload = {
    title: meetingTitle,
    summary: `Action items from: ${meetingTitle}`,
    action_items: actionItems.map((item) => ({
      task: String(item.task || "Untitled task"),
      owner: String(item.owner || "Unassigned"),
      due_date: String(item.due_date || "Not specified"),
      priority: String(item.priority || "Medium"),
    })),
    source: "artivaa",
    timestamp: new Date().toISOString(),
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Jira webhook failed: ${response.status} ${response.statusText}`);
  }

  console.log("[Jira] Webhook sent successfully");
  // Return empty array — ticket keys not available via webhook
  return [];
}

async function createJiraTicketsDirect(
  config: { domain: string; email: string; apiToken: string; projectKey: string },
  meetingTitle: string,
  actionItems: Array<Record<string, unknown>>
) {
  const credentials = Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");
  const baseUrl = `https://${config.domain}/rest/api/3`;
  const createdTickets: string[] = [];

  for (const item of actionItems) {
    const priorityLabel = item.priority === "High" ? "High" : item.priority === "Low" ? "Low" : "Medium";
    const body = {
      fields: {
        project: { key: config.projectKey },
        summary: String(item.task || "Untitled task"),
        description: {
          type: "doc", version: 1,
          content: [{ type: "paragraph", content: [
            { type: "text", text: `From meeting: ${meetingTitle}\n` },
            { type: "text", text: `Owner: ${String(item.owner || "Unassigned")}\n` },
            { type: "text", text: `Due: ${String(item.due_date || "Not specified")}` },
          ]}],
        },
        issuetype: { name: "Task" },
        priority: { name: priorityLabel },
      },
    };

    try {
      const response = await fetch(`${baseUrl}/issue`, {
        method: "POST",
        headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        const ticket = (await response.json()) as { key?: string };
        if (ticket.key) { createdTickets.push(ticket.key); console.log(`[Jira] Created ticket: ${ticket.key}`); }
      } else {
        console.error("[Jira] Ticket creation failed:", await response.json().catch(() => null));
      }
    } catch (error) {
      console.error("[Jira] Error:", error instanceof Error ? error.message : error);
    }
  }

  return createdTickets;
}

export async function testJiraConnection(domain: string, email: string, apiToken: string) {
  const credentials = Buffer.from(`${email}:${apiToken}`).toString("base64");
  const response = await fetch(`https://${domain}/rest/api/3/myself`, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  return response.ok;
}

/** Test a webhook URL by sending a test payload */
export async function testJiraWebhook(webhookUrl: string) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Test from Artivaa",
      summary: "Test connection from Artivaa Meeting Intelligence.",
      action_items: [{ task: "Test ticket", owner: "You", due_date: "Today", priority: "Medium" }],
      source: "artivaa",
      timestamp: new Date().toISOString(),
    }),
  });
  return response.ok;
}
