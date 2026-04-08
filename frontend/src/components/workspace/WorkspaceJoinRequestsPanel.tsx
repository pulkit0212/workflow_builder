"use client";

import { useState, useTransition } from "react";
import { Check, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  acceptWorkspaceJoinRequest,
  rejectWorkspaceJoinRequest
} from "@/features/workspaces/api";
import type {
  WorkspaceJoinRequestRecord,
  WorkspaceRole
} from "@/features/workspaces/types";

type WorkspaceJoinRequestsPanelProps = {
  workspaceId: string;
  requests: WorkspaceJoinRequestRecord[];
  onAccepted: (requestId: string) => void;
  onRejected: (requestId: string) => void;
};

export function WorkspaceJoinRequestsPanel({
  workspaceId,
  requests,
  onAccepted,
  onRejected
}: WorkspaceJoinRequestsPanelProps) {
  const [selectedRoles, setSelectedRoles] = useState<Record<string, WorkspaceRole>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (requests.length === 0) {
    return null;
  }

  function getRole(requestId: string) {
    return selectedRoles[requestId] ?? "member";
  }

  function handleAccept(requestId: string) {
    startTransition(async () => {
      try {
        await acceptWorkspaceJoinRequest(workspaceId, requestId, {
          role: getRole(requestId)
        });
        onAccepted(requestId);
        setError(null);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Failed to accept join request."
        );
      }
    });
  }

  function handleReject(requestId: string) {
    startTransition(async () => {
      try {
        await rejectWorkspaceJoinRequest(workspaceId, requestId);
        onRejected(requestId);
        setError(null);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Failed to reject join request."
        );
      }
    });
  }

  return (
    <div className="space-y-4 rounded-[28px] border border-[#e5e7eb] bg-[#f9fafb] p-5">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6c63ff]">
          Join Requests
        </p>
        <h3 className="text-lg font-semibold text-[#111827]">Pending approvals</h3>
      </div>
      {requests.map((request) => (
        <div
          key={request.id}
          className="flex flex-col gap-3 rounded-[24px] border border-[#e5e7eb] bg-white px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
        >
          <div>
            <p className="text-sm font-semibold text-[#111827]">
              {request.user.fullName || request.user.email}
            </p>
            <p className="text-sm text-[#6b7280]">{request.user.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={getRole(request.id)}
              onChange={(event) =>
                setSelectedRoles((current) => ({
                  ...current,
                  [request.id]: event.target.value as WorkspaceRole
                }))
              }
              className="rounded-xl border border-[#d1d5db] bg-white px-3 py-2 text-sm text-[#111827] outline-none"
            >
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleAccept(request.id)}
              disabled={isPending}
            >
              {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Accept
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleReject(request.id)}
              disabled={isPending}
            >
              <X className="h-4 w-4" />
              Reject
            </Button>
          </div>
        </div>
      ))}
      {error ? (
        <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] p-3 text-sm text-[#991b1b]">
          {error}
        </div>
      ) : null}
    </div>
  );
}
