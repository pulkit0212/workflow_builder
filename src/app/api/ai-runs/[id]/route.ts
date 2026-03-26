import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { getRunDetailForUser } from "@/lib/ai/execute-tool";
import { ToolExecutionError } from "@/lib/ai/tool-execution-error";
import { canUseHistory } from "@/lib/subscription";
import { getUserSubscription } from "@/lib/subscription.server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  const { id } = await params;

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  try {
    const subscription = await getUserSubscription(userId);

    if (!canUseHistory(subscription.plan)) {
      return apiError("Meeting history requires Pro or Elite plan.", 403, {
        error: "upgrade_required",
        currentPlan: subscription.plan
      });
    }

    const run = await getRunDetailForUser(id, userId);

    if (!run) {
      return apiError("Run not found.", 404);
    }

    return apiSuccess({
      success: true,
      run: {
        id: run.id,
        title: run.title,
        status: run.status,
        inputJson: run.inputJson,
        outputJson: run.outputJson,
        model: run.model,
        tokensUsed: run.tokensUsed,
        createdAt: run.createdAt.toISOString(),
        updatedAt: run.updatedAt.toISOString(),
        tool: {
          slug: run.tool.slug,
          name: run.tool.name,
          description: run.tool.description
        }
      }
    });
  } catch (error) {
    if (error instanceof ToolExecutionError) {
      return apiError(error.message, error.statusCode, error.details);
    }

    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return apiError(message, 500);
  }
}
