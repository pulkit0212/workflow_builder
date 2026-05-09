"use client";

import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import type { Route } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { fetchUnifiedCalendarFeed } from "@/features/meetings/api";
import { encodeCalendarMeetingId } from "@/features/meetings/ids";
import { getMeetingDisplayStatus, findSessionForMeeting } from "@/features/meetings/meeting-status";
import type { MeetingSessionRecord } from "@/features/meeting-assistant/types";
import type { UnifiedCalendarMeeting } from "@/lib/calendar/types";
import { useWorkspaceContext } from "@/contexts/workspace-context";
import { useApiFetch, useIsAuthReady } from "@/hooks/useApiFetch";
import type { MeetingSessionListResponse, MeetingSessionErrorResponse } from "@/features/meeting-assistant/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasContent(m: MeetingSessionRecord) {
  const summary = m.summary?.trim() ?? "";
  const errorPhrases = ["not enough content", "summary generation failed", "googlegenerativeai", "error fetching"];
  const summaryIsError = errorPhrases.some((p) => summary.toLowerCase().includes(p));
  return (summary.length > 0 && !summaryIsError) || m.transcript?.trim() || m.status === "completed" || (m.keyPoints?.length ?? 0) > 0 || (m.actionItems?.length ?? 0) > 0;
}

function getSummaryPreview(summary: string | null): string | null {
  if (!summary) return null;
  const text = summary.replace(/\s+/g, " ").trim();
  const errorPhrases = ["not enough content", "summary generation failed", "googlegenerativeai", "error fetching", "404", "failed:"];
  if (errorPhrases.some((p) => text.toLowerCase().includes(p)) || text.length < 20) return null;
  return text.length > 100 ? `${text.slice(0, 97).trimEnd()}...` : text;
}

function formatCompactDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatTimeRange(s: string, e: string) {
  const a = formatTime(s), b = formatTime(e);
  if (!a) return "Time unavailable";
  return (!b || a === b) ? a : `${a} – ${b}`;
}

const PLATFORM_NAMES = new Set(["google meet", "zoom", "teams", "microsoft teams"]);

