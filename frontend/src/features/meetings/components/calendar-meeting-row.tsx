"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle, Loader2, Share2 } from "lucide-react";
import { encodeCalendarMeetingId } from "@/features/meetings/ids";
import { getMeetingDisplayStatus } from "@/features/meetings/meeting-status";
import type { MeetingSessionRecord } from "@/features/meeting-assistant/types";
import type { UnifiedCalendarMeeting } from "@/lib/calendar/types";
import { useRef, useState } from "react";

function formatTimeRange(startTime: string, endTime: string) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Time unavailable";
  const s = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const e = end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return s === e ? s : `${s} - ${e}`;
}

function getPlatformFromMeeting(meeting: UnifiedCalendarMeeting): string {
  const url = meeting.meetLink?.toLowerCase() ?? "";
  // Check actual join link URL first
  if (url.includes("zoom.us") || url.includes("zoom.com")) return "zoom";
  if (url.includes("teams.microsoft.com") || url.includes("teams.live.com")) return "teams";
  if (url.includes("meet.google.com")) return "google";
  // Outlook web links (outlook.live.com etc) are NOT join links - ignore for platform detection
  // Use provider/source as the reliable signal
  if (meeting.provider === "microsoft_teams" || meeting.source === "microsoft_teams") return "teams";
  if (meeting.provider === "microsoft_outlook" || meeting.source === "microsoft_outlook") return "outlook";
  return "google";
}

function getPlatformBadge(platform: string) {
  if (platform === "zoom") return { label: "Zoom", cls: "bg-blue-50 text-blue-600 ring-blue-200" };
  if (platform === "teams") return { label: "Microsoft Teams", cls: "bg-[#f5f3ff] text-[#6264A7] ring-[#ddd6fe]" };
  if (platform === "outlook") return { label: "Outlook Calendar", cls: "bg-sky-50 text-sky-700 ring-sky-200" };
  return { label: "Google Meet", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
}

type CalendarMeetingRowProps = {
  meeting: UnifiedCalendarMeeting;
  session?: MeetingSessionRecord | null;
  adminWorkspaces?: { id: string; name: string }[];
};

export function CalendarMeetingRow({ meeting, session, adminWorkspaces = [] }: CalendarMeetingRowProps) {
  const router = useRouter();
  const detailHref = `/dashboard/meetings/${encodeCalendarMeetingId(meeting.id)}` as Route;
  const status = getMeetingDisplayStatus(meeting, session);
  const platform = getPlatformFromMeeting(meeting);
  const platformBadge = getPlatformBadge(platform);

  const isAlreadyShared = !!session?.workspaceId;
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [isSharing, setIsSharing] = useState(false);
  const [sharedNow, setSharedNow] = useState(false);
  const showSharedBadge = isAlreadyShared || sharedNow;

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), type === "error" ? 5000 : 3000);
  }

  async function handleShare() {
    if (!selectedWorkspaceId) return;
    setIsSharing(true);
    try {
      const providerValue =
        platform === "zoom" ? "zoom_web" :
        platform === "teams" ? "teams_web" :
        platform === "outlook" ? "teams_web" :
        "google_meet";
      const res = await fetch("/api/meetings/share-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          title: meeting.title,
          meetingLink: meeting.meetLink ?? "",
          scheduledStartTime: meeting.startTime,
          scheduledEndTime: meeting.endTime,
          provider: providerValue,
          externalCalendarEventId: meeting.id,
        }),
      });
      const data = await res.json() as { success: boolean; message?: string; details?: { error?: string } };
      if (!res.ok) {
        showToast(data.details?.error === "admin_required" ? "Only workspace admins can share meetings." : (data.message ?? "Failed to share."), "error");
      } else {
        setSharedNow(true);
        setShareModalOpen(false);
        showToast("Meeting shared to workspace successfully.", "success");
      }
    } catch {
      showToast("Failed to share meeting.", "error");
    } finally {
      setIsSharing(false);
    }
  }

  function openShareModal() {
    if (adminWorkspaces.length > 0) setSelectedWorkspaceId(adminWorkspaces[0].id);
    setShareModalOpen(true);
  }

  return (
    <div className="group relative flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-[#6c63ff]/40 hover:bg-[#faf9ff] hover:shadow-md hover:shadow-[#6c63ff]/10 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#6c63ff] to-[#9b8fff] text-sm font-semibold text-white">
          {meeting.title.trim().charAt(0).toUpperCase() || "M"}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">{meeting.title}</p>
          <p className="mt-0.5 text-xs text-slate-400">{formatTimeRange(meeting.startTime, meeting.endTime)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${platformBadge.cls}`}>
              {platformBadge.label}
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1"
              style={{ background: status.bg, color: status.color, "--tw-ring-color": status.color + "33" } as React.CSSProperties}
            >
              {status.pulse && <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ backgroundColor: status.color }} />}
              {status.label}
            </span>
            {showSharedBadge && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                <CheckCircle className="h-3 w-3" /> Shared
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
        {status.showJoin && meeting.meetLink && (
          <button type="button"
            onClick={() => { navigator.clipboard.writeText(meeting.meetLink!); showToast("Meeting link copied", "success"); }}
            className="inline-flex items-center rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors">
            Copy Link
          </button>
        )}
        {status.showStartNotetaker && (
          <Link href={detailHref} className="inline-flex items-center rounded-xl bg-[#6c63ff] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#5b52e0] transition-colors">
            Start AI Notetaker
          </Link>
        )}
        {status.showStopRecording && session && (
          <button type="button" onClick={() => router.push(`/dashboard/meetings/${session.id}` as Route)}
            className="inline-flex items-center rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors">
            Stop Recording
          </button>
        )}
        {status.showViewReport && session && (
          <button type="button" onClick={() => router.push(`/dashboard/meetings/${session.id}` as Route)}
            className="inline-flex items-center rounded-xl bg-[#6c63ff] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#5b52e0] transition-colors">
            View Report
          </button>
        )}
        <Link href={detailHref}
          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-[#6c63ff]/40 hover:bg-[#faf9ff] hover:text-[#6c63ff] transition-all">
          View Details
          <ArrowRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
        </Link>
        {adminWorkspaces.length > 0 && !showSharedBadge && (
          <button type="button" onClick={openShareModal}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 hover:border-[#6c63ff]/40 hover:bg-[#faf9ff] hover:text-[#6c63ff] transition-all">
            <Share2 className="h-3.5 w-3.5" /> Share
          </button>
        )}
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border px-4 py-3 text-sm shadow-lg ${
          toast.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"
        }`}>{toast.message}</div>
      )}

      {shareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#6c63ff]/10">
                <Share2 className="h-5 w-5 text-[#6c63ff]" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Share to Workspace</p>
                <p className="mt-0.5 text-xs text-slate-400">All workspace members will see this meeting.</p>
              </div>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
              <p className="text-xs font-medium text-slate-700 truncate">{meeting.title}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {new Date(meeting.startTime).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500">Select workspace</label>
              <select value={selectedWorkspaceId} onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#6c63ff]/40">
                {adminWorkspaces.map((ws) => <option key={ws.id} value={ws.id}>{ws.name}</option>)}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setShareModalOpen(false)} disabled={isSharing}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button type="button" onClick={() => void handleShare()} disabled={isSharing || !selectedWorkspaceId}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#6c63ff] py-2.5 text-sm font-semibold text-white hover:bg-[#5b52e0] disabled:opacity-50 transition-colors">
                {isSharing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Share"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
