import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { callAI } from "@/lib/ai/provider";
import { handleUserSafeAIError } from "@/lib/ai/errorHandler";

export const runtime = "nodejs";

type ExtractOption =
  | "summary"
  | "actionItems"
  | "keyPoints"
  | "decisions"
  | "risks"
  | "rawInsights";

type DocumentAnalyzerOutput = {
  summary: string | null;
  action_items: Array<{
    task: string;
    owner: string;
    due_date: string;
    priority: "High" | "Medium" | "Low";
  }>;
  key_points: string[];
  decisions: string[];
  risks: string[];
  raw_insights: string | null;
};

const defaultExtractOptions: ExtractOption[] = [
  "summary",
  "actionItems",
  "keyPoints",
  "decisions",
  "risks"
];

const logPrefix = "[DocAnalyzer]";

function getExtractOptions(
  rawValue: FormDataEntryValue | string | null | undefined
) {
  if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
    return defaultExtractOptions;
  }

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) && parsed.length > 0
      ? (parsed as ExtractOption[])
      : defaultExtractOptions;
  } catch {
    return defaultExtractOptions;
  }
}

function buildPrompt(documentText: string, extractOptions: ExtractOption[]) {
  return `You are an expert document analyst.

Analyze this document and extract structured information.

${extractOptions.includes("summary") ? "Include a concise 2-4 sentence summary." : ""}
${extractOptions.includes("actionItems") ? "Extract action items with task, owner, due date, and priority." : ""}
${extractOptions.includes("keyPoints") ? "Extract at least 3 specific key points when possible." : ""}
${extractOptions.includes("decisions") ? "Extract decisions that were made." : ""}
${extractOptions.includes("risks") ? "Extract risks, blockers, or concerns." : ""}
${extractOptions.includes("rawInsights") ? "Add extra observations in raw_insights." : ""}

Document content:
${documentText.substring(0, 15000)}

Return ONLY valid JSON:
{
  "summary": "2-4 sentence overview",
  "action_items": [
    {
      "task": "Task",
      "owner": "Person or Unassigned",
      "due_date": "Deadline or Not specified",
      "priority": "High or Medium or Low"
    }
  ],
  "key_points": ["Point 1"],
  "decisions": [],
  "risks": [],
  "raw_insights": null
}`;
}

function normalizeOutput(
  parsed: Partial<DocumentAnalyzerOutput>
): DocumentAnalyzerOutput {
  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : null,
    action_items: Array.isArray(parsed.action_items)
      ? parsed.action_items
          .map((item) => ({
            task: item?.task || "",
            owner: item?.owner || "",
            due_date: item?.due_date || "",
            priority:
              item?.priority === "High" ||
              item?.priority === "Low" ||
              item?.priority === "Medium"
                ? item.priority
                : "Medium"
          }))
          .filter((i) => i.task.trim().length > 0)
      : [],
    key_points: Array.isArray(parsed.key_points)
      ? parsed.key_points.filter((i): i is string => typeof i === "string")
      : [],
    decisions: Array.isArray(parsed.decisions)
      ? parsed.decisions.filter((i): i is string => typeof i === "string")
      : [],
    risks: Array.isArray(parsed.risks)
      ? parsed.risks.filter((i): i is string => typeof i === "string")
      : [],
    raw_insights:
      typeof parsed.raw_insights === "string" ? parsed.raw_insights : null
  };
}

export async function POST(req: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { success: false, message: "Unauthorized." },
      { status: 401 }
    );
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    let documentText = "";
    let extractOptions: ExtractOption[] = defaultExtractOptions;

    // ================= FILE FLOW =================
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      extractOptions = getExtractOptions(formData.get("extractOptions"));

      if (!(file instanceof File)) {
        return NextResponse.json(
          { success: false, message: "No file provided" },
          { status: 400 }
        );
      }

      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json(
          { success: false, message: "Max 10MB allowed" },
          { status: 400 }
        );
      }

      const fileType = file.type;
      const fileName = file.name.toLowerCase();

      if (fileType === "text/plain" || fileName.endsWith(".txt")) {
        documentText = await file.text();
      }

      // DOCX
      else if (
        fileType.includes("wordprocessingml") ||
        fileName.endsWith(".docx")
      ) {
        const mammoth = await import("mammoth");
        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await mammoth.extractRawText({ buffer });
        documentText = result.value;
      }

      // PDF
      else if (fileType === "application/pdf" || fileName.endsWith(".pdf")) {
        try {
          const { PDFParse } = await import("pdf-parse");
          const buffer = Buffer.from(await file.arrayBuffer());
          const parser = new PDFParse({ data: buffer });
          try {
            const textResult = await parser.getText();
            documentText = textResult.text;
          } finally {
            await parser.destroy();
          }
        } catch {
          // fallback Gemini Vision
          const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
          const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
          const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

          const res = await model.generateContent([
            {
              inlineData: { mimeType: "application/pdf", data: base64 }
            },
            { text: "Extract text from PDF" }
          ]);

          documentText = res.response.text();
        }
      }

      // IMAGE
      else if (fileType.startsWith("image/")) {
        const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const res = await model.generateContent([
          { inlineData: { mimeType: fileType, data: base64 } },
          { text: "Extract text from image" }
        ]);

        documentText = res.response.text();
      } else {
        return NextResponse.json(
          { success: false, message: "Unsupported file" },
          { status: 400 }
        );
      }
    }

    // ================= TEXT FLOW =================
    else {
      const body = await req.json();
      documentText = body.text || "";
      extractOptions = body.extractOptions || defaultExtractOptions;
    }

    if (documentText.trim().length < 10) {
      return NextResponse.json(
        { success: false, message: "Invalid content" },
        { status: 400 }
      );
    }

    // ================= AI CALL =================
    let aiResponse: string;

    try {
      aiResponse = await callAI(
        buildPrompt(documentText, extractOptions)
      );
    } catch (err) {
      try {
        handleUserSafeAIError(err);
      } catch (safeError) {
        return NextResponse.json(
          {
            success: false,
            message:
              safeError instanceof Error
                ? safeError.message
                : "AI error"
          },
          { status: 500 }
        );
      }
      return;
    }

    const cleaned = aiResponse.replace(/```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { success: false, message: "Parse failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      result: normalizeOutput(parsed)
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}