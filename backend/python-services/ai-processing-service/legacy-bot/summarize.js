const path = require("node:path");

require("dotenv").config({ path: path.join(process.cwd(), ".env.local") });

const GEMINI_MODEL = "gemini-2.5-flash";

function buildFallbackSummary(message) {
  return {
    summary: message,
    key_decisions: [],
    action_items: [],
    risks_and_blockers: [],
    key_topics: [],
    meeting_sentiment: "Neutral",
    follow_up_meeting_needed: false,
  };
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizePriority(priority) {
  const normalized = normalizeText(priority).toLowerCase();

  if (normalized === "high") {
    return "High";
  }

  if (normalized === "low") {
    return "Low";
  }

  return "Medium";
}

function normalizeSummaryPayload(payload) {
  return {
    summary: normalizeText(payload.summary),
    key_decisions: Array.isArray(payload.key_decisions)
      ? payload.key_decisions.map((item) => normalizeText(item)).filter(Boolean)
      : [],
    action_items: Array.isArray(payload.action_items)
      ? payload.action_items
          .map((item) => ({
            task: normalizeText(item.task),
            owner: normalizeText(item.owner) || "Unassigned",
            due_date: normalizeText(item.due_date) || "Not specified",
            priority: normalizePriority(item.priority),
          }))
          .filter((item) => item.task)
      : [],
    risks_and_blockers: Array.isArray(payload.risks_and_blockers)
      ? payload.risks_and_blockers.map((item) => normalizeText(item)).filter(Boolean)
      : [],
    key_topics: Array.isArray(payload.key_topics)
      ? payload.key_topics.map((item) => normalizeText(item)).filter(Boolean)
      : [],
    meeting_sentiment: ["Positive", "Neutral", "Mixed", "Negative"].includes(payload.meeting_sentiment)
      ? payload.meeting_sentiment
      : "Neutral",
    follow_up_meeting_needed: Boolean(payload.follow_up_meeting_needed),
    participants: Array.isArray(payload.participants)
      ? payload.participants
          .map((p) => ({
            name: normalizeText(p.name) || "Participant",
            talkTimePercent: typeof p.talkTimePercent === "number" ? p.talkTimePercent : 0,
          }))
          .filter((p) => p.name)
      : [],
  };
}

function getPrompt(transcript) {
  return `You are Artivaa, a professional meeting intelligence assistant.

Analyze this meeting transcript and extract structured information.
Be specific and actionable. Never be vague.
Focus on actionable tasks only. Skip vague statements like "we should think about X".
Only include concrete tasks with a clear action verb.

Transcript:
${transcript}

Return ONLY valid JSON. No markdown. No explanation. No backticks.
Use this exact format:

{
  "summary": "2-4 sentences covering what the meeting was about, main topics discussed, and outcome",
  "key_decisions": [
    "Specific decision made in the meeting"
  ],
  "action_items": [
    {
      "task": "Specific actionable task starting with a verb",
      "owner": "Extract owner using these rules in order: 1) Explicit assignment: 'John will do X' → John 2) Implicit: 'John, can you do X' → John 3) Self-assignment: 'I will do X' → use speaker name if known 4) Group: 'We will do X' → Team 5) Unclear → Unassigned. Always use first name only if full name mentioned.",
      "due_date": "Extract deadline: 1) Explicit: 'by Friday' → Friday 2) Relative: 'next week' → Next week 3) Urgent: 'ASAP' or 'urgent' → ASAP 4) None mentioned → Not specified",
      "priority": "Infer from language: 1) 'urgent', 'ASAP', 'critical', 'blocking' → High 2) 'soon', 'this week', 'important' → Medium 3) 'eventually', 'low priority', 'nice to have' → Low 4) Default → Medium"
    }
  ],
  "risks_and_blockers": [
    "Any risk or blocker mentioned"
  ],
  "key_topics": ["topic1", "topic2", "topic3"],
  "meeting_sentiment": "Positive / Neutral / Mixed / Negative",
  "follow_up_meeting_needed": true,
  "participants": [
    {
      "name": "First name or full name as mentioned in conversation. If unclear use Participant 1, Participant 2 etc.",
      "talkTimePercent": 50
    }
  ]
}

Rules:
- action_items must be specific tasks with clear action verbs, not vague notes
- owner must be a real name from the transcript if mentioned
- If nothing was decided, key_decisions should be empty array []
- If no blockers, risks_and_blockers should be empty array []
- meeting_sentiment based on tone of conversation
- follow_up_meeting_needed: true if someone said "let's meet again" or similar
- participants: only include people who SPOKE (not just mentioned). talkTimePercent values should sum to approximately 100`;
}

function extractText(payload) {
  return (payload.candidates || [])
    .flatMap((candidate) => (candidate.content && candidate.content.parts) || [])
    .map((part) => part.text || "")
    .join("")
    .trim();
}

async function summarizeMeeting(transcript) {
  if (!transcript || transcript.trim().length < 50) {
    return buildFallbackSummary("Not enough content to summarize.");
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error("[Summary] GEMINI_API_KEY is not set");
    return buildFallbackSummary("Summary unavailable - Gemini API key not configured.");
  }

  try {
    const prompt = getPrompt(transcript);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(raw || "Gemini request failed");
    }

    const payload = JSON.parse(await response.text());
    const rawText = extractText(payload);

    if (!rawText) {
      throw new Error("Gemini returned an empty response.");
    }

    const structured = JSON.parse(rawText);
    return normalizeSummaryPayload(structured);
  } catch (error) {
    console.error("[Summary] Gemini API error:", error instanceof Error ? error.message : error);
    return buildFallbackSummary(
      `Summary generation failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

module.exports = { summarizeMeeting, summarizeWithRetry };

async function summarizeWithRetry(transcript, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Summary] Attempt ${attempt}/${maxRetries}`);
      const result = await summarizeMeeting(transcript);
      if (typeof result === "object" && result.summary) {
        return result;
      }
      throw new Error("Invalid summary response");
    } catch (e) {
      console.error(`[Summary] Attempt ${attempt} failed:`, e instanceof Error ? e.message : e);
      if (attempt === maxRetries) {
        throw new Error(`Summary failed after ${maxRetries} attempts: ${e instanceof Error ? e.message : e}`);
      }
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`[Summary] Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
