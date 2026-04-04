import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { executeToolRun } from "@/lib/ai/execute-tool";
import { ToolExecutionError } from "@/lib/ai/tool-execution-error";
import { checkRateLimit } from "@/lib/rate-limit";

const toolRunRouteLogPrefix = "[api-tool-run]";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ toolSlug: string }> }
) {
  console.info(`${toolRunRouteLogPrefix} request received`);
  const { userId } = await auth();
  const { toolSlug } = await params;
  console.info(`${toolRunRouteLogPrefix} auth resolved`, {
    toolSlug,
    isAuthenticated: Boolean(userId)
  });

  if (!userId) {
    console.warn(`${toolRunRouteLogPrefix} unauthorized request`, { toolSlug });
    return apiError("Unauthorized.", 401);
  }

  const rl = checkRateLimit(`tool:${userId}`, 20, 60_000);
  if (!rl.allowed) {
    return apiError("Too many requests. Please wait before trying again.", 429);
  }

  let body: unknown;

  try {
    body = await request.json();
    console.info(`${toolRunRouteLogPrefix} request body parsed`, {
      toolSlug,
      bodyType: body === null ? "null" : typeof body
    });
  } catch {
    console.error(`${toolRunRouteLogPrefix} request body parse failed`, { toolSlug });
    return apiError("Request body must be valid JSON.", 400);
  }

  try {
    const run = await executeToolRun(toolSlug, body, userId);
    console.info(`${toolRunRouteLogPrefix} tool run completed`, {
      toolSlug,
      runId: run.id
    });
    return apiSuccess({
      success: true,
      run
    });
  } catch (error) {
    if (error instanceof ToolExecutionError) {
      console.error(`${toolRunRouteLogPrefix} tool run failed`, {
        toolSlug,
        message: error.message,
        statusCode: error.statusCode
      });
      return apiError(error.message, error.statusCode, error.details);
    }

    const message = error instanceof Error ? error.message : "Unexpected server error.";
    console.error(`${toolRunRouteLogPrefix} unexpected route error`, {
      toolSlug,
      message
    });
    return apiError(message, 500);
  }
}
