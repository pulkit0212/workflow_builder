import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { generateGeminiJson, toBase64 } from "@/lib/ai/gemini-client";

export const runtime = "nodejs";

const extractOptionsSchema = z.array(
  z.enum(["summary", "actionItems", "keyPoints", "decisions", "risks", "rawInsights"])
);

const documentAnalyzerTextInputSchema = z.object({
  text: z.string().trim().min(1, "Document text is required."),
  extractOptions: extractOptionsSchema.default(["summary", "actionItems", "keyPoints", "decisions", "risks"])
});

const documentAnalyzerActionItemSchema = z.object({
  task: z.string().trim().min(1),
  owner: z.string().trim().default(""),
  due_date: z.string().trim().default(""),
  priority: z.enum(["High", "Medium", "Low"]).default("Medium")
});

const documentAnalyzerOutputSchema = z.object({
  summary: z.string().nullable().default(null),
  action_items: z.array(documentAnalyzerActionItemSchema).default([]),
  key_points: z.array(z.string().trim().min(1)).default([]),
  decisions: z.array(z.string().trim().min(1)).default([]),
  risks: z.array(z.string().trim().min(1)).default([]),
  raw_insights: z.string().nullable().default(null)
});

type DocumentAnalyzerOutput = z.infer<typeof documentAnalyzerOutputSchema>;

function parseExtractOptions(rawValue: FormDataEntryValue | null) {
  if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
    return ["summary", "actionItems", "keyPoints", "decisions", "risks"] as const;
  }

  try {
    const parsed = JSON.parse(rawValue);
    return extractOptionsSchema.parse(Array.isArray(parsed) ? parsed : []);
  } catch {
    return extractOptionsSchema.parse(
      rawValue
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    );
  }
}

function buildDocumentPrompt(documentText: string, extractOptions: Array<z.infer<typeof extractOptionsSchema>[number]>) {
  return `You are an expert document analyst.

Analyze this document and extract structured information.

${extractOptions.includes("summary") ? "Extract a comprehensive summary." : ""}
${extractOptions.includes("actionItems") ? "Extract all action items with owner and deadline." : ""}
${extractOptions.includes("keyPoints") ? "Extract the most important key points." : ""}
${extractOptions.includes("decisions") ? "Extract all decisions that were made." : ""}
${extractOptions.includes("risks") ? "Identify any risks, concerns, or blockers." : ""}
${extractOptions.includes("rawInsights") ? "Provide additional insights and observations." : ""}

Document content:
${documentText}

Return ONLY valid JSON, no markdown, no backticks:
{
  "summary": "Full summary here or null",
  "action_items": [
    { "task": "...", "owner": "...", "due_date": "...", "priority": "High/Medium/Low" }
  ],
  "key_points": ["point 1", "point 2"],
  "decisions": ["decision 1", "decision 2"],
  "risks": ["risk 1", "risk 2"],
  "raw_insights": "insights text or null"
}`;
}

function isTextLikeFile(file: File) {
  return [
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/json",
    "application/xml",
    "text/xml"
  ].includes(file.type);
}

function buildInlineDataPart(file: File, buffer: ArrayBuffer) {
  return {
    inlineData: {
      mimeType: file.type || "application/octet-stream",
      data: toBase64(buffer)
    }
  };
}

async function analyzeTextDocument(text: string, extractOptions: Array<z.infer<typeof extractOptionsSchema>[number]>) {
  return generateGeminiJson<DocumentAnalyzerOutput>({
    model: "gemini-2.0-flash",
    prompt: buildDocumentPrompt(text, extractOptions)
  });
}

async function analyzeBinaryDocument(file: File, extractOptions: Array<z.infer<typeof extractOptionsSchema>[number]>) {
  const buffer = await file.arrayBuffer();

  return generateGeminiJson<DocumentAnalyzerOutput>({
    model: "gemini-2.0-flash",
    prompt: buildDocumentPrompt(`[Attached file: ${file.name}]`, extractOptions),
    parts: [buildInlineDataPart(file, buffer)]
  });
}

function normalizeOutput(output: DocumentAnalyzerOutput) {
  return documentAnalyzerOutputSchema.parse({
    summary: output.summary ?? null,
    action_items: output.action_items ?? [],
    key_points: output.key_points ?? [],
    decisions: output.decisions ?? [],
    risks: output.risks ?? [],
    raw_insights: output.raw_insights ?? null
  });
}

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");

      if (!(file instanceof File) || file.size === 0) {
        return apiError("A file is required.", 400);
      }

      if (file.size > 10 * 1024 * 1024) {
        return apiError("Files must be 10MB or smaller.", 400);
      }

      const extractOptions = parseExtractOptions(formData.get("extractOptions"));

      const output = isTextLikeFile(file)
        ? await analyzeTextDocument(await file.text(), extractOptions)
        : await analyzeBinaryDocument(file, extractOptions);

      return apiSuccess({
        success: true,
        result: normalizeOutput(output)
      });
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return apiError("Request body must be valid JSON.", 400);
    }

    const parsed = documentAnalyzerTextInputSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("Invalid document analyzer input.", 400, parsed.error.flatten());
    }

    const output = await analyzeTextDocument(parsed.data.text, parsed.data.extractOptions);

    return apiSuccess({
      success: true,
      result: normalizeOutput(output)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to analyze document.";
    const statusCode = typeof error === "object" && error && "statusCode" in error ? Number((error as { statusCode?: number }).statusCode) || 500 : 500;
    return apiError(message, statusCode);
  }
}
