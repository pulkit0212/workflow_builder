import { z } from "zod";

function stripCodeFences(value: string) {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function extractJsonObject(value: string) {
  const cleaned = stripCodeFences(value);
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Model did not return a JSON object.");
  }

  return cleaned.slice(firstBrace, lastBrace + 1);
}

export function parseJsonResponse<T>(rawText: string, schema: z.ZodType<T>) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(extractJsonObject(rawText));
  } catch {
    throw new Error("Model returned invalid JSON.");
  }

  const result = schema.safeParse(parsed);

  if (!result.success) {
    throw new Error("Model returned JSON in an unexpected shape.");
  }

  return result.data;
}
