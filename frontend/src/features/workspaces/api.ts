import type {
  AcceptJoinRequestInput,
  AddWorkspaceMemberInput,
  CreateWorkspaceInput,
  CreateWorkspaceMeetingInput,
  JoinWorkspaceInput,
  SearchableUser,
  UpdateWorkspaceMemberInput,
  WorkspaceDetails,
  WorkspaceErrorResponse,
  WorkspaceMeetingRecord,
  WorkspaceJoinRequestRecord,
  WorkspaceMemberRecord,
  WorkspaceRecord,
  WorkspaceSearchRecord
} from "@/features/workspaces/types";
import { clientApiFetch } from "@/lib/api-client";

function getErrorMessage(payload: WorkspaceErrorResponse) {
  return payload.message;
}

export async function fetchWorkspaces() {
  const response = await clientApiFetch("/api/workspaces", {
    cache: "no-store"
  });
  const payload = (await response.json()) as
    | { success: true; workspaces: WorkspaceRecord[] }
    | WorkspaceErrorResponse;

  if (!response.ok || !payload.success) {
    throw new Error("message" in payload ? getErrorMessage(payload) : "Failed to load workspaces.");
  }

  return payload.workspaces;
}

export async function fetchWorkspaceDetails(workspaceId: string) {
  const response = await clientApiFetch(`/api/workspaces/${workspaceId}`, {
    cache: "no-store"
  });
  const payload = (await response.json()) as
    | { success: true; workspace: WorkspaceDetails }
    | WorkspaceErrorResponse;

  if (!response.ok || !payload.success) {
    throw new Error("message" in payload ? getErrorMessage(payload) : "Failed to load workspace.");
  }

  return payload.workspace;
}

export async function fetchWorkspaceMembers(workspaceId: string) {
  const response = await clientApiFetch(`/api/workspaces/${workspaceId}/members`, {
    cache: "no-store"
  });
  const payload = (await response.json()) as
    | { success: true; members: WorkspaceMemberRecord[] }
    | WorkspaceErrorResponse;

  if (!response.ok || !payload.success) {
    throw new Error("message" in payload ? getErrorMessage(payload) : "Failed to load workspace members.");
  }

  return payload.members;
}

export async function createWorkspace(values: CreateWorkspaceInput) {
  const response = await clientApiFetch("/api/workspaces", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(values)
  });
  const payload = (await response.json()) as
    | { success: true; workspace: WorkspaceRecord }
    | WorkspaceErrorResponse;

  if (!response.ok || !payload.success) {
    throw new Error("message" in payload ? getErrorMessage(payload) : "Failed to create workspace.");
  }

  return payload.workspace;
}

export async function searchUsers(query: string) {
  const response = await clientApiFetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
    cache: "no-store"
  });
  const payload = (await response.json()) as
    | { success: true; users: SearchableUser[] }
    | WorkspaceErrorResponse;

  if (!response.ok || !payload.success) {
    throw new Error("message" in payload ? getErrorMessage(payload) : "Failed to search users.");
  }

  return payload.users;
}

export async function searchJoinableWorkspaces(query: string) {
  const response = await clientApiFetch(`/api/workspaces/search?q=${encodeURIComponent(query)}`, {
    cache: "no-store"
  });
  const payload = (await response.json()) as
    | { success: true; workspaces: WorkspaceSearchRecord[] }
    | WorkspaceErrorResponse;

  if (!response.ok || !payload.success) {
    throw new Error(
      "message" in payload ? getErrorMessage(payload) : "Failed to search workspaces."
    );
  }

  return payload.workspaces;
}

