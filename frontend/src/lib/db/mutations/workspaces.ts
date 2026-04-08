import { and, eq } from "drizzle-orm";
import {
  workspaceJoinRequests,
  workspaces,
  workspaceMeetings,
  workspaceMembers
} from "@/db/schema";
import { db } from "@/lib/db/client";

function getDbOrThrow() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return db;
}

export async function createWorkspace(values: {
  ownerId: string;
  name: string;
  members?: Array<{
    userId: string;
    role: string;
  }>;
}) {
  const database = getDbOrThrow();
  const [workspace] = await database
    .insert(workspaces)
    .values({
      ownerId: values.ownerId,
      name: values.name,
      updatedAt: new Date()
    })
    .returning();

  if (!workspace) {
    throw new Error("Failed to create workspace.");
  }

  await database.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId: values.ownerId,
    role: "owner",
    status: "active"
  });

  const invitedMembers = (values.members ?? []).filter(
    (member, index, array) =>
      member.userId !== values.ownerId &&
      array.findIndex((candidate) => candidate.userId === member.userId) === index
  );

  if (invitedMembers.length > 0) {
    await database.insert(workspaceMembers).values(
      invitedMembers.map((member) => ({
        workspaceId: workspace.id,
        userId: member.userId,
        role: member.role,
        status: "active"
      }))
    );
  }

  return workspace;
}

export async function addWorkspaceMember(values: {
  workspaceId: string;
  userId: string;
  role: string;
  status?: string;
}) {
  const database = getDbOrThrow();
  const existing = await database
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, values.workspaceId),
        eq(workspaceMembers.userId, values.userId)
      )
    )
    .limit(1);

  if (existing[0]) {
    const [updatedExisting] = await database
      .update(workspaceMembers)
      .set({
        role: values.role,
        status: values.status ?? "active"
      })
      .where(eq(workspaceMembers.id, existing[0].id))
      .returning();

    return updatedExisting ?? existing[0];
  }

  const [membership] = await database
    .insert(workspaceMembers)
    .values({
      workspaceId: values.workspaceId,
      userId: values.userId,
      role: values.role,
      status: values.status ?? "active"
    })
    .returning();

  if (!membership) {
    throw new Error("Failed to add workspace member.");
  }

  return membership;
}

export async function updateWorkspaceMember(values: {
  memberId: string;
  workspaceId: string;
  role?: string;
  status?: string;
}) {
  const database = getDbOrThrow();
  const [member] = await database
    .update(workspaceMembers)
    .set({
      ...(values.role ? { role: values.role } : {}),
      ...(values.status ? { status: values.status } : {})
    })
    .where(
      and(
        eq(workspaceMembers.id, values.memberId),
        eq(workspaceMembers.workspaceId, values.workspaceId)
      )
    )
    .returning();

  if (!member) {
    throw new Error("Workspace member not found.");
  }

  return member;
}

export async function removeWorkspaceMember(values: {
  memberId: string;
  workspaceId: string;
}) {
  return updateWorkspaceMember({
    memberId: values.memberId,
    workspaceId: values.workspaceId,
    status: "removed"
  });
}

export async function createWorkspaceMeeting(values: {
  workspaceId: string;
  createdBy: string;
  title: string;
  status?: string;
  platform?: string;
}) {
  const database = getDbOrThrow();
  const [meeting] = await database
    .insert(workspaceMeetings)
    .values({
      workspaceId: values.workspaceId,
      createdBy: values.createdBy,
      title: values.title,
      status: values.status ?? "scheduled",
      platform: values.platform ?? "manual"
    })
    .returning();

  if (!meeting) {
    throw new Error("Failed to create workspace meeting.");
  }

  return meeting;
}

export async function createWorkspaceJoinRequest(values: {
  workspaceId: string;
  userId: string;
}) {
  const database = getDbOrThrow();
  const [joinRequest] = await database
    .insert(workspaceJoinRequests)
    .values({
      workspaceId: values.workspaceId,
      userId: values.userId,
      status: "pending"
    })
    .returning();

  if (!joinRequest) {
    throw new Error("Failed to create join request.");
  }

  return joinRequest;
}

export async function updateWorkspaceJoinRequest(values: {
  requestId: string;
  status: string;
}) {
  const database = getDbOrThrow();
  const [joinRequest] = await database
    .update(workspaceJoinRequests)
    .set({
      status: values.status
    })
    .where(eq(workspaceJoinRequests.id, values.requestId))
    .returning();

  if (!joinRequest) {
    throw new Error("Join request not found.");
  }

  return joinRequest;
}
