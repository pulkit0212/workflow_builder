import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { aiRuns } from "@/db/schema";
import { getIntegrationByUserAndType } from "@/lib/db/queries/integrations";
import { getActiveGoogleIntegration } from "@/lib/google/integration";
import { sendSlackSummary } from "@/lib/integrations/slack";
import { sendGmailSummary } from "@/lib/integrations/gmail";
import { createNotionPage } from "@/lib/integrations/notion";
import { createJiraTickets } from "@/lib/integrations/jira";

export const runtime = "nodejs";

const shareSchema = z.object({
  targets: z.array(z.enum(["slack", "gmail", "notion", "jira"])).min(1),
});

function getDbOrThrow() {
  if (!db) throw new Error("DATABASE_URL is not configured.");
  return db;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return apiError("Unauthorized.", 401);

  const { id: runId } = await params;

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const database = getDbOrThrow();

    // Load the run
    const [run] = await database
      .select()
      .from(aiRuns)
      .where(eq(aiRuns.id, runId))
      .limit(1);

    if (!run) return apiError("Run not found.", 404);
    if (run.userId !== user.id) return apiError("Forbidden.", 403);
    if (!run.outputJson) return apiError("Run has no output to share.", 400);

    const body = await request.json();
    const parsed = shareSchema.safeParse(body);
    if (!parsed.success) return apiError("Invalid request.", 400);

    const { targets } = parsed.data;
    const output = run.outputJson as Record<string, unknown>;
    const title = run.title ?? "Meeting Summary";
    const transcript =
      run.inputJson && typeof (run.inputJson as Record<string, unknown>).transcript === "string"
        ? ((run.inputJson as Record<string, unknown>).transcript as string)
        : "";

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
            await sendSlackSummary(config, title, output);
            results.slack = { success: true, message: "Posted to Slack." };
            break;

          case "gmail": {
            const googleIntegration = await getActiveGoogleIntegration(user.id);
            const accessToken = googleIntegration?.accessToken;
            if (!accessToken) {
              results.gmail = { success: false, message: "Google account not connected." };
              break;
            }
            await sendGmailSummary(config, title, output, accessToken);
            results.gmail = { success: true, message: "Email sent." };
            break;
          }

          case "notion":
            await createNotionPage(config, title, output, transcript);
            results.notion = { success: true, message: "Page created in Notion." };
            break;

          case "jira": {
            const actionItems = Array.isArray(output.action_items)
              ? (output.action_items as Array<Record<string, unknown>>)
              : [];
            if (actionItems.length === 0) {
              results.jira = { success: false, message: "No action items to create tickets for." };
              break;
            }
            const tickets = await createJiraTickets(config, title, actionItems);
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
