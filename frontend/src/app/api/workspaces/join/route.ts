import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { joinWorkspaceSchema } from "@/features/workspaces/schema";
import { addWorkspaceMember } from "@/lib/db/mutations/workspaces";
import {
  getWorkspaceById,
  listWorkspaceMeetings,
  listWorkspaceMembers
} from "@/lib/db/queries/workspaces";

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

  const parsed = joinWorkspaceSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("Invalid workspace join input.", 400, parsed.error.flatten());
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const workspace = await getWorkspaceById(parsed.data.workspaceId);

    if (!workspace) {
      return apiError("Workspace not found.", 404);
    }

    await addWorkspaceMember({
      workspaceId: workspace.id,
      userId: user.id,
      role: "member"
    });

    const [members, meetings] = await Promise.all([
      listWorkspaceMembers(workspace.id),
      listWorkspaceMeetings(workspace.id)
    ]);

    return apiSuccess({
      success: true,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        ownerId: workspace.ownerId,
        createdAt: workspace.createdAt.toISOString(),
        role: workspace.ownerId === user.id ? "owner" : "member",
        memberCount: members.length,
        meetingCount: meetings.length
      }
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to join workspace.", 500);
  }
}
