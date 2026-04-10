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

const assignBodySchema = z.object({
  memberId: z.string().uuid(),
  memberName: z.string().min(1),
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

    // Verify the user is an admin or owner in this workspace
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

    if (!membership || membership.role !== "admin") {
      return apiError("Only workspace admins can assign action items.", 403, { error: "admin_required" });
    }

    // Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("Invalid JSON body.", 400);
    }

    const parsed = assignBodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Invalid request body.", 400, { details: parsed.error.flatten() });
    }

    const { memberName } = parsed.data;

    // Update action_items.owner WHERE id=itemId AND workspaceId=workspaceId
    const updated = await db
      .update(actionItems)
      .set({ owner: memberName, updatedAt: new Date() })
      .where(
        and(
          eq(actionItems.id, itemId),
          eq(actionItems.workspaceId, workspaceId)
        )
      )
      .returning({ id: actionItems.id, owner: actionItems.owner });

    if (updated.length === 0) {
      return apiError("Action item not found.", 404, { error: "not_found" });
    }

    return apiSuccess({ success: true, actionItem: updated[0] });
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return apiError(
        "Your database tables are not set up yet. Run your database migrations, then try again.",
        503
      );
    }
    return apiError(
      error instanceof Error ? error.message : "Failed to assign action item.",
      500
    );
  }
}
