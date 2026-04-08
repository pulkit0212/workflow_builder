import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { meetingSessions, actionItems, workspaceMembers } from "@/db/schema";

const moveToWorkspaceSchema = z.object({
  workspaceId: z.string().uuid()
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext) {
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

  const parsed = moveToWorkspaceSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid request body.", 400, parsed.error.flatten());
  }

  const { workspaceId } = parsed.data;

  try {
    await ensureDatabaseReady();

    if (!db) {
      return apiError("DATABASE_URL is not configured.", 503);
    }

    const user = await syncCurrentUserToDatabase(userId);
    const { id: meetingId } = await context.params;

    // Fetch the meeting and verify ownership
    const [meeting] = await db
      .select()
      .from(meetingSessions)
      .where(eq(meetingSessions.id, meetingId))
      .limit(1);

    if (!meeting) {
      return apiError("Meeting not found.", 404, { error: "not_found" });
    }

    if (meeting.userId !== user.id) {
      return apiError("You are not the owner of this meeting.", 403, { error: "not_meeting_owner" });
    }

    // Check if already in a workspace
    if (meeting.workspaceMoveStatus === "approved") {
      return apiError("Meeting is already in a workspace.", 409, { error: "already_in_workspace" });
    }

    // Verify the user is an active member of the target workspace
    const [membership] = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, user.id),
          eq(workspaceMembers.status, "active")
        )
      )
      .limit(1);

    if (!membership) {
      return apiError("You are not an active member of this workspace.", 403, { error: "forbidden" });
    }

    // Perform the move in a single transaction
    await db.transaction(async (tx) => {
      await tx
        .update(meetingSessions)
        .set({
          workspaceId,
          workspaceMoveStatus: "approved",
          workspaceMovedBy: user.id,
          workspaceMovedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(meetingSessions.id, meetingId));

      await tx
        .update(actionItems)
        .set({
          workspaceId,
          updatedAt: new Date()
        })
        .where(eq(actionItems.meetingId, meetingId));
    });

    return apiSuccess({ success: true, meetingId, workspaceId });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to move meeting to workspace.", 500);
  }
}
