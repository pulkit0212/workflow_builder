import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray } from "drizzle-orm";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { db } from "@/lib/db/client";
import { actionItems, integrations } from "@/db/schema";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return apiError("Unauthorized.", 401);
  if (!db) return apiError("Database not configured.", 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", 400);
  }

  const { itemIds } = body as { itemIds?: string[] };
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return apiError("itemIds must be a non-empty array.", 400);
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);

    const [items, jiraIntegrations] = await Promise.all([
      db.select().from(actionItems).where(
        and(eq(actionItems.userId, user.id), inArray(actionItems.id, itemIds))
      ),
      db.select().from(integrations).where(
        and(
          eq(integrations.userId, user.id),
          eq(integrations.type, "jira"),
          eq(integrations.enabled, true)
        )
      ).limit(1)
    ]);

    const integration = jiraIntegrations[0];
    if (!integration) {
      return apiError("Jira is not configured. Please set up Jira in Integrations.", 400);
    }

    const config = integration.config as Record<string, string> | null;
    if (!config?.domain || !config?.email || !config?.apiToken || !config?.projectKey) {
      return apiError("Jira configuration is incomplete.", 400);
    }

    const credentials = Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");
    let count = 0;

    for (const item of items) {
      try {
        const res = await fetch(`https://${config.domain}/rest/api/3/issue`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            fields: {
              project: { key: config.projectKey },
              summary: item.task,
              issuetype: { name: "Task" },
              priority: { name: item.priority },
              description: {
                type: "doc",
                version: 1,
                content: [{
                  type: "paragraph",
                  content: [{
                    type: "text",
                    text: `Owner: ${item.owner} | Due: ${item.dueDate}`
                  }]
                }]
              }
            }
          })
        });
        if (res.ok) count++;
      } catch {
        console.error("[Jira Export] Failed for item:", item.id);
      }
    }

    return apiSuccess({ success: true, count });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to export to Jira.", 500);
  }
}
