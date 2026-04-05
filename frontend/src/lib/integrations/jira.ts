export async function createJiraTickets(
  config: {
    domain?: string;
    email?: string;
    apiToken?: string;
    projectKey?: string;
  },
  meetingTitle: string,
  actionItems: Array<Record<string, unknown>>
) {
  if (!config.domain) throw new Error("Jira domain not configured");
  if (!config.email) throw new Error("Jira email not configured");
  if (!config.apiToken) throw new Error("Jira API token not configured");
  if (!config.projectKey) throw new Error("Jira project key not configured");

  const credentials = Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");
  const baseUrl = `https://${config.domain}/rest/api/3`;
  const createdTickets: string[] = [];

  for (const item of actionItems) {
    const priorityLabel =
      item.priority === "High" ? "High" : item.priority === "Low" ? "Low" : "Medium";

    const body = {
      fields: {
        project: { key: config.projectKey },
        summary: String(item.task || "Untitled task"),
        description: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: `From meeting: ${meetingTitle}\n` },
                { type: "text", text: `Owner: ${String(item.owner || "Unassigned")}\n` },
                { type: "text", text: `Due: ${String(item.due_date || "Not specified")}` }
              ]
            }
          ]
        },
        issuetype: { name: "Task" },
        priority: { name: priorityLabel }
      }
    };

    try {
      const response = await fetch(`${baseUrl}/issue`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        const ticket = (await response.json()) as { key?: string };
        if (ticket.key) {
          createdTickets.push(ticket.key);
          console.log(`[Jira] Created ticket: ${ticket.key}`);
        }
      } else {
        const error = await response.json().catch(() => null);
        console.error("[Jira] Ticket creation failed:", error);
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
    headers: { Authorization: `Basic ${credentials}` }
  });

  return response.ok;
}
