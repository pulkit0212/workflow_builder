import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { getIntegrationByUserAndType } from "@/lib/db/queries/integrations";
import { getActiveGoogleIntegration } from "@/lib/google/integration";
import { sendSlackSummary } from "@/lib/integrations/slack";
import { sendGmailSummary } from "@/lib/integrations/gmail";
import { createNotionPage } from "@/lib/integrations/notion";
import { createJiraTickets } from "@/lib/integrations/jira";

export const runtime = "nodejs";

const shareSchema = z.object({
  targets: z.array(z.enum(["slack", "gmail", "notion", "jira"])).min(1),
  title: z.string(),
  summary: z.string(),
  actionItems: z.array(z.object({
    task: z.string(),
    owner: z.string().optional(),
    dueDate: z.string().optional(),
    deadline: z.string().optional(),
    priority: z.string().optional(),
  })).optional().default([]),
  transcript: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return apiError("Unauthorized.", 401);

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);

    const body = await request.json();
    const parsed = shareSchema.safeParse(body);
    if (!parsed.success) return apiError("Invalid request.", 400);

    const { targets, title, summary, actionItems, transcript } = parsed.data;

    // Build the summary object in the format the integration libs expect
    const summaryOutput: Record<string, unknown> = {
      summary,
      action_items: actionItems.map((item) => ({
        task: item.task,
        owner: item.owner ?? "Unassigned",
        due_date: item.dueDate ?? item.deadline ?? "Not specified",
        priority: item.priority ?? "Medium",
      })),
      key_points: [],
    };

    const results: Record<string, { success: boolean; message: string }> = {};

    for (const target of targets) {
      const integration = await getIntegrationByUserAndType(user.id, target);

      if (!integration?.enabled) {
        results[target] = { success: false, message: `${target} is not connected or enabled.` };
        continue;
      }

      const config = (integration.config ?? {}) as Record<string, string>;

      try {
        switch (target) {
          case "slack":
            await sendSlackSummary(config, title, summaryOutput);
            results.slack = { success: true, message: "Posted to Slack." };
            break;

          case "gmail": {
            const googleIntegration = await getActiveGoogleIntegration(user.id);
            const accessToken = googleIntegration?.accessToken;
            if (!accessToken) {
              results.gmail = { success: false, message: "Google account not connected." };
              break;
            }
            await sendGmailSummary(config, title, summaryOutput, accessToken);
            results.gmail = { success: true, message: "Email sent." };
            break;
          }

          case "notion":
            await createNotionPage(config, title, summaryOutput, transcript ?? "");
            results.notion = { success: true, message: "Page created in Notion." };
            break;

          case "jira": {
            if (actionItems.length === 0) {
              results.jira = { success: false, message: "No action items to create tickets for." };
              break;
            }
            const tickets = await createJiraTickets(
              config,
              title,
              actionItems.map((item) => ({
                task: item.task,
                owner: item.owner ?? "Unassigned",
                due_date: item.dueDate ?? item.deadline ?? "Not specified",
                priority: item.priority ?? "Medium",
              }))
            );
            results.jira = {
              success: tickets.length > 0,
              message: tickets.length > 0
                ? `Created ${tickets.length} ticket${tickets.length !== 1 ? "s" : ""}: ${tickets.join(", ")}`
                : "No tickets created.",
            };
            break;
          }
        }
      } catch (err) {
        results[target] = {
          success: false,
          message: err instanceof Error ? err.message : `Failed to share to ${target}.`,
        };
      }
    }

    return apiSuccess({ results });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Share failed.", 500);
  }
}
