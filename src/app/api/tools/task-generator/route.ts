import { auth } from "@clerk/nextjs/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-responses";

export const runtime = "nodejs";
const GEMINI_MODEL = "gemini-2.5-flash";
const logPrefix = "[Task Generator]";

const taskGeneratorInputSchema = z.object({
  input: z.string().trim().min(1, "Input is required."),
  mode: z.enum(["raw", "voice", "meeting"]),
  teamMembers: z.string().trim().optional().default(""),
  dateContext: z.string().trim().optional().default(""),
  outputFormat: z.enum(["detailed", "simple", "jira"]),
  autoPriority: z.boolean().default(true)
});

const taskSchema = z.object({
  task: z.string().trim().min(1),
  owner: z.string().trim().default("Unassigned"),
  due_date: z.string().trim().default("Not specified"),
  priority: z.enum(["High", "Medium", "Low"]).default("Medium"),
  type: z.string().trim().default("Task"),
  notes: z.string().trim().default("")
});

const taskGeneratorOutputSchema = z.object({
  tasks: z.array(taskSchema).min(1),
  summary: z.string().trim().min(1),
  total_tasks: z.number().int().nonnegative(),
  unextractable: z.string().trim().optional().default("")
});

function buildTaskGeneratorPrompt(input: z.infer<typeof taskGeneratorInputSchema>) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  return `You are an expert project manager and task extraction AI.

Extract ALL tasks, action items, and to-dos from this input text.
Convert vague or messy language into clear, actionable tasks.

Input text:
${input.input}

Context:
- Today's date: ${input.dateContext || today}
- Team members available: ${input.teamMembers || "Not specified — use names mentioned in text"}
- Mode: ${input.mode === "voice" ? "Voice transcript — ignore filler words" : input.mode === "meeting" ? "Meeting transcript or notes" : "Written notes"}
- Format: ${input.outputFormat}
- Priority inference: ${input.autoPriority ? "Enabled - infer urgency from language used" : "Disabled - do not infer urgency unless the text explicitly states priority; default to Medium"}

Instructions:
1. Extract EVERY task mentioned, even implied ones
2. Make each task a clear ACTION starting with a verb
   BAD: "contract stuff"
   GOOD: "Review and sign the contract with Acme Corp"
3. Assign owner based on:
   - Names explicitly mentioned ("John will do X" -> owner: John)
   - Context clues ("send it to me" -> owner: depends on context)
   - If unclear -> owner: "Unassigned"
4. Extract due dates:
   - Convert relative dates using today: ${today}
   - "Friday" -> actual date
   - "asap" or "urgent" -> mark as High priority, due: "ASAP"
   - If no date mentioned -> "Not specified"
5. Infer priority from language:
   - "asap", "urgent", "critical", "immediately", "blocking" -> High
   - "soon", "this week", "next" -> Medium
   - "eventually", "when possible", "low priority" -> Low
   - Default if unclear -> Medium
6. For Jira-style: add type field (Task/Bug/Story/Epic)
7. If priority inference is disabled, keep priority at Medium unless the input explicitly names a priority or urgency

Return ONLY valid JSON, no markdown, no backticks:
{
  "tasks": [
    {
      "task": "Clear actionable task description starting with verb",
      "owner": "Person name or Unassigned",
      "due_date": "Specific date or ASAP or Not specified",
      "priority": "High or Medium or Low",
      "type": "Task or Bug or Story",
      "notes": "Any additional context (optional, can be empty string)"
    }
  ],
  "summary": "One line: what this set of tasks is about",
  "total_tasks": 5,
  "unextractable": "Any text that seemed important but wasn't a task (optional)"
}

Rules:
- Minimum 1 task, even from very short input
- Never skip tasks — extract everything
- Tasks must start with action verbs: Send, Review, Create, Fix, Call, etc.
- If input is completely unrelated to tasks, still try to extract implied actions`;
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

  const parsed = taskGeneratorInputSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("Invalid task generator input.", 400, parsed.error.flatten());
  }

  const model = getGeminiModel();

  if (!model) {
    return apiError("GEMINI_API_KEY not set", 500);
  }

  try {
    const result = await model.generateContent(buildTaskGeneratorPrompt(parsed.data));
    const text = result.response.text();

    console.log(`${logPrefix} Raw Gemini response:`, text.substring(0, 200));

    const cleaned = cleanGeminiJson(text);

    let parsedOutput: unknown;

    try {
      parsedOutput = JSON.parse(cleaned);
    } catch {
      console.error(`${logPrefix} JSON parse failed:`, cleaned);
      return apiError("Failed to parse AI response", 500);
    }

    const normalized = taskGeneratorOutputSchema.parse(parsedOutput);

    return apiSuccess({
      success: true,
      tasks: normalized.tasks,
      summary: normalized.summary,
      total_tasks: normalized.total_tasks || normalized.tasks.length,
      unextractable: normalized.unextractable || ""
    });
  } catch (geminiError) {
    const message = geminiError instanceof Error ? geminiError.message : "Gemini request failed";
    console.error(`${logPrefix} Gemini error:`, message);
    return apiError(message || "Gemini request failed", 500);
  }
}
