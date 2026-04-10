"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useUser } from "@clerk/nextjs";
import type { Route } from "next";
import Link from "next/link";
import { CalendarDays, CheckCircle2, ClipboardList, Video } from "lucide-react";
import { SkeletonList } from "@/components/SkeletonCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchTodayMeetings } from "@/features/meetings/api";
import { encodeCalendarMeetingId } from "@/features/meetings/ids";
import { getMeetingDisplayStatus, findSessionForMeeting } from "@/features/meetings/meeting-status";
import type { MeetingSessionRecord } from "@/features/meeting-assistant/types";
import type { GoogleCalendarMeeting } from "@/lib/google/types";
import { cn } from "@/lib/utils";
import { useWorkspaceContext } from "@/contexts/workspace-context";
import { useWorkspaceFetch } from "@/hooks/useWorkspaceFetch";
import type { MeetingSessionListResponse, MeetingSessionErrorResponse } from "@/features/meeting-assistant/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 21) return "Good evening";
  return "Good night";
};

function hasContent(m: MeetingSessionRecord) {
  // Include if has summary, transcript, or is completed/has any processed content
  const summary = m.summary?.trim() ?? "";
  const transcript = m.transcript?.trim() ?? "";
  const errorPhrases = ["not enough content", "summary generation failed", "googlegenerativeai", "error fetching"];
  const summaryIsError = errorPhrases.some((p) => summary.toLowerCase().includes(p));
  return (
    (summary.length > 0 && !summaryIsError) ||
    transcript.length > 0 ||
    m.status === "completed" ||
    m.keyPoints.length > 0 ||
    m.actionItems.length > 0
  );
}

/** Returns a clean summary preview or null if it's an error/too short */
function getSummaryPreview(summary: string | null): string | null {
  if (!summary) return null;
  const text = summary.replace(/\s+/g, " ").trim();
  const errorPhrases = [
    "not enough content",
    "summary generation failed",
    "googlegenerativeai",
    "error fetching",
    "404",
    "failed:",
  ];
  if (
    errorPhrases.some((p) => text.toLowerCase().includes(p)) ||
    text.length < 20
  ) {
    return null;
  }
  return text.length > 120 ? `${text.slice(0, 117).trimEnd()}...` : text;
}

function formatCompactDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatTimeRange(startTime: string, endTime: string) {
  const s = formatTime(startTime);
  const e = formatTime(endTime);
  if (!s) return "Time unavailable";
  if (!e || s === e) return s;
  return `${s} – ${e}`;
}

const PLATFORM_NAMES = new Set(["google meet", "zoom", "teams", "microsoft teams"]);

