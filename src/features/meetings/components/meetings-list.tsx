"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Route } from "next";
import Link from "next/link";
import { signIn } from "next-auth/react";
import {
  CalendarSync,
  CalendarDays,
  ChevronRight,
  Clock3,
  ExternalLink,
  Link2,
  LoaderCircle,
  Radio,
  Video
} from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionHeader } from "@/components/shared/section-header";
import { Button } from "@/components/ui/button";
import { ResultState } from "@/components/tools/result-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  getMeetingSessionProviderLabel,
  getMeetingSessionStatusLabel
} from "@/features/meeting-assistant/helpers";
import type { MeetingSessionRecord } from "@/features/meeting-assistant/types";
import type { UpcomingMeeting } from "@/features/upcoming-meetings/types";
import {
  getUpcomingMeetingStatus,
  getUpcomingMeetingStatusLabel
} from "@/features/upcoming-meetings/helpers";
import {
  fetchJoinedMeetings,
  fetchTodayMeetings
} from "@/features/meetings/api";
import { encodeCalendarMeetingId } from "@/features/meetings/ids";
import { formatMeetingDateTime, getMeetingSummaryPreview } from "@/features/meetings/helpers";

function formatTodayHeading(now = new Date()) {
  return now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric"
  });
}

function formatClockTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Time unavailable";
  }

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatMeetingTimeRange(meeting: Pick<UpcomingMeeting, "startTime" | "endTime">) {
  return `${formatClockTime(meeting.startTime)} - ${formatClockTime(meeting.endTime)}`;
}

