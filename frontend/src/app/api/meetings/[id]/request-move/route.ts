import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { workspaceMembers, workspaceMoveRequests } from "@/db/schema";

const requestMoveSchema = z.object({
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

  const parsed = requestMoveSchema.safeParse(body);
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

    // Check for an existing pending request for the same meetingId + workspaceId
    const [existingRequest] = await db
      .select()
      .from(workspaceMoveRequests)
      .where(
        and(
          eq(workspaceMoveRequests.meetingId, meetingId),
          eq(workspaceMoveRequests.workspaceId, workspaceId),
          eq(workspaceMoveRequests.status, "pending")
        )
      )
      .limit(1);

    if (existingRequest) {
      return apiError("A pending request already exists for this meeting and workspace.", 409, {
        error: "request_already_pending"
      });
    }

    // Insert the move request
    const [newRequest] = await db
      .insert(workspaceMoveRequests)
      .values({
        meetingId,
        workspaceId,
        requestedBy: user.id,
        status: "pending"
      })
      .returning();

    return apiSuccess({ success: true, requestId: newRequest.id, meetingId, workspaceId });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to submit move request.",
      500
    );
  }
}
