import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";

type ExtractOption = "summary" | "actionItems" | "keyPoints" | "decisions" | "risks" | "rawInsights";

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

const defaultExtractOptions: ExtractOption[] = ["summary", "actionItems", "keyPoints", "decisions", "risks"];
const logPrefix = "[DocAnalyzer]";

function getExtractOptions(rawValue: FormDataEntryValue | string | null | undefined) {
  if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
    return defaultExtractOptions;
  }

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as ExtractOption[]) : defaultExtractOptions;
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

Return ONLY valid JSON, no markdown, no backticks:
{
  "summary": "2-4 sentence overview of the document",
  "action_items": [
    {
      "task": "Specific task or action item",
      "owner": "Person responsible or Unassigned",
      "due_date": "Deadline or Not specified",
      "priority": "High or Medium or Low"
    }
  ],
  "key_points": ["Important point 1", "Important point 2", "Important point 3"],
  "decisions": ["Decision made 1", "Decision made 2"],
  "risks": ["Risk or concern 1"],
  "raw_insights": "Extra observations or null"
}

Rules:
- If no action items found: action_items = []
- If no decisions found: decisions = []
- If no risks found: risks = []
- If raw insights are not needed: raw_insights = null
- Be specific, not vague`;
}

function normalizeOutput(parsed: Partial<DocumentAnalyzerOutput>): DocumentAnalyzerOutput {
  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : null,
    action_items: Array.isArray(parsed.action_items)
      ? parsed.action_items.map((item) => ({
          task: typeof item?.task === "string" ? item.task : "",
          owner: typeof item?.owner === "string" ? item.owner : "",
          due_date: typeof item?.due_date === "string" ? item.due_date : "",
          priority:
            item?.priority === "High" || item?.priority === "Low" || item?.priority === "Medium"
              ? item.priority
              : "Medium"
        })).filter((item) => item.task.trim().length > 0)
      : [],
    key_points: Array.isArray(parsed.key_points) ? parsed.key_points.filter((item): item is string => typeof item === "string") : [],
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions.filter((item): item is string => typeof item === "string") : [],
    risks: Array.isArray(parsed.risks) ? parsed.risks.filter((item): item is string => typeof item === "string") : [],
    raw_insights: typeof parsed.raw_insights === "string" ? parsed.raw_insights : null
  };
}

export async function POST(req: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }

  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          message: "GEMINI_API_KEY not configured"
        },
        { status: 500 }
      );
    }

    const contentType = req.headers.get("content-type") || "";
    let documentText = "";
    let extractOptions: ExtractOption[] = defaultExtractOptions;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      extractOptions = getExtractOptions(formData.get("extractOptions"));

      if (!(file instanceof File)) {
        return NextResponse.json(
          {
            success: false,
            message: "No file provided"
          },
          { status: 400 }
        );
      }

      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json(
          {
            success: false,
            message: "Files must be 10MB or smaller."
          },
          { status: 400 }
        );
      }

      const fileType = file.type;
      const fileName = file.name.toLowerCase();

      console.log(logPrefix, "File:", fileName, "Type:", fileType);

      if (fileType === "text/plain" || fileName.endsWith(".txt")) {
        documentText = await file.text();
      } else if (
        fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        fileName.endsWith(".docx")
      ) {
        const mammoth = await import("mammoth");
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const result = await mammoth.extractRawText({ buffer });
        documentText = result.value;
        console.log(logPrefix, "DOCX extracted, length:", documentText.length);
      } else if (fileType === "application/pdf" || fileName.endsWith(".pdf")) {
        try {
          const pdfParse = await import("pdf-parse");
          const arrayBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const pdfData = await pdfParse.default(buffer);
          documentText = pdfData.text;
          console.log(logPrefix, "PDF extracted, length:", documentText.length);
        } catch (pdfError) {
          console.log(logPrefix, "PDF parse failed, using Gemini Vision", pdfError);
          const arrayBuffer = await file.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString("base64");

          const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
          const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

          const result = await model.generateContent([
            {
              inlineData: {
                mimeType: "application/pdf",
                data: base64
              }
            },
            { text: "Extract all text content from this PDF document." }
          ]);
          documentText = result.response.text();
        }
      } else if (
        fileType.startsWith("image/") ||
        fileName.endsWith(".png") ||
        fileName.endsWith(".jpg") ||
        fileName.endsWith(".jpeg")
      ) {
        const arrayBuffer = await file.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const mimeType = fileType || "image/jpeg";

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const result = await model.generateContent([
          {
            inlineData: { mimeType, data: base64 }
          },
          { text: "Extract all text and content from this image." }
        ]);
        documentText = result.response.text();
      } else {
        return NextResponse.json(
          {
            success: false,
            message: `Unsupported file type: ${fileType}. Please upload PDF, DOCX, TXT, PNG, or JPG.`
          },
          { status: 400 }
        );
      }
    } else {
      const body = (await req.json()) as {
        text?: string;
        extractOptions?: ExtractOption[];
      };
      documentText = body.text || "";
      extractOptions = Array.isArray(body.extractOptions) && body.extractOptions.length > 0
        ? body.extractOptions
        : defaultExtractOptions;
    }

    if (!documentText || documentText.trim().length < 10) {
      return NextResponse.json(
        {
          success: false,
          message: "Could not extract text from document. Please try a different file."
        },
        { status: 400 }
      );
    }

    console.log(logPrefix, "Analyzing text, length:", documentText.length);

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(buildPrompt(documentText, extractOptions));
    const text = result.response.text();
    const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();

    let parsed: Partial<DocumentAnalyzerOutput>;
    try {
      parsed = JSON.parse(cleaned) as Partial<DocumentAnalyzerOutput>;
    } catch {
      console.error(logPrefix, "JSON parse failed:", cleaned.substring(0, 200));
      return NextResponse.json(
        {
          success: false,
          message: "Failed to parse AI response. Please try again."
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      result: normalizeOutput(parsed)
    });
  } catch (error: any) {
    console.error(logPrefix, "Error:", error?.message || error);
    return NextResponse.json(
      {
        success: false,
        message: error?.message || "Document analysis failed"
      },
      { status: 500 }
    );
  }
}
