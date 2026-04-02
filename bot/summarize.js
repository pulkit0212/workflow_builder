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
  };
}

function getPrompt(transcript) {
  return `You are Artivaa, a professional meeting intelligence assistant.

Analyze this meeting transcript and extract structured information.
Be specific and actionable. Never be vague.

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
      "task": "Specific task to be done",
      "owner": "Person's name or 'Unassigned'",
      "due_date": "Mentioned deadline or 'Not specified'",
      "priority": "High / Medium / Low"
    }
  ],
  "risks_and_blockers": [
    "Any risk or blocker mentioned"
  ],
  "key_topics": ["topic1", "topic2", "topic3"],
  "meeting_sentiment": "Positive / Neutral / Mixed / Negative",
  "follow_up_meeting_needed": true
}

Rules:
- action_items must be specific tasks, not vague notes
- owner must be a real name from the transcript if mentioned
- If nothing was decided, key_decisions should be empty array []
- If no blockers, risks_and_blockers should be empty array []
- meeting_sentiment based on tone of conversation
- follow_up_meeting_needed: true if someone said "let's meet again" or similar`;
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

module.exports = { summarizeMeeting };
