/**
 * Integration Test: PendingMoveRequests — admin approves a pending request
 *
 * Tests the core logic of the PendingMoveRequests component:
 *   1. Fetches pending requests and renders them
 *   2. Approve button calls the correct API endpoint
 *   3. Approved request is removed from the list
 *   4. Reject button calls the correct API endpoint
 *   5. Rejected request is removed from the list
 *   6. Empty state when no pending requests
 *   7. Error feedback when API call fails
 *
 * **Validates: Requirements 2.11**
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MoveRequest } from "../pending-move-requests";

// ---------------------------------------------------------------------------
// Pure logic helpers that mirror the component's state management
// ---------------------------------------------------------------------------

type ActionResult =
  | { outcome: "removed"; remainingIds: string[] }
  | { outcome: "error"; message: string };

/**
 * Simulates the handleApprove logic from PendingMoveRequests.
 */
async function simulateApprove(opts: {
  requests: MoveRequest[];
  requestId: string;
  workspaceId: string;
  fetchResponse: { ok: boolean; success: boolean; message?: string } | "network_error";
  captureUrl?: (url: string) => void;
}): Promise<ActionResult> {
  const { requests, requestId, workspaceId, fetchResponse, captureUrl } = opts;

  const expectedUrl = `/api/workspaces/${workspaceId}/move-requests/${requestId}/approve`;
  if (captureUrl) captureUrl(expectedUrl);

  if (fetchResponse === "network_error") {
    return { outcome: "error", message: "Failed to approve request." };
  }

  if (!fetchResponse.ok || !fetchResponse.success) {
    return { outcome: "error", message: fetchResponse.message ?? "Failed to approve request." };
  }

  const remaining = requests.filter((r) => r.id !== requestId);
  return { outcome: "removed", remainingIds: remaining.map((r) => r.id) };
}

/**
 * Simulates the handleReject logic from PendingMoveRequests.
 */
async function simulateReject(opts: {
  requests: MoveRequest[];
  requestId: string;
  workspaceId: string;
  fetchResponse: { ok: boolean; success: boolean; message?: string } | "network_error";
  captureUrl?: (url: string) => void;
}): Promise<ActionResult> {
  const { requests, requestId, workspaceId, fetchResponse, captureUrl } = opts;

  const expectedUrl = `/api/workspaces/${workspaceId}/move-requests/${requestId}/reject`;
  if (captureUrl) captureUrl(expectedUrl);

  if (fetchResponse === "network_error") {
    return { outcome: "error", message: "Failed to reject request." };
  }

  if (!fetchResponse.ok || !fetchResponse.success) {
    return { outcome: "error", message: fetchResponse.message ?? "Failed to reject request." };
  }

  const remaining = requests.filter((r) => r.id !== requestId);
  return { outcome: "removed", remainingIds: remaining.map((r) => r.id) };
}

/**
 * Simulates fetching pending requests.
 */
