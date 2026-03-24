require("dotenv").config({ path: require("node:path").join(process.cwd(), ".env.local") });

console.log("[Summary] Gemini key loaded:", !!process.env.GEMINI_API_KEY);

const { summarizeMeetingWithGemini } = require("../src/lib/ai/providers/gemini-shared.js");

async function summarizeMeeting(transcript) {
  if (!transcript || transcript.trim().length < 50) {
    return {
      summary: "Not enough content to summarize.",
      action_items: [],
      decisions: [],
      key_topics: [],
    };
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error("[Summary] GEMINI_API_KEY is not set");
    return {
      summary: "Summary unavailable - Gemini API key not configured.",
      action_items: [],
      decisions: [],
      key_topics: [],
    };
  }

  try {
    const result = await summarizeMeetingWithGemini(transcript);
    return {
      summary: result.output.summary,
      action_items: result.output.action_items.map((item) =>
        item.owner ? `${item.owner}: ${item.task}` : item.task
      ),
      decisions: result.output.key_points,
      key_topics: [],
    };
  } catch (error) {
    console.error("[Summary] Gemini API error:", error.message);
    return {
      summary: `Summary generation failed: ${error.message}`,
      action_items: [],
      decisions: [],
      key_topics: [],
    };
  }
}

module.exports = { summarizeMeeting };
