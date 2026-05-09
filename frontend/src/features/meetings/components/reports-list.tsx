"use client";

import { useEffect, useMemo, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, FileText, RefreshCw } from "lucide-react";
import { SkeletonList } from "@/components/SkeletonCard";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import type { MeetingSessionRecord } from "@/features/meeting-assistant/types";
import { getMeetingSessionProviderLabel, getMeetingSessionStatusLabel } from "@/features/meeting-assistant/helpers";
import type { ReportsResponse } from "@/features/meetings/api";
import { formatMeetingDateTime, formatMeetingDuration, getMeetingSummaryPreview } from "@/features/meetings/helpers";
import { useWorkspaceContext } from "@/contexts/workspace-context";
import { useApiFetch } from "@/hooks/useApiFetch";

type StatusFilter = "all" | "completed" | "recording" | "failed";
type DateFilter = "all" | "week" | "month";

function getInitials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("");
}

function getDisplayStatus(status: MeetingSessionRecord["status"], hasSummary: boolean) {
  if (hasSummary && (status === "draft" || status === "completed")) return "COMPLETED";
  if (status === "capturing") return "RECORDING";
  if (status === "failed") return "FAILED";
  if (["processing", "summarizing"].includes(status ?? "")) return "PROCESSING";
  return getMeetingSessionStatusLabel(status).toUpperCase();
}

function getStatusStyle(status: MeetingSessionRecord["status"], hasSummary: boolean) {
  const s = getDisplayStatus(status, hasSummary);
  if (s === "COMPLETED") return { bg: "#E6F4EA", color: "#137333" };
  if (s === "FAILED") return { bg: "#FCE8E6", color: "#C5221F" };
  if (s === "RECORDING") return { bg: "#FCE8E6", color: "#C5221F" };
  if (s === "PROCESSING") return { bg: "#FEF7E0", color: "#B06000" };
  return { bg: "#E8F0FE", color: "#1A73E8" };
}

function getPlatformStyle(provider: string | null | undefined) {
  const label = getMeetingSessionProviderLabel((provider ?? "") as Parameters<typeof getMeetingSessionProviderLabel>[0]);
  if (label.toLowerCase().includes("zoom")) return { bg: "#E3F2FD", color: "#2D8CFF", icon: "video_call" };
  if (label.toLowerCase().includes("teams")) return { bg: "#EDE9FE", color: "#6264A7", icon: "groups" };
  return { bg: "#FCE8E6", color: "#EA4335", icon: "videocam" };
}

function isRecordingState(status: MeetingSessionRecord["status"]) {
  return ["joining","waiting_for_join","waiting_for_admission","joined","capturing","recording","recorded","processing_transcript","transcribed","processing_summary","processing","summarizing"].includes(status ?? "");
}

