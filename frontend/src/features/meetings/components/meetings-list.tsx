"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSession, signIn } from "next-auth/react";
import type { Route } from "next";
import Link from "next/link";
import { CalendarDays, CalendarSync, LoaderCircle, Share2 } from "lucide-react";
import { SkeletonList } from "@/components/SkeletonCard";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchJoinedMeetings, fetchTodayMeetings, fetchUpcomingMeetings } from "@/features/meetings/api";
import { CalendarMeetingRow } from "@/features/meetings/components/calendar-meeting-row";
import { findSessionForMeeting } from "@/features/meetings/meeting-status";
import type { MeetingSessionRecord } from "@/features/meeting-assistant/types";
import type { GoogleCalendarMeeting } from "@/lib/google/types";
import { useWorkspaceContext } from "@/contexts/workspace-context";

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

function groupMeetingsByDate(meetings: GoogleCalendarMeeting[]) {
  const groups = new Map<string, { date: Date; meetings: GoogleCalendarMeeting[] }>();

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

function ConnectGoogleCalendarCard({
  isConnecting,
  actionError,
  onConnect
}: {
  isConnecting: boolean;
  actionError: string | null;
  onConnect: () => void;
}) {
  return (
    <Card className="p-6">
      <div className="space-y-3">
        <p className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#6c63ff]">Google Calendar</p>
        <h2>Connect your calendar</h2>
        <p>Your upcoming Google Calendar sessions will appear here automatically once Google Calendar is connected.</p>
        <Button type="button" onClick={onConnect} disabled={isConnecting}>
          {isConnecting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          Continue with Google
        </Button>
        {actionError ? <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] p-3 text-sm text-[#991b1b]">{actionError}</div> : null}
      </div>
    </Card>
  );
}

function ReconnectGoogleCalendarCard({
  isConnecting,
  onReconnect
}: {
  isConnecting: boolean;
  onReconnect: () => void;
}) {
  return (
    <Card className="border-[#fde68a] bg-[#fffbeb] p-6">
      <div className="space-y-3">
        <p className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#b45309]">Google Calendar</p>
        <p className="text-lg font-semibold text-[#111827]">📅 Google Calendar needs to be reconnected</p>
        <p className="text-sm text-[#92400e]">Your session has expired.</p>
        <Button type="button" onClick={onReconnect} disabled={isConnecting}>
          {isConnecting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          Reconnect Google Calendar
        </Button>
      </div>
    </Card>
  );
}

export function MeetingsList() {
  const searchParams = useSearchParams();
  const { activeWorkspaceId, activeWorkspace } = useWorkspaceContext();
  const [todayMeetings, setTodayMeetings] = useState<GoogleCalendarMeeting[]>([]);
  const [upcomingMeetings, setUpcomingMeetings] = useState<GoogleCalendarMeeting[]>([]);
  const [sessions, setSessions] = useState<MeetingSessionRecord[]>([]);
  const [workspaceMeetings, setWorkspaceMeetings] = useState<MeetingSessionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [needsGoogleConnection, setNeedsGoogleConnection] = useState(false);
  const [needsGoogleReconnect, setNeedsGoogleReconnect] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function loadMeetings(options?: { silent?: boolean }) {
    if (!options?.silent) setIsLoading(true);
    setError(null);
    try {
      if (activeWorkspaceId) {
        // Workspace mode: fetch shared meetings only, no Google Calendar
        const res = await fetch(`/api/workspace/${activeWorkspaceId}/meetings`);
        const data = await res.json() as { success: boolean; meetings: MeetingSessionRecord[] };
        setWorkspaceMeetings(data.meetings ?? []);
        setTodayMeetings([]);
        setUpcomingMeetings([]);
        setSessions([]);
      } else {
        // Personal mode: Google Calendar
        const todayResult = await fetchTodayMeetings();
        setNeedsGoogleConnection(todayResult.status === "not_connected");
        setNeedsGoogleReconnect(todayResult.status === "auth_required");
        setTodayMeetings(todayResult.meetings);
        if (todayResult.status === "connected") {
          const [upcoming, joined] = await Promise.all([
            fetchUpcomingMeetings(),
            fetchJoinedMeetings().catch(() => []),
          ]);
          setUpcomingMeetings(upcoming);
          setSessions(joined);
        } else {
          setUpcomingMeetings([]);
          setSessions([]);
        }
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load meetings.");
    } finally {
      if (!options?.silent) setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadMeetings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);

  useEffect(() => {
    void getSession().then((session) => {
      if ((session as { error?: string } | null)?.error === "RefreshAccessTokenError") {
        void signIn("google", { callbackUrl: "/dashboard/meetings" });
      }
    });
  }, []);

  useEffect(() => {
    const googleStatus = searchParams.get("google");

    if (!googleStatus) {
      return;
    }

    if (googleStatus === "connect_failed") {
      setActionError("Google Calendar connection failed. Try again.");
      setNeedsGoogleConnection(true);
      setIsConnectingGoogle(false);
      return;
    }

    if (googleStatus === "missing_context") {
      setActionError("Google connection context expired. Start the connection flow again.");
      setNeedsGoogleConnection(true);
      setIsConnectingGoogle(false);
      return;
    }

    if (googleStatus === "connected") {
      setActionError(null);
      setIsConnectingGoogle(false);
      setNeedsGoogleConnection(false);
      setNeedsGoogleReconnect(false);
      void loadMeetings({ silent: true });
    }
  }, [searchParams]);

  function handleConnectGoogle() {
    setIsConnectingGoogle(true);
    setActionError(null);
    void signIn("google", {
      callbackUrl: "/dashboard/meetings"
    }).catch((connectError) => {
      setIsConnectingGoogle(false);
      setActionError(connectError instanceof Error ? connectError.message : "Failed to start Google sign-in.");
    });
  }

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
            <Share2 className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-700">No meetings shared yet</p>
            <p className="mt-1 text-xs text-slate-400">The workspace admin can share meetings from their personal space.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {workspaceMeetings.map((meeting) => (
              <Link
                key={meeting.id}
                href={`/dashboard/meetings/${meeting.id}` as Route}
                className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-[#6c63ff]/40 hover:bg-[#faf9ff] hover:shadow-md"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#6c63ff] to-[#9b8fff] text-sm font-semibold text-white">
                  {(meeting.title ?? "M").charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{meeting.title}</p>
                  <p className="text-xs text-slate-400">
                    {meeting.scheduledStartTime
                      ? new Date(meeting.scheduledStartTime).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
                      : new Date(meeting.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
                <span className="text-xs font-semibold text-[#6c63ff] opacity-0 transition-opacity group-hover:opacity-100">
                  View →
                </span>
              </Link>
            ))}
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
          <p className="mt-1 text-sm text-slate-400">Your upcoming Google Calendar sessions</p>
        </div>
        <Button type="button" variant="secondary" onClick={handleSyncCalendar} disabled={isSyncing}>
          {isSyncing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CalendarSync className="h-4 w-4" />}
          Sync Calendar
        </Button>
      </div>

      {needsGoogleReconnect ? (
        <ReconnectGoogleCalendarCard isConnecting={isConnectingGoogle} onReconnect={handleConnectGoogle} />
      ) : needsGoogleConnection ? (
        <ConnectGoogleCalendarCard
          isConnecting={isConnectingGoogle}
          actionError={actionError}
          onConnect={handleConnectGoogle}
        />
      ) : error ? (
        <Card className="border-[#fecaca] p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2>Unable to load meetings</h2>
              <p className="mt-2">{error}</p>
            </div>
            <Button type="button" variant="outline" onClick={handleSyncCalendar} disabled={isSyncing}>
              Retry
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <section className="space-y-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#6c63ff]">
              TODAY — {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()}
            </p>
            {todayMeetings.length > 0 ? (
              <div className="space-y-3">
                {todayMeetings.map((meeting) => (
                  <CalendarMeetingRow
                    key={meeting.id}
                    meeting={meeting}
                    session={findSessionForMeeting(meeting, sessions)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="No meetings scheduled today"
                description="Your Google Calendar meetings will appear here automatically."
              />
            )}
          </section>

          <section className="space-y-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#6c63ff]">UPCOMING</p>
            {groupedUpcoming.length > 0 ? (
              <div className="space-y-6">
                {groupedUpcoming.map((group) => (
                  <div key={group.date.toISOString()} className="space-y-3">
                    <p className="text-sm font-semibold text-[#6b7280]">{formatUpcomingLabel(group.date)}</p>
                    {group.meetings.map((meeting) => (
                      <CalendarMeetingRow
                        key={meeting.id}
                        meeting={meeting}
                        session={findSessionForMeeting(meeting, sessions)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="No upcoming meetings"
                description="Future Google Calendar meetings will appear here once they are scheduled."
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}
