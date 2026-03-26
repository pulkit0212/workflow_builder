"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileText, LoaderCircle, Search } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { MeetingSessionRecord } from "@/features/meeting-assistant/types";
import { getMeetingSessionProviderLabel, getMeetingSessionStatusLabel } from "@/features/meeting-assistant/helpers";
import { fetchMeetingReports } from "@/features/meetings/api";
import { formatMeetingDateTime, formatMeetingDuration, getMeetingSummaryPreview } from "@/features/meetings/helpers";

type StatusFilter = "all" | "completed" | "recording" | "failed";
type DateFilter = "all" | "week" | "month";

function getParticipants(meeting: MeetingSessionRecord) {
  const owners = Array.from(new Set(meeting.actionItems.map((item) => item.owner).filter(Boolean)));

  if (owners.length > 0) {
    return owners as string[];
  }

  return ["Artiva"];
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function getStatusVariant(status: MeetingSessionRecord["status"]) {
  switch (status) {
    case "completed":
      return "available" as const;
    case "failed":
      return "danger" as const;
    case "summarizing":
      return "accent" as const;
    default:
      return "info" as const;
  }
}

function isRecordingState(status: MeetingSessionRecord["status"]) {
  return [
    "joining",
    "waiting_for_join",
    "waiting_for_admission",
    "joined",
    "capturing",
    "recording",
    "recorded",
    "processing_transcript",
    "transcribed",
    "processing_summary",
    "processing",
    "summarizing"
  ].includes(status);
}

function ReportCard({ meeting }: { meeting: MeetingSessionRecord }) {
  const participants = getParticipants(meeting);
  const duration = formatMeetingDuration(meeting.meetingDuration);
  const preview = meeting.summary?.trim() ? getMeetingSummaryPreview(meeting) : null;

  return (
    <Card className="flex h-full flex-col p-6">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#f5f3ff] text-sm font-semibold text-[#6c63ff]">
          {getInitials(meeting.title || "A")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={getStatusVariant(meeting.status)}>
              {isRecordingState(meeting.status) ? <span className="pulse-dot" aria-hidden="true" /> : null}
              {meeting.status === "capturing" ? "Recording" : getMeetingSessionStatusLabel(meeting.status)}
            </Badge>
            <Badge variant="neutral">{getMeetingSessionProviderLabel(meeting.provider)}</Badge>
            {duration ? <Badge variant="neutral">{duration}</Badge> : null}
          </div>
          <p className="mt-3 text-[16px] font-semibold text-[#1f2937]">{meeting.title}</p>
          <p className="mt-1 text-[13px] text-[#9ca3af]">{formatMeetingDateTime(meeting.scheduledStartTime ?? meeting.createdAt)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {participants.slice(0, 3).map((participant) => (
          <span key={participant} className="inline-flex items-center gap-2 rounded-full bg-[#f3f4f6] px-2.5 py-1 text-xs text-[#4b5563]">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-[#6c63ff]">
              {getInitials(participant)}
            </span>
            {participant}
          </span>
        ))}
        {participants.length > 3 ? (
          <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-xs text-[#4b5563]">+{participants.length - 3} more</span>
        ) : null}
      </div>

      <div className="mt-5 flex-1">
        {meeting.status === "completed" ? (
          <>
            {preview ? <p className="line-clamp-2 text-[14px] leading-6 text-[#6b7280]">{preview}</p> : null}
            {meeting.actionItems.length > 0 ? (
              <div className="mt-4">
                <Badge variant="accent">{meeting.actionItems.length} action items</Badge>
              </div>
            ) : null}
          </>
        ) : meeting.status === "failed" ? (
          <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] p-4">
            <p className="text-sm font-semibold text-[#991b1b]">Recording failed</p>
            <p className="mt-2 text-sm leading-6 text-[#991b1b]">
              {meeting.failureReason || "Artiva could not finish this recording."}
            </p>
          </div>
        ) : (
          <div className="rounded-xl bg-[#f9fafb] p-4">
            <p className="text-sm text-[#4b5563]">Artiva is recording this meeting...</p>
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-end">
        {meeting.status === "completed" ? (
          <Button asChild>
            <Link href={`/dashboard/meetings/${meeting.id}`}>View Report</Link>
          </Button>
        ) : meeting.status === "failed" ? (
          <Button asChild variant="secondary">
            <Link href={`/dashboard/meetings/${meeting.id}`}>Retry</Link>
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

export function ReportsList() {
  const [reports, setReports] = useState<MeetingSessionRecord[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [date, setDate] = useState<DateFilter>("all");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 6,
    totalPages: 1
  });

  const normalizedSearch = useMemo(() => search.trim(), [search]);

  useEffect(() => {
    setPage(1);
  }, [normalizedSearch, status, date]);

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      setIsLoading(true);
      setError(null);
      setUpgradeRequired(false);

      try {
        const result = await fetchMeetingReports({
          page,
          limit: 6,
          status,
          date,
          search: normalizedSearch
        });

        if (!cancelled) {
          setReports(result.meetings);
          setPagination(result.pagination);
          setUpgradeRequired(false);
        }
      } catch (loadError) {
        if (!cancelled) {
          if ((loadError as Error & { status?: number }).status === 403) {
            setUpgradeRequired(true);
            setError(null);
            return;
          }
          setError(loadError instanceof Error ? loadError.message : "Failed to load reports.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadReports();

    return () => {
      cancelled = true;
    };
  }, [date, normalizedSearch, page, status]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1>Meeting Reports</h1>
          <p className="mt-1">From meetings to meaningful work.</p>
        </div>
        <label className="flex w-full max-w-md items-center gap-3 rounded-lg border border-[#d1d5db] bg-white px-4 py-2">
          <Search className="h-4 w-4 text-[#9ca3af]" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search reports..."
            className="w-full border-0 bg-transparent p-0 text-sm text-[#374151] outline-none placeholder:text-[#9ca3af]"
          />
        </label>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="flex items-center gap-3 rounded-lg border border-[#d1d5db] bg-white px-4 py-2">
            <Search className="h-4 w-4 text-[#9ca3af]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search reports..."
              className="w-full border-0 bg-transparent p-0 text-sm text-[#374151] outline-none placeholder:text-[#9ca3af]"
            />
          </label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            className="rounded-lg border border-[#d1d5db] bg-white px-4 py-2 text-sm text-[#374151] outline-none"
          >
            <option value="all">All</option>
            <option value="completed">Completed</option>
            <option value="recording">Recording</option>
            <option value="failed">Failed</option>
          </select>
          <select
            value={date}
            onChange={(event) => setDate(event.target.value as DateFilter)}
            className="rounded-lg border border-[#d1d5db] bg-white px-4 py-2 text-sm text-[#374151] outline-none"
          >
            <option value="all">All time</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
          </select>
        </div>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <Card key={index} className="p-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="shimmer h-12 w-12 rounded-full" />
                  <div className="space-y-2">
                    <div className="shimmer h-4 w-40 rounded-full" />
                    <div className="shimmer h-3 w-32 rounded-full" />
                  </div>
                </div>
                <div className="shimmer h-20 rounded-xl" />
              </div>
            </Card>
          ))}
        </div>
      ) : upgradeRequired ? (
        <Card className="border-[#fde68a] bg-[#fffbeb] p-6">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b45309]">Locked Feature</p>
            <h2 className="text-2xl font-bold text-[#111827]">Meeting reports require Pro or Elite</h2>
            <p className="max-w-2xl text-sm leading-6 text-[#92400e]">
              Upgrade to see completed meeting reports and recording history.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/dashboard/billing">
                  Upgrade now
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/dashboard/tools">Keep using tools</Link>
              </Button>
            </div>
          </div>
        </Card>
      ) : error ? (
        <Card className="border-[#fecaca] p-6">
          <p className="text-sm font-semibold text-[#991b1b]">Unable to load reports</p>
          <p className="mt-2 text-sm text-[#991b1b]">{error}</p>
        </Card>
      ) : reports.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No meeting reports yet"
          description="Start AI Notetaker on a Google Meet to generate your first report."
        />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {reports.map((meeting) => (
              <ReportCard key={meeting.id} meeting={meeting} />
            ))}
          </div>
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.total}
            pageSize={pagination.limit}
            itemLabel="reports"
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
