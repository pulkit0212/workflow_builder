"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSession, signIn } from "next-auth/react";
import { CalendarDays, CalendarSync, LoaderCircle } from "lucide-react";
import { SkeletonList } from "@/components/SkeletonCard";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchTodayMeetings, fetchUpcomingMeetings } from "@/features/meetings/api";
import { CalendarMeetingRow } from "@/features/meetings/components/calendar-meeting-row";
import type { GoogleCalendarMeeting } from "@/lib/google/types";

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
  const [todayMeetings, setTodayMeetings] = useState<GoogleCalendarMeeting[]>([]);
  const [upcomingMeetings, setUpcomingMeetings] = useState<GoogleCalendarMeeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [needsGoogleConnection, setNeedsGoogleConnection] = useState(false);
  const [needsGoogleReconnect, setNeedsGoogleReconnect] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function loadMeetings(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setIsLoading(true);
    }

    setError(null);

    try {
      const todayResult = await fetchTodayMeetings();
      setNeedsGoogleConnection(todayResult.status === "not_connected");
      setNeedsGoogleReconnect(todayResult.status === "auth_required");
      setTodayMeetings(todayResult.meetings);

      if (todayResult.status === "connected") {
        const upcoming = await fetchUpcomingMeetings();
        setUpcomingMeetings(upcoming);
      } else {
        setUpcomingMeetings([]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load meetings.");
    } finally {
      if (!options?.silent) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    void loadMeetings();
  }, []);

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

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1>Meetings</h1>
          <p className="mt-1">Your upcoming Google Calendar sessions</p>
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
                  <CalendarMeetingRow key={meeting.id} meeting={meeting} />
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
                      <CalendarMeetingRow key={meeting.id} meeting={meeting} />
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
