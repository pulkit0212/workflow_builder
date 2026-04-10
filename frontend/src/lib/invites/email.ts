export interface InviteEmailParams {
  to: string;
  workspaceName: string;
  inviterName: string;
  acceptLink: string;
}

function buildInviteEmailHtml(params: InviteEmailParams): string {
  const { workspaceName, inviterName, acceptLink } = params;
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:#6c63ff;padding:32px 40px;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Artivaa</h1>
        </td></tr>
        <tr><td style="padding:40px;">
          <h2 style="margin:0 0 16px;color:#1e1b4b;font-size:20px;">You've been invited to join a workspace</h2>
          <p style="margin:0 0 8px;color:#4b5563;font-size:15px;">
            <strong>${inviterName}</strong> has invited you to join the <strong>${workspaceName}</strong> workspace on Artivaa.
          </p>
          <p style="margin:0 0 32px;color:#6b7280;font-size:14px;">Click the button below to accept the invitation. This link expires in 7 days.</p>
          <a href="${acceptLink}" style="display:inline-block;background:#6c63ff;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;">Accept Invite</a>
          <p style="margin:32px 0 0;color:#9ca3af;font-size:12px;">If you didn't expect this invitation, you can safely ignore this email.</p>
          <p style="margin:8px 0 0;color:#9ca3af;font-size:12px;">Or copy this link: <a href="${acceptLink}" style="color:#6c63ff;">${acceptLink}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendInviteEmail(params: InviteEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.INVITE_EMAIL_FROM ?? "Artivaa <onboarding@resend.dev>";

  // Dev fallback — log to console if no API key configured
  if (!apiKey) {
    console.log("\n📧 [INVITE EMAIL - DEV MODE]");
    console.log(`To: ${params.to}`);
    console.log(`Workspace: ${params.workspaceName}`);
    console.log(`Invited by: ${params.inviterName}`);
    console.log(`Accept link: ${params.acceptLink}\n`);
    return; // don't throw — allow invite row to be saved
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: `You're invited to join ${params.workspaceName} on Artivaa`,
      html: buildInviteEmailHtml(params)
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`[Resend] ${response.status}:`, body);
    throw new Error(`Resend API error ${response.status}: ${body}`);
  }
}
