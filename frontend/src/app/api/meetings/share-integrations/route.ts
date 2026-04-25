import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sendSlackSummary } from "@/lib/integrations/slack";
import { createJiraTickets } from "@/lib/integrations/jira";
import { createNotionPage } from "@/lib/integrations/notion";

type ShareTarget = "slack" | "gmail" | "notion" | "jira";

type ShareResult = { success: boolean; message: string };

export async function POST(req: NextRequest) {
  try {
    const { getToken } = await auth();
    const token = await getToken();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

    const body = await req.json() as {
      targets: ShareTarget[];
      title: string;
      summary: string;
      actionItems: Array<{ task: string; owner?: string; dueDate?: string; deadline?: string; priority?: string }>;
      transcript: string | null;
    };

    const { targets, title, summary, actionItems, transcript } = body;

    // Fetch integration configs from Express backend
    const intRes = await fetch(`${apiUrl}/api/integrations`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!intRes.ok) {
      return NextResponse.json({ results: Object.fromEntries(targets.map((t) => [t, { success: false, message: "Failed to load integration config." }])) });
    }

    const integrations = (await intRes.json()) as Array<{ type: string; enabled: boolean; config: Record<string, unknown> }>;
    const configMap = Object.fromEntries(integrations.map((i) => [i.type, i.config ?? {}]));

    // Build summary object for legacy integration libs
    const summaryObj = {
      summary,
      action_items: actionItems.map((i) => ({
        task: i.task,
        owner: i.owner ?? "Unassigned",
        due_date: i.dueDate ?? i.deadline ?? "Not specified",
        priority: i.priority ?? "Medium",
      })),
      key_points: [] as string[],
      key_decisions: [] as string[],
    };

    const results: Record<string, ShareResult> = {};

    for (const target of targets) {
      const config = configMap[target] ?? {};
      try {
        switch (target) {
          case "slack":
            await sendSlackSummary(config, title, summaryObj);
            results[target] = { success: true, message: "Posted to Slack." };
            break;

          case "gmail": {
            // Get Google access token from backend
            const tokenRes = await fetch(`${apiUrl}/api/google/access-token`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const tokenData = await tokenRes.json() as { accessToken?: string };
            if (!tokenData.accessToken) {
              results[target] = { success: false, message: "Google account not connected. Please connect Google in Integrations." };
              break;
            }
            // Send email via Gmail REST API directly
            const recipients = String(config.recipients ?? "").split(",").map((r) => r.trim()).filter(Boolean);
            if (recipients.length === 0) {
              results[target] = { success: false, message: "No recipients configured. Add recipients in Integrations → Gmail → Configure." };
              break;
            }
            const actionItemsHtml = summaryObj.action_items.length > 0
              ? summaryObj.action_items.map((i) => `<li><b>${i.task}</b> — ${i.owner} (Due: ${i.due_date})</li>`).join("")
              : "<li>No action items</li>";
            const htmlBody = `<div style="font-family:Arial,sans-serif;max-width:600px"><h2>📋 ${title}</h2><p>${summary}</p><h3>✅ Action Items</h3><ul>${actionItemsHtml}</ul><p style="color:#9ca3af;font-size:12px">Powered by Artivaa</p></div>`;
            const emailContent = [`To: ${recipients.join(", ")}`, "Content-Type: text/html; charset=utf-8", "MIME-Version: 1.0", `Subject: Meeting Summary: ${title}`, "", htmlBody].join("\n");
            const encoded = Buffer.from(emailContent).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
            const gmailRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
              method: "POST",
              headers: { Authorization: `Bearer ${tokenData.accessToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({ raw: encoded }),
            });
            if (!gmailRes.ok) {
              const err = await gmailRes.json() as { error?: { message?: string; code?: number } };
              const isAuthError = gmailRes.status === 401 || gmailRes.status === 403;
              results[target] = {
                success: false,
                message: isAuthError
                  ? "Google token expired. Go to Integrations → Google Calendar → Disconnect, then reconnect."
                  : (err.error?.message ?? "Gmail send failed.")
              };
            } else {
              results[target] = { success: true, message: "Email sent." };
            }
            break;
          }

          case "notion":
            await createNotionPage(config, title, summaryObj, transcript ?? "");
            results[target] = { success: true, message: "Notion page created." };
            break;

          case "jira":
            if (actionItems.length === 0) {
              results[target] = { success: false, message: "No action items to create tickets for." };
              break;
            }
            await createJiraTickets(config, title, summaryObj.action_items as Array<Record<string, unknown>>);
            results[target] = { success: true, message: `${actionItems.length} ticket(s) created.` };
            break;

          default:
            results[target] = { success: false, message: "Unknown integration." };
        }
      } catch (err) {
        results[target] = { success: false, message: err instanceof Error ? err.message : "Unknown error." };
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}