function MeetingsListSkeleton() {
  return (
    <div className="space-y-8">
      {[0, 1].map((section) => (
        <Card key={section} className="overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-5">
            <div className="animate-pulse space-y-3">
              <div className="h-4 w-32 rounded-full bg-slate-100" />
              <div className="h-7 w-56 rounded-full bg-slate-200" />
              <div className="h-5 w-80 rounded-full bg-slate-100" />
            </div>
          </div>
          <div className="space-y-4 p-6">
            {[0, 1, 2].map((row) => (
              <div key={row} className="rounded-[1.75rem] border border-slate-200 bg-slate-50/70 p-5">
                <div className="animate-pulse space-y-4">
                  <div className="flex gap-2">
                    <div className="h-6 w-24 rounded-full bg-slate-100" />
                    <div className="h-6 w-28 rounded-full bg-slate-100" />
                  </div>
                  <div className="h-6 w-72 rounded-full bg-slate-200" />
                  <div className="h-5 w-64 rounded-full bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

type SectionCardProps = {
  eyebrow: string;
  title: string;
  description: string;
  count: number;
  tone: "upcoming" | "joined";
  children: React.ReactNode;
};

function SectionCard({ eyebrow, title, description, count, tone, children }: SectionCardProps) {
  const headerClassName =
    tone === "upcoming"
      ? "border-blue-100 bg-[linear-gradient(90deg,rgba(239,246,255,0.95),rgba(255,255,255,0.96),rgba(238,242,255,0.95))]"
      : "border-slate-200 bg-[linear-gradient(90deg,rgba(248,250,252,0.95),rgba(255,255,255,0.96),rgba(241,245,249,0.95))]";

  return (
    <Card className="overflow-hidden border-white/80 bg-white/92">
      <div className={`border-b px-6 py-5 ${headerClassName}`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <p className={tone === "upcoming" ? "text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600" : "text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"}>{eyebrow}</p>
            <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
            <p className="text-sm text-slate-600">{description}</p>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm">
            <Radio className="h-4 w-4 text-slate-500" />
            {count} {count === 1 ? "meeting" : "meetings"}
          </div>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </Card>
  );
}

function getUpcomingStatusBadgeVariant(meeting: UpcomingMeeting) {
  const status = getUpcomingMeetingStatus(meeting);

  switch (status) {
    case "ongoing":
      return "accent" as const;
    case "starting_soon":
      return "info" as const;
    default:
      return "neutral" as const;
  }
}

function getJoinedStatusBadgeVariant(status: MeetingSessionRecord["status"]) {
  switch (status) {
    case "completed":
      return "available" as const;
    case "joining":
    case "waiting_for_join":
      return "info" as const;
    case "capturing":
    case "recording":
    case "recorded":
      return "accent" as const;
    case "processing":
    case "processing_transcript":
    case "processing_summary":
    case "transcribed":
      return "info" as const;
    case "failed":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
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
    <Card className="overflow-hidden border-blue-100">
      <div className="border-b border-blue-100 bg-[linear-gradient(90deg,rgba(239,246,255,0.95),rgba(255,255,255,0.96),rgba(238,242,255,0.95))] px-6 py-5">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Google Calendar</p>
          <h2 className="text-xl font-semibold text-slate-950">Connect Google Calendar</h2>
          <p className="text-sm text-slate-600">
            Allow access to your calendar to show today&apos;s scheduled meetings.
          </p>
        </div>
      </div>
      <div className="space-y-4 p-6">
        <Button type="button" onClick={onConnect} disabled={isConnecting}>
          {isConnecting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          Continue with Google
        </Button>
        {actionError ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {actionError}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function TodayMeetingRow({ meeting }: { meeting: UpcomingMeeting }) {
  const detailHref = `/dashboard/meetings/${encodeCalendarMeetingId(meeting.id)}` as Route;
  const statusLabel = getUpcomingMeetingStatusLabel(getUpcomingMeetingStatus(meeting))
    .replace("Ongoing", "Live");

  return (
    <div className="group rounded-[2rem] border border-blue-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,246,255,0.72))] p-6 shadow-[0_18px_44px_rgba(37,99,235,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(37,99,235,0.12)]">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info">Google Meet</Badge>
            <Badge variant={getUpcomingStatusBadgeVariant(meeting)}>{statusLabel}</Badge>
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-slate-950 transition-colors group-hover:text-indigo-700">
              {meeting.title}
            </h3>
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50/80 px-3 py-1.5 text-slate-700">
                <Clock3 className="h-4 w-4 text-indigo-600" />
                {formatMeetingTimeRange(meeting)}
              </span>
              {meeting.meetLink ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700">
                  <Link2 className="h-4 w-4 text-indigo-600" />
                  Google Meet link available
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-500">
                  <Video className="h-4 w-4 text-slate-400" />
                  No Meet link
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {meeting.meetLink ? (
            <Button asChild>
              <a href={meeting.meetLink} target="_blank" rel="noreferrer">
                Join Meeting
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          ) : null}
          <Button asChild variant="secondary">
            <Link href={detailHref}>
              View Details
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function JoinedMeetingRow({ meeting }: { meeting: MeetingSessionRecord }) {
  const displayDateTime = meeting.scheduledStartTime ?? meeting.createdAt;

  return (
    <Link
      href={`/dashboard/meetings/${meeting.id}`}
      className="group block rounded-[2rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.9))] p-6 shadow-[0_16px_40px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_56px_rgba(15,23,42,0.1)]"
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">{getMeetingSessionProviderLabel(meeting.provider)}</Badge>
            <Badge variant={getJoinedStatusBadgeVariant(meeting.status)}>
              {getMeetingSessionStatusLabel(meeting.status)}
            </Badge>
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-slate-950 transition-colors group-hover:text-slate-800">
              {meeting.title}
            </h3>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">
              {getMeetingSummaryPreview(meeting)}
            </p>
          </div>
        </div>
        <div className="space-y-3 text-sm text-slate-600 lg:text-right">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-slate-700">
            <CalendarDays className="h-4 w-4 text-slate-500" />
            {formatMeetingDateTime(displayDateTime)}
          </div>
          <div className="inline-flex items-center gap-2 self-start rounded-full border border-transparent px-3 py-2 font-medium text-slate-500 transition-colors group-hover:border-slate-200 group-hover:bg-slate-100 group-hover:text-slate-900 lg:self-end">
            View
            <ChevronRight className="h-4 w-4" />
          </div>
        </div>
      </div>
    </Link>
  );
}

export function MeetingsList() {
  const searchParams = useSearchParams();
  const [todayMeetings, setTodayMeetings] = useState<UpcomingMeeting[]>([]);
  const [joinedMeetings, setJoinedMeetings] = useState<MeetingSessionRecord[]>([]);
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
      const [nextTodayMeetings, nextJoinedMeetings] = await Promise.all([
        fetchTodayMeetings(),
        fetchJoinedMeetings()
      ]);

      setNeedsGoogleConnection(nextTodayMeetings.status === "not_connected");
      setTodayMeetings(nextTodayMeetings.meetings);
      setJoinedMeetings(nextJoinedMeetings);
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
    }).catch((error) => {
      setIsConnectingGoogle(false);
      setActionError(error instanceof Error ? error.message : "Failed to start Google sign-in.");
    });
  }

  function handleSyncCalendar() {
    setIsSyncing(true);
    void loadMeetings({ silent: true }).finally(() => {
      setIsSyncing(false);
    });
  }

  if (isLoading) {
    return <MeetingsListSkeleton />;
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Meetings"
          description="Review upcoming calendar sessions and captured meeting records in one polished workspace."
        action={
          <Button type="button" variant="secondary" onClick={handleSyncCalendar} disabled={isSyncing}>
            {isSyncing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CalendarSync className="h-4 w-4" />}
            Sync Calendar
          </Button>
        }
      />

      {error ? (
        <ResultState icon="error" title="Unable to load meetings" description={error} />
      ) : (
        <div className="space-y-8">
          <SectionCard
            eyebrow={formatTodayHeading()}
            title="Upcoming Today"
            description="Scheduled meetings from Google Calendar, prioritized for what needs attention next."
            count={todayMeetings.length}
            tone="upcoming"
          >
            {needsGoogleConnection ? (
              <ConnectGoogleCalendarCard
                isConnecting={isConnectingGoogle}
                actionError={actionError}
                onConnect={handleConnectGoogle}
              />
            ) : todayMeetings.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="No upcoming meetings today"
                description="Your calendar is clear for now. When meetings are scheduled for today, they will appear here."
              />
            ) : (
              <div className="space-y-5">
                {todayMeetings.map((meeting) => (
                  <TodayMeetingRow key={meeting.id} meeting={meeting} />
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            eyebrow="Joined"
            title="Joined Meetings"
            description="Captured meetings saved in the app, with transcript, summary, and action items when available."
            count={joinedMeetings.length}
            tone="joined"
          >
            {joinedMeetings.length === 0 ? (
              <EmptyState
                icon={Video}
                title="No joined meetings yet"
                description="Completed or in-progress captured meetings will appear here once you join and process them."
              />
            ) : (
              <div className="space-y-5">
                {joinedMeetings.map((meeting) => (
                  <JoinedMeetingRow key={meeting.id} meeting={meeting} />
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  );
}
