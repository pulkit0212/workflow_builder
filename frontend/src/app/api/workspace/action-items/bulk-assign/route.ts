import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray } from "drizzle-orm";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";
import { resolveWorkspaceIdForRequest } from "@/lib/workspaces/server";
import { db } from "@/lib/db/client";
import { actionItems } from "@/db/schema/action-items";
import { workspaceMembers } from "@/db/schema";

function getDbOrThrow() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return db;
}

export async function PATCH(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const workspaceId = await resolveWorkspaceIdForRequest(request, user.id);

    if (!workspaceId) {
      return apiError("Workspace is required.", 400, { error: "workspace_required" });
    }

    const database = getDbOrThrow();

    // Check requester's role — must be ADMIN or OWNER
    const [membership] = await database
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

    const role = membership?.role ?? "viewer";
    if (role !== "admin" && role !== "owner") {
      return apiError("Admin or owner role required.", 403, { error: "admin_required" });
    }

    // Parse body
    const body = await request.json();
    const { itemIds, assignee } = body as { itemIds: string[]; assignee: string };

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return apiError("itemIds must be a non-empty array.", 400);
    }

    if (typeof assignee !== "string" || assignee.trim() === "") {
      return apiError("assignee must be a non-empty string.", 400);
    }

    // Update owner on all specified rows that belong to this workspace
    const updated = await database
      .update(actionItems)
      .set({ owner: assignee.trim(), updatedAt: new Date() })
      .where(
        and(
          eq(actionItems.workspaceId, workspaceId),
          inArray(actionItems.id, itemIds)
        )
      )
      .returning({ id: actionItems.id, owner: actionItems.owner });

    return apiSuccess({ success: true, updated });
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return apiError(
        "Your database tables are not set up yet. Run your database migrations, then try again.",
        503
      );
    }
    return apiError(
      error instanceof Error ? error.message : "Failed to bulk-assign action items.",
      500
    );
  }
}
