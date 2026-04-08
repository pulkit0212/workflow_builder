import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray } from "drizzle-orm";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { db } from "@/lib/db/client";
import { actionItems, integrations } from "@/db/schema";
import { resolveWorkspaceIdForRequest } from "@/lib/workspaces/server";

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
    const workspaceId = await resolveWorkspaceIdForRequest(request, user.id);

    const [items, slackIntegrations] = await Promise.all([
      db.select().from(actionItems).where(
        workspaceId
          ? and(
              eq(actionItems.workspaceId, workspaceId),
              eq(actionItems.userId, user.id),
              inArray(actionItems.id, itemIds)
            )
          : and(
              eq(actionItems.userId, user.id),
              inArray(actionItems.id, itemIds)
            )
      ),
      db.select().from(integrations).where(
        and(
          eq(integrations.userId, user.id),
          eq(integrations.type, "slack"),
          eq(integrations.enabled, true)
        )
      ).limit(1)
    ]);

    const integration = slackIntegrations[0];
    const webhookUrl = (integration?.config as Record<string, unknown> | null)?.webhookUrl as string | undefined;

    if (!webhookUrl) {
      return apiError("Slack is not configured. Please add a webhook URL in Integrations.", 400);
    }

    const message = {
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "✅ Action Items", emoji: true }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: items
              .map((item) => `• *${item.task}* — ${item.owner} (${item.dueDate}) [${item.priority}]`)
              .join("\n") || "_No items_"
          }
        },
        {
          type: "context",
          elements: [{ type: "mrkdwn", text: "_Exported from Artivaa_" }]
        }
      ]
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message)
    });

    if (!res.ok) {
      return apiError("Failed to post to Slack. Check your webhook URL.", 502);
    }

    return apiSuccess({ success: true });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to export to Slack.", 500);
  }
}