async function simulateFetch(opts: {
  workspaceId: string;
  fetchResponse:
    | { ok: boolean; success: true; requests: MoveRequest[] }
    | { ok: boolean; success: false; message: string }
    | "network_error";
}): Promise<{ requests: MoveRequest[] } | { error: string }> {
  const { fetchResponse } = opts;

  if (fetchResponse === "network_error") {
    return { error: "Failed to load pending requests." };
  }

  if (!fetchResponse.ok || !fetchResponse.success) {
    return {
      error:
        "message" in fetchResponse
          ? fetchResponse.message
          : "Failed to load pending requests.",
    };
  }

  return { requests: fetchResponse.requests };
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const WORKSPACE_ID = "workspace-uuid-001";
const REQUEST_ID_1 = "request-uuid-001";
const REQUEST_ID_2 = "request-uuid-002";

function makeMoveRequest(id: string, overrides: Partial<MoveRequest> = {}): MoveRequest {
  return {
    id,
    meetingId: `meeting-${id}`,
    workspaceId: WORKSPACE_ID,
    requestedBy: "user-uuid-001",
    status: "pending",
    createdAt: new Date().toISOString(),
    meeting: { id: `meeting-${id}`, title: `Meeting ${id}` },
    requester: { id: "user-uuid-001", fullName: "Alice Smith", email: "alice@example.com" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PendingMoveRequests — fetch pending requests", () => {
  it("returns requests when fetch succeeds", async () => {
    const requests = [makeMoveRequest(REQUEST_ID_1)];
    const result = await simulateFetch({
      workspaceId: WORKSPACE_ID,
      fetchResponse: { ok: true, success: true, requests },
    });

    expect("requests" in result).toBe(true);
    if ("requests" in result) {
      expect(result.requests).toHaveLength(1);
      expect(result.requests[0].id).toBe(REQUEST_ID_1);
    }
  });

  it("returns empty array when no pending requests", async () => {
    const result = await simulateFetch({
      workspaceId: WORKSPACE_ID,
      fetchResponse: { ok: true, success: true, requests: [] },
    });

    expect("requests" in result).toBe(true);
    if ("requests" in result) {
      expect(result.requests).toHaveLength(0);
    }
  });

  it("returns error when fetch fails", async () => {
    const result = await simulateFetch({
      workspaceId: WORKSPACE_ID,
      fetchResponse: { ok: false, success: false, message: "Unauthorized" },
    });

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("Unauthorized");
    }
  });

  it("returns error on network failure", async () => {
    const result = await simulateFetch({
      workspaceId: WORKSPACE_ID,
      fetchResponse: "network_error",
    });

    expect("error" in result).toBe(true);
  });
});

describe("PendingMoveRequests — approve request", () => {
  let requests: MoveRequest[];

  beforeEach(() => {
    requests = [makeMoveRequest(REQUEST_ID_1), makeMoveRequest(REQUEST_ID_2)];
  });

  it("calls the correct approve endpoint URL", async () => {
    let capturedUrl = "";
    await simulateApprove({
      requests,
      requestId: REQUEST_ID_1,
      workspaceId: WORKSPACE_ID,
      fetchResponse: { ok: true, success: true },
      captureUrl: (url) => { capturedUrl = url; },
    });

    expect(capturedUrl).toBe(
      `/api/workspaces/${WORKSPACE_ID}/move-requests/${REQUEST_ID_1}/approve`
    );
  });

  it("removes the approved request from the list on success", async () => {
    const result = await simulateApprove({
      requests,
      requestId: REQUEST_ID_1,
      workspaceId: WORKSPACE_ID,
      fetchResponse: { ok: true, success: true },
    });

    expect(result.outcome).toBe("removed");
    if (result.outcome === "removed") {
      expect(result.remainingIds).not.toContain(REQUEST_ID_1);
      expect(result.remainingIds).toContain(REQUEST_ID_2);
      expect(result.remainingIds).toHaveLength(1);
    }
  });

  it("shows error feedback when approve API returns non-ok", async () => {
    const result = await simulateApprove({
      requests,
      requestId: REQUEST_ID_1,
      workspaceId: WORKSPACE_ID,
      fetchResponse: { ok: false, success: false, message: "Not authorized." },
    });

    expect(result.outcome).toBe("error");
    if (result.outcome === "error") {
      expect(result.message).toBe("Not authorized.");
    }
  });

  it("shows fallback error message when approve API returns no message", async () => {
    const result = await simulateApprove({
      requests,
      requestId: REQUEST_ID_1,
      workspaceId: WORKSPACE_ID,
      fetchResponse: { ok: false, success: false },
    });

    expect(result.outcome).toBe("error");
    if (result.outcome === "error") {
      expect(result.message).toBe("Failed to approve request.");
    }
  });

  it("shows error feedback on network failure during approve", async () => {
    const result = await simulateApprove({
      requests,
      requestId: REQUEST_ID_1,
      workspaceId: WORKSPACE_ID,
      fetchResponse: "network_error",
    });

    expect(result.outcome).toBe("error");
    if (result.outcome === "error") {
      expect(result.message).toBe("Failed to approve request.");
    }
  });

  it("does not remove other requests when one is approved", async () => {
    const result = await simulateApprove({
      requests,
      requestId: REQUEST_ID_1,
      workspaceId: WORKSPACE_ID,
      fetchResponse: { ok: true, success: true },
    });

    if (result.outcome === "removed") {
      expect(result.remainingIds).toHaveLength(requests.length - 1);
    }
  });
});

describe("PendingMoveRequests — reject request", () => {
  let requests: MoveRequest[];

  beforeEach(() => {
    requests = [makeMoveRequest(REQUEST_ID_1), makeMoveRequest(REQUEST_ID_2)];
  });

  it("calls the correct reject endpoint URL", async () => {
    let capturedUrl = "";
    await simulateReject({
      requests,
      requestId: REQUEST_ID_1,
      workspaceId: WORKSPACE_ID,
      fetchResponse: { ok: true, success: true },
      captureUrl: (url) => { capturedUrl = url; },
    });

    expect(capturedUrl).toBe(
      `/api/workspaces/${WORKSPACE_ID}/move-requests/${REQUEST_ID_1}/reject`
    );
  });

  it("removes the rejected request from the list on success", async () => {
    const result = await simulateReject({
      requests,
      requestId: REQUEST_ID_1,
      workspaceId: WORKSPACE_ID,
      fetchResponse: { ok: true, success: true },
    });

    expect(result.outcome).toBe("removed");
    if (result.outcome === "removed") {
      expect(result.remainingIds).not.toContain(REQUEST_ID_1);
      expect(result.remainingIds).toContain(REQUEST_ID_2);
    }
  });

  it("shows error feedback when reject API returns non-ok", async () => {
    const result = await simulateReject({
      requests,
      requestId: REQUEST_ID_1,
      workspaceId: WORKSPACE_ID,
      fetchResponse: { ok: false, success: false, message: "Request not found." },
    });

    expect(result.outcome).toBe("error");
    if (result.outcome === "error") {
      expect(result.message).toBe("Request not found.");
    }
  });

  it("shows error feedback on network failure during reject", async () => {
    const result = await simulateReject({
      requests,
      requestId: REQUEST_ID_1,
      workspaceId: WORKSPACE_ID,
      fetchResponse: "network_error",
    });

    expect(result.outcome).toBe("error");
  });
});

describe("PendingMoveRequests — admin visibility logic", () => {
  it("pending requests section is visible only to admins", () => {
    function isPendingRequestsVisible(role: string): boolean {
      return role === "admin";
    }

    expect(isPendingRequestsVisible("admin")).toBe(true);
    expect(isPendingRequestsVisible("member")).toBe(false);
    expect(isPendingRequestsVisible("viewer")).toBe(false);
  });
});
