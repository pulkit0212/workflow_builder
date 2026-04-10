import { z } from "zod";

export const workspaceRoleSchema = z.enum(["admin", "member", "viewer"]);
export const workspaceMemberStatusSchema = z.enum(["active", "pending", "removed"]);
export const workspaceJoinRequestStatusSchema = z.enum(["pending", "accepted", "rejected"]);
export const searchableUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email()
});

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2, "Workspace name must be at least 2 characters long.").max(120),
  members: z
    .array(
      z.object({
        userId: z.string().uuid("Invalid user id."),
        role: workspaceRoleSchema.refine((value) => value !== "admin", {
          message: "Admin role is reserved for the workspace creator."
        })
      })
    )
    .default([])
});

export const joinWorkspaceSchema = z.object({
  workspaceId: z.string().uuid("Enter a valid workspace ID.")
});

export const addWorkspaceMemberSchema = z.object({
  userId: z.string().uuid("Invalid user id."),
  role: workspaceRoleSchema.refine((value) => value !== "admin", {
    message: "Admin role is reserved for the workspace creator."
  }).default("member")
});

export const updateWorkspaceMemberSchema = z.object({
  role: workspaceRoleSchema.refine((value) => value !== "admin", {
    message: "Admin role cannot be assigned through member updates."
  })
});

export const createWorkspaceMeetingSchema = z.object({
  title: z.string().trim().min(2, "Meeting title must be at least 2 characters long.").max(200),
  status: z.string().trim().max(50).optional().default("scheduled"),
  platform: z.string().trim().max(50).optional().default("manual")
});

export const requestJoinWorkspaceSchema = z.object({
  workspaceId: z.string().uuid()
});

export const acceptJoinRequestSchema = z.object({
  role: workspaceRoleSchema.refine((value) => value !== "admin", {
    message: "Admin role cannot be assigned when accepting a join request."
  })
});

export const workspaceMeetingRecordSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  createdBy: z.string().uuid(),
  title: z.string(),
  status: z.string(),
  platform: z.string(),
  createdAt: z.string()
});

export const workspaceMemberRecordSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
  role: workspaceRoleSchema,
  status: workspaceMemberStatusSchema,
  createdAt: z.string(),
  user: z
    .object({
      id: z.string().uuid(),
      fullName: z.string().nullable(),
      email: z.string().email()
    })
    .optional()
});

export const workspaceRecordSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  ownerId: z.string().uuid(),
  createdAt: z.string(),
  role: workspaceRoleSchema,
  memberCount: z.number().int().nonnegative(),
  meetingCount: z.number().int().nonnegative()
});

export const workspaceSearchRecordSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  ownerId: z.string().uuid(),
  createdAt: z.string(),
  memberCount: z.number().int().nonnegative(),
  meetingCount: z.number().int().nonnegative(),
  hasPendingRequest: z.boolean().default(false)
});

export const workspaceJoinRequestRecordSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
  status: workspaceJoinRequestStatusSchema,
  createdAt: z.string(),
  user: z.object({
    id: z.string().uuid(),
    fullName: z.string().nullable(),
    email: z.string().email()
  })
});

export const workspaceDetailsSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  ownerId: z.string().uuid(),
  createdAt: z.string(),
  currentUserRole: workspaceRoleSchema,
  members: z.array(workspaceMemberRecordSchema),
  meetings: z.array(workspaceMeetingRecordSchema),
  joinRequests: z.array(workspaceJoinRequestRecordSchema).default([])
});
