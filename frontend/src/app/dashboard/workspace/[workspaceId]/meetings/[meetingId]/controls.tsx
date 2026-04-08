"use client";

import { useState, useTransition } from "react";
import { Download, LoaderCircle, Share2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MeetingDetailRecord } from "@/features/meetings/types";

type WorkspaceRole = "admin" | "member" | "viewer";

type ToastState = { message: string; type: "success" | "error" } | null;

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  if (!toast) return null;
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 cursor-pointer rounded-xl border px-4 py-3 text-sm shadow-lg ${
        toast.type === "success"
          ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]"
          : "border-[#fecaca] bg-[#fef2f2] text-[#991b1b]"
      }`}
      onClick={onDismiss}
    >
      {toast.message}
    </div>
  );
}

// ─── Delete from workspace button (ADMIN only) ────────────────────────────────

function DeleteFromWorkspaceButton({
  meetingId,
  workspaceId,
  onSuccess,
}: {
  meetingId: string;
  workspaceId: string;
  onSuccess: (msg: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      try {
        // Remove meeting from workspace by resetting workspace fields
        const res = await fetch(`/api/workspace/${workspaceId}/meetings/${meetingId}`, {
          method: "DELETE",
        });
        if (res.ok) {
          onSuccess("Meeting removed from workspace.");
        } else {
          const data = (await res.json()) as { message?: string };
          onSuccess(data.message ?? "Failed to remove meeting.");
        }
      } catch {
        onSuccess("Failed to remove meeting from workspace.");
      } finally {
        setConfirming(false);
      }
    });
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-600">Remove from workspace?</span>
        <Button
          type="button"
          variant="danger"
          onClick={handleDelete}
          disabled={isPending}
        >
          {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          Confirm
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setConfirming(false)}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="danger"
      onClick={() => setConfirming(true)}
    >
      <Trash2 className="h-4 w-4" />
      Remove from Workspace
    </Button>
  );
}

// ─── Download button (ADMIN + MEMBER) ─────────────────────────────────────────

function DownloadButton({ meeting }: { meeting: MeetingDetailRecord }) {
  function handleDownload() {
    // Build a plain-text report and trigger download
    const lines: string[] = [
      `Meeting Report: ${meeting.title}`,
      `Date: ${meeting.scheduledStartTime ? new Date(meeting.scheduledStartTime).toLocaleString() : "Unknown"}`,
      "",
      "=== Summary ===",
      meeting.summary ?? "No summary available.",
      "",
      "=== Key Decisions ===",
      ...(meeting.keyDecisions.length > 0
        ? meeting.keyDecisions.map((d, i) => `${i + 1}. ${d}`)
        : ["None"]),
      "",
      "=== Action Items ===",
      ...(meeting.actionItems.length > 0
        ? meeting.actionItems.map(
            (item) =>
              `- ${item.task} | Owner: ${item.owner ?? "Unassigned"} | Due: ${item.dueDate ?? item.deadline ?? "N/A"} | Priority: ${item.priority ?? "Medium"}`
          )
        : ["None"]),
      "",
      "=== Risks & Blockers ===",
      ...(meeting.risksAndBlockers.length > 0 ? meeting.risksAndBlockers : ["None"]),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${meeting.title.replace(/[^a-z0-9]/gi, "_")}_report.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button type="button" variant="secondary" onClick={handleDownload}>
      <Download className="h-4 w-4" />
      Download Report
    </Button>
  );
}

// ─── Request-move button (MEMBER only) ────────────────────────────────────────

function RequestMoveButton({
  meetingId,
  workspaceId,
  onToast,
}: {
  meetingId: string;
  workspaceId: string;
  onToast: (t: ToastState) => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleRequest() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/meetings/${meetingId}/request-move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId }),
        });
        const data = (await res.json()) as { success: boolean; message?: string; details?: { error?: string } };
        if (res.ok) {
          onToast({ message: "Move request submitted successfully.", type: "success" });
        } else {
          const errMsg =
            data.details?.error === "request_already_pending"
              ? "A move request is already pending for this meeting."
              : (data.message ?? "Failed to submit request.");
          onToast({ message: errMsg, type: "error" });
        }
      } catch {
        onToast({ message: "Failed to submit move request.", type: "error" });
      }
    });
  }

  return (
    <Button type="button" variant="secondary" onClick={handleRequest} disabled={isPending}>
      {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
      Request Move
    </Button>
  );
}

// ─── Assign action item dropdown (ADMIN only) ─────────────────────────────────

export type WorkspaceMember = {
  id: string;
  name: string;
};

export function AssignToDropdown({
  itemId,
  workspaceId,
  currentOwner,
  members,
}: {
  itemId: string;
  workspaceId: string;
  currentOwner: string | null;
  members: WorkspaceMember[];
}) {
  const [optimisticOwner, setOptimisticOwner] = useState<string>(currentOwner ?? "");
  const [isPending, startTransition] = useTransition();

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const memberId = e.target.value;
    if (!memberId) return;

    const member = members.find((m) => m.id === memberId);
    if (!member) return;

    const previousOwner = optimisticOwner;
    // Optimistic update
    setOptimisticOwner(member.name);

    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/workspace/${workspaceId}/action-items/${itemId}/assign`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ memberId, memberName: member.name }),
          }
        );
        if (!res.ok) {
          // Revert on error
          setOptimisticOwner(previousOwner);
        }
      } catch {
        // Revert on error
        setOptimisticOwner(previousOwner);
      }
    });
  }

  const selectedMemberId =
    members.find((m) => m.name === optimisticOwner)?.id ?? "";

  return (
    <div className="relative flex items-center gap-1">
      {isPending && (
        <LoaderCircle className="h-3 w-3 animate-spin text-[#6c63ff]" />
      )}
      <select
        value={selectedMemberId}
        onChange={handleChange}
        disabled={isPending}
        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm focus:border-[#6c63ff] focus:outline-none focus:ring-1 focus:ring-[#6c63ff] disabled:opacity-50"
        aria-label="Assign to member"
      >
        <option value="">Unassigned</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Main controls component ──────────────────────────────────────────────────

export function WorkspaceMeetingControls({
  meeting,
  role,
  workspaceId,
}: {
  meeting: MeetingDetailRecord;
  role: WorkspaceRole;
  workspaceId: string;
}) {
  const [toast, setToast] = useState<ToastState>(null);

  const meetingId = meeting.meetingSessionId ?? meeting.id;

  function showToast(t: ToastState) {
    setToast(t);
    if (t) {
      setTimeout(() => setToast(null), 4000);
    }
  }

  // VIEWER: no controls
  if (role === "viewer") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
        Read-only access
      </div>
    );
  }

  // MEMBER controls
  if (role === "member") {
    return (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <DownloadButton meeting={meeting} />
          <RequestMoveButton
            meetingId={meetingId}
            workspaceId={workspaceId}
            onToast={showToast}
          />
        </div>
        <Toast toast={toast} onDismiss={() => setToast(null)} />
      </>
    );
  }

  // ADMIN controls
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <DownloadButton meeting={meeting} />
        <DeleteFromWorkspaceButton
          meetingId={meetingId}
          workspaceId={workspaceId}
          onSuccess={(msg) => showToast({ message: msg, type: "success" })}
        />
      </div>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