export async function requestJoinWorkspace(values: JoinWorkspaceInput) {
  const response = await clientApiFetch(`/api/workspaces/${values.workspaceId}/request-join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({})
  });
  const payload = (await response.json()) as
    | { success: true; workspace: WorkspaceRecord }
    | WorkspaceErrorResponse;

  if (!response.ok || !payload.success) {
    throw new Error("message" in payload ? getErrorMessage(payload) : "Failed to join workspace.");
  }

  return payload.workspace;
}

export async function createWorkspaceMeeting(
  workspaceId: string,
  values: CreateWorkspaceMeetingInput
) {
  const response = await clientApiFetch(`/api/workspaces/${workspaceId}/meetings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(values)
  });
  const payload = (await response.json()) as
    | { success: true; meeting: WorkspaceMeetingRecord }
    | WorkspaceErrorResponse;

  if (!response.ok || !payload.success) {
    throw new Error("message" in payload ? getErrorMessage(payload) : "Failed to create workspace meeting.");
  }

  return payload.meeting;
}

export async function addWorkspaceMember(workspaceId: string, values: AddWorkspaceMemberInput) {
  const response = await clientApiFetch(`/api/workspaces/${workspaceId}/members`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(values)
  });
  const payload = (await response.json()) as
    | { success: true; member: WorkspaceMemberRecord }
    | WorkspaceErrorResponse;

  if (!response.ok || !payload.success) {
    throw new Error("message" in payload ? getErrorMessage(payload) : "Failed to add member.");
  }

  return payload.member;
}

export async function updateWorkspaceMember(
  workspaceId: string,
  memberId: string,
  values: UpdateWorkspaceMemberInput
) {
  const response = await clientApiFetch(`/api/workspaces/${workspaceId}/members/${memberId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(values)
  });
  const payload = (await response.json()) as
    | { success: true; member: WorkspaceMemberRecord }
    | WorkspaceErrorResponse;

  if (!response.ok || !payload.success) {
    throw new Error(
      "message" in payload ? getErrorMessage(payload) : "Failed to update member."
    );
  }

  return payload.member;
}

export async function removeWorkspaceMember(workspaceId: string, memberId: string) {
  const response = await clientApiFetch(`/api/workspaces/${workspaceId}/members/${memberId}`, {
    method: "DELETE"
  });
  const payload = (await response.json()) as
    | { success: true; member: WorkspaceMemberRecord }
    | WorkspaceErrorResponse;

  if (!response.ok || !payload.success) {
    throw new Error(
      "message" in payload ? getErrorMessage(payload) : "Failed to remove member."
    );
  }

  return payload.member;
}

export async function fetchWorkspaceJoinRequests(workspaceId: string) {
  const response = await clientApiFetch(`/api/workspaces/${workspaceId}/join-requests`, {
    cache: "no-store"
  });
  const payload = (await response.json()) as
    | { success: true; joinRequests: WorkspaceJoinRequestRecord[] }
    | WorkspaceErrorResponse;

  if (!response.ok || !payload.success) {
    throw new Error(
      "message" in payload ? getErrorMessage(payload) : "Failed to load join requests."
    );
  }

  return payload.joinRequests;
}

export async function acceptWorkspaceJoinRequest(
  workspaceId: string,
  requestId: string,
  values: AcceptJoinRequestInput
) {
  const response = await clientApiFetch(
    `/api/workspaces/${workspaceId}/join-requests/${requestId}/accept`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(values)
    }
  );
  const payload = (await response.json()) as
    | { success: true; member: WorkspaceMemberRecord }
    | WorkspaceErrorResponse;

  if (!response.ok || !payload.success) {
    throw new Error(
      "message" in payload ? getErrorMessage(payload) : "Failed to accept join request."
    );
  }

  return payload.member;
}

export async function rejectWorkspaceJoinRequest(workspaceId: string, requestId: string) {
  const response = await clientApiFetch(
    `/api/workspaces/${workspaceId}/join-requests/${requestId}/reject`,
    {
      method: "POST"
    }
  );
  const payload = (await response.json()) as
    | { success: true; joinRequest: WorkspaceJoinRequestRecord }
    | WorkspaceErrorResponse;

  if (!response.ok || !payload.success) {
    throw new Error(
      "message" in payload ? getErrorMessage(payload) : "Failed to reject join request."
    );
  }

  return payload.joinRequest;
}
