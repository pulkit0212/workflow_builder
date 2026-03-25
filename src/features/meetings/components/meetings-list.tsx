"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { CalendarDays, CalendarSync, LoaderCircle } from "lucide-react";
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

export function MeetingsList() {
  const searchParams = useSearchParams();
  const [todayMeetings, setTodayMeetings] = useState<GoogleCalendarMeeting[]>([]);
  const [upcomingMeetings, setUpcomingMeetings] = useState<GoogleCalendarMeeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [needsGoogleConnection, setNeedsGoogleConnection] = useState(false);
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
    return (
      <div className="space-y-6">
        {[0, 1, 2].map((index) => (
          <Card key={index} className="p-6">
            <div className="space-y-3">
              <div className="shimmer h-4 w-40 rounded-full" />
              <div className="shimmer h-20 rounded-xl" />
            </div>
          </Card>
        ))}
      </div>
    );
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

      {needsGoogleConnection ? (
        <ConnectGoogleCalendarCard
          isConnecting={isConnectingGoogle}
          actionError={actionError}
          onConnect={handleConnectGoogle}
        />
      ) : error ? (
        <Card className="border-[#fecaca] p-6">
          <h2>Unable to load meetings</h2>
          <p className="mt-2">{error}</p>
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