// ─── Report Card — Stitch style ───────────────────────────────────────────────
function ReportCard({ meeting }: { meeting: MeetingSessionRecord }) {
  const duration = formatMeetingDuration(meeting.meetingDuration);
  const preview = meeting.summary?.trim() ? getMeetingSummaryPreview(meeting) : null;
  const hasSummary = !!(meeting.summary?.trim() || meeting.transcript?.trim());
  const displayStatus = getDisplayStatus(meeting.status, hasSummary);
  const statusStyle = getStatusStyle(meeting.status, hasSummary);
  const platformStyle = getPlatformStyle(meeting.provider ?? "");
  const platformLabel = getMeetingSessionProviderLabel(meeting.provider);
  const actionItemCount = meeting.actionItems?.length ?? 0;

  // Smart insights tags from summary content
  const insightTags: string[] = [];
  if (meeting.insights) insightTags.push("Smart Insights");
  if (actionItemCount > 0) insightTags.push(`${actionItemCount} action item${actionItemCount !== 1 ? "s" : ""}`);
  if (meeting.keyDecisions && meeting.keyDecisions.length > 0) insightTags.push("Strategic Insights");

  return (
    <Link href={`/dashboard/meetings/${meeting.id}` as Route}
      className="group flex flex-col rounded-xl border border-[#DADCE0] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:shadow-md hover:border-[#6C3FF5]/30 overflow-hidden">

      {/* Card header */}
      <div className="p-5 pb-3">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] text-sm font-bold text-[#6C3FF5]">
              {getInitials(meeting.title || "A")}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#202124] truncate max-w-[200px]">{meeting.title}</p>
              <p className="text-xs text-[#5F6368] mt-0.5">
                {formatMeetingDateTime(meeting.scheduledStartTime ?? meeting.createdAt)}
              </p>
            </div>
          </div>
          {/* Status badge */}
          <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
            style={{ background: statusStyle.bg, color: statusStyle.color }}>
            {isRecordingState(meeting.status) && displayStatus === "RECORDING" && (
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse mr-1" />
            )}
            {displayStatus}
          </span>
        </div>

        {/* Platform + duration */}
        <div className="flex items-center gap-2 mb-3">
          <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{ background: platformStyle.bg, color: platformStyle.color }}>
            <span className="material-symbols-outlined text-[11px]">{platformStyle.icon}</span>
            {platformLabel}
          </span>
          {duration && (
            <span className="flex items-center gap-1 text-[11px] text-[#5F6368]">
              <span className="material-symbols-outlined text-[12px]">schedule</span>
              {duration}
            </span>
          )}
        </div>

        {/* Insight tags */}
        {insightTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {insightTags.map((tag) => (
              <span key={tag} className="rounded-full bg-[#EDE9FE] px-2 py-0.5 text-[10px] font-semibold text-[#6C3FF5]">
                {tag.includes("action") ? "⚡" : "✦"} {tag}
              </span>
            ))}
          </div>
        )}

        {/* Summary preview */}
        <div className="min-h-[48px]">
          {hasSummary && preview ? (
            <p className="line-clamp-2 text-xs leading-relaxed text-[#5F6368]">{preview}</p>
          ) : meeting.status === "failed" ? (
            <div className="rounded-lg border border-[#FCE8E6] bg-[#FCE8E6] px-3 py-2">
              <p className="text-xs text-[#C5221F]">{meeting.failureReason || "Recording failed."}</p>
            </div>
          ) : isRecordingState(meeting.status) ? (
            <p className="text-xs italic text-[#9AA0A6]">Processing in progress…</p>
          ) : (
            <p className="text-xs text-[#9AA0A6]">No summary available yet.</p>
          )}
        </div>
      </div>

      {/* Card footer */}
      <div className="mt-auto border-t border-[#DADCE0] px-5 py-3 flex items-center justify-between bg-[#F8F9FA]">
        <div className="flex items-center gap-1.5">
          {hasSummary ? (
            <>
              <span className="material-symbols-outlined text-[#34A853] text-[16px]">check_circle</span>
              <span className="text-xs font-semibold text-[#137333]">Summary ready</span>
            </>
          ) : meeting.status === "failed" ? (
            <>
              <span className="material-symbols-outlined text-[#C5221F] text-[16px]">cancel</span>
              <span className="text-xs font-semibold text-[#C5221F]">Summary failed</span>
            </>
          ) : (
            <span className="text-xs text-[#9AA0A6]">In progress</span>
          )}
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#6C3FF5] opacity-0 group-hover:opacity-100 transition-opacity">
          {meeting.status === "failed" ? "Retry Analysis" : "View Full Report"}
          <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}

