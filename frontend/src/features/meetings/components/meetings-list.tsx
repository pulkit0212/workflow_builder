"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Route } from "next";
import Link from "next/link";
import { CalendarSync, LoaderCircle, Share2, Plus, Video } from "lucide-react";
import { SkeletonList } from "@/components/SkeletonCard";
import { fetchJoinedMeetings, fetchUnifiedCalendarFeed } from "@/features/meetings/api";
import { CalendarMeetingRow } from "@/features/meetings/components/calendar-meeting-row";
import { findSessionForMeeting } from "@/features/meetings/meeting-status";
import type { MeetingSessionRecord } from "@/features/meeting-assistant/types";
import type { UnifiedCalendarMeeting } from "@/lib/calendar/types";
import { useWorkspaceContext } from "@/contexts/workspace-context";
import { useApiFetch, useIsAuthReady } from "@/hooks/useApiFetch";

function formatDateHeading(value: Date, prefix: string) {
  return `${prefix} — ${value.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()}`;
}

function formatUpcomingLabel(date: Date) {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  if (target.getTime() === tomorrow.getTime()) return formatDateHeading(date, "TOMORROW");
  return `${date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()} — ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()}`;
}

function groupMeetingsByDate(meetings: UnifiedCalendarMeeting[]) {
  const groups = new Map<string, { date: Date; meetings: UnifiedCalendarMeeting[] }>();
  for (const meeting of meetings) {
    const date = new Date(meeting.startTime);
    const key = date.toDateString();
    const existing = groups.get(key);
    if (existing) { existing.meetings.push(meeting); }
    else { groups.set(key, { date, meetings: [meeting] }); }
  }
  return Array.from(groups.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────
type FilterTab = "All" | "Today" | "This Week" | "This Month";

export function MeetingsList() {
  const searchParams = useSearchParams();
  const { activeWorkspaceId, activeWorkspace } = useWorkspaceContext();
  const apiFetch = useApiFetch();
  const isAuthReady = useIsAuthReady();
  const [todayMeetings, setTodayMeetings] = useState<UnifiedCalendarMeeting[]>([]);
  const [upcomingMeetings, setUpcomingMeetings] = useState<UnifiedCalendarMeeting[]>([]);
  const [sessions, setSessions] = useState<MeetingSessionRecord[]>([]);
  const [workspaceMeetings, setWorkspaceMeetings] = useState<MeetingSessionRecord[]>([]);
  const [adminWorkspaces, setAdminWorkspaces] = useState<{ id: string; name: string; role: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [needsCalendarConnection, setNeedsCalendarConnection] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>("All");

  async function loadMeetings(options?: { silent?: boolean }) {
    if (!options?.silent) setIsLoading(true);
    setError(null);
    try {
      if (activeWorkspaceId) {
        const res = await apiFetch(`/api/workspace/${activeWorkspaceId}/meetings`);
        const data = await res.json() as { success: boolean; meetings: MeetingSessionRecord[] };
        setWorkspaceMeetings(data.meetings ?? []);
        setTodayMeetings([]); setUpcomingMeetings([]); setSessions([]);
      } else {
        const now = new Date();
        const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
        const upcomingEnd = new Date(now); upcomingEnd.setDate(now.getDate() + 7); upcomingEnd.setHours(23, 59, 59, 999);
        try {
          const [todayFeed, upcomingFeed, joined] = await Promise.all([
            fetchUnifiedCalendarFeed(todayStart, todayEnd),
            fetchUnifiedCalendarFeed(todayEnd, upcomingEnd),
            fetchJoinedMeetings().catch(() => []),
          ]);
          setNeedsCalendarConnection(false);
          setTodayMeetings(todayFeed.meetings);
          setUpcomingMeetings(upcomingFeed.meetings);
          setSessions(joined);
        } catch (feedError) {
          const msg = feedError instanceof Error ? feedError.message : "";
          if (msg.includes("calendar_auth_required") || msg.includes("not connected")) {
            setNeedsCalendarConnection(true);
            setTodayMeetings([]); setUpcomingMeetings([]); setSessions([]);
          } else { throw feedError; }
        }
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load meetings.");
    } finally {
      if (!options?.silent) setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!isAuthReady) return;
    void loadMeetings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId, isAuthReady]);

  useEffect(() => {
    if (activeWorkspaceId || !isAuthReady) return;
    apiFetch("/api/workspaces", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { workspaces?: { id: string; name: string; role: string }[] }) => { setAdminWorkspaces(d.workspaces ?? []); })
      .catch(() => {});
  }, [activeWorkspaceId, isAuthReady]);

  useEffect(() => {
    const googleStatus = searchParams.get("google");
    const oauthError = searchParams.get("error");
    if (oauthError === "oauth_failed" || oauthError === "oauth_cancelled") {
      setActionError("Calendar connection failed. Please try again from the Integrations page.");
      return;
    }
    if (!googleStatus) return;
    if (googleStatus === "connect_failed") { setActionError("Calendar connection failed. Try again."); setNeedsCalendarConnection(true); return; }
    if (googleStatus === "missing_context") { setActionError("Calendar connection context expired. Start the connection flow again."); setNeedsCalendarConnection(true); return; }
    if (googleStatus === "connected") { setActionError(null); setNeedsCalendarConnection(false); void loadMeetings({ silent: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function handleSyncCalendar() {
    setIsSyncing(true);
    void loadMeetings({ silent: true }).finally(() => setIsSyncing(false));
  }

  const groupedUpcoming = useMemo(() => groupMeetingsByDate(upcomingMeetings), [upcomingMeetings]);

  if (isLoading) return <SkeletonList count={5} />;

  // ── Workspace mode ────────────────────────────────────────────────────────
  if (activeWorkspaceId) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-semibold text-[#202124]" style={{ fontFamily: "'Work Sans', sans-serif" }}>
              Meetings
            </h1>
            <p className="text-sm text-[#5F6368] mt-0.5">{activeWorkspace?.name ?? "Workspace"} — shared meetings</p>
          </div>
          <button type="button" onClick={() => void loadMeetings({ silent: true })}
            className="inline-flex items-center gap-2 rounded-lg border border-[#DADCE0] bg-white px-4 py-2 text-sm font-medium text-[#5F6368] hover:bg-[#F8F9FA] transition-colors">
            <CalendarSync className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : workspaceMeetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#DADCE0] bg-white py-20 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F4] mb-3">
              <Share2 className="h-6 w-6 text-[#9AA0A6]" />
            </div>
            <p className="text-sm font-semibold text-[#202124]">No meetings shared yet</p>
            <p className="mt-1 text-xs text-[#5F6368]">The workspace admin can share meetings from their personal space.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {workspaceMeetings.map((meeting) => {
              const dateStr = meeting.scheduledStartTime
                ? new Date(meeting.scheduledStartTime).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
                : new Date(meeting.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
              const hasContent = !!(meeting.summary?.trim() || meeting.transcript?.trim());
              const isRecording = ["capturing", "processing", "summarizing", "waiting_for_join", "waiting_for_admission"].includes(meeting.status ?? "");
              return (
                <Link key={meeting.id} href={`/dashboard/meetings/${meeting.id}` as Route}
                  className="group flex items-center gap-4 rounded-xl border border-[#DADCE0] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:border-[#6C3FF5]/40 hover:shadow-md">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] text-sm font-bold text-[#6C3FF5]">
                    {(meeting.title ?? "M").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#202124]">{meeting.title}</p>
                    <p className="text-xs text-[#5F6368] mt-0.5">{dateStr}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasContent && <span className="rounded-full bg-[#E6F4EA] px-2 py-0.5 text-[11px] font-bold text-[#137333]">READY</span>}
                    {isRecording && <span className="rounded-full bg-[#FCE8E6] px-2 py-0.5 text-[11px] font-bold text-[#C5221F]">RECORDING</span>}
                    <span className="text-xs font-semibold text-[#6C3FF5] opacity-0 group-hover:opacity-100 transition-opacity">View →</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Personal mode ─────────────────────────────────────────────────────────
  const tabs: FilterTab[] = ["All", "Today", "This Week", "This Month"];

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-semibold text-[#202124]" style={{ fontFamily: "'Work Sans', sans-serif" }}>
          Meetings
        </h1>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleSyncCalendar} disabled={isSyncing}
            className="inline-flex items-center gap-2 rounded-lg border border-[#DADCE0] bg-white px-4 py-2 text-sm font-medium text-[#5F6368] hover:bg-[#F8F9FA] transition-colors disabled:opacity-50">
            {isSyncing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CalendarSync className="h-4 w-4" />}
            Schedule New
          </button>
          <button type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-[#6C3FF5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5B2FE0] transition-colors shadow-sm">
            <Video className="h-4 w-4" />
            Join with Code
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 bg-[#F1F3F4] p-1 rounded-xl w-fit">
        {tabs.map((tab) => (
          <button key={tab} type="button" onClick={() => setActiveTab(tab)}
            className={`px-5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === tab
                ? "bg-white text-[#6C3FF5] shadow-sm"
                : "text-[#5F6368] hover:text-[#202124]"
            }`}>
            {tab}
          </button>
        ))}
      </div>

      {needsCalendarConnection ? (
        <div className="rounded-xl border border-dashed border-[#DADCE0] bg-white p-10 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F4]">
            <CalendarSync className="h-6 w-6 text-[#9AA0A6]" />
          </div>
          <p className="text-sm font-semibold text-[#202124]">Connect a Calendar</p>
          <p className="text-xs text-[#5F6368]">Your upcoming sessions will appear here automatically once a calendar is connected.</p>
          <Link href="/dashboard/integrations"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#6C3FF5] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#5B2FE0] transition-colors">
            Connect Calendar
          </Link>
          {actionError && <p className="text-xs text-red-600">{actionError}</p>}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={handleSyncCalendar} disabled={isSyncing}
            className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors">
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Today meetings */}
          {(activeTab === "All" || activeTab === "Today") && todayMeetings.length > 0 && (
            <>
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#5F6368] px-1 pt-2">
                Today — {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </p>
              {todayMeetings.map((meeting) => (
                <CalendarMeetingRow key={meeting.id} meeting={meeting}
                  session={findSessionForMeeting(meeting, sessions)} adminWorkspaces={adminWorkspaces} />
              ))}
            </>
          )}

          {/* Upcoming meetings */}
          {(activeTab === "All" || activeTab === "This Week") && groupedUpcoming.length > 0 && (
            <>
              {groupedUpcoming.map((group) => (
                <div key={group.date.toISOString()} className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[#5F6368] px-1 pt-2">
                    {formatUpcomingLabel(group.date)}
                  </p>
                  {group.meetings.map((meeting) => (
                    <CalendarMeetingRow key={meeting.id} meeting={meeting}
                      session={findSessionForMeeting(meeting, sessions)} adminWorkspaces={adminWorkspaces} />
                  ))}
                </div>
              ))}
            </>
          )}

          {/* Empty state */}
          {todayMeetings.length === 0 && groupedUpcoming.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#DADCE0] bg-white py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F4] mb-3">
                <CalendarSync className="h-6 w-6 text-[#9AA0A6]" />
              </div>
              <p className="text-sm font-semibold text-[#202124]">No meetings scheduled</p>
              <p className="mt-1 text-xs text-[#5F6368]">Your calendar meetings will appear here.</p>
            </div>
          )}

          {/* Load more */}
          {(todayMeetings.length > 0 || groupedUpcoming.length > 0) && (
            <div className="flex justify-center pt-4">
              <button type="button" onClick={handleSyncCalendar}
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#5F6368] hover:text-[#6C3FF5] transition-colors">
                Load more meetings
                <span className="material-symbols-outlined text-[18px]">expand_more</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* FAB */}
      <div className="fixed bottom-8 right-8 z-50">
        <button type="button"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-[#6C3FF5] text-white shadow-xl hover:bg-[#5B2FE0] hover:scale-105 active:scale-95 transition-all">
          <Plus className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}
