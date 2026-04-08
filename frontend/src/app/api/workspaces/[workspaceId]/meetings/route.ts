import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { createWorkspaceMeetingSchema } from "@/features/workspaces/schema";
import { createWorkspaceMeeting } from "@/lib/db/mutations/workspaces";
import { getWorkspaceMembership } from "@/lib/db/queries/workspaces";

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> }
) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  const { workspaceId } = await context.params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", 400);
  }

  const parsed = createWorkspaceMeetingSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("Invalid workspace meeting input.", 400, parsed.error.flatten());
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const membership = await getWorkspaceMembership(workspaceId, user.id);

    if (!membership) {
      return apiError("You do not have access to this workspace.", 403);
    }

    const meeting = await createWorkspaceMeeting({
      workspaceId,
      createdBy: user.id,
      title: parsed.data.title,
      status: parsed.data.status,
      platform: parsed.data.platform
    });

    return apiSuccess(
      {
        success: true,
        meeting: {
          ...meeting,
          createdAt: meeting.createdAt.toISOString()
        }
      },
      201
    );
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to create workspace meeting.",
      500
    );
  }
}
