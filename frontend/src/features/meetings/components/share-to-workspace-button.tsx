"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle, LoaderCircle, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkspaceRecord } from "@/features/workspaces/types";

type ShareToWorkspaceButtonProps = {
  meetingId: string;
  workspaceMoveStatus: string | null;
  workspaceId: string | null;
  isOwner: boolean;
};

type ToastState = {
  message: string;
  type: "success" | "error";
} | null;

export function ShareToWorkspaceButton({
  meetingId,
  workspaceMoveStatus: initialMoveStatus,
  workspaceId: initialWorkspaceId,
  isOwner,
}: ShareToWorkspaceButtonProps) {
  const [moveStatus, setMoveStatus] = useState(initialMoveStatus);
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [toast, setToast] = useState<ToastState>(null);
  const [isPending, startTransition] = useTransition();

  // Fetch workspaces on mount to determine visibility and workspace name
  useEffect(() => {
    if (!isOwner) return;

    fetch("/api/workspaces", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { success: boolean; workspaces: WorkspaceRecord[] }) => {
        if (data.success) {
          setWorkspaces(data.workspaces);
          // If already approved, find the workspace name
          if (moveStatus === "approved" && workspaceId) {
            const ws = data.workspaces.find((w) => w.id === workspaceId);
            if (ws) setWorkspaceName(ws.name);
          }
        } else {
          setWorkspaces([]);
        }
      })
      .catch(() => setWorkspaces([]));
  }, [isOwner, moveStatus, workspaceId]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  function handleOpenModal() {
    if (workspaces && workspaces.length > 0) {
      setSelectedWorkspaceId(workspaces[0].id);
    }
    setModalOpen(true);
  }

  function handleConfirm() {
    if (!selectedWorkspaceId) return;

    startTransition(async () => {
      try {
        const res = await fetch(`/api/meetings/${meetingId}/move-to-workspace`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: selectedWorkspaceId }),
        });

        const data = (await res.json()) as { success: boolean; message?: string; details?: { error?: string } };

        if (!res.ok) {
          const errMsg =
            data.details?.error === "already_in_workspace"
              ? "This meeting is already shared to a workspace."
              : (data.message ?? "Failed to share meeting.");
          setToast({ message: errMsg, type: "error" });
          setModalOpen(false);
          return;
        }

        const shared = workspaces?.find((w) => w.id === selectedWorkspaceId);
        setWorkspaceName(shared?.name ?? null);
        setWorkspaceId(selectedWorkspaceId);
        setMoveStatus("approved");
        setModalOpen(false);
        setToast({ message: `Meeting shared to "${shared?.name ?? "workspace"}" successfully.`, type: "success" });
      } catch {
        setToast({ message: "Failed to share meeting. Please try again.", type: "error" });
        setModalOpen(false);
      }
    });
  }

  // Show "Shared to" badge when approved
  if (moveStatus === "approved") {
    return (
      <>
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-[#16a34a]" />
          <span className="text-sm font-medium text-[#16a34a]">
            Shared to: {workspaceName ?? "workspace"} ✓
          </span>
        </div>
        {toast ? (
          <div
            className={`fixed bottom-6 right-6 z-50 rounded-xl border px-4 py-3 text-sm shadow-lg ${
              toast.type === "success"
                ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]"
                : "border-[#fecaca] bg-[#fef2f2] text-[#991b1b]"
            }`}
          >
            {toast.message}
          </div>
        ) : null}
      </>
    );
  }

  // Only show button when owner, not yet shared, and has at least one workspace membership
  if (!isOwner || moveStatus !== null || workspaces === null || workspaces.length === 0) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={handleOpenModal}
      >
        <Share2 className="h-4 w-4" />
        Share to Workspace
      </Button>

      {toast ? (
        <div
          className={`fixed bottom-6 right-6 z-50 rounded-xl border px-4 py-3 text-sm shadow-lg ${
            toast.type === "success"
              ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]"
              : "border-[#fecaca] bg-[#fef2f2] text-[#991b1b]"
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-[28px] border border-[#d8dcff] bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f1efff] text-[#6c63ff]">
                <Share2 className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-[#111827]">Share to Workspace</h3>
                <p className="text-sm leading-6 text-[#6b7280]">
                  Select a workspace to share this meeting with your team.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <label htmlFor="workspace-select" className="text-sm font-medium text-[#111827]">
                Workspace
              </label>
              <select
                id="workspace-select"
                value={selectedWorkspaceId}
                onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                className="w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] outline-none focus:border-[#6c63ff]"
              >
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={isPending || !selectedWorkspaceId}
              >
                {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                Share Meeting
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
