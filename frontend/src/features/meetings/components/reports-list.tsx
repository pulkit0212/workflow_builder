"use client";

import { useEffect, useMemo, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, FileText, Search } from "lucide-react";
import { SkeletonList } from "@/components/SkeletonCard";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { Card } from "@/components/ui/card";
import type { MeetingSessionRecord } from "@/features/meeting-assistant/types";
import { getMeetingSessionProviderLabel, getMeetingSessionStatusLabel } from "@/features/meeting-assistant/helpers";
import type { ReportsResponse } from "@/features/meetings/api";
import { formatMeetingDateTime, formatMeetingDuration, getMeetingSummaryPreview } from "@/features/meetings/helpers";
import { useWorkspaceContext } from "@/contexts/workspace-context";
import { useApiFetch } from "@/hooks/useApiFetch";

type StatusFilter = "all" | "completed" | "recording" | "failed";
type DateFilter = "all" | "week" | "month";

function getParticipants(meeting: MeetingSessionRecord) {
  const owners = Array.from(new Set((meeting.actionItems ?? []).map((item) => item.owner).filter(Boolean)));
  if (owners.length > 0) return owners as string[];
  return ["Artivaa"];
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function getStatusVariant(status: MeetingSessionRecord["status"], hasSummary: boolean) {
  if (hasSummary && (status === "draft" || status === "completed")) return "available" as const;
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

function getDisplayStatus(status: MeetingSessionRecord["status"], hasSummary: boolean) {
  if (hasSummary && (status === "draft" || status === "completed")) return "Completed";
  if (status === "capturing") return "Recording";
  return getMeetingSessionStatusLabel(status);
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
  const hasSummary = !!(meeting.summary?.trim() || meeting.transcript?.trim());
  const statusVariant = getStatusVariant(meeting.status, hasSummary);
  const displayStatus = getDisplayStatus(meeting.status, hasSummary);

  const statusColors: Record<string, string> = {
    available: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    danger: "bg-red-50 text-red-600 ring-red-200",
    accent: "bg-[#6c63ff]/10 text-[#6c63ff] ring-[#6c63ff]/20",
    info: "bg-blue-50 text-blue-600 ring-blue-200",
    neutral: "bg-slate-100 text-slate-500 ring-slate-200",
  };

  return (
    <Link
      href={`/dashboard/meetings/${meeting.id}` as Route}
      className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-[#6c63ff]/50 hover:bg-[#faf9ff] hover:shadow-lg hover:shadow-[#6c63ff]/10 focus:outline-none focus:ring-2 focus:ring-[#6c63ff]/40"
    >
      {/* Top row */}
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#6c63ff] to-[#9b8fff] text-sm font-semibold text-white">
          {getInitials(meeting.title || "A")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusColors[statusVariant] ?? statusColors.neutral}`}>
              {isRecordingState(meeting.status) && <span className="mr-1 h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
              {displayStatus}
            </span>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">
              {getMeetingSessionProviderLabel(meeting.provider)}
            </span>
            {duration && (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">
                {duration}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm font-bold text-slate-900 truncate">{meeting.title}</p>
          <p className="mt-0.5 text-xs text-slate-400">{formatMeetingDateTime(meeting.scheduledStartTime ?? meeting.createdAt)}</p>
        </div>
      </div>

      {/* Participants + tags */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {participants.slice(0, 3).map((p) => (
          <span key={p} className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#6c63ff]/10 text-[9px] font-bold text-[#6c63ff]">
              {getInitials(p)}
            </span>
            {p}
          </span>
        ))}
        {participants.length > 3 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-400">+{participants.length - 3}</span>
        )}
        {meeting.recordingUrl && (
          <span className="rounded-full bg-[#f5f3ff] px-2 py-0.5 text-[11px] text-[#6c63ff]">🎵 Recording</span>
        )}
        {meeting.insights && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-600">📊 Insights</span>
        )}
      </div>

      {/* Preview */}
      <div className="mt-3 flex-1">
        {hasSummary && preview ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">{preview}</p>
        ) : meeting.status === "failed" ? (
          <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2">
            <p className="text-xs text-red-600">{meeting.failureReason || "Recording failed."}</p>
          </div>
        ) : isRecordingState(meeting.status) ? (
          <p className="text-xs italic text-slate-400">Processing…</p>
        ) : null}
        {(meeting.actionItems?.length ?? 0) > 0 && (
          <span className="mt-2 inline-flex items-center rounded-full bg-[#6c63ff]/10 px-2 py-0.5 text-[11px] font-semibold text-[#6c63ff] ring-1 ring-[#6c63ff]/20">
            {meeting.actionItems!.length} action item{meeting.actionItems!.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className={`text-xs font-medium ${hasSummary ? "text-emerald-600" : isRecordingState(meeting.status) ? "text-blue-500" : "text-slate-300"}`}>
          {hasSummary ? "✓ Summary ready" : isRecordingState(meeting.status) ? "In progress" : ""}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#6c63ff] opacity-0 transition-opacity group-hover:opacity-100">
          View Report <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}

export function ReportsList() {
  const { activeWorkspaceId } = useWorkspaceContext();
  const apiFetch = useApiFetch();
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

  async function loadReportsData(params: {
    page: number;
    limit: number;
    status: StatusFilter;
    date: DateFilter;
    search: string;
  }) {
    const query = new URLSearchParams({
      page: String(params.page),
      limit: String(params.limit),
      status: params.status,
      date: params.date,
      search: params.search,
    });
    const response = await apiFetch(`/api/meetings/reports?${query.toString()}`, {
      cache: "no-store",
    });
    const payload = (await response.json()) as ReportsResponse | { success: false; message: string; details?: { error?: string } };

    if (!response.ok) {
      const error = new Error("message" in payload ? payload.message : "Failed to load meeting reports.");
      (error as Error & { status?: number }).status = response.status;
      if (payload && typeof payload === "object" && "details" in payload && payload.details && typeof payload.details === "object") {
        const details = payload.details as { error?: string };
        if (details.error) {
          (error as Error & { code?: string }).code = details.error;
        }
      }
      throw error;
    }

    return payload as ReportsResponse;
  }

  useEffect(() => {
    setPage(1);
  }, [normalizedSearch, status, date, activeWorkspaceId]);

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      setIsLoading(true);
      setError(null);
      setUpgradeRequired(false);

      try {
        const result = await loadReportsData({
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
    // Re-fetch when activeWorkspaceId changes (Req 5.4)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, normalizedSearch, page, status, activeWorkspaceId]);

  async function handleRetry() {
    setIsLoading(true);
    setError(null);

    try {
      const result = await loadReportsData({
        page,
        limit: 6,
        status,
        date,
        search: normalizedSearch
      });
      setReports(result.meetings);
      setPagination(result.pagination);
      setUpgradeRequired(false);
    } catch (loadError) {
      if ((loadError as Error & { status?: number }).status === 403) {
        setUpgradeRequired(true);
        setError(null);
      } else {
        setError(loadError instanceof Error ? loadError.message : "Failed to load reports.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#6c63ff]">Reports</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Meeting Reports</h1>
          <p className="mt-1 text-sm text-slate-400">From meetings to meaningful work.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-[#6c63ff]/40">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reports…"
            className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-[#6c63ff]/40 sm:w-40"
        >
          <option value="all">All status</option>
          <option value="completed">Completed</option>
          <option value="recording">Recording</option>
          <option value="failed">Failed</option>
        </select>
        <select
          value={date}
          onChange={(e) => setDate(e.target.value as DateFilter)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-[#6c63ff]/40 sm:w-40"
        >
          <option value="all">All time</option>
          <option value="week">This week</option>
          <option value="month">This month</option>
        </select>
      </div>

      {isLoading ? (
        <SkeletonList count={4} />
      ) : upgradeRequired ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">Locked Feature</p>
          <h2 className="text-lg font-bold text-slate-900">Meeting reports require Pro or Elite</h2>
          <p className="text-sm text-amber-700">Upgrade to see completed meeting reports and recording history.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link href="/dashboard/billing"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#6c63ff] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5b52e0] transition-colors">
              Upgrade now <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link href="/dashboard/tools"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
              Keep using tools
            </Link>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-red-700">Unable to load reports</p>
            <p className="mt-0.5 text-sm text-red-500">{error}</p>
          </div>
          <button onClick={() => void handleRetry()}
            className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors">
            Retry
          </button>
        </div>
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