function getDisplayTitle(m: MeetingSessionRecord): string {
  const raw = m.title?.trim() ?? "";
  if (raw && !PLATFORM_NAMES.has(raw.toLowerCase())) return raw;
  const date = m.scheduledStartTime ?? m.createdAt;
  if (date) {
    const d = new Date(date);
    if (!Number.isNaN(d.getTime())) return `Meeting on ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  }
  return "Untitled Meeting";
}

function getPlatformLabel(meeting: { provider: string; meetLink?: string | null }) {
  const url = meeting.meetLink?.toLowerCase() ?? "";
  if (url.includes("zoom.us")) return "Zoom";
  if (url.includes("teams.microsoft.com")) return "Teams";
  if (meeting.provider === "microsoft_teams") return "Teams";
  if (meeting.provider === "microsoft_outlook") return "Outlook";
  return "Google";
}

function getPlatformStyle(meeting: { provider: string; meetLink?: string | null }) {
  const label = getPlatformLabel(meeting);
  if (label === "Zoom") return { bg: "#E3F2FD", color: "#2D8CFF" };
  if (label === "Teams") return { bg: "#EDE7F6", color: "#6264A7" };
  if (label === "Outlook") return { bg: "#E3F2FD", color: "#0078D4" };
  return { bg: "#E8F5E9", color: "#00AC47" };
}

function getStatusBadge(status: string) {
  switch (status) {
    case "completed": return { bg: "#E6F4EA", color: "#137333", label: "Ready" };
    case "processing": case "summarizing": return { bg: "#FEF7E0", color: "#B06000", label: "Processing" };
    case "failed": return { bg: "#FCE8E6", color: "#C5221F", label: "Failed" };
    default: return { bg: "#EDE9FE", color: "#6C3FF5", label: "Upcoming" };
  }
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, helper, icon, iconBg, iconColor, trend }: {
  label: string; value: number | string; helper: string;
  icon: string; iconBg: string; iconColor: string; trend?: string;
}) {
  return (
    <div className="bg-white border border-[#DADCE0] rounded-xl p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#5F6368]">{label}</span>
        <div className="p-2 rounded-lg" style={{ background: iconBg }}>
          <span className="material-symbols-outlined text-[20px]" style={{ color: iconColor }}>{icon}</span>
        </div>
      </div>
      <h3 className="text-2xl font-bold text-[#202124]">{value}</h3>
      {trend ? (
        <p className="text-xs text-[#34A853] mt-1 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
          {trend}
        </p>
      ) : (
        <p className="text-xs text-[#5F6368] mt-1">{helper}</p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useUser();
  const { activeWorkspaceId, activeWorkspace } = useWorkspaceContext();
  const apiFetch = useApiFetch();
  const isAuthReady = useIsAuthReady();
  const [reports, setReports] = useState<MeetingSessionRecord[]>([]);
  const [todayMeetings, setTodayMeetings] = useState<UnifiedCalendarMeeting[]>([]);
  const [calendarPartialFailure, setCalendarPartialFailure] = useState<Array<{ provider: string; error: string }>>([]);
  const [noCalendarConnected, setNoCalendarConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchJoinedMeetings(): Promise<MeetingSessionRecord[]> {
    const response = await apiFetch("/api/meetings/joined", { cache: "no-store" });
    const payload = (await response.json()) as MeetingSessionListResponse | MeetingSessionErrorResponse;
    if (!response.ok || !payload.success) throw new Error("message" in payload ? payload.message : "Failed to load.");
    return payload.meetings;
  }

  async function loadDashboard() {
    setIsLoading(true); setError(null);
    try {
      if (activeWorkspaceId) {
        const res = await apiFetch(`/api/workspace/${activeWorkspaceId}/meetings`);
        const data = await res.json() as { success: boolean; meetings: MeetingSessionRecord[] };
        setReports(data.meetings ?? []); setTodayMeetings([]); setCalendarPartialFailure([]); setNoCalendarConnected(false);
      } else {
        const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
        const [joined, feedRes] = await Promise.all([
          fetchJoinedMeetings(),
          fetchUnifiedCalendarFeed(startOfToday, endOfToday).catch(() => ({ meetings: [], partialFailure: undefined })),
        ]);
        setReports(joined);
        const sorted = [...feedRes.meetings].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()).slice(0, 5);
        setTodayMeetings(sorted);
        setCalendarPartialFailure(feedRes.partialFailure?.failedProviders ?? []);
        setNoCalendarConnected(feedRes.meetings.length === 0 && !feedRes.partialFailure);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard.");
    } finally { setIsLoading(false); }
  }

  useEffect(() => {
    if (!isAuthReady) return;
    let mounted = true;
    void (async () => {
      setIsLoading(true); setError(null);
      try {
        if (activeWorkspaceId) {
          const res = await apiFetch(`/api/workspace/${activeWorkspaceId}/meetings`);
          const data = await res.json() as { success: boolean; meetings: MeetingSessionRecord[] };
          if (!mounted) return;
          setReports(data.meetings ?? []); setTodayMeetings([]); setCalendarPartialFailure([]); setNoCalendarConnected(false);
        } else {
          const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
          const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
          const [joined, feedRes] = await Promise.all([
            fetchJoinedMeetings(),
            fetchUnifiedCalendarFeed(startOfToday, endOfToday).catch(() => ({ meetings: [], partialFailure: undefined })),
          ]);
          if (!mounted) return;
          setReports(joined);
          const sorted = [...feedRes.meetings].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()).slice(0, 5);
          setTodayMeetings(sorted);
          setCalendarPartialFailure(feedRes.partialFailure?.failedProviders ?? []);
          setNoCalendarConnected(feedRes.meetings.length === 0 && !feedRes.partialFailure);
        }
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Failed to load.");
      } finally { if (mounted) setIsLoading(false); }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId, isAuthReady]);

  const meetingsWithContent = reports.filter(hasContent);
  const completedCount = meetingsWithContent.length;
  const meetingsThisMonth = reports.filter((m) => {
    const d = new Date(m.scheduledStartTime ?? m.createdAt);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const totalActionItems = reports.reduce((sum, m) => sum + (m.actionItems?.length ?? 0), 0);
  const pendingActionItems = reports.reduce((sum, m) => sum + (m.actionItems?.filter(a => a.status !== "done").length ?? 0), 0);
  const recentReports = reports.filter(hasContent).slice(0, 5);

  const stats = [
    { label: "Total Meetings", value: reports.length, helper: "All time", icon: "videocam", iconBg: "#EDE9FE", iconColor: "#6C3FF5", trend: undefined },
    { label: "This Month", value: meetingsThisMonth, helper: "Consistent with average", icon: "calendar_month", iconBg: "#E6F4EA", iconColor: "#34A853", trend: undefined },
    { label: "Action Items", value: totalActionItems, helper: `${pendingActionItems} pending`, icon: "assignment_turned_in", iconBg: "#FEF7E0", iconColor: "#B06000", trend: undefined },
    { label: "Completed", value: completedCount, helper: "With full summaries", icon: "task_alt", iconBg: "#F1F3F4", iconColor: "#5F6368", trend: undefined },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0,1,2,3].map(i => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-white border border-[#DADCE0]" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2 h-80 animate-pulse rounded-xl bg-white border border-[#DADCE0]" />
          <div className="h-80 animate-pulse rounded-xl bg-white border border-[#DADCE0]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rounded-xl border border-[#FCE8E6] bg-[#FCE8E6] p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-[#C5221F]">{error}</p>
          <button onClick={() => void loadDashboard()} className="rounded-lg border border-[#EA4335] bg-white px-4 py-2 text-sm font-semibold text-[#EA4335] hover:bg-[#FCE8E6] transition-colors">Retry</button>
        </div>
      )}

      {/* ── Main content grid ── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">

        {/* Today's Meetings */}
        <div className="xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-section-heading text-[#202124]">
              {activeWorkspaceId ? "Workspace Meetings" : "Today's Meetings"}
            </h2>
            <Link href="/dashboard/meetings" className="text-xs font-semibold text-[#6C3FF5] hover:underline uppercase tracking-wider">
              View Calendar
            </Link>
          </div>

          {!activeWorkspaceId && todayMeetings.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {todayMeetings.map((meeting) => {
                const session = findSessionForMeeting(meeting, reports);
                const status = getMeetingDisplayStatus(meeting, session);
                const platformStyle = getPlatformStyle(meeting);
                const platformLabel = getPlatformLabel(meeting);
                const timeRange = formatTimeRange(meeting.startTime, meeting.endTime);
                return (
                  <a
                    key={meeting.id}
                    href={`/dashboard/meetings/${encodeCalendarMeetingId(meeting.id)}`}
                    className="bg-white border border-[#DADCE0] rounded-xl p-6 flex flex-col hover:border-[#6C3FF5]/50 hover:shadow-md transition-all"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full border flex items-center gap-1"
                        style={{ background: platformStyle.bg, color: platformStyle.color, borderColor: `${platformStyle.color}33` }}>
                        <span className="material-symbols-outlined text-[12px]">videocam</span>
                        {platformLabel.toUpperCase()}
                      </span>
                      <span className="text-xs font-semibold text-[#5F6368]">{timeRange}</span>
                    </div>
                    <h4 className="font-semibold text-[#202124] mb-2 line-clamp-1">{meeting.title}</h4>
                    <div className="mt-auto flex items-center justify-between">
                      <span className="text-xs px-2 py-0.5 rounded font-semibold"
                        style={{ background: status.bg, color: status.color }}>
                        {status.label}
                      </span>
                      <button className="bg-[#6C3FF5] hover:bg-[#5B2FE0] text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm flex items-center gap-1.5 transition-colors">
                        <span className="material-symbols-outlined text-[14px]">smart_toy</span>
                        Start AI Notetaker
                      </button>
                    </div>
                  </a>
                );
              })}
            </div>
          ) : !activeWorkspaceId && noCalendarConnected ? (
            <div className="bg-white border border-dashed border-[#DADCE0] rounded-xl p-12 flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-[#F1F3F4] rounded-full flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-[#5F6368] text-2xl">event_upcoming</span>
              </div>
              <h5 className="font-semibold text-[#202124] mb-1">No calendar connected</h5>
              <p className="text-sm text-[#5F6368] max-w-xs mb-4">Connect your calendar to see today&apos;s meetings here.</p>
              <Link href="/dashboard/integrations" className="bg-[#6C3FF5] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#5B2FE0] transition-colors">
                Connect Calendar
              </Link>
            </div>
          ) : !activeWorkspaceId ? (
            <div className="bg-white border border-dashed border-[#DADCE0] rounded-xl p-12 flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-[#F1F3F4] rounded-full flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-[#5F6368] text-2xl">event_upcoming</span>
              </div>
              <h5 className="font-semibold text-[#202124]">No meetings scheduled today</h5>
              <p className="text-sm text-[#5F6368] mt-1">Your calendar is clear. Great time to catch up on action items!</p>
            </div>
          ) : null}

          {/* Recent Reports */}
          <div className="flex items-center justify-between mt-6">
            <h2 className="font-section-heading text-[#202124]">Recent Reports</h2>
            <div className="flex gap-2">
              <button className="p-2 border border-[#DADCE0] bg-white rounded-lg hover:bg-[#F1F3F4] transition-colors">
                <span className="material-symbols-outlined text-[20px] text-[#5F6368]">filter_list</span>
              </button>
              <button className="p-2 border border-[#DADCE0] bg-white rounded-lg hover:bg-[#F1F3F4] transition-colors">
                <span className="material-symbols-outlined text-[20px] text-[#5F6368]">download</span>
              </button>
            </div>
          </div>

          <div className="bg-white border border-[#DADCE0] rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8F9FA] border-b border-[#DADCE0]">
                  <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#5F6368]">Meeting Title</th>
                  <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#5F6368]">Date</th>
                  <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#5F6368]">Status</th>
                  <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#5F6368]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DADCE0]">
                {recentReports.length > 0 ? recentReports.map((meeting) => {
                  const badge = getStatusBadge(meeting.status);
                  const displayTitle = getDisplayTitle(meeting);
                  const preview = getSummaryPreview(meeting.summary);
                  return (
                    <tr key={meeting.id} className="hover:bg-[#F8F9FA] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-[#EDE9FE] flex items-center justify-center">
                            <span className="material-symbols-outlined text-[#6C3FF5] text-lg">description</span>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[#202124]">{displayTitle}</p>
                            {preview && <p className="text-xs text-[#5F6368] truncate max-w-[200px]">{preview}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-[#5F6368]">{formatCompactDate(meeting.scheduledStartTime ?? meeting.createdAt)}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 rounded text-[11px] font-bold uppercase tracking-wider"
                          style={{ background: badge.bg, color: badge.color }}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {meeting.status === "completed" ? (
                          <Link href={`/dashboard/meetings/${meeting.id}` as Route}
                            className="text-[#6C3FF5] font-semibold text-xs hover:bg-[#EDE9FE] px-3 py-1.5 rounded-lg transition-colors border border-[#6C3FF5]/20">
                            View Report
                          </Link>
                        ) : meeting.status === "failed" ? (
                          <button className="text-[#EA4335] font-semibold text-xs hover:bg-[#FCE8E6] px-3 py-1.5 rounded-lg transition-colors border border-[#EA4335]/20">
                            Retry
                          </button>
                        ) : (
                          <span className="text-[#5F6368] text-xs opacity-50">Processing...</span>
                        )}
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <span className="material-symbols-outlined text-[#DADCE0] text-4xl">description</span>
                        <p className="text-sm text-[#5F6368]">No reports yet. Start AI Notetaker on a meeting.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {recentReports.length > 0 && (
              <div className="bg-[#F8F9FA] px-6 py-3 border-t border-[#DADCE0] flex items-center justify-between">
                <p className="text-xs text-[#5F6368]">Showing {recentReports.length} of {reports.length} reports</p>
                <Link href="/dashboard/reports" className="text-xs font-semibold text-[#6C3FF5] hover:underline flex items-center gap-1">
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Personal Insights */}
          <div className="bg-gradient-to-br from-[#6C3FF5] to-[#5B2FE0] rounded-xl p-6 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 opacity-10">
              <span className="material-symbols-outlined text-[80px]">bolt</span>
            </div>
            <h4 className="font-semibold text-lg mb-2">Weekly Efficiency</h4>
            <div className="flex items-end gap-2 mb-4">
              <span className="text-4xl font-bold">{completedCount > 0 ? Math.round((completedCount / Math.max(reports.length, 1)) * 100) : 0}%</span>
              <span className="text-xs mb-1.5 opacity-80">completion rate</span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-2 mb-4">
              <div className="bg-white h-full rounded-full transition-all" style={{ width: `${completedCount > 0 ? Math.round((completedCount / Math.max(reports.length, 1)) * 100) : 0}%` }} />
            </div>
            <p className="text-xs opacity-90">
              {totalActionItems} action items extracted from {reports.length} meeting{reports.length !== 1 ? "s" : ""}.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="bg-white border border-[#DADCE0] rounded-xl p-4">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#5F6368] mb-3">Quick Actions</h4>
            <div className="space-y-2">
              <Link href="/dashboard/meetings"
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-[#DADCE0] hover:bg-[#F8F9FA] transition-all text-left group">
                <span className="material-symbols-outlined text-[#6C3FF5]">mic_external_on</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#202124]">Record Live Audio</p>
                  <p className="text-xs text-[#5F6368]">Direct transcript upload</p>
                </div>
                <span className="material-symbols-outlined text-sm text-[#DADCE0] group-hover:text-[#6C3FF5] transition-colors">chevron_right</span>
              </Link>
              <Link href="/dashboard/integrations"
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-[#DADCE0] hover:bg-[#F8F9FA] transition-all text-left group">
                <span className="material-symbols-outlined text-[#34A853]">cloud_upload</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#202124]">Connect Calendar</p>
                  <p className="text-xs text-[#5F6368]">Google, Teams, Outlook</p>
                </div>
                <span className="material-symbols-outlined text-sm text-[#DADCE0] group-hover:text-[#6C3FF5] transition-colors">chevron_right</span>
              </Link>
            </div>
          </div>

          {/* Calendar partial failure warning */}
          {calendarPartialFailure.length > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-[#FEF7E0] bg-[#FEF7E0] px-4 py-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-[#B06000]" />
              <p className="text-xs text-[#B06000]">Some calendars couldn&apos;t be loaded</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
