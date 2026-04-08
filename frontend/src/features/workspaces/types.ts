import type { z } from "zod";
import {
  acceptJoinRequestSchema,
  addWorkspaceMemberSchema,
  createWorkspaceMeetingSchema,
  createWorkspaceSchema,
  joinWorkspaceSchema,
  searchableUserSchema,
  updateWorkspaceMemberSchema,
  workspaceDetailsSchema,
  workspaceJoinRequestRecordSchema,
  workspaceMeetingRecordSchema,
  workspaceMemberStatusSchema,
  workspaceMemberRecordSchema,
  workspaceRecordSchema,
  workspaceSearchRecordSchema,
  workspaceJoinRequestStatusSchema,
  workspaceRoleSchema
} from "@/features/workspaces/schema";

export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;
export type WorkspaceMemberStatus = z.infer<typeof workspaceMemberStatusSchema>;
export type WorkspaceJoinRequestStatus = z.infer<typeof workspaceJoinRequestStatusSchema>;
export type CreateWorkspaceInput = z.input<typeof createWorkspaceSchema>;
export type JoinWorkspaceInput = z.input<typeof joinWorkspaceSchema>;
export type AddWorkspaceMemberInput = z.input<typeof addWorkspaceMemberSchema>;
export type UpdateWorkspaceMemberInput = z.input<typeof updateWorkspaceMemberSchema>;
export type CreateWorkspaceMeetingInput = z.input<typeof createWorkspaceMeetingSchema>;
export type AcceptJoinRequestInput = z.input<typeof acceptJoinRequestSchema>;
export type WorkspaceRecord = z.infer<typeof workspaceRecordSchema>;
export type WorkspaceSearchRecord = z.infer<typeof workspaceSearchRecordSchema>;
export type WorkspaceMemberRecord = z.infer<typeof workspaceMemberRecordSchema>;
export type WorkspaceMeetingRecord = z.infer<typeof workspaceMeetingRecordSchema>;
export type WorkspaceJoinRequestRecord = z.infer<typeof workspaceJoinRequestRecordSchema>;
export type SearchableUser = z.infer<typeof searchableUserSchema>;
export type WorkspaceDetails = z.infer<typeof workspaceDetailsSchema>;

export type WorkspaceListResponse = {
  success: true;
  workspaces: WorkspaceRecord[];
};

export type WorkspaceResponse = {
  success: true;
  workspace: WorkspaceRecord;
};

export type WorkspaceDetailsResponse = {
  success: true;
  workspace: WorkspaceDetails;
};

export type WorkspaceMembersResponse = {
  success: true;
  members: WorkspaceMemberRecord[];
};

export type WorkspaceJoinRequestsResponse = {
  success: true;
  joinRequests: WorkspaceJoinRequestRecord[];
};

export type WorkspaceMeetingResponse = {
  success: true;
  meeting: WorkspaceMeetingRecord;
};

export type WorkspaceSearchResponse = {
  success: true;
  workspaces: WorkspaceSearchRecord[];
};

export type UserSearchResponse = {
  success: true;
  users: SearchableUser[];
};

export type WorkspaceErrorResponse = {
  success: false;
  message: string;
  details?: unknown;
};