// ─── ReportsList ──────────────────────────────────────────────────────────────
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
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 6, totalPages: 1 });

  const normalizedSearch = useMemo(() => search.trim(), [search]);

  async function loadReportsData(params: { page: number; limit: number; status: StatusFilter; date: DateFilter; search: string }) {
    const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit), status: params.status, date: params.date, search: params.search });
    const response = await apiFetch(`/api/meetings/reports?${query.toString()}`, { cache: "no-store" });
    const payload = (await response.json()) as ReportsResponse | { success: false; message: string; details?: { error?: string } };
    if (!response.ok) {
      const err = new Error("message" in payload ? payload.message : "Failed to load meeting reports.");
      (err as Error & { status?: number }).status = response.status;
      if (payload && typeof payload === "object" && "details" in payload && payload.details) {
        const details = payload.details as { error?: string };
        if (details.error) (err as Error & { code?: string }).code = details.error;
      }
      throw err;
    }
    return payload as ReportsResponse;
  }

  useEffect(() => { setPage(1); }, [normalizedSearch, status, date, activeWorkspaceId]);

  useEffect(() => {
    let cancelled = false;
    async function loadReports() {
      setIsLoading(true); setError(null); setUpgradeRequired(false);
      try {
        const result = await loadReportsData({ page, limit: 6, status, date, search: normalizedSearch });
        if (!cancelled) { setReports(result.meetings); setPagination(result.pagination); }
      } catch (loadError) {
        if (!cancelled) {
          if ((loadError as Error & { status?: number }).status === 403) { setUpgradeRequired(true); return; }
          setError(loadError instanceof Error ? loadError.message : "Failed to load reports.");
        }
      } finally { if (!cancelled) setIsLoading(false); }
    }
    void loadReports();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, normalizedSearch, page, status, activeWorkspaceId]);

  async function handleRetry() {
    setIsLoading(true); setError(null);
    try {
      const result = await loadReportsData({ page, limit: 6, status, date, search: normalizedSearch });
      setReports(result.meetings); setPagination(result.pagination); setUpgradeRequired(false);
    } catch (loadError) {
      if ((loadError as Error & { status?: number }).status === 403) { setUpgradeRequired(true); setError(null); }
      else setError(loadError instanceof Error ? loadError.message : "Failed to load reports.");
    } finally { setIsLoading(false); }
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-[#202124]" style={{ fontFamily: "'Work Sans', sans-serif" }}>
            Meeting Reports
          </h1>
          <p className="text-sm text-[#5F6368] mt-0.5">From meetings to meaningful work. Review automated transcriptions and AI-generated insights.</p>
        </div>
        <button type="button" onClick={() => void handleRetry()}
          className="inline-flex items-center gap-2 rounded-lg border border-[#DADCE0] bg-white px-4 py-2 text-sm font-medium text-[#5F6368] hover:bg-[#F8F9FA] transition-colors">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Filter bar — Stitch style */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-[#DADCE0] bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-[#6C3FF5]/30">
          <span className="material-symbols-outlined text-[#9AA0A6] text-[18px]">search</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by keyword..."
            className="w-full bg-transparent text-sm text-[#202124] outline-none placeholder:text-[#9AA0A6]" />
        </div>
        {/* Status filter */}
        <div className="flex items-center gap-2 rounded-lg border border-[#DADCE0] bg-white px-3 py-2 text-sm text-[#5F6368] focus-within:ring-2 focus-within:ring-[#6C3FF5]/30 sm:w-40">
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="w-full bg-transparent outline-none cursor-pointer">
            <option value="all">All status</option>
            <option value="completed">Completed</option>
            <option value="recording">Recording</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        {/* Date filter */}
        <div className="flex items-center gap-2 rounded-lg border border-[#DADCE0] bg-white px-3 py-2 text-sm text-[#5F6368] focus-within:ring-2 focus-within:ring-[#6C3FF5]/30 sm:w-36">
          <select value={date} onChange={(e) => setDate(e.target.value as DateFilter)}
            className="w-full bg-transparent outline-none cursor-pointer">
            <option value="all">All time</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
          </select>
        </div>
        {/* More options */}
        <button type="button" className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#DADCE0] bg-white text-[#5F6368] hover:bg-[#F8F9FA] transition-colors">
          <span className="material-symbols-outlined text-[20px]">more_vert</span>
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <SkeletonList count={4} />
      ) : upgradeRequired ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">Locked Feature</p>
          <h2 className="text-lg font-bold text-[#202124]">Meeting reports require Pro or Elite</h2>
          <p className="text-sm text-amber-700">Upgrade to see completed meeting reports and recording history.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link href="/dashboard/billing"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#6C3FF5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5B2FE0] transition-colors">
              Upgrade now <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-[#FCE8E6] bg-[#FCE8E6] p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-[#C5221F]">{error}</p>
          <button onClick={() => void handleRetry()}
            className="rounded-lg border border-[#EA4335] bg-white px-4 py-2 text-sm font-semibold text-[#C5221F] hover:bg-[#FCE8E6] transition-colors">
            Retry
          </button>
        </div>
      ) : reports.length === 0 ? (
        <EmptyState icon={FileText} title="No meeting reports yet"
          description="Start AI Notetaker on a Google Meet to generate your first report." />
      ) : (
        <>
          {/* 2-column card grid — Stitch style */}
          <div className="grid gap-4 lg:grid-cols-2">
            {reports.map((meeting) => (
              <ReportCard key={meeting.id} meeting={meeting} />
            ))}
          </div>
          {/* Pagination */}
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
