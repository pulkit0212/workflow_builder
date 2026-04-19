import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { callAI } from "@/lib/ai/provider";
import { handleUserSafeAIError } from "@/lib/ai/errorHandler";
import { createAiRun } from "@/lib/db/mutations/ai-runs";
import { ensureToolRecord } from "@/lib/db/queries/tools";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { toolRegistry } from "@/lib/ai/tool-registry";

export const runtime = "nodejs";
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

  try {
    const text = await callAI(buildEmailPrompt(parsed.data));
    const cleaned = cleanGeminiJson(text);

    let output: EmailGeneratorOutput;

    try {
      output = JSON.parse(cleaned) as EmailGeneratorOutput;
    } catch {
      console.error(`${logPrefix} JSON parse failed:`, cleaned);
      return apiError("Failed to parse AI response", 500);
    }

    const result = {
      success: true,
      subject: output.subject.trim(),
      body: output.body.replace(/\r\n/g, "\n").trim()
    };

    // Persist to ai_runs (fire-and-forget)
    void (async () => {
      try {
        await ensureDatabaseReady();
        const user = await syncCurrentUserToDatabase(userId);
        const toolRecord = await ensureToolRecord(toolRegistry["email-generator"]);
        await createAiRun({
          userId: user.id,
          toolId: toolRecord.id,
          title: `${parsed.data.emailType} email — ${parsed.data.context.slice(0, 60).trim()}`,
          status: "completed",
          inputJson: parsed.data as Record<string, unknown>,
          outputJson: { subject: result.subject, body: result.body },
          model: "gemini",
          tokensUsed: 0
        });
      } catch { /* non-critical */ }
    })();

    return apiSuccess(result);
  } catch (error) {
    try {
      handleUserSafeAIError(error);
    } catch (safeError) {
      const message = safeError instanceof Error ? safeError.message : "Something went wrong.";
      console.error(`${logPrefix} AI error:`, error instanceof Error ? error.message : error);
      return apiError(message, 500);
    }
  }
}
