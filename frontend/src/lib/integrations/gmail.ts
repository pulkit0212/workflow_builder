import { google } from "googleapis";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function sendGmailSummary(
  config: { recipients?: string },
  meetingTitle: string,
  summary: Record<string, unknown>,
  accessToken: string
) {
  if (!config.recipients) {
    throw new Error("No recipients configured");
  }

  if (!accessToken) {
    throw new Error("Google access token required");
  }

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: "v1", auth });
  const actionItems = Array.isArray(summary.action_items) ? summary.action_items : [];
  const keyDecisions = Array.isArray(summary.key_decisions) ? summary.key_decisions : [];

  const actionItemsHtml =
    actionItems.length > 0
      ? `<ul>${actionItems
          .map((item) => {
            const typedItem = item as {
              task?: string;
              owner?: string;
              due_date?: string;
              priority?: string;
            };
            return `<li><strong>${escapeHtml(typedItem.task || "Untitled task")}</strong> — ${escapeHtml(
              typedItem.owner || "Unassigned"
            )} (Due: ${escapeHtml(typedItem.due_date || "Not specified")}, Priority: ${escapeHtml(
              typedItem.priority || "Medium"
            )})</li>`;
          })
          .join("")}</ul>`
      : "<p><em>No action items</em></p>";

  const decisionsHtml =
    keyDecisions.length > 0
      ? `<ul>${keyDecisions.map((decision) => `<li>${escapeHtml(String(decision))}</li>`).join("")}</ul>`
      : "<p><em>No decisions recorded</em></p>";

  const htmlBody = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #6c63ff; padding: 20px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px;">📋 Meeting Summary</h1>
          <p style="color: #e2e8f0; margin: 4px 0 0 0; font-size: 14px;">${escapeHtml(meetingTitle)}</p>
        </div>
        <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
          <h2 style="color: #1f2937; font-size: 16px;">Summary</h2>
          <p style="color: #4b5563;">${escapeHtml(String(summary.summary || "No summary available"))}</p>
          <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 20px 0;">
          <h2 style="color: #1f2937; font-size: 16px;">✅ Action Items</h2>
          ${actionItemsHtml}
          <h2 style="color: #1f2937; font-size: 16px;">🎯 Key Decisions</h2>
          ${decisionsHtml}
          <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 20px 0;">
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            Powered by Artivaa — From meetings to meaningful work
          </p>
        </div>
      </body>
    </html>
  `;

  const recipients = config.recipients
    .split(",")
    .map((recipient) => recipient.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    throw new Error("No valid recipients configured");
  }

  const emailContent = [
    `To: ${recipients.join(", ")}`,
    "Content-Type: text/html; charset=utf-8",
    "MIME-Version: 1.0",
    `Subject: Meeting Summary: ${meetingTitle}`,
    "",
    htmlBody
  ].join("\n");

  const encodedEmail = Buffer.from(emailContent)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encodedEmail }
  });

  console.log("[Gmail] Summary email sent to:", recipients);
  return true;
}
