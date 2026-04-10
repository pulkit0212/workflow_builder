import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { meetingSessions, actionItems, workspaceMembers, workspaceMoveRequests } from "@/db/schema";

const reviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
  adminNote: z.string().optional()
});

type RouteContext = {
  params: Promise<{ workspaceId: string; requestId: string }>;
};

export const runtime = "nodejs";

export async function PATCH(request: Request, context: RouteContext) {
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

  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid request body.", 400, parsed.error.flatten());
  }

  const { action, adminNote } = parsed.data;

  try {
    await ensureDatabaseReady();

    if (!db) {
      return apiError("DATABASE_URL is not configured.", 503);
    }

    const user = await syncCurrentUserToDatabase(userId);
    const { workspaceId, requestId } = await context.params;

    // Verify the authenticated user is ADMIN or OWNER in the workspace
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

    if (!membership || !["admin"].includes(membership.role)) {
      return apiError("You must be an admin of this workspace.", 403, {
        error: "admin_required"
      });
    }

    // Fetch the move request
    const [moveRequest] = await db
      .select()
      .from(workspaceMoveRequests)
      .where(
        and(
          eq(workspaceMoveRequests.id, requestId),
          eq(workspaceMoveRequests.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (!moveRequest) {
      return apiError("Move request not found.", 404, { error: "not_found" });
    }

    const now = new Date();

    if (action === "approve") {
      // Approve: update meeting_sessions, action_items, and move_request in a transaction
      await db.transaction(async (tx) => {
        await tx
          .update(meetingSessions)
          .set({
            workspaceId: moveRequest.workspaceId,
            workspaceMoveStatus: "approved",
            workspaceMovedBy: user.id,
            workspaceMovedAt: now,
            updatedAt: now
          })
          .where(eq(meetingSessions.id, moveRequest.meetingId));

        await tx
          .update(actionItems)
          .set({
            workspaceId: moveRequest.workspaceId,
            updatedAt: now
          })
          .where(eq(actionItems.meetingId, moveRequest.meetingId));

        await tx
          .update(workspaceMoveRequests)
          .set({
            status: "approved",
            reviewedBy: user.id,
            reviewedAt: now
          })
          .where(eq(workspaceMoveRequests.id, requestId));
      });

      return apiSuccess({ success: true, action: "approved", requestId });
    } else {
      // Reject: update move_request only, do NOT touch meeting_sessions or action_items
      await db
        .update(workspaceMoveRequests)
        .set({
          status: "rejected",
          reviewedBy: user.id,
          reviewedAt: now,
          ...(adminNote !== undefined ? { adminNote } : {})
        })
        .where(eq(workspaceMoveRequests.id, requestId));

      return apiSuccess({ success: true, action: "rejected", requestId });
    }
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to review move request.",
      500
    );
  }
}
