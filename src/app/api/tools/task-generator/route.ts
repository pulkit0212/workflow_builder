import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { generateGeminiJson } from "@/lib/ai/gemini-client";

export const runtime = "nodejs";

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

  try {
    const output = await generateGeminiJson<z.infer<typeof taskGeneratorOutputSchema>>({
      model: "gemini-2.0-flash",
      prompt: buildTaskGeneratorPrompt(parsed.data)
    });

    const normalized = taskGeneratorOutputSchema.parse(output);

    return apiSuccess({
      success: true,
      tasks: normalized.tasks,
      summary: normalized.summary,
      total_tasks: normalized.total_tasks || normalized.tasks.length,
      unextractable: normalized.unextractable || ""
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate tasks.";
    const statusCode = typeof error === "object" && error && "statusCode" in error ? Number((error as { statusCode?: number }).statusCode) || 500 : 500;
    return apiError(message, statusCode);
  }
}
