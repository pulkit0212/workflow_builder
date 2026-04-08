import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { createWorkspaceSchema } from "@/features/workspaces/schema";
import { createWorkspace as createWorkspaceRecord } from "@/lib/db/mutations/workspaces";
import { listWorkspacesForUser } from "@/lib/db/queries/workspaces";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const workspaces = await listWorkspacesForUser(user.id);

    return apiSuccess({
      success: true,
      workspaces: workspaces.map((workspace) => ({
        ...workspace,
        createdAt: workspace.createdAt.toISOString()
      }))
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to load workspaces.", 500);
  }
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

  const parsed = createWorkspaceSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("Invalid workspace input.", 400, parsed.error.flatten());
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const workspace = await createWorkspaceRecord({
      ownerId: user.id,
      name: parsed.data.name,
      members: parsed.data.members
    });

    const memberCount = parsed.data.members.filter((member) => member.userId !== user.id).length + 1;

    return apiSuccess(
      {
        success: true,
        workspace: {
          id: workspace.id,
          name: workspace.name,
          ownerId: workspace.ownerId,
          createdAt: workspace.createdAt.toISOString(),
          role: "owner",
          memberCount,
          meetingCount: 0
        }
      },
      201
    );
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to create workspace.", 500);
  }
}
