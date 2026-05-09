/**
 * Outbound email: Resend first (RESEND_API_KEY), else Gmail API (gmail.send).
 * Used by auto-share, History share, meeting follow-up send, and tools.
 */

import { pool } from "../db/client";
import { sendResendHtmlEmail } from "./email-resend";

export type GmailIntegrationSendResult =
  | { ok: true; via: "resend" | "gmail_api" }
  | { ok: false; message: string };

/** Wrap plain text (e.g. AI follow-up email) as minimal HTML for Resend/Gmail HTML MIME. */
export function plainTextToHtmlEmailBody(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:640px;line-height:1.5;white-space:pre-wrap;color:#202124;">${escaped}</div>`;
}

export async function sendHtmlToRecipients(params: {
  userId: string;
  recipients: string[];
  subject: string;
  html: string;
}): Promise<GmailIntegrationSendResult> {
  const recipients = params.recipients.map((r) => r.trim()).filter(Boolean);
  if (recipients.length === 0) {
    return { ok: false, message: "No email recipients provided." };
  }

  if (process.env.RESEND_API_KEY?.trim()) {
    const resendResult = await sendResendHtmlEmail({
      to: recipients,
      subject: params.subject,
      html: params.html,
    });
    if (resendResult.ok) return { ok: true, via: "resend" };
    return {
      ok: false,
      message:
        resendResult.reason === "send_failed"
          ? resendResult.detail ?? "Resend email failed."
          : "Email could not be sent.",
    };
  }

  const tokenResult = await pool.query(
    `SELECT access_token, scopes FROM user_integrations WHERE user_id = $1 AND provider = 'google' LIMIT 1`,
    [params.userId]
  );
  const accessToken = tokenResult.rows[0]?.access_token;
  const scopes = String(tokenResult.rows[0]?.scopes ?? "");
  const hasGmailSend = scopes.includes("https://www.googleapis.com/auth/gmail.send");
  if (!accessToken) {
    return {
      ok: false,
      message:
        "Set RESEND_API_KEY on the server for email, or connect Google with Gmail send permission.",
    };
  }
  if (!hasGmailSend) {
    return {
      ok: false,
      message:
        "Google is missing Gmail send permission. Use RESEND_API_KEY, or reconnect Google with Gmail sending.",
    };
  }

  const emailContent = [
    `To: ${recipients.join(", ")}`,
    "Content-Type: text/html; charset=utf-8",
    "MIME-Version: 1.0",
    `Subject: ${params.subject}`,
    "",
    params.html,
  ].join("\n");
  const encoded = Buffer.from(emailContent)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const gmailRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encoded }),
  });
  if (!gmailRes.ok) {
    if (gmailRes.status === 401 || gmailRes.status === 403) {
      return {
        ok: false,
        message: "Gmail rejected the send. Reconnect Google or use RESEND_API_KEY.",
      };
    }
    const errText = await gmailRes.text().catch(() => "");
    return {
      ok: false,
      message: `Gmail send failed (${gmailRes.status}). ${errText.slice(0, 120)}`,
    };
  }
  return { ok: true, via: "gmail_api" };
}

/** Uses Integrations → Gmail `config.recipients` (comma-separated). */
export async function sendHtmlViaGmailIntegration(params: {
  userId: string;
  config: Record<string, unknown>;
  subject: string;
  html: string;
}): Promise<GmailIntegrationSendResult> {
  const recipients = String(params.config.recipients ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  if (recipients.length === 0) {
    return {
      ok: false,
      message: "Add comma-separated recipients under Integrations → Gmail.",
    };
  }
  return sendHtmlToRecipients({
    userId: params.userId,
    recipients,
    subject: params.subject,
    html: params.html,
  });
}
