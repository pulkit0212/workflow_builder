"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Clock, Loader2, X } from "lucide-react";
import { clientApiFetch } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MoveRequest = {
  id: string;
  meetingId: string;
  workspaceId: string;
  requestedBy: string;
  status: string;
  createdAt: string;
  meeting?: {
    id: string;
    title: string;
  };
  requester?: {
    id: string;
    fullName: string | null;
    email: string;
  };
};

type PendingMoveRequestsProps = {
  workspaceId: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PendingMoveRequests({ workspaceId }: PendingMoveRequestsProps) {
  const [requests, setRequests] = useState<MoveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function fetchRequests() {
    setLoading(true);
    setError(null);
    try {
      const res = await clientApiFetch(`/api/workspaces/${workspaceId}/move-requests`, {
        cache: "no-store",
      });
      const payload = (await res.json()) as
        | { success: true; requests: MoveRequest[] }
        | { success: false; message: string };

      if (!res.ok || !payload.success) {
        setError("message" in payload ? payload.message : "Failed to load pending requests.");
        return;
      }

      setRequests(payload.requests);
    } catch {
      setError("Failed to load pending requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  async function handleApprove(requestId: string) {
    setActionLoading(requestId);
    setActionError(null);
    try {
      const res = await clientApiFetch(
        `/api/workspaces/${workspaceId}/move-requests/${requestId}/approve`,
        { method: "POST" }
      );
      const payload = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !payload.success) {
        setActionError(payload.message ?? "Failed to approve request.");
        return;
      }
      // Remove the approved request from the list
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch {
      setActionError("Failed to approve request.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(requestId: string) {
    setActionLoading(requestId);
    setActionError(null);
    try {
      const res = await clientApiFetch(
        `/api/workspaces/${workspaceId}/move-requests/${requestId}/reject`,
        { method: "POST" }
      );
      const payload = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !payload.success) {
        setActionError(payload.message ?? "Failed to reject request.");
        return;
      }
      // Remove the rejected request from the list
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch {
      setActionError("Failed to reject request.");
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-[#6c63ff]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center">
        <CheckCircle className="mb-2 h-8 w-8 text-slate-300" />
        <p className="text-sm font-medium text-slate-500">No pending requests</p>
        <p className="mt-0.5 text-xs text-slate-400">All move requests have been handled.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{actionError}</p>
        </div>
      )}

      {requests.map((request) => {
        const meetingTitle = request.meeting?.title ?? `Meeting ${request.meetingId}`;
        const requesterName =
          request.requester?.fullName ?? request.requester?.email ?? request.requestedBy;
        const requesterEmail = request.requester?.email;
        const isActing = actionLoading === request.id;

        return (
          <div
            key={request.id}
            className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50">
                <Clock className="h-4 w-4 text-amber-500" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{meetingTitle}</p>
                <p className="truncate text-xs text-slate-400">
                  {requesterName}
                  {requesterEmail && requesterName !== requesterEmail
                    ? ` · ${requesterEmail}`
                    : ""}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => handleApprove(request.id)}
                disabled={isActing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {isActing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCircle className="h-3 w-3" />
                )}
                Approve
              </button>
              <button
                type="button"
                onClick={() => handleReject(request.id)}
                disabled={isActing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                {isActing ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                Reject
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
