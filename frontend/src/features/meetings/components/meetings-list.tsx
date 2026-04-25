"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Route } from "next";
import Link from "next/link";
import { CalendarDays, CalendarSync, LoaderCircle, Share2 } from "lucide-react";
import { SkeletonList } from "@/components/SkeletonCard";
import { fetchJoinedMeetings, fetchUnifiedCalendarFeed } from "@/features/meetings/api";
import { CalendarMeetingRow } from "@/features/meetings/components/calendar-meeting-row";
import { findSessionForMeeting } from "@/features/meetings/meeting-status";
import type { MeetingSessionRecord } from "@/features/meeting-assistant/types";
import type { UnifiedCalendarMeeting } from "@/lib/calendar/types";
import { useWorkspaceContext } from "@/contexts/workspace-context";
import { useApiFetch, useIsAuthReady } from "@/hooks/useApiFetch";

function formatDateHeading(value: Date, prefix: string) {
  return `${prefix} — ${value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  }).toUpperCase()}`;
}

function formatUpcomingLabel(date: Date) {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  if (target.getTime() === tomorrow.getTime()) {
    return formatDateHeading(date, "TOMORROW");
  }

  return `${date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()} — ${date
    .toLocaleDateString("en-US", {
      month: "short",
      day: "numeric"
    })
    .toUpperCase()}`;
}

