import { auth } from "@clerk/nextjs/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-responses";

export const runtime = "nodejs";
const GEMINI_MODEL = "gemini-2.5-flash";
const logPrefix = "[Email Generator]";

const emailGeneratorInputSchema = z.object({
  context: z.string().trim().min(1, "Meeting context is required."),
  emailType: z.string().trim().min(1),
  tone: z.string().trim().min(1),
  recipients: z.string().trim().optional().default("")
});

type EmailGeneratorOutput = {
  subject: string;
  body: string;
};

function buildEmailPrompt(input: z.infer<typeof emailGeneratorInputSchema>) {
  return `You are a professional email writer.

Generate a ${input.emailType} email based on this meeting context:
${input.context}

${input.recipients ? `Recipients/audience: ${input.recipients}` : ""}

Tone: ${input.tone}

Email type guidelines:
- Follow-up: Thank attendees, recap key points, confirm next steps
- Action Items: List all tasks, owners, deadlines clearly
- Summary Update: Brief overview for stakeholders who missed meeting
- Thank You: Appreciate time, highlight value of discussion
- Next Steps: Focus only on what happens next, clear and actionable
- Custom: Write a comprehensive professional email

Return ONLY valid JSON, no markdown, no backticks:
{
  "subject": "Email subject line here",
  "body": "Full email body here with proper line breaks using \\n"
}

Rules:
- Subject should be specific and professional
- Body should have proper greeting, content, and sign-off
- Use [Your Name] as placeholder for sender
- Keep it concise but complete
- ${input.tone === "Concise" ? "Keep under 150 words" : ""}
- ${input.tone === "Friendly" ? "Use warm, conversational language" : ""}
- ${input.tone === "Formal" ? "Use formal business language" : ""}`;
}

function getGeminiModel() {
  if (!process.env.GEMINI_API_KEY) {
    console.error(`${logPrefix} GEMINI_API_KEY is not set`);
    return null;
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI.getGenerativeModel({ model: GEMINI_MODEL });
}

function cleanGeminiJson(text: string) {
  return text.replace(/```json/g, "").replace(/```/g, "").trim();
}

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", 400);
  }

  const parsed = emailGeneratorInputSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("Invalid email generator input.", 400, parsed.error.flatten());
  }

  const model = getGeminiModel();

  if (!model) {
    return apiError("GEMINI_API_KEY not set", 500);
  }

  try {
    const result = await model.generateContent(buildEmailPrompt(parsed.data));
    const text = result.response.text();

    console.log(`${logPrefix} Raw Gemini response:`, text.substring(0, 200));

    const cleaned = cleanGeminiJson(text);

    let output: EmailGeneratorOutput;

    try {
      output = JSON.parse(cleaned) as EmailGeneratorOutput;
    } catch {
      console.error(`${logPrefix} JSON parse failed:`, cleaned);
      return apiError("Failed to parse AI response", 500);
    }

    return apiSuccess({
      success: true,
      subject: output.subject.trim(),
      body: output.body.replace(/\r\n/g, "\n").trim()
    });
  } catch (geminiError) {
    const message = geminiError instanceof Error ? geminiError.message : "Gemini request failed";
    console.error(`${logPrefix} Gemini error:`, message);
    return apiError(message || "Gemini request failed", 500);
  }
}
