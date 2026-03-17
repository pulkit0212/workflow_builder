import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { executeMeetingSummarizerRun } from "@/features/tools/meeting-summarizer/server/execute-run";
import { ToolExecutionError } from "@/lib/ai/tool-execution-error";

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

  try {
    const run = await executeMeetingSummarizerRun(body, userId);
    return apiSuccess({
      success: true,
      run
    });
  } catch (error) {
    if (error instanceof ToolExecutionError) {
      return apiError(error.message, error.statusCode, error.details);
    }

    return apiError(error instanceof Error ? error.message : "Unexpected server error.", 500);
  }
}
