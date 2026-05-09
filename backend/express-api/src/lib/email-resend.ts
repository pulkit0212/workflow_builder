/**
 * Shared Resend outbound helper (transactional HTML).
 * Uses RESEND_API_KEY and optional EMAIL_FROM — same as workspace invites.
 */

const RESEND_API = "https://api.resend.com/emails";

export type ResendSendResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "send_failed"; detail?: string };

export async function sendResendHtmlEmail(params: {
  to: string[];
  subject: string;
  html: string;
}): Promise<ResendSendResult> {
  const recipients = params.to.map((e) => e.trim()).filter(Boolean);
  if (recipients.length === 0) {
    return { ok: false, reason: "send_failed", detail: "No recipients" };
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, reason: "not_configured" };
  }

  const from = process.env.EMAIL_FROM?.trim() || "Artivaa <onboarding@resend.dev>";

  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject: params.subject,
        html: params.html,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let detail = text.slice(0, 400);
      try {
        const j = JSON.parse(text) as { message?: string };
        if (typeof j.message === "string") detail = j.message;
      } catch {
        /* keep */
      }
      console.error("[email-resend] Resend error:", res.status, detail);
      return { ok: false, reason: "send_failed", detail };
    }

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[email-resend]", msg);
    return { ok: false, reason: "send_failed", detail: msg };
  }
}
