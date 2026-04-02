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
      // Never expose internal provider details (API keys, provider names, raw API errors)
      const isQuotaOrRate =
        error.statusCode === 429 ||
        (typeof error.details === "object" &&
          error.details !== null &&
          "status" in error.details &&
          (error.details as { status?: number }).status === 429);

      const safeMessage = isQuotaOrRate
        ? "AI service is temporarily unavailable. Please try again in a moment."
        : error.statusCode === 400
          ? error.message  // validation errors are safe to show
          : "Something went wrong while generating the summary. Please try again.";

      // Only pass details for validation errors (400), never for provider errors
      const safeDetails = error.statusCode === 400 ? error.details : undefined;

      return apiError(safeMessage, error.statusCode >= 500 ? 500 : error.statusCode, safeDetails);
    }

    return apiError("Something went wrong. Please try again.", 500);
  }
}
