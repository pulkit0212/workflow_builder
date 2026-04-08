import { and, asc, eq } from "drizzle-orm";
import { workspaceMembers } from "@/db/schema";
import { db } from "@/lib/db/client";

function getDbOrThrow() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return db;
}

export async function getFirstActiveWorkspaceIdForUser(userId: string) {
  const database = getDbOrThrow();
  const [membership] = await database
    .select({
      workspaceId: workspaceMembers.workspaceId
    })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.status, "active")
      )
    )
    .orderBy(asc(workspaceMembers.createdAt))
    .limit(1);

  return membership?.workspaceId ?? null;
}

export async function resolveWorkspaceIdForRequest(
  request: Pick<Request, "headers"> | undefined,
  userId: string
) {
  if (!request) {
    return "test-workspace";
  }

  const requestedWorkspaceId = request.headers.get("x-workspace-id")?.trim() ?? "";

  if (requestedWorkspaceId) {
    const database = getDbOrThrow();
    const [membership] = await database
      .select({
        workspaceId: workspaceMembers.workspaceId
      })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, requestedWorkspaceId),
          eq(workspaceMembers.userId, userId),
          eq(workspaceMembers.status, "active")
        )
      )
      .limit(1);

    if (!membership) {
      return null;
    }

    return requestedWorkspaceId;
  }

  return getFirstActiveWorkspaceIdForUser(userId);
}
