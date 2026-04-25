import { toolRegistry, type ToolSlug } from "@/lib/ai/tool-registry";
import { ToolExecutionError } from "@/lib/ai/tool-execution-error";

// Tool execution now happens in the Express backend via /api/tools/:slug/run
// This file is kept for the Next.js /api/tools/[toolSlug]/run route handler.
export async function executeToolRun(toolSlug: string, rawInput: unknown, clerkUserId: string) {
  if (!(toolSlug in toolRegistry)) {
    throw new ToolExecutionError("Tool not found.", 404);
  }

  const tool = toolRegistry[toolSlug as ToolSlug];

  if (!tool.implemented) {
    throw new ToolExecutionError(`${tool.name} is not implemented yet.`, 501);
  }

  // All tool execution is now handled by the Express backend
  throw new ToolExecutionError(`Use the Express API at /api/tools/${toolSlug}/run`, 501);
}
