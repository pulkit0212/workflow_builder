/**
 * Central AI provider abstraction.
 * Provider is controlled ONLY via AI_PROVIDER env var ("gemini" | "openai").
 * Automatic fallback to the other provider if primary fails and its key is set.
 */
import "server-only";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getOpenAIClient } from "@/lib/ai/openai";

const GEMINI_MODEL = "gemini-2.5-flash";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

function cleanJson(text: string): string {
  return text.replace(/```json/g, "").replace(/```/g, "").trim();
}

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const result = await model.generateContent(prompt);
  return cleanJson(result.response.text());
}

async function callOpenAI(prompt: string): Promise<string> {
  const client = getOpenAIClient(); // throws if OPENAI_API_KEY missing
  const response = await client.responses.create({
    model: OPENAI_MODEL,
    input: prompt
  });
  const text = response.output_text?.trim() ?? "";
  if (!text) throw new Error("OpenAI returned an empty response.");
  return cleanJson(text);
}

/**
 * Call the configured AI provider with a prompt string.
 * Returns the raw text response (JSON string for structured outputs).
 * Falls back to the other provider if primary fails and fallback key is present.
 */
export async function callAI(prompt: string): Promise<string> {
  const provider = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();

  try {
    if (provider === "openai") {
      return await callOpenAI(prompt);
    }
    return await callGemini(prompt);
  } catch (primaryError) {
    console.error("[AI PRIMARY FAILED]", provider, primaryError instanceof Error ? primaryError.message : primaryError);

    // Attempt fallback
    const fallbackProvider = provider === "openai" ? "gemini" : "openai";
    const fallbackKeyPresent =
      fallbackProvider === "gemini"
        ? Boolean(process.env.GEMINI_API_KEY)
        : Boolean(process.env.OPENAI_API_KEY);

    if (fallbackKeyPresent) {
      try {
        console.warn("[AI FALLBACK] Trying", fallbackProvider);
        if (fallbackProvider === "openai") {
          return await callOpenAI(prompt);
        }
        return await callGemini(prompt);
      } catch (fallbackError) {
        console.error("[AI FALLBACK FAILED]", fallbackProvider, fallbackError instanceof Error ? fallbackError.message : fallbackError);
        throw fallbackError;
      }
    }

    throw primaryError;
  }
}
