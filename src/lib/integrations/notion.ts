export async function createNotionPage(
  config: { apiToken?: string; databaseId?: string },
  meetingTitle: string,
  summary: Record<string, unknown>,
  transcript: string
) {
  if (!config.apiToken) {
    throw new Error("Notion API token not configured");
  }

  if (!config.databaseId) {
    throw new Error("Notion database ID not configured");
  }

  const actionItems = Array.isArray(summary.action_items) ? summary.action_items : [];
  const keyPoints = Array.isArray(summary.key_points) ? summary.key_points : [];
  const actionItemsBlocks = actionItems.map((item) => {
    const typedItem = item as {
      task?: string;
      owner?: string;
      due_date?: string;
    };

    return {
      object: "block",
      type: "to_do",
      to_do: {
        rich_text: [
          {
            type: "text",
            text: {
              content: `${typedItem.task || "Untitled task"} — ${typedItem.owner || "Unassigned"} (Due: ${typedItem.due_date || "Not specified"})`
            }
          }
        ],
        checked: false
      }
    };
  });

  const keyPointsBlocks = keyPoints.map((point) => ({
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: {
      rich_text: [{ type: "text", text: { content: String(point) } }]
    }
  }));

  const blocks = [
    {
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "📋 Summary" } }]
      }
    },
    {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [{ type: "text", text: { content: String(summary.summary || "No summary") } }]
      }
    },
    {
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "✅ Action Items" } }]
      }
    },
    ...actionItemsBlocks,
    {
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "💡 Key Points" } }]
      }
    },
    ...keyPointsBlocks,
    {
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "📝 Transcript" } }]
      }
    },
    {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: transcript
                ? transcript.substring(0, 2000) + (transcript.length > 2000 ? "..." : "")
                : "No transcript"
            }
          }
        ]
      }
    }
  ];

  const response = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      parent: { database_id: config.databaseId },
      properties: {
        title: {
          title: [
            {
              text: { content: meetingTitle }
            }
          ]
        }
      },
      children: blocks
    })
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
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Notion-Version": "2022-06-28"
    }
  });

  return response.ok;
}
