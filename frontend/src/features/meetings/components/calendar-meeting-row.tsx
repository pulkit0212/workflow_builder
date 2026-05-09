"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Share2 } from "lucide-react";
import { encodeCalendarMeetingId } from "@/features/meetings/ids";
import { getMeetingDisplayStatus } from "@/features/meetings/meeting-status";
import type { MeetingSessionRecord } from "@/features/meeting-assistant/types";
import type { UnifiedCalendarMeeting } from "@/lib/calendar/types";
import { useRef, useState } from "react";
import { useApiFetch } from "@/hooks/useApiFetch";

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
  if (url.includes("zoom.us") || url.includes("zoom.com")) return "zoom";
  if (url.includes("teams.microsoft.com") || url.includes("teams.live.com")) return "teams";
  if (url.includes("meet.google.com")) return "google";
  if (meeting.provider === "microsoft_teams" || meeting.source === "microsoft_teams") return "teams";
  if (meeting.provider === "microsoft_outlook" || meeting.source === "microsoft_outlook") return "outlook";
  return "google";
}

function getPlatformBadge(platform: string) {
  if (platform === "zoom") return { label: "ZOOM", bg: "#E3F2FD", color: "#2D8CFF" };
  if (platform === "teams") return { label: "MICROSOFT TEAMS", bg: "#EDE9FE", color: "#6264A7" };
  if (platform === "outlook") return { label: "OUTLOOK", bg: "#E3F2FD", color: "#0078D4" };
  return { label: "GOOGLE MEET", bg: "#FCE8E6", color: "#EA4335" };
}

type CalendarMeetingRowProps = {
  meeting: UnifiedCalendarMeeting;
  session?: MeetingSessionRecord | null;
  adminWorkspaces?: { id: string; name: string }[];
};

