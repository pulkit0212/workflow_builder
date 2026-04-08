import test from "node:test";
import assert from "node:assert/strict";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { WorkspacesService } from "./workspaces.service";
import { WorkspaceJoinRequestStatus } from "./workspace-join-request-status.enum";
import { WorkspaceMemberStatus } from "./workspace-member-status.enum";
import { WorkspaceRole } from "./workspace-role.enum";

function createWorkspaceService(overrides?: Partial<Record<string, unknown>>) {
  const updateCalls: unknown[] = [];
  const createCalls: unknown[] = [];

  const prisma = {
    workspace: {
      findUnique: async () => ({ id: "workspace-1" }),
      create: async (payload: unknown) => payload,
    },
    workspaceMember: {
      findMany: async () => [],
      findUnique: async ({
        where,
      }: {
        where: { workspaceId_userId: { workspaceId: string; userId: string } };
      }) => {
        if (where.workspaceId_userId.userId === "owner-user") {
          return {
            id: "membership-owner",
            workspaceId: "workspace-1",
            userId: "owner-user",
            role: WorkspaceRole.OWNER,
            status: WorkspaceMemberStatus.ACTIVE,
            createdAt: new Date(),
          };
        }

        if (where.workspaceId_userId.userId === "admin-user") {
          return {
            id: "membership-admin",
            workspaceId: "workspace-1",
            userId: "admin-user",
            role: WorkspaceRole.ADMIN,
            status: WorkspaceMemberStatus.ACTIVE,
            createdAt: new Date(),
          };
        }

        return null;
      },
      findFirst: async () => ({
        id: "member-1",
        workspaceId: "workspace-1",
        userId: "viewer-user",
        role: WorkspaceRole.VIEWER,
        status: WorkspaceMemberStatus.ACTIVE,
        createdAt: new Date(),
      }),
      create: async (payload: unknown) => {
        createCalls.push(payload);
        return payload;
      },
      update: async (payload: unknown) => {
        updateCalls.push(payload);
        return payload;
      },
    },
    workspaceJoinRequest: {
      findFirst: async () => null,
      findMany: async () => [],
      create: async (payload: unknown) => payload,
      update: async (payload: unknown) => payload,
      updateMany: async () => ({ count: 0 }),
    },
    $queryRaw: async () => [],
    $transaction: async (callback: (tx: typeof prisma) => Promise<unknown>) =>
      callback(prisma),
  } as never;

  Object.assign(prisma, overrides);

  return {
    service: new WorkspacesService(prisma),
    updateCalls,
    createCalls,
  };
}

test("createWorkspace adds owner and invited members", async () => {
  const { service } = createWorkspaceService();

  const result = await service.createWorkspace("owner-user", {
    name: "Product Team",
    members: [{ userId: "member-user", role: WorkspaceRole.ADMIN }],
  });

  assert.deepEqual((result as { data: { members: { create: unknown[] } } }).data.members.create, [
    {
      userId: "owner-user",
      role: WorkspaceRole.OWNER,
      status: WorkspaceMemberStatus.ACTIVE,
    },
    {
      userId: "member-user",
      role: WorkspaceRole.ADMIN,
      status: WorkspaceMemberStatus.ACTIVE,
    },
  ]);
});

test("createWorkspace rejects duplicate invited members", async () => {
  const { service } = createWorkspaceService();

  await assert.rejects(
    () =>
      service.createWorkspace("owner-user", {
        name: "Product Team",
        members: [
          { userId: "member-user", role: WorkspaceRole.ADMIN },
          { userId: "member-user", role: WorkspaceRole.MEMBER },
        ],
      }),
    BadRequestException,
  );
});

test("addMember prevents admins from promoting admins", async () => {
  const { service } = createWorkspaceService({
    workspaceMember: {
      findMany: async () => [],
      findUnique: async ({
        where,
      }: {
        where: { workspaceId_userId: { workspaceId: string; userId: string } };
      }) => {
        if (where.workspaceId_userId.userId === "admin-user") {
          return {
            id: "membership-admin",
            workspaceId: "workspace-1",
            userId: "admin-user",
            role: WorkspaceRole.ADMIN,
            status: WorkspaceMemberStatus.ACTIVE,
            createdAt: new Date(),
          };
        }

        return null;
      },
      findFirst: async () => null,
      create: async (payload: unknown) => payload,
      update: async (payload: unknown) => payload,
    },
  });

  await assert.rejects(
    () =>
      service.addMember("admin-user", "workspace-1", {
        userId: "new-user",
        role: WorkspaceRole.ADMIN,
      }),
    ForbiddenException,
  );
});

test("requestJoin returns the existing pending request", async () => {
  const pendingRequest = {
    id: "request-1",
    workspaceId: "workspace-1",
    userId: "user-2",
    status: WorkspaceJoinRequestStatus.PENDING,
    createdAt: new Date(),
  };

  const { service } = createWorkspaceService({
    workspaceJoinRequest: {
      findFirst: async () => pendingRequest,
      findMany: async () => [],
      create: async (payload: unknown) => payload,
      update: async (payload: unknown) => payload,
      updateMany: async () => ({ count: 0 }),
    },
  });

  const result = await service.requestJoin("user-2", "workspace-1");

  assert.equal(result, pendingRequest);
});

test("requestJoin rejects users who are already active members", async () => {
  const { service } = createWorkspaceService({
    workspaceMember: {
      findMany: async () => [],
      findUnique: async () => ({
        id: "membership-2",
        workspaceId: "workspace-1",
        userId: "user-2",
        role: WorkspaceRole.MEMBER,
        status: WorkspaceMemberStatus.ACTIVE,
        createdAt: new Date(),
      }),
      findFirst: async () => null,
      create: async (payload: unknown) => payload,
      update: async (payload: unknown) => payload,
    },
  });

  await assert.rejects(
    () => service.requestJoin("user-2", "workspace-1"),
    ConflictException,
  );
});
