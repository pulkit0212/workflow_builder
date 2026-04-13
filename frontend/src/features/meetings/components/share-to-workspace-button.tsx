"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowRight, CheckCircle, Loader2, Share2, X } from "lucide-react";
import type { WorkspaceRecord } from "@/features/workspaces/types";
import { isCalendarMeetingId, decodeCalendarMeetingId } from "@/features/meetings/ids";

type ShareToWorkspaceButtonProps = {
  meetingId: string;
  workspaceMoveStatus: string | null;
  workspaceId: string | null;
  isOwner: boolean;
  currentUserId?: string;
  currentUserWorkspaceRole?: string | null;
  /** DB UUID for the meeting — needed when meetingId is a calendar ID */
  dbMeetingId?: string | null;
  calendarMeeting?: {
    title: string;
    meetingLink: string;
    scheduledStartTime?: string;
    scheduledEndTime?: string;
    provider?: string;
    externalCalendarEventId?: string;
  };
};

export function ShareToWorkspaceButton({
  meetingId,
  workspaceMoveStatus: initialMoveStatus,
  workspaceId: initialWorkspaceId,
  isOwner,
  currentUserWorkspaceRole,
  calendarMeeting,
  dbMeetingId: initialDbMeetingId,
}: ShareToWorkspaceButtonProps) {
  const [moveStatus, setMoveStatus] = useState(initialMoveStatus);
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  // For calendar meetings, store the DB UUID returned after sharing (or passed in)
  const [dbMeetingId, setDbMeetingId] = useState<string | null>(
    initialDbMeetingId ?? (isCalendarMeetingId(meetingId) ? null : meetingId)
  );
  // Only admin workspaces — user can only share to workspaces where they are admin
  const [adminWorkspaces, setAdminWorkspaces] = useState<WorkspaceRecord[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [isPending, startTransition] = useTransition();

  const isWorkspaceAdmin = currentUserWorkspaceRole === "admin";

  useEffect(() => {
    if (!isOwner) return;
    fetch("/api/workspaces", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { success: boolean; workspaces: WorkspaceRecord[] }) => {
        if (data.success) {
          // Only show workspaces where user is admin
          const adminOnly = (data.workspaces ?? []).filter((w) => w.role === "admin");
          setAdminWorkspaces(adminOnly);
          if (moveStatus === "approved" && workspaceId) {
            const ws = data.workspaces.find((w) => w.id === workspaceId);
            if (ws) setWorkspaceName(ws.name);
          }
        } else {
          setAdminWorkspaces([]);
        }
      })
      .catch(() => setAdminWorkspaces([]));
  }, [isOwner, moveStatus, workspaceId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  function handleShare() {
    if (adminWorkspaces && adminWorkspaces.length > 0) {
      setSelectedWorkspaceId(adminWorkspaces[0].id);
    }
    setModalOpen(true);
  }

  function handleConfirm() {
    if (!selectedWorkspaceId) return;
    startTransition(async () => {
      try {
        const isCalendar = isCalendarMeetingId(meetingId);
        let res: Response;

        if (isCalendar && calendarMeeting) {
          // Calendar meeting — create DB record and share in one step
          res = await fetch("/api/meetings/share-calendar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workspaceId: selectedWorkspaceId,
              title: calendarMeeting.title,
              meetingLink: calendarMeeting.meetingLink,
              scheduledStartTime: calendarMeeting.scheduledStartTime,
              scheduledEndTime: calendarMeeting.scheduledEndTime,
              provider: calendarMeeting.provider ?? "google_meet",
              externalCalendarEventId: calendarMeeting.externalCalendarEventId,
            }),
          });
        } else {
          // DB meeting — use move-to-workspace
          res = await fetch(`/api/meetings/${meetingId}/move-to-workspace`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workspaceId: selectedWorkspaceId }),
          });
        }

        const data = await res.json() as { success: boolean; message?: string; details?: { error?: string }; meetingId?: string };
        if (!res.ok) {
          const msg = data.details?.error === "already_in_workspace"
            ? "This meeting is already shared to a workspace."
            : data.details?.error === "admin_required"
              ? "You must be a workspace admin to share meetings."
              : (data.message ?? "Failed to share meeting.");
          setToast({ message: msg, type: "error" });
          setModalOpen(false);
          return;
        }
        // Store the DB UUID returned by share-calendar so remove works correctly
        if (isCalendar && data.meetingId) {
          setDbMeetingId(data.meetingId);
        }
        const shared = adminWorkspaces?.find((w) => w.id === selectedWorkspaceId);
        setWorkspaceName(shared?.name ?? null);
        setWorkspaceId(selectedWorkspaceId);
        setMoveStatus("approved");
        setModalOpen(false);
        setToast({ message: `Shared to "${shared?.name ?? "workspace"}" successfully.`, type: "success" });
      } catch {
        setToast({ message: "Failed to share meeting.", type: "error" });
        setModalOpen(false);
      }
    });
  }

  function handleRemove() {
    const idToUse = dbMeetingId;
    if (!idToUse) {
      setToast({ message: "Cannot remove: meeting ID not found.", type: "error" });
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/meetings/${idToUse}/move-to-workspace`, { method: "DELETE" });
        const data = await res.json() as { success: boolean; message?: string };
        if (!res.ok) {
          setToast({ message: data.message ?? "Failed to remove from workspace.", type: "error" });
          return;
        }
        setMoveStatus(null);
        setWorkspaceId(null);
        setWorkspaceName(null);
        setDbMeetingId(null);
        setToast({ message: "Meeting removed from workspace.", type: "success" });
      } catch {
        setToast({ message: "Failed to remove meeting from workspace.", type: "error" });
      }
    });
  }

  const Toast = toast ? (
    <div className={`fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border px-4 py-3 text-sm shadow-lg ${
      toast.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"
    }`}>
      {toast.message}
    </div>
  ) : null;

  // Already shared — show badge with remove option for owner or workspace admin
  if (moveStatus === "approved") {
    const canRemove = isOwner || isWorkspaceAdmin;
    return (
      <>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">
            <CheckCircle className="h-3.5 w-3.5" />
            Shared to: {workspaceName ?? "workspace"}
          </span>
          {canRemove && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={isPending}
              className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"
              title="Remove from workspace"
            >
              {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
              Remove
            </button>
          )}
        </div>
        {Toast}
      </>
    );
  }

  // Not yet shared — only show to meeting owner who is also admin of at least one workspace
  if (!isOwner || !adminWorkspaces || adminWorkspaces.length === 0) {
    return Toast;
  }

  return (
    <>
      <button
        type="button"
        onClick={handleShare}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:border-[#6c63ff]/40 hover:bg-[#faf9ff] hover:text-[#6c63ff] transition-all"
      >
        <Share2 className="h-4 w-4" />
        Share to Workspace
      </button>

      {Toast}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#6c63ff]/10">
                <Share2 className="h-5 w-5 text-[#6c63ff]" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Share to Workspace</p>
                <p className="mt-0.5 text-xs text-slate-400">All workspace members will be able to see this meeting.</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500">Select workspace</label>
              <select
                value={selectedWorkspaceId}
                onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#6c63ff]/40"
              >
                {adminWorkspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>{ws.name}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400">Only workspaces where you are admin are shown.</p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={isPending}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending || !selectedWorkspaceId}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#6c63ff] py-2.5 text-sm font-semibold text-white hover:bg-[#5b52e0] disabled:opacity-50 transition-colors"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Share
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