function groupMeetingsByDate(meetings: UnifiedCalendarMeeting[]) {
  const groups = new Map<string, { date: Date; meetings: UnifiedCalendarMeeting[] }>();

  for (const meeting of meetings) {
    const date = new Date(meeting.startTime);
    const key = date.toDateString();
    const existing = groups.get(key);

    if (existing) {
      existing.meetings.push(meeting);
    } else {
      groups.set(key, { date, meetings: [meeting] });
    }
  }

  return Array.from(groups.values()).sort((left, right) => left.date.getTime() - right.date.getTime());
}

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

  async function loadMeetings(options?: { silent?: boolean }) {
    if (!options?.silent) setIsLoading(true);
    setError(null);
    try {
      if (activeWorkspaceId) {
        // Workspace mode: fetch shared meetings only, no calendar
        const res = await apiFetch(`/api/workspace/${activeWorkspaceId}/meetings`);
        const data = await res.json() as { success: boolean; meetings: MeetingSessionRecord[] };
        setWorkspaceMeetings(data.meetings ?? []);
        setTodayMeetings([]);
        setUpcomingMeetings([]);
        setSessions([]);
      } else {
        // Personal mode: unified calendar feed
        const now = new Date();
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(now);
        todayEnd.setHours(23, 59, 59, 999);

        const upcomingEnd = new Date(now);
        upcomingEnd.setDate(now.getDate() + 7);
        upcomingEnd.setHours(23, 59, 59, 999);

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
          // If the feed fails with a calendar_auth_required-style error, show connect prompt
          const msg = feedError instanceof Error ? feedError.message : "";
          if (msg.includes("calendar_auth_required") || msg.includes("not connected")) {
            setNeedsCalendarConnection(true);
            setTodayMeetings([]);
            setUpcomingMeetings([]);
            setSessions([]);
          } else {
            throw feedError;
          }
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

  // Fetch admin workspaces once for the share button
  useEffect(() => {
    if (activeWorkspaceId || !isAuthReady) return;
    apiFetch("/api/workspaces", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { workspaces?: { id: string; name: string; role: string }[] }) => {
        setAdminWorkspaces(d.workspaces ?? []);
      })
      .catch(() => {});
  }, [activeWorkspaceId, isAuthReady]);

  // Handle OAuth callback query params (e.g. ?google=connected or ?error=oauth_failed)
  useEffect(() => {
    const googleStatus = searchParams.get("google");
    const oauthError = searchParams.get("error");

    if (oauthError === "oauth_failed" || oauthError === "oauth_cancelled") {
      setActionError("Calendar connection failed. Please try again from the Integrations page.");
      return;
    }

    if (!googleStatus) return;

    if (googleStatus === "connect_failed") {
      setActionError("Calendar connection failed. Try again.");
      setNeedsCalendarConnection(true);
      return;
    }

    if (googleStatus === "missing_context") {
      setActionError("Calendar connection context expired. Start the connection flow again.");
      setNeedsCalendarConnection(true);
      return;
    }

    if (googleStatus === "connected") {
      setActionError(null);
      setNeedsCalendarConnection(false);
      void loadMeetings({ silent: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function handleSyncCalendar() {
    setIsSyncing(true);
    void loadMeetings({ silent: true }).finally(() => setIsSyncing(false));
  }

  const groupedUpcoming = useMemo(() => groupMeetingsByDate(upcomingMeetings), [upcomingMeetings]);

  if (isLoading) {
    return <SkeletonList count={3} />;
  }

  // ── Workspace mode ──────────────────────────────────────────────────────────
  if (activeWorkspaceId) {
    return (
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#6c63ff]">Meetings</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">{activeWorkspace?.name ?? "Workspace"} Meetings</h1>
            <p className="mt-1 text-sm text-slate-400">Meetings shared to this workspace by the admin.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadMeetings({ silent: true })}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <CalendarSync className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : workspaceMeetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <Share2 className="h-7 w-7 text-slate-300" />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-700">No meetings shared yet</p>
            <p className="mt-1 text-xs text-slate-400">The workspace admin can share meetings from their personal space.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {workspaceMeetings.map((meeting) => {
              const dateStr = meeting.scheduledStartTime
                ? new Date(meeting.scheduledStartTime).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
                : new Date(meeting.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
              const hasContent = !!(meeting.summary?.trim() || meeting.transcript?.trim());
              const isRecording = ["capturing", "processing", "summarizing", "waiting_for_join", "waiting_for_admission"].includes(meeting.status ?? "");

              return (
                <Link
                  key={meeting.id}
                  href={`/dashboard/meetings/${meeting.id}` as Route}
                  className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-[#6c63ff]/40 hover:bg-[#faf9ff] hover:shadow-lg hover:shadow-[#6c63ff]/10 focus:outline-none focus:ring-2 focus:ring-[#6c63ff]/40"
                >
                  {/* Avatar */}
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#6c63ff] to-[#9b8fff] text-sm font-semibold text-white">
                    {(meeting.title ?? "M").charAt(0).toUpperCase()}
                  </span>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-bold text-slate-900">{meeting.title}</p>
                      {hasContent && (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                          Summary ready
                        </span>
                      )}
                      {isRecording && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600 ring-1 ring-red-200">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                          Recording
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">{dateStr}</p>
                  </div>

                  {/* Hover hint */}
                  <span className="shrink-0 text-xs font-semibold text-[#6c63ff] opacity-0 transition-opacity group-hover:opacity-100">
                    View →
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Personal mode ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#6c63ff]">Meetings</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Meetings</h1>
          <p className="mt-1 text-sm text-slate-400">Your upcoming calendar sessions</p>
        </div>
        <button type="button" onClick={handleSyncCalendar} disabled={isSyncing}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50">
          {isSyncing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CalendarSync className="h-4 w-4" />}
          Sync Calendar
        </button>
      </div>

      {needsCalendarConnection ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <CalendarDays className="h-7 w-7 text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-700">Connect a Calendar</p>
          <p className="text-xs text-slate-400">Your upcoming sessions will appear here automatically once a calendar is connected.</p>
          <Link
            href="/dashboard/integrations"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#6c63ff] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#5b52e0] transition-colors"
          >
            Connect Calendar
          </Link>
          {actionError && <p className="text-xs text-red-600">{actionError}</p>}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={handleSyncCalendar} disabled={isSyncing}
            className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors">
            Retry
          </button>
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#6c63ff]">
              Today — {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </p>
            {todayMeetings.length > 0 ? (
              <div className="space-y-3">
                {todayMeetings.map((meeting) => (
                  <CalendarMeetingRow
                    key={meeting.id}
                    meeting={meeting}
                    session={findSessionForMeeting(meeting, sessions)}
                    adminWorkspaces={adminWorkspaces}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center">
                <CalendarDays className="h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm font-medium text-slate-600">No meetings scheduled today</p>
                <p className="mt-0.5 text-xs text-slate-400">Your calendar meetings will appear here.</p>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#6c63ff]">Upcoming</p>
            {groupedUpcoming.length > 0 ? (
              <div className="space-y-6">
                {groupedUpcoming.map((group) => (
                  <div key={group.date.toISOString()} className="space-y-3">
                    <p className="text-xs font-semibold text-slate-400">{formatUpcomingLabel(group.date)}</p>
                    {group.meetings.map((meeting) => (
                      <CalendarMeetingRow
                        key={meeting.id}
                        meeting={meeting}
                        session={findSessionForMeeting(meeting, sessions)}
                        adminWorkspaces={adminWorkspaces}
                      />
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center">
                <CalendarDays className="h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm font-medium text-slate-600">No upcoming meetings</p>
                <p className="mt-0.5 text-xs text-slate-400">Future calendar meetings will appear here once scheduled.</p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
