/**
 * Transactional email for workspace invites via Resend (https://resend.com).
 * Free tier: thousands of emails/month — verify your domain for production "from" address.
 *
 * Env:
 *   RESEND_API_KEY=re_...
 *   EMAIL_FROM="Artivaa <noreply@yourdomain.com>"  (or Resend test: "Artivaa <onboarding@resend.dev>")
 */

import { sendResendHtmlEmail } from "./email-resend";

export type InviteEmailResult = { ok: true } | { ok: false; reason: "not_configured" | "send_failed"; detail?: string };

export async function sendWorkspaceInviteEmail(params: {
  to: string;
  inviteLink: string;
  workspaceName: string;
  inviterDisplayName: string;
}): Promise<InviteEmailResult> {
  if (!process.env.RESEND_API_KEY?.trim()) {
    console.warn("[workspace-invite-email] RESEND_API_KEY not set — invite email skipped (link still returned in API).");
    return { ok: false, reason: "not_configured" };
  }

  const subject = `You're invited to ${params.workspaceName} on Artivaa`;
  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #202124;">
  <p>Hi,</p>
  <p><strong>${escapeHtml(params.inviterDisplayName)}</strong> invited you to join the workspace
  <strong>${escapeHtml(params.workspaceName)}</strong> on Artivaa AI.</p>
  <p><a href="${escapeHtml(params.inviteLink)}" style="display:inline-block; margin: 16px 0; padding: 12px 20px; background: #6C3FF5; color: #fff; text-decoration: none; border-radius: 12px; font-weight: 600;">Accept invitation</a></p>
  <p style="font-size: 13px; color: #5F6368;">Or paste this link in your browser:<br/><span style="word-break: break-all;">${escapeHtml(params.inviteLink)}</span></p>
  <p style="font-size: 12px; color: #9AA0A6;">If you didn’t expect this, you can ignore this email.</p>
</body>
</html>`.trim();

  const result = await sendResendHtmlEmail({
    to: [params.to],
    subject,
    html,
  });

  if (result.ok) {
    console.info("[workspace-invite-email] Sent invite to", params.to);
    return { ok: true };
  }
  if (result.reason === "not_configured") {
    return { ok: false, reason: "not_configured" };
  }
  return { ok: false, reason: "send_failed", detail: result.detail };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
