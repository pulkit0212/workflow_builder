import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../db/client";
import { config } from "../config";
import { BadRequestError, NotFoundError } from "../lib/errors";

export const meetingExtrasRouter = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildRawGmailMessage(recipients: string[], subject: string, body: string) {
  return [
    "MIME-Version: 1.0",
    `To: ${recipients.join(", ")}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
  ].join("\r\n");
}

function buildFollowUpPrompt(title: string, summary: string, keyPoints: unknown[], actionItems: unknown[]) {
  const keyPointLines = Array.isArray(keyPoints)
    ? keyPoints.map((p) => `- ${p}`).join("\n")
    : "";

  const actionItemLines = Array.isArray(actionItems) && actionItems.length > 0
    ? actionItems
        .map((item: unknown) => {
          if (typeof item === "object" && item !== null) {
            const i = item as Record<string, unknown>;
            const meta = [
              i.owner ? `Owner: ${i.owner}` : null,
              i.deadline ? `Deadline: ${i.deadline}` : null,
            ]
              .filter(Boolean)
              .join(", ");
            return meta ? `- ${i.task} (${meta})` : `- ${i.task}`;
          }
          return `- ${item}`;
        })
        .join("\n")
    : "- No explicit action items were captured.";

  return [
    "Write a professional, concise follow-up email after a meeting.",
    "Return plain text only. Do not use markdown fences.",
    "Use this structure:",
    "1. Greeting",
    "2. Brief meeting summary",
    "3. Key points discussed",
    "4. Action items / next steps",
    "5. Professional closing",
    "",
    "Tone requirements:",
    "- Professional and clear",
    "- Concise but useful",
    "- Suitable to send directly after light editing",
    "",
    `Meeting title: ${title}`,
    "",
    "Summary:",
    summary,
    "",
    "Key points:",
    keyPointLines,
    "",
    "Action items:",
    actionItemLines,
    "",
    "Write the final email now.",
  ].join("\n");
}

async function callGemini(prompt: string): Promise<string> {
  const apiKey = config.geminiApiKey;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to call Gemini API.");
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = payload.candidates
    ?.flatMap((c) => c.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

// ─── POST /api/meeting/followup ───────────────────────────────────────────────

meetingExtrasRouter.post("/followup", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;
    const { meetingId } = req.body as { meetingId?: string };

    if (!meetingId) {
      return next(new BadRequestError("meetingId is required."));
    }

    const result = await pool.query(
      `SELECT id, user_id, title, summary, key_points, action_items
       FROM meeting_sessions
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [meetingId, userId]
    );

    const meeting = result.rows[0] ?? null;
    if (!meeting) {
      return next(new NotFoundError("Meeting not found."));
    }

    if (!meeting.summary || !Array.isArray(meeting.key_points)) {
      return next(new BadRequestError("Generate the meeting summary before creating a follow-up email."));
    }

    const prompt = buildFollowUpPrompt(
      meeting.title,
      meeting.summary,
      meeting.key_points,
      meeting.action_items ?? []
    );

    const followUpEmail = await callGemini(prompt);

    await pool.query(
      `UPDATE meeting_sessions SET follow_up_email = $1, updated_at = NOW() WHERE id = $2`,
      [followUpEmail, meeting.id]
    );

    res.json({ success: true, followUpEmail });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/meeting/send-email ─────────────────────────────────────────────

meetingExtrasRouter.post("/send-email", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;
    const { meetingId, recipients } = req.body as { meetingId?: string; recipients?: string[] };

    if (!meetingId) {
      return next(new BadRequestError("meetingId is required."));
    }
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return next(new BadRequestError("recipients must be a non-empty array."));
    }

    const meetingResult = await pool.query(
      `SELECT id, user_id, title, follow_up_email
       FROM meeting_sessions
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [meetingId, userId]
    );

    const meeting = meetingResult.rows[0] ?? null;
    if (!meeting) {
      return next(new NotFoundError("Meeting not found."));
    }

    if (!meeting.follow_up_email?.trim()) {
      return next(new BadRequestError("Generate a follow-up email before sending."));
    }

    const integrationResult = await pool.query(
      `SELECT access_token FROM user_integrations
       WHERE user_id = $1 AND provider = 'google'
       LIMIT 1`,
      [userId]
    );

    const integration = integrationResult.rows[0] ?? null;
    if (!integration?.access_token) {
      return next(new BadRequestError("Connect Google with Gmail access before sending email."));
    }

    const subject = `Summary & Next Steps – ${meeting.title}`;
    const raw = toBase64Url(buildRawGmailMessage(recipients, subject, meeting.follow_up_email));

    const gmailResponse = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      }
    );

    if (!gmailResponse.ok) {
      if (gmailResponse.status === 401 || gmailResponse.status === 403) {
        return next(new BadRequestError("Reconnect Google to grant Gmail sending access, then try again."));
      }
      return next(new Error("Failed to send the email with Gmail."));
    }

    await pool.query(
      `UPDATE meeting_sessions SET email_sent = true, email_sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [meeting.id]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