export function CalendarMeetingRow({ meeting, session, adminWorkspaces = [] }: CalendarMeetingRowProps) {
  const router = useRouter();
  const apiFetch = useApiFetch();
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
  const [isStartingBot, setIsStartingBot] = useState(false);

  async function handleStartNotetaker() {
    if (!meeting.meetLink) { showToast("This meeting has no join link.", "error"); return; }
    setIsStartingBot(true);
    try {
      const createRes = await apiFetch("/api/meetings", {
        method: "POST",
        body: JSON.stringify({
          title: meeting.title,
          meetingLink: meeting.meetLink,
          provider: platform === "zoom" ? "zoom_web" : platform === "teams" ? "teams_web" : "google_meet",
          scheduledStartTime: meeting.startTime,
          scheduledEndTime: meeting.endTime,
          externalCalendarEventId: meeting.id,
          status: "scheduled",
        }),
      });
      if (!createRes.ok) { showToast("Failed to create meeting session.", "error"); return; }
      const created = await createRes.json() as { id?: string };
      const sessionId = created.id;
      if (!sessionId) { showToast("Failed to create meeting session.", "error"); return; }
      const startRes = await apiFetch(`/api/meetings/${sessionId}/bot/start`, { method: "POST" });
      if (!startRes.ok) {
        const errData = await startRes.json().catch(() => ({})) as { error?: string };
        showToast(errData.error ?? "Failed to start bot.", "error");
        return;
      }
      router.push(`/dashboard/meetings/${sessionId}` as import("next").Route);
    } catch {
      showToast("Failed to start AI Notetaker.", "error");
    } finally {
      setIsStartingBot(false);
    }
  }

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), type === "error" ? 5000 : 3000);
  }

  async function handleShare() {
    if (!selectedWorkspaceId) return;
    setIsSharing(true);
    try {
      const providerValue = platform === "zoom" ? "zoom_web" : platform === "teams" ? "teams_web" : platform === "outlook" ? "teams_web" : "google_meet";
      const res = await apiFetch("/api/meetings/share-calendar", {
        method: "POST",
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
    <>
      {/* ── Meeting row — Stitch style ── */}
      <div className="group flex items-center gap-4 rounded-xl border border-[#DADCE0] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:shadow-md hover:border-[#6C3FF5]/30">
        {/* Icon */}
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#EDE9FE]">
          <span className="material-symbols-outlined text-[#6C3FF5] text-[22px]">groups</span>
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[#202124] truncate">{meeting.title}</p>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="flex items-center gap-1 text-xs text-[#5F6368]">
              <span className="material-symbols-outlined text-[14px]">schedule</span>
              {formatTimeRange(meeting.startTime, meeting.endTime)}
            </span>
            <span className="text-[#DADCE0]">·</span>
            <span className="flex items-center gap-1 text-xs text-[#5F6368]">
              <span className="material-symbols-outlined text-[14px]">timer</span>
              {(() => {
                const diff = new Date(meeting.endTime).getTime() - new Date(meeting.startTime).getTime();
                const mins = Math.round(diff / 60000);
                return `${mins} min`;
              })()}
            </span>
          </div>
        </div>

        {/* Right side — badges + actions */}
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {/* Platform badge */}
          <div className="flex flex-col items-end gap-1">
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold flex items-center gap-1"
              style={{ background: platformBadge.bg, color: platformBadge.color }}>
              <span className="material-symbols-outlined text-[11px]">video_chat</span>
              {platformBadge.label}
            </span>
            {/* Status badge */}
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
              style={{ background: status.bg, color: status.color }}>
              {status.pulse && <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full mr-1" style={{ backgroundColor: status.color }} />}
              {status.label}
            </span>
          </div>

          {/* Action buttons */}
          {status.showStartNotetaker && (
            <button type="button" onClick={() => void handleStartNotetaker()} disabled={isStartingBot}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#6C3FF5] px-4 py-2 text-xs font-bold text-white hover:bg-[#5B2FE0] transition-colors disabled:opacity-60 shadow-sm">
              {isStartingBot ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="material-symbols-outlined text-[14px]">smart_toy</span>}
              Start AI Notetaker
            </button>
          )}
          {status.showViewReport && session && (
            <button type="button" onClick={() => router.push(`/dashboard/meetings/${session.id}` as Route)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#6C3FF5] text-[#6C3FF5] px-4 py-2 text-xs font-bold hover:bg-[#EDE9FE] transition-colors">
              View Report
            </button>
          )}
          {status.showStopRecording && session && (
            <button type="button" onClick={() => router.push(`/dashboard/meetings/${session.id}` as Route)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 transition-colors">
              Stop Recording
            </button>
          )}
          {!status.showStartNotetaker && !status.showViewReport && !status.showStopRecording && (
            <Link href={detailHref}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#DADCE0] bg-white px-4 py-2 text-xs font-semibold text-[#5F6368] hover:border-[#6C3FF5]/40 hover:text-[#6C3FF5] transition-all">
              View Details
            </Link>
          )}
          {adminWorkspaces.length > 0 && !showSharedBadge && (
            <button type="button" onClick={openShareModal}
              className="inline-flex items-center gap-1 rounded-xl border border-[#DADCE0] bg-white px-3 py-2 text-xs font-semibold text-[#5F6368] hover:border-[#6C3FF5]/40 hover:text-[#6C3FF5] transition-all">
              <Share2 className="h-3.5 w-3.5" />
            </button>
          )}
          {showSharedBadge && (
            <span className="rounded-full bg-[#E6F4EA] px-2 py-0.5 text-[10px] font-bold text-[#137333]">✓ Shared</span>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border px-4 py-3 text-sm shadow-lg ${
          toast.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"
        }`}>{toast.message}</div>
      )}

      {/* Share modal */}
      {shareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EDE9FE]">
                <Share2 className="h-5 w-5 text-[#6C3FF5]" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#202124]">Share to Workspace</p>
                <p className="mt-0.5 text-xs text-[#5F6368]">All workspace members will see this meeting.</p>
              </div>
            </div>
            <div className="rounded-xl border border-[#DADCE0] bg-[#F8F9FA] px-3 py-2.5">
              <p className="text-xs font-medium text-[#202124] truncate">{meeting.title}</p>
              <p className="text-xs text-[#5F6368] mt-0.5">
                {new Date(meeting.startTime).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#5F6368]">Select workspace</label>
              <select value={selectedWorkspaceId} onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                className="w-full rounded-xl border border-[#DADCE0] bg-[#F8F9FA] px-3 py-2.5 text-sm text-[#202124] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#6C3FF5]/40">
                {adminWorkspaces.map((ws) => <option key={ws.id} value={ws.id}>{ws.name}</option>)}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setShareModalOpen(false)} disabled={isSharing}
                className="flex-1 rounded-xl border border-[#DADCE0] bg-white py-2.5 text-sm font-semibold text-[#5F6368] hover:bg-[#F8F9FA] transition-colors">
                Cancel
              </button>
              <button type="button" onClick={() => void handleShare()} disabled={isSharing || !selectedWorkspaceId}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#6C3FF5] py-2.5 text-sm font-semibold text-white hover:bg-[#5B2FE0] disabled:opacity-50 transition-colors">
                {isSharing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Share"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
