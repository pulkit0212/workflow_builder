import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { searchJoinableWorkspaces } from "@/lib/db/queries/workspaces";

export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) {
    return apiSuccess({
      success: true,
      workspaces: []
    });
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const workspaces = await searchJoinableWorkspaces(user.id, query);

    return apiSuccess({
      success: true,
      workspaces: workspaces.map((workspace) => ({
        ...workspace,
        createdAt: workspace.createdAt.toISOString()
      }))
    });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to search workspaces.",
      500
    );
  }
}
