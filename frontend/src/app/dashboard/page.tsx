"use client";

import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import type { Route } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, ClipboardList, Sparkles, TrendingUp, Video, Zap } from "lucide-react";
import { SkeletonList } from "@/components/SkeletonCard";
import { fetchUnifiedCalendarFeed } from "@/features/meetings/api";
import { encodeCalendarMeetingId } from "@/features/meetings/ids";
import { getMeetingDisplayStatus, findSessionForMeeting } from "@/features/meetings/meeting-status";
import type { MeetingSessionRecord } from "@/features/meeting-assistant/types";
import type { UnifiedCalendarMeeting } from "@/lib/calendar/types";
import { cn } from "@/lib/utils";
import { useWorkspaceContext } from "@/contexts/workspace-context";
import { useWorkspaceFetch } from "@/hooks/useWorkspaceFetch";
import type { MeetingSessionListResponse, MeetingSessionErrorResponse } from "@/features/meeting-assistant/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

const getGreeting = () => {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 17) return "Good afternoon";
  if (h >= 17 && h < 21) return "Good evening";
  return "Good night";
};

function hasContent(m: MeetingSessionRecord) {
  const summary = m.summary?.trim() ?? "";
  const transcript = m.transcript?.trim() ?? "";
  const errorPhrases = ["not enough content", "summary generation failed", "googlegenerativeai", "error fetching"];
  const summaryIsError = errorPhrases.some((p) => summary.toLowerCase().includes(p));
  return (summary.length > 0 && !summaryIsError) || transcript.length > 0 || m.status === "completed" || (m.keyPoints?.length ?? 0) > 0 || (m.actionItems?.length ?? 0) > 0;
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

function getMeetingDetailHref(m: UnifiedCalendarMeeting) {
  return `/dashboard/meetings/${encodeCalendarMeetingId(m.id)}`;
}

function getPlatformFromMeeting(meeting: { provider: string; meetLink?: string | null }) {
  const url = meeting.meetLink?.toLowerCase() ?? "";
  if (url.includes("zoom.us") || url.includes("zoom.com")) return "zoom";
  if (url.includes("teams.microsoft.com") || url.includes("teams.live.com")) return "teams";
  if (url.includes("meet.google.com")) return "google";
  if (meeting.provider === "microsoft_teams") return "teams";
  if (meeting.provider === "microsoft_outlook") return "outlook";
  return "google";
}

function getPlatformLabel(meeting: { provider: string; meetLink?: string | null }) {
  const p = getPlatformFromMeeting(meeting);
  if (p === "zoom") return "Zoom";
  if (p === "teams") return "Teams";
  if (p === "outlook") return "Outlook";
  return "Google";
}

function getPlatformStyle(meeting: { provider: string; meetLink?: string | null }) {
  const p = getPlatformFromMeeting(meeting);
  if (p === "zoom") return { bg: "#e3f2fd", color: "#2D8CFF" };
  if (p === "teams") return { bg: "#ede7f6", color: "#6264A7" };
  if (p === "outlook") return { bg: "#e3f2fd", color: "#0078D4" };
  return { bg: "#e8f5e9", color: "#16a34a" };
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, helper, icon, gradient, textColor }: {
  label: string; value: number; helper: string;
  icon: React.ReactNode; gradient: string; textColor: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-6 ${gradient} transition-all hover:scale-[1.02] hover:shadow-lg`}>
      <div className="flex items-start justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
          <span className="text-white">{icon}</span>
        </div>
        <TrendingUp className="h-4 w-4 text-white/40" />
      </div>
      <div className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60">{label}</p>
        <p className="mt-1 text-4xl font-bold text-white">{value}</p>
        <p className="mt-1.5 text-[12px] text-white/70">{helper}</p>
      </div>
      {/* Decorative circle */}
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
      <div className="absolute -bottom-8 -right-2 h-20 w-20 rounded-full bg-white/5" />
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useUser();
  const { activeWorkspaceId, activeWorkspace } = useWorkspaceContext();
  const workspaceFetch = useWorkspaceFetch();
  const [reports, setReports] = useState<MeetingSessionRecord[]>([]);
  const [todayMeetings, setTodayMeetings] = useState<UnifiedCalendarMeeting[]>([]);
  const [calendarPartialFailure, setCalendarPartialFailure] = useState<Array<{ provider: string; error: string }>>([]);
  const [noCalendarConnected, setNoCalendarConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchJoinedMeetingsWithContext(): Promise<MeetingSessionRecord[]> {
    const response = await workspaceFetch("/api/meetings/joined", { cache: "no-store" });
    const payload = (await response.json()) as MeetingSessionListResponse | MeetingSessionErrorResponse;
    if (!response.ok || !payload.success) throw new Error("message" in payload ? payload.message : "Failed to load.");
    return payload.meetings;
  }

  async function loadDashboard() {
    setIsLoading(true); setError(null);
    try {
      if (activeWorkspaceId) {
        const res = await fetch(`/api/workspace/${activeWorkspaceId}/meetings`);
        const data = await res.json() as { success: boolean; meetings: MeetingSessionRecord[] };
        setReports(data.meetings ?? []); setTodayMeetings([]); setCalendarPartialFailure([]); setNoCalendarConnected(false);
      } else {
        const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
        const [joined, feedRes] = await Promise.all([
          fetchJoinedMeetingsWithContext(),
          fetchUnifiedCalendarFeed(startOfToday, endOfToday).catch(() => ({ meetings: [], partialFailure: undefined })),
        ]);
        setReports(joined);
        const sorted = [...feedRes.meetings].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()).slice(0, 5);
        setTodayMeetings(sorted);
        setCalendarPartialFailure(feedRes.partialFailure?.failedProviders ?? []);
        // No calendar connected = empty meetings AND no partial failures (meaning no providers were even tried)
        setNoCalendarConnected(feedRes.meetings.length === 0 && !feedRes.partialFailure);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard.");
      setReports([]); setTodayMeetings([]); setCalendarPartialFailure([]); setNoCalendarConnected(false);
    } finally { setIsLoading(false); }
  }

  useEffect(() => {
    let mounted = true;
    void (async () => {
      setIsLoading(true); setError(null);
      try {
        if (activeWorkspaceId) {
          const res = await fetch(`/api/workspace/${activeWorkspaceId}/meetings`);
          const data = await res.json() as { success: boolean; meetings: MeetingSessionRecord[] };
          if (!mounted) return;
          setReports(data.meetings ?? []); setTodayMeetings([]); setCalendarPartialFailure([]); setNoCalendarConnected(false);
        } else {
          const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
          const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
          const [joined, feedRes] = await Promise.all([
            fetchJoinedMeetingsWithContext(),
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
        if (mounted) { setError(err instanceof Error ? err.message : "Failed to load."); setReports([]); setTodayMeetings([]); setCalendarPartialFailure([]); setNoCalendarConnected(false); }
      } finally { if (mounted) setIsLoading(false); }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);

  const greeting = useMemo(() => getGreeting(), []);
  const meetingsWithContent = reports.filter(hasContent);
  const completedCount = meetingsWithContent.length;
  const meetingsThisWeek = reports.filter((m) => new Date(m.scheduledStartTime ?? m.createdAt).getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000).length;
  const totalActionItems = reports.reduce((sum, m) => sum + (m.actionItems?.length ?? 0), 0);
  const recentReports = reports.filter(hasContent).slice(0, 5);

  const mondayDate = (() => {
    const d = new Date(); const day = d.getDay(); const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  })();

  const stats = [
    { label: "Meetings Recorded", value: reports.length, helper: `${completedCount} with transcripts`, icon: <Video className="h-5 w-5" />, gradient: "bg-gradient-to-br from-[#6c63ff] to-[#9b8fff]", textColor: "#6c63ff" },
    { label: "This Week", value: meetingsThisWeek, helper: `Since ${mondayDate}`, icon: <CalendarDays className="h-5 w-5" />, gradient: "bg-gradient-to-br from-[#2563eb] to-[#60a5fa]", textColor: "#2563eb" },
    { label: "Action Items", value: totalActionItems, helper: `Across ${reports.length} meeting${reports.length !== 1 ? "s" : ""}`, icon: <ClipboardList className="h-5 w-5" />, gradient: "bg-gradient-to-br from-[#059669] to-[#34d399]", textColor: "#059669" },
    { label: "Completed", value: completedCount, helper: "With full summaries", icon: <CheckCircle2 className="h-5 w-5" />, gradient: "bg-gradient-to-br from-[#d97706] to-[#fbbf24]", textColor: "#d97706" },
  ];

  const avatarColors = ["bg-[#f5f3ff] text-[#6c63ff]", "bg-[#eff6ff] text-[#2563eb]", "bg-[#f0fdf4] text-[#16a34a]", "bg-[#fefce8] text-[#ca8a04]", "bg-[#fff1f2] text-[#f97316]"];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
        <div className="grid grid-cols-4 gap-4">
          {[0,1,2,3].map(i => <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>
        <SkeletonList count={3} />
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* ── Hero greeting banner ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1e1b4b] via-[#312e81] to-[#4c1d95] px-8 py-8">
        {/* Decorative blobs */}
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[#6c63ff]/20 blur-3xl" />
        <div className="absolute -bottom-12 left-1/3 h-48 w-48 rounded-full bg-purple-400/10 blur-2xl" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-yellow-300" />
              <p className="text-sm font-semibold text-purple-200">
                {activeWorkspaceId && activeWorkspace ? activeWorkspace.name : "Personal Space"}
              </p>
            </div>
            <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">
              {greeting}, {user?.firstName || "there"} 👋
            </h1>
            <p className="mt-1 text-sm text-purple-300">
              {activeWorkspaceId
                ? "Here's your workspace meeting intelligence."
                : "Here's your meeting intelligence overview."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/meetings"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm hover:bg-white/20 transition-colors">
              <CalendarDays className="h-4 w-4" /> Meetings
            </Link>
            <Link href="/dashboard/reports"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm hover:bg-white/20 transition-colors">
              <Zap className="h-4 w-4" /> Reports
            </Link>
          </div>
        </div>
      </div>

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => void loadDashboard()} className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors">Retry</button>
        </div>
      )}

      {/* ── Main content grid ── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">

        {/* Recent Reports — 3 cols */}
        <div className="col-span-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:col-span-3">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div>
              <p className="text-sm font-bold text-slate-900">Recent Reports</p>
              <p className="mt-0.5 text-xs text-slate-400">Last 5 meetings with summaries</p>
            </div>
            <Link href="/dashboard/reports" className="inline-flex items-center gap-1 text-xs font-semibold text-[#6c63ff] hover:text-[#5b52ee] transition-colors">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-slate-50">
            {recentReports.length > 0 ? recentReports.map((meeting, index) => {
              const preview = getSummaryPreview(meeting.summary);
              const displayTitle = getDisplayTitle(meeting);
              return (
                <Link key={meeting.id} href={`/dashboard/meetings/${meeting.id}` as Route}
                  className="group flex items-start gap-4 px-6 py-4 transition-colors hover:bg-[#faf9ff]">
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold", avatarColors[index % avatarColors.length])}>
                    {displayTitle.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">{displayTitle}</p>
                      <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">✓</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">{formatCompactDate(meeting.scheduledStartTime ?? meeting.createdAt)}</p>
                    {preview && <p className="mt-0.5 truncate text-xs text-slate-500">{preview}</p>}
                  </div>
                  <span className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 opacity-0 transition-all group-hover:opacity-100 group-hover:border-[#6c63ff]/30 group-hover:text-[#6c63ff]">
                    View
                  </span>
                </Link>
              );
            }) : (
              <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                  <Video className="h-7 w-7 text-slate-300" />
                </div>
                <p className="text-sm font-semibold text-slate-700">No reports yet</p>
                <p className="text-xs text-slate-400">Start AI Notetaker on a meeting to generate your first report.</p>
                <Link href="/dashboard/meetings" className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-[#6c63ff] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5b52e0] transition-colors">
                  Go to Meetings <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Today / Workspace Meetings — 2 cols */}
        <div className="col-span-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div>
              <p className="text-sm font-bold text-slate-900">
                {activeWorkspaceId ? "Shared Meetings" : "Today's Meetings"}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {activeWorkspaceId
                  ? "Shared to this workspace"
                  : new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
              </p>
            </div>
            <Link href="/dashboard/meetings" className="inline-flex items-center gap-1 text-xs font-semibold text-[#6c63ff] hover:text-[#5b52ee] transition-colors">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-slate-50">
            {activeWorkspaceId ? (
              reports.slice(0, 5).length > 0 ? reports.slice(0, 5).map((meeting, index) => {
                const displayTitle = getDisplayTitle(meeting);
                return (
                  <Link key={meeting.id} href={`/dashboard/meetings/${meeting.id}` as Route}
                    className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[#faf9ff]">
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold", avatarColors[index % avatarColors.length])}>
                      {displayTitle.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{displayTitle}</p>
                      <p className="text-xs text-slate-400">{formatCompactDate(meeting.scheduledStartTime ?? meeting.createdAt)}</p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 group-hover:text-[#6c63ff]" />
                  </Link>
                );
              }) : (
                <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                    <CalendarDays className="h-6 w-6 text-slate-300" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">No shared meetings</p>
                  <p className="text-xs text-slate-400">Admin can share meetings to this workspace.</p>
                </div>
              )
            ) : (
              todayMeetings.length > 0 ? (
                <>
                  {calendarPartialFailure.length > 0 && (
                    <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-5 py-2.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                      <p className="text-xs text-amber-700">Some calendars couldn&apos;t be loaded</p>
                    </div>
                  )}
                  {todayMeetings.map((meeting) => {
                    const session = findSessionForMeeting(meeting, reports);
                    const status = getMeetingDisplayStatus(meeting, session);
                    const platformStyle = getPlatformStyle(meeting);
                    const platformLabel = getPlatformLabel(meeting);
                    const timeRange = formatTimeRange(meeting.startTime, meeting.endTime);
                    return (
                      <a key={meeting.id} href={getMeetingDetailHref(meeting)}
                        className="group block px-5 py-3.5 transition-colors hover:bg-[#faf9ff]">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: platformStyle.bg, color: platformStyle.color }}>{platformLabel}</span>
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: status.bg, color: status.color }}>
                              {status.pulse && <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ backgroundColor: status.color }} />}
                              {status.label}
                            </span>
                          </div>
                          <ArrowRight className="h-3.5 w-3.5 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 group-hover:text-[#6c63ff]" />
                        </div>
                        <p className="mt-1.5 truncate text-sm font-semibold text-slate-900">{meeting.title}</p>
                        <p className="mt-0.5 text-xs text-slate-400">{timeRange}</p>
                      </a>
                    );
                  })}
                </>
              ) : noCalendarConnected ? (
                <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                    <CalendarDays className="h-6 w-6 text-slate-300" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">No calendar connected</p>
                  <p className="text-xs text-slate-400">Connect a calendar to see today&apos;s meetings.</p>
                  <Link href="/dashboard/integrations" className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-[#6c63ff] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5b52e0] transition-colors">
                    Connect a calendar <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
                  {calendarPartialFailure.length > 0 && (
                    <div className="mb-2 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                      <p className="text-xs text-amber-700">Some calendars couldn&apos;t be loaded</p>
                    </div>
                  )}
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                    <CalendarDays className="h-6 w-6 text-slate-300" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">No meetings today</p>
                  <p className="text-xs text-slate-400">Your calendar is clear for today.</p>
                </div>
              )
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
