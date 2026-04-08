import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";
import { db } from "@/lib/db/client";
import { actionItems } from "@/db/schema/action-items";
import { workspaceMembers } from "@/db/schema";

export const runtime = "nodejs";

const statusBodySchema = z.object({
  status: z.enum(["pending", "in_progress", "done", "hold"]),
});

type RouteContext = {
  params: Promise<{ workspaceId: string; itemId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  try {
    await ensureDatabaseReady();

    if (!db) {
      return apiError("DATABASE_URL is not configured.", 503);
    }

    const user = await syncCurrentUserToDatabase(userId);
    const { workspaceId, itemId } = await context.params;

    // Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("Invalid JSON body.", 400);
    }

    const parsed = statusBodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Invalid request body.", 400, { details: parsed.error.flatten() });
    }

    const { status } = parsed.data;

    // Fetch the action item to check ownership
    const [actionItem] = await db
      .select({ id: actionItems.id, owner: actionItems.owner, workspaceId: actionItems.workspaceId })
      .from(actionItems)
      .where(
        and(
          eq(actionItems.id, itemId),
          eq(actionItems.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (!actionItem) {
      return apiError("Action item not found.", 404, { error: "not_found" });
    }

    // Check if user is admin/owner in workspace
    const [membership] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, user.id),
          eq(workspaceMembers.status, "active")
        )
      )
      .limit(1);

    const isAdmin = membership && (membership.role === "admin" || membership.role === "owner");
    const isAssignedMember = actionItem.owner === user.fullName;

    if (!isAdmin && !isAssignedMember) {
      return apiError(
        "You are not authorized to update this action item's status.",
        403,
        { error: "forbidden" }
      );
    }

    // Set completedAt based on status
    const completedAt = status === "done" ? new Date() : null;

    const updated = await db
      .update(actionItems)
      .set({ status, completedAt, updatedAt: new Date() })
      .where(
        and(
          eq(actionItems.id, itemId),
          eq(actionItems.workspaceId, workspaceId)
        )
      )
      .returning({ id: actionItems.id, status: actionItems.status, completedAt: actionItems.completedAt });

    return apiSuccess({ success: true, actionItem: updated[0] });
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return apiError(
        "Your database tables are not set up yet. Run your database migrations, then try again.",
        503
      );
    }
    return apiError(
      error instanceof Error ? error.message : "Failed to update action item status.",
      500
    );
  }
}
