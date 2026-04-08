import test from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { MeetingsService } from "./meetings.service";

function createService() {
  const updates: Array<{ where: { id: string }; data: { workspaceId: string } }> =
    [];

  const prisma = {
    meeting: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (where.id === "personal-meeting") {
          return {
            id: "personal-meeting",
            title: "1:1",
            createdBy: "user-1",
            workspaceId: null,
            status: "scheduled",
            platform: "manual",
            createdAt: new Date(),
          };
        }

        return {
          id: "workspace-meeting",
          title: "Team Sync",
          createdBy: "user-1",
          workspaceId: "workspace-1",
          status: "scheduled",
          platform: "manual",
          createdAt: new Date(),
        };
      },
      update: async (payload: { where: { id: string }; data: { workspaceId: string } }) => {
        updates.push(payload);
        return {
          id: payload.where.id,
          workspaceId: payload.data.workspaceId,
        };
      },
      create: async () => null,
      findMany: async () => [],
    },
  } as never;

  const workspacesService = {
    ensureMember: async () => ({
      id: "membership-1",
    }),
  } as never;

  return {
    service: new MeetingsService(prisma, workspacesService),
    updates,
  };
}

test("movePersonalMeetingToWorkspace updates workspace_id for personal meetings", async () => {
  const { service, updates } = createService();

  await service.movePersonalMeetingToWorkspace("user-1", "personal-meeting", {
    workspaceId: "workspace-2",
  });

  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0], {
    where: { id: "personal-meeting" },
    data: { workspaceId: "workspace-2" },
  });
});

test("movePersonalMeetingToWorkspace rejects meetings that are already shared", async () => {
  const { service } = createService();

  await assert.rejects(
    () =>
      service.movePersonalMeetingToWorkspace("user-1", "workspace-meeting", {
        workspaceId: "workspace-2",
      }),
    BadRequestException,
  );
});
