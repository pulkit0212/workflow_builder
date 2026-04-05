import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { getRunsForUser } from "@/lib/ai/execute-tool";
import { ToolExecutionError } from "@/lib/ai/tool-execution-error";
import { toolSlugs, type ToolSlug } from "@/lib/ai/tool-registry";
import { canUseHistory } from "@/lib/subscription";
import { getUserSubscription } from "@/lib/subscription.server";

export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  const { searchParams } = new URL(request.url);
  const toolSlug = searchParams.get("toolSlug") ?? undefined;

  if (toolSlug && !toolSlugs.includes(toolSlug as ToolSlug)) {
    return apiError("Invalid tool slug filter.", 400);
  }

  try {
    const subscription = await getUserSubscription(userId);

    if (!canUseHistory(subscription.plan)) {
      return apiError("Meeting history requires Pro or Elite plan.", 403, {
        error: "upgrade_required",
        currentPlan: subscription.plan
      });
    }

    const runs = await getRunsForUser(userId, toolSlug as ToolSlug | undefined);

    return apiSuccess({
      success: true,
      runs: runs.map((run) => ({
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
      }))
    });
  } catch (error) {
    if (error instanceof ToolExecutionError) {
      return apiError(error.message, error.statusCode, error.details);
    }

    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return apiError(message, 500);
  }
}
