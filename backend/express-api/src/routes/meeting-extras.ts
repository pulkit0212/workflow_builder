import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../db/client";
import { config } from "../config";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { plainTextToHtmlEmailBody, sendHtmlToRecipients } from "../lib/gmail-integration-outbound";

export const meetingExtrasRouter = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    "Write a follow-up email after a meeting.",
    "Return plain text only. Do not use markdown fences.",
    "Use this structure:",
    "1. Greeting",
    "2. Brief meeting summary",
    "3. Key points discussed",
    "4. Action items / next steps",
    "5. Professional closing",
    "",
    "Tone requirements:",
    "- Use the requested tone",
    "- Clear and actionable",
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

async function getUserSettingString(userId: string, key: string): Promise<string | null> {
  try {
    const { rows } = await pool.query<{ value: unknown }>(
      "SELECT value FROM user_settings WHERE user_id = $1 AND key = $2 LIMIT 1",
      [userId, key]
    );
    const v = rows[0]?.value;
    if (v === null || v === undefined) return null;
    return typeof v === "string" ? v : String(v);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "42P01") return null; // user_settings not migrated yet
    throw e;
  }
}

function toneLabel(tone: string | null): string {
  const t = String(tone ?? "professional").toLowerCase();
  if (t === "friendly") return "Friendly";
  if (t === "formal") return "Formal";
  if (t === "concise") return "Concise";
  return "Professional";
}

function languageLabel(lang: string | null): string {
  return String(lang ?? "en").toLowerCase() === "hi" ? "Hindi" : "English";
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

    const [tonePref, langPref] = await Promise.all([
      getUserSettingString(userId, "defaultEmailTone"),
      getUserSettingString(userId, "language"),
    ]);

    const promptWithPrefs = [
      prompt,
      "",
      `Requested tone: ${toneLabel(tonePref)}`,
      `Requested language: ${languageLabel(langPref)}`,
      "Write the email in the requested language.",
      ...(toneLabel(tonePref) === "Concise" ? ["Keep it under ~150 words when possible."] : []),
    ].join("\n");

    const followUpEmail = await callGemini(promptWithPrefs);

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

    const subject = `Summary & Next Steps – ${meeting.title}`;
    const html = plainTextToHtmlEmailBody(meeting.follow_up_email);
    const sent = await sendHtmlToRecipients({
      userId,
      recipients,
      subject,
      html,
    });
    if (!sent.ok) {
      return next(new BadRequestError(sent.message));
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
