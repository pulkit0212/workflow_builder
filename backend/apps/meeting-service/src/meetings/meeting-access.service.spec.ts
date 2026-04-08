import test from "node:test";
import assert from "node:assert/strict";
import { MeetingAccessService } from "./meeting-access.service";

function createPrismaStub(membership: unknown) {
  return {
    workspaceMember: {
      findUnique: async () => membership,
    },
    meeting: {
      findUnique: async () => null,
    },
  } as never;
}

test("canAccessMeeting allows the creator to access a personal meeting", async () => {
  const service = new MeetingAccessService(createPrismaStub(null));

  const allowed = await service.canAccessMeeting("user-1", {
    id: "meeting-1",
    title: "Personal",
    createdBy: "user-1",
    workspaceId: null,
    status: "scheduled",
    platform: "manual",
    createdAt: new Date(),
  });

  assert.equal(allowed, true);
});

test("canAccessMeeting checks workspace membership for workspace meetings", async () => {
  const service = new MeetingAccessService(
    createPrismaStub({
      id: "membership-1",
    }),
  );

  const allowed = await service.canAccessMeeting("user-2", {
    id: "meeting-2",
    title: "Workspace",
    createdBy: "user-1",
    workspaceId: "workspace-1",
    status: "scheduled",
    platform: "manual",
    createdAt: new Date(),
  });

  assert.equal(allowed, true);
});
