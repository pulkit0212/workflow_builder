import { getActiveGoogleIntegration } from "@/lib/google/integration";
import { sendSlackSummary } from "@/lib/integrations/slack";
import { sendGmailSummary } from "@/lib/integrations/gmail";
import { createNotionPage } from "@/lib/integrations/notion";
import { createJiraTickets } from "@/lib/integrations/jira";

type Integration = { type: string; config: Record<string, unknown> };

export async function triggerIntegrations(
  userId: string,
  meetingId: string,
  meetingTitle: string,
  summary: Record<string, unknown>,
  transcript: string,
  accessToken?: string,
  integrations: Integration[] = []
) {
  console.log("[Integrations] Triggering for meeting:", meetingId);

  if (integrations.length === 0) {
    console.log("[Integrations] No integrations enabled");
    return {};
  }

  const results: Record<string, boolean> = {};
  let gmailAccessToken = accessToken;

  for (const integration of integrations) {
    const config = integration.config ?? {};

    try {
      switch (integration.type) {
        case "slack":
          await sendSlackSummary(config, meetingTitle, summary);
          results.slack = true;
          break;
        case "gmail":
          if (!gmailAccessToken) {
            const googleIntegration = await getActiveGoogleIntegration(userId);
            gmailAccessToken = googleIntegration?.accessToken ?? undefined;
          }
          if (gmailAccessToken) {
            await sendGmailSummary(config, meetingTitle, summary, gmailAccessToken);
            results.gmail = true;
          } else {
            results.gmail = false;
          }
          break;
        case "notion":
          await createNotionPage(config, meetingTitle, summary, transcript);
          results.notion = true;
          break;
        case "jira":
          if (Array.isArray(summary.action_items) && summary.action_items.length > 0) {
            await createJiraTickets(config, meetingTitle, summary.action_items as Array<Record<string, unknown>>);
          }
          results.jira = true;
          break;
        default:
          break;
      }
      console.log(`[Integrations] ${integration.type} ✓`);
    } catch (error) {
      console.error(`[Integrations] ${integration.type} failed:`, error instanceof Error ? error.message : error);
      results[integration.type] = false;
    }
  }

  return results;
}
