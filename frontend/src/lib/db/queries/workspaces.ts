import { and, count, desc, eq, ilike, inArray, notInArray } from "drizzle-orm";
import {
  workspaceJoinRequests,
  workspaces,
  workspaceMeetings,
  workspaceMembers,
  users
} from "@/db/schema";
import { db } from "@/lib/db/client";

function getDbOrThrow() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return db;
}

export async function getWorkspaceById(workspaceId: string) {
  const database = getDbOrThrow();
  const [workspace] = await database
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  return workspace ?? null;
}

export async function getWorkspaceMembership(workspaceId: string, userId: string) {
  const database = getDbOrThrow();
  const [membership] = await database
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.status, "active")
      )
    )
    .limit(1);

  return membership ?? null;
}

export async function listWorkspaceMembers(workspaceId: string) {
  const database = getDbOrThrow();
  return database
    .select({
      id: workspaceMembers.id,
      workspaceId: workspaceMembers.workspaceId,
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      status: workspaceMembers.status,
      createdAt: workspaceMembers.createdAt,
      user: {
        id: users.id,
        fullName: users.fullName,
        email: users.email
      }
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        inArray(workspaceMembers.status, ["active", "pending"])
      )
    );
}

export async function listWorkspaceMeetings(workspaceId: string) {
  const database = getDbOrThrow();
  return database
    .select()
    .from(workspaceMeetings)
    .where(eq(workspaceMeetings.workspaceId, workspaceId))
    .orderBy(desc(workspaceMeetings.createdAt));
}

export async function listWorkspacesForUser(userId: string) {
  const database = getDbOrThrow();
  const memberships = await database
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.status, "active")
      )
    );

  const workspaceRows = await Promise.all(
    memberships.map(async (membership) => {
      const workspace = await getWorkspaceById(membership.workspaceId);

      if (!workspace) {
        return null;
      }

      const [memberTotal, meetingTotal] = await Promise.all([
        database
          .select({ count: count() })
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, workspace.id),
              eq(workspaceMembers.status, "active")
            )
          ),
        database
          .select({ count: count() })
          .from(workspaceMeetings)
          .where(eq(workspaceMeetings.workspaceId, workspace.id))
      ]);

      return {
        id: workspace.id,
        name: workspace.name,
        type: workspace.type,
        ownerId: workspace.ownerId,
        createdAt: workspace.createdAt,
        role: membership.role,
        memberCount: memberTotal[0]?.count ?? 0,
        meetingCount: meetingTotal[0]?.count ?? 0
      };
    })
  );

  return workspaceRows.filter((workspace): workspace is NonNullable<typeof workspace> => Boolean(workspace));
}

export async function getWorkspaceMemberById(memberId: string) {
  const database = getDbOrThrow();
  const [member] = await database
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.id, memberId))
    .limit(1);

  return member ?? null;
}

export async function listWorkspaceJoinRequests(workspaceId: string) {
  const database = getDbOrThrow();
  return database
    .select({
      id: workspaceJoinRequests.id,
      workspaceId: workspaceJoinRequests.workspaceId,
      userId: workspaceJoinRequests.userId,
      status: workspaceJoinRequests.status,
      createdAt: workspaceJoinRequests.createdAt,
      user: {
        id: users.id,
        fullName: users.fullName,
        email: users.email
      }
    })
    .from(workspaceJoinRequests)
    .innerJoin(users, eq(users.id, workspaceJoinRequests.userId))
    .where(
      and(
        eq(workspaceJoinRequests.workspaceId, workspaceId),
        eq(workspaceJoinRequests.status, "pending")
      )
    )
    .orderBy(desc(workspaceJoinRequests.createdAt));
}

export async function getWorkspaceJoinRequestById(requestId: string) {
  const database = getDbOrThrow();
  const [joinRequest] = await database
    .select()
    .from(workspaceJoinRequests)
    .where(eq(workspaceJoinRequests.id, requestId))
    .limit(1);

  return joinRequest ?? null;
}

export async function getPendingWorkspaceJoinRequest(workspaceId: string, userId: string) {
  const database = getDbOrThrow();
  const [joinRequest] = await database
    .select()
    .from(workspaceJoinRequests)
    .where(
      and(
        eq(workspaceJoinRequests.workspaceId, workspaceId),
        eq(workspaceJoinRequests.userId, userId),
        eq(workspaceJoinRequests.status, "pending")
      )
    )
    .limit(1);

  return joinRequest ?? null;
}

export async function searchJoinableWorkspaces(userId: string, query: string) {
  const database = getDbOrThrow();
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return [];
  }

  const memberships = await database
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.status, "active")
      )
    );

  const excludedWorkspaceIds = memberships.map((membership) => membership.workspaceId);
  const rows = await database
    .select()
    .from(workspaces)
    .where(
      excludedWorkspaceIds.length > 0
        ? and(
            ilike(workspaces.name, `%${normalizedQuery}%`),
            notInArray(workspaces.id, excludedWorkspaceIds)
          )
        : ilike(workspaces.name, `%${normalizedQuery}%`)
    )
    .limit(8);

  return Promise.all(
    rows.map(async (workspace) => {
      const [memberTotal, meetingTotal, pendingRequest] = await Promise.all([
        database
          .select({ count: count() })
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, workspace.id),
              eq(workspaceMembers.status, "active")
            )
          ),
        database
          .select({ count: count() })
          .from(workspaceMeetings)
          .where(eq(workspaceMeetings.workspaceId, workspace.id)),
        getPendingWorkspaceJoinRequest(workspace.id, userId)
      ]);

      return {
        id: workspace.id,
        name: workspace.name,
        ownerId: workspace.ownerId,
        createdAt: workspace.createdAt,
        memberCount: memberTotal[0]?.count ?? 0,
        meetingCount: meetingTotal[0]?.count ?? 0,
        hasPendingRequest: Boolean(pendingRequest)
      };
    })
  );
}