/** If the stored title is just a platform name, derive a better display title */
function getDisplayTitle(meeting: MeetingSessionRecord): string {
  const raw = meeting.title?.trim() ?? "";
  if (raw && !PLATFORM_NAMES.has(raw.toLowerCase())) {
    return raw;
  }
  // Fallback: use date
  const date = meeting.scheduledStartTime ?? meeting.createdAt;
  if (date) {
    const d = new Date(date);
    if (!Number.isNaN(d.getTime())) {
      return `Meeting on ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    }
  }
  return "Untitled Meeting";
}

function getMeetingDetailHref(meeting: GoogleCalendarMeeting) {
  return `/dashboard/meetings/${encodeCalendarMeetingId(meeting.id)}`;
}

function getPlatformLabel(provider: string) {
  if (provider === "zoom_web") return "Zoom";
  if (provider === "teams_web") return "Teams";
  return "Google Meet";
}

function getPlatformStyle(provider: string): { bg: string; color: string } {
  if (provider === "zoom_web") return { bg: "#e3f2fd", color: "#2D8CFF" };
  if (provider === "teams_web") return { bg: "#ede7f6", color: "#6264A7" };
  return { bg: "#e8f5e9", color: "#16a34a" };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  helper,
  icon,
  accent,
  iconBg,
}: {
  label: string;
  value: number;
  helper: string;
  icon: ReactNode;
  accent: string;
  iconBg: string;
}) {
  return (
    <Card
      className="rounded-2xl border border-gray-100 bg-white p-6 transition-all hover:shadow-md"
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      <div className="space-y-4">
        <span
          className="flex h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: iconBg, color: accent }}
        >
          {icon}
        </span>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
            {label}
          </p>
          <p className="mt-1 text-[38px] font-bold leading-none text-gray-900">{value}</p>
          <p className="mt-2 text-[13px] text-gray-500">{helper}</p>
        </div>
      </div>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useUser();
  const { activeWorkspaceId, activeWorkspace } = useWorkspaceContext();
  const workspaceFetch = useWorkspaceFetch();
  const [reports, setReports] = useState<MeetingSessionRecord[]>([]);
  const [todayMeetings, setTodayMeetings] = useState<GoogleCalendarMeeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchJoinedMeetingsWithContext(): Promise<MeetingSessionRecord[]> {
    const response = await workspaceFetch("/api/meetings/joined", { cache: "no-store" });
    const payload = (await response.json()) as MeetingSessionListResponse | MeetingSessionErrorResponse;
    if (!response.ok || !payload.success) {
      throw new Error("message" in payload ? payload.message : "Failed to load joined meetings.");
    }
    return payload.meetings;
  }

  async function loadDashboard() {
    setIsLoading(true);
    setError(null);
    try {
      if (activeWorkspaceId) {
        const res = await fetch(`/api/workspace/${activeWorkspaceId}/meetings`);
        const data = await res.json() as { success: boolean; meetings: MeetingSessionRecord[] };
        setReports(data.meetings ?? []);
        setTodayMeetings([]);
      } else {
        const [joined, todayRes] = await Promise.all([
          fetchJoinedMeetingsWithContext(),
          fetchTodayMeetings().catch(() => ({ status: "connected" as const, meetings: [] })),
        ]);
        setReports(joined);
        const sorted = [...todayRes.meetings].sort(
          (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );
        setTodayMeetings(sorted.slice(0, 5));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard.");
      setReports([]);
      setTodayMeetings([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    void (async () => {
      setIsLoading(true);
      setError(null);
      try {
        if (activeWorkspaceId) {
          // Workspace mode: fetch shared meetings from workspace API, no calendar
          const res = await fetch(`/api/workspace/${activeWorkspaceId}/meetings`);
          const data = await res.json() as { success: boolean; meetings: MeetingSessionRecord[] };
          if (!mounted) return;
          setReports(data.meetings ?? []);
          setTodayMeetings([]); // no calendar in workspace mode
        } else {
          // Personal mode: fetch joined meetings + Google Calendar
          const [joined, todayRes] = await Promise.all([
            fetchJoinedMeetingsWithContext(),
            fetchTodayMeetings().catch(() => ({ status: "connected" as const, meetings: [] })),
          ]);
          if (!mounted) return;
          setReports(joined);
          const sorted = [...todayRes.meetings].sort(
            (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
          );
          setTodayMeetings(sorted.slice(0, 5));
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load dashboard.");
          setReports([]);
          setTodayMeetings([]);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);

  const greeting = useMemo(() => getGreeting(), []);

  // Stats derived from reports (already sorted DESC by createdAt from API)
  const meetingsWithContent = reports.filter(hasContent);
  const completedCount = meetingsWithContent.length;
  const meetingsThisWeek = reports.filter((m) => {
    const ts = new Date(m.scheduledStartTime ?? m.createdAt).getTime();
    return ts >= Date.now() - 7 * 24 * 60 * 60 * 1000;
  }).length;
  const totalActionItems = reports.reduce((sum, m) => sum + m.actionItems.length, 0);

  // Recent reports: meetings with content, newest first, max 5
  // API already returns DESC by createdAt, so just filter + slice
  const recentReports = reports.filter(hasContent).slice(0, 5);

  const mondayDate = (() => {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  })();

  const stats = [
    {
      label: "Total Meetings Recorded",
      value: reports.length,
      helper: `${completedCount} with transcripts`,
      icon: <Video className="h-5 w-5" />,
      accent: "#6c63ff",
      iconBg: "#f5f3ff",
    },
    {
      label: "Meetings This Week",
      value: meetingsThisWeek,
      helper: `Since ${mondayDate}`,
      icon: <CalendarDays className="h-5 w-5" />,
      accent: "#2563eb",
      iconBg: "#eff6ff",
    },
    {
      label: "Total Action Items",
      value: totalActionItems,
      helper: `Across ${reports.length} meetings`,
      icon: <ClipboardList className="h-5 w-5" />,
      accent: "#16a34a",
      iconBg: "#f0fdf4",
    },
    {
      label: "Completed Meetings",
      value: completedCount,
      helper: `${completedCount} with full summaries`,
      icon: <CheckCircle2 className="h-5 w-5" />,
      accent: "#ca8a04",
      iconBg: "#fefce8",
    },
  ];

  const avatarColors = [
    "bg-[#f5f3ff] text-[#6c63ff]",
    "bg-[#eff6ff] text-[#2563eb]",
    "bg-[#f0fdf4] text-[#16a34a]",
    "bg-[#fefce8] text-[#ca8a04]",
    "bg-[#fff1f2] text-[#f97316]",
  ];

  if (isLoading) {
    return (
      <div className="space-y-6 p-8">
        <SkeletonList count={4} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="space-y-8">

        {/* Greeting */}
        <div className="space-y-1">
          <h1 className="text-[24px] font-bold text-gray-900">
            {greeting}, {user?.firstName || "there"} 👋
          </h1>
          {activeWorkspaceId && activeWorkspace ? (
            <p className="text-sm font-medium text-[#6c63ff]">
              {activeWorkspace.name}
            </p>
          ) : null}
          <p className="text-sm text-gray-500">Here&apos;s your meeting intelligence overview.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>

        {/* Error */}
        {error ? (
          <Card className="border-[#fecaca] bg-[#fef2f2] p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#991b1b]">Unable to load dashboard</p>
                <p className="mt-2 text-sm text-[#991b1b]">{error}</p>
              </div>
              <Button type="button" variant="outline" onClick={() => void loadDashboard()}>
                Retry
              </Button>
            </div>
          </Card>
        ) : null}

        {/* Recent Reports + Today's Meetings */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">

          {/* ── Recent Reports ── */}
          <Card className="col-span-1 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm xl:col-span-3">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
              <div>
                <h2 className="text-[16px] font-semibold text-gray-900">Recent Reports</h2>
                <p className="mt-0.5 text-[13px] text-gray-400">Last 5 meetings with summaries</p>
              </div>
              <Link
                href="/dashboard/reports"
                className="text-[13px] font-medium text-[#6c63ff] hover:text-[#5b52ee]"
              >
                View all →
              </Link>
            </div>

            <div className="divide-y divide-[#f3f4f6]">
              {recentReports.length > 0 ? (
                recentReports.map((meeting, index) => {
                  const preview = getSummaryPreview(meeting.summary);
                  const displayTitle = getDisplayTitle(meeting);
                  const avatarLetter = displayTitle.charAt(0).toUpperCase();

                  return (
                    <div
                      key={meeting.id}
                      className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-[#fafafa]"
                    >
                      {/* Avatar */}
                      <span
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                          avatarColors[index % avatarColors.length]
                        )}
                      >
                        {avatarLetter}
                      </span>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[14px] font-semibold text-gray-900">
                            {displayTitle}
                          </p>
                          <span className="shrink-0 rounded-full bg-[#f0fdf4] px-2 py-0.5 text-[10px] font-semibold text-[#16a34a]">
                            Completed
                          </span>
                        </div>
                        <p className="mt-0.5 text-[12px] text-gray-400">
                          {formatCompactDate(meeting.scheduledStartTime ?? meeting.createdAt)}
                        </p>
                        {preview ? (
                          <p className="mt-0.5 truncate text-[13px] text-gray-500">{preview}</p>
                        ) : (
                          <p className="mt-0.5 truncate text-[13px] italic text-gray-400">
                            Summary not available
                          </p>
                        )}
                      </div>

                      {/* Action */}
                      <Button asChild variant="secondary" size="sm" className="shrink-0">
                        <Link href={`/dashboard/meetings/${meeting.id}` as Route}>View</Link>
                      </Button>
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                  <span className="text-3xl">📋</span>
                  <p className="text-[14px] font-medium text-gray-700">No reports yet</p>
                  <p className="text-[13px] text-gray-400">
                    Start AI Notetaker on a meeting to generate your first report.
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* ── Today's Meetings / Workspace Meetings ── */}
          <Card className="col-span-1 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm xl:col-span-2">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
              <div>
                <h2 className="text-[16px] font-semibold text-gray-900">
                  {activeWorkspaceId ? "Shared Meetings" : "Today's Meetings"}
                </h2>
                <p className="mt-0.5 text-[13px] text-gray-400">
                  {activeWorkspaceId
                    ? "Meetings shared to this workspace"
                    : new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                </p>
              </div>
              <Link
                href="/dashboard/meetings"
                className="text-[13px] font-medium text-[#6c63ff] hover:text-[#5b52ee]"
              >
                View all →
              </Link>
            </div>

            <div className="divide-y divide-[#f3f4f6]">
              {activeWorkspaceId ? (
                // Workspace mode: show shared meetings list
                reports.slice(0, 5).length > 0 ? (
                  reports.slice(0, 5).map((meeting, index) => {
                    const displayTitle = getDisplayTitle(meeting);
                    return (
                      <Link
                        key={meeting.id}
                        href={`/dashboard/meetings/${meeting.id}` as Route}
                        className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-[#fafafa]"
                      >
                        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold", avatarColors[index % avatarColors.length])}>
                          {displayTitle.charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-gray-900">{displayTitle}</p>
                          <p className="text-[11px] text-gray-400">{formatCompactDate(meeting.scheduledStartTime ?? meeting.createdAt)}</p>
                        </div>
                      </Link>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                    <span className="text-3xl">📋</span>
                    <p className="text-[14px] font-medium text-gray-700">No shared meetings yet</p>
                    <p className="text-[13px] text-gray-400">Admin can share meetings to this workspace.</p>
                  </div>
                )
              ) : (
                // Personal mode: show Google Calendar meetings
                todayMeetings.length > 0 ? (
                  todayMeetings.map((meeting) => {
                    const session = findSessionForMeeting(meeting, reports);
                    const status = getMeetingDisplayStatus(meeting, session);
                    const platformStyle = getPlatformStyle(meeting.provider);
                    const platformLabel = getPlatformLabel(meeting.provider);
                    const timeRange = formatTimeRange(meeting.startTime, meeting.endTime);
                    return (
                      <a key={meeting.id} href={getMeetingDetailHref(meeting)} className="block px-5 py-4 transition-colors hover:bg-[#fafafa]">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: platformStyle.bg, color: platformStyle.color }}>{platformLabel}</span>
                          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: status.bg, color: status.color }}>
                            {status.pulse ? <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ backgroundColor: status.color }} /> : null}
                            {status.label}
                          </span>
                        </div>
                        <p className="mt-2 truncate text-[14px] font-semibold text-gray-900">{meeting.title}</p>
                        <p className="mt-0.5 text-[12px] text-gray-400">{timeRange}</p>
                      </a>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                    <span className="text-3xl">📅</span>
                    <p className="text-[14px] font-medium text-gray-700">No meetings today</p>
                    <p className="text-[13px] text-gray-400">Connect Google Calendar to see your schedule here.</p>
                  </div>
                )
              )}
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}
