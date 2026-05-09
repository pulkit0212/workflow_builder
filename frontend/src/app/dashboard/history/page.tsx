"use client";

import { useEffect, useMemo, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, History, Plus } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { formatHistoryDate, formatPreview } from "@/features/history/helpers";
import { useApiFetch, useIsAuthReady } from "@/hooks/useApiFetch";

const ITEMS_PER_PAGE = 6;

type HistoryRun = {
  id: string;
  title: string | null;
  status: string;
  inputJson: unknown;
  outputJson: unknown;
  model: string | null;
  tokensUsed: number | null;
  createdAt: string;
  updatedAt: string;
  tool: { slug: string; name: string; description: string };
};

// ─── Tool config ──────────────────────────────────────────────────────────────
const TOOL_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  "meeting-summarizer":  { label: "MEETING SUMMARIZER",  icon: "description",    color: "#6C3FF5", bg: "#EDE9FE" },
  "task-generator":      { label: "TASK GENERATOR",      icon: "task_alt",       color: "#059669", bg: "#D1FAE5" },
  "document-analyzer":   { label: "DOCUMENT ANALYSIS",   icon: "article",        color: "#D97706", bg: "#FEF3C7" },
  "email-generator":     { label: "EMAIL GENERATOR",     icon: "mail",           color: "#2563EB", bg: "#DBEAFE" },
  "ai-strategy-run":     { label: "AI STRATEGY RUN",     icon: "psychology",     color: "#7C3AED", bg: "#EDE9FE" },
  "document-summarizer": { label: "DOCUMENT SUMMARIZER", icon: "summarize",      color: "#B45309", bg: "#FEF3C7" },
};

function getToolConfig(slug: string) {
  return TOOL_CONFIG[slug] ?? { label: slug.toUpperCase().replace(/-/g, " "), icon: "auto_awesome", color: "#6C3FF5", bg: "#EDE9FE" };
}

function getStatusStyle(status: string) {
  if (status === "completed") return { bg: "#E6F4EA", color: "#137333", label: "Completed" };
  if (status === "failed")    return { bg: "#FCE8E6", color: "#C5221F", label: "Failed" };
  if (status === "processing" || status === "running") return { bg: "#E8F0FE", color: "#1A73E8", label: "Processing" };
  return { bg: "#FEF7E0", color: "#B06000", label: status };
}

// ─── Run Card — Stitch style ──────────────────────────────────────────────────
function RunCard({ run }: { run: HistoryRun }) {
  const tool = getToolConfig(run.tool.slug);
  const status = getStatusStyle(run.status);
  const preview = formatPreview(run);
  const isProcessing = run.status === "processing" || run.status === "running";
  const isFailed = run.status === "failed";

  // Safely extract rich content from outputJson
  const out = (run.outputJson && typeof run.outputJson === "object" ? run.outputJson : {}) as Record<string, unknown>;

  // Key points — try multiple field names
  const keyPoints: string[] = (() => {
    const candidates = [out.keyPoints, out.key_points, out.keypoints, out.highlights, out.insights];
    for (const c of candidates) {
      if (Array.isArray(c) && c.length > 0) {
        return (c as unknown[]).slice(0, 3).map((p) => typeof p === "string" ? p : typeof p === "object" && p !== null && "text" in p ? String((p as Record<string, unknown>).text) : "").filter(Boolean);
      }
    }
    return [];
  })();

  // Action items — try multiple field names
  const actionItems: string[] = (() => {
    const candidates = [out.actionItems, out.action_items, out.tasks, out.items];
    for (const c of candidates) {
      if (Array.isArray(c) && c.length > 0) {
        return (c as unknown[]).slice(0, 3).map((p) => {
          if (typeof p === "string") return p;
          if (typeof p === "object" && p !== null) {
            const obj = p as Record<string, unknown>;
            return String(obj.task ?? obj.title ?? obj.text ?? obj.description ?? "");
          }
          return "";
        }).filter(Boolean);
      }
    }
    return [];
  })();

  // Summary text
  const summaryText: string = (() => {
    const candidates = [out.summary, out.text, out.content, out.result, out.output];
    for (const c of candidates) {
      if (typeof c === "string" && c.trim().length > 20) return c.trim();
    }
    // Try nested objects
    for (const val of Object.values(out)) {
      if (typeof val === "string" && val.trim().length > 30) return val.trim();
    }
    return preview || "";
  })();

  // Decide what to show: keyPoints > actionItems > summary
  const showKeyPoints = keyPoints.length > 0;
  const showActionItems = !showKeyPoints && actionItems.length > 0;
  const showSummary = !showKeyPoints && !showActionItems && summaryText.length > 0;

  return (
    <div className="flex flex-col rounded-xl border border-[#DADCE0] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:shadow-md hover:border-[#6C3FF5]/30 overflow-hidden min-h-[360px]">
      {/* Card header */}
      <div className="p-6 pb-4 flex-1">
        <div className="flex items-start justify-between gap-2 mb-3">
          {/* Tool badge */}
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: tool.bg }}>
              <span className="material-symbols-outlined text-[16px]" style={{ color: tool.color }}>{tool.icon}</span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: tool.color }}>
              {tool.label}
            </span>
          </div>
          {/* Status badge */}
          <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
            style={{ background: status.bg, color: status.color }}>
            {isProcessing && <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse mr-1" />}
            {status.label}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-base font-bold text-[#202124] mb-1 leading-snug">
          {run.title ?? "Untitled run"}
        </h3>
        <p className="text-xs text-[#5F6368] mb-3">{formatHistoryDate(run.createdAt)}</p>

        {/* Content */}
        {isFailed ? (
          <div className="flex items-center gap-2 text-xs text-[#C5221F]">
            <span className="material-symbols-outlined text-[14px]">warning</span>
            {preview || "Run failed. Please try again."}
          </div>
        ) : isProcessing ? (
          <div className="space-y-2">
            <div className="h-2 w-full rounded-full bg-[#E8F0FE] overflow-hidden">
              <div className="h-full rounded-full bg-[#1A73E8] animate-pulse" style={{ width: "60%" }} />
            </div>
            <p className="text-xs text-[#5F6368] italic">Analyzing…</p>
          </div>
        ) : showKeyPoints ? (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#9AA0A6]">Key Points</p>
            <ul className="space-y-1.5">
              {keyPoints.map((point, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-[#5F6368]">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6C3FF5]" />
                  <span className="line-clamp-2">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : showActionItems ? (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#9AA0A6]">
              Action Items
              <span className="ml-1.5 rounded-full bg-[#EDE9FE] px-1.5 py-0.5 text-[#6C3FF5]">{actionItems.length}</span>
            </p>
            <ul className="space-y-1.5">
              {actionItems.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-[#5F6368]">
                  <span className="material-symbols-outlined text-[#6C3FF5] text-[13px] mt-0.5">radio_button_unchecked</span>
                  <span className="line-clamp-2">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : showSummary ? (
          <p className="text-xs text-[#5F6368] leading-relaxed line-clamp-4 italic">&ldquo;{summaryText.slice(0, 200)}{summaryText.length > 200 ? "…" : ""}&rdquo;</p>
        ) : (
          <p className="text-xs text-[#9AA0A6] italic">No preview available.</p>
        )}
      </div>

      {/* Card footer */}
      <div className="border-t border-[#DADCE0] px-5 py-3 flex items-center justify-between bg-[#F8F9FA]">
        {isFailed ? (
          <button type="button" className="text-xs font-semibold text-[#C5221F] hover:underline">
            Retry Run
          </button>
        ) : isProcessing ? (
          <span className="text-xs text-[#5F6368]">Processing…</span>
        ) : (
          <Link href={`/dashboard/history/${run.id}` as Route}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#6C3FF5] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#5B2FE0] transition-colors">
            {run.tool.slug === "task-generator" ? "Open Tasks" :
             run.tool.slug === "document-analyzer" ? "View Analysis" :
             run.tool.slug === "meeting-summarizer" ? "View Summary" :
             "View Results"}
          </Link>
        )}
        <button type="button" className="rounded-lg p-1.5 text-[#9AA0A6] hover:bg-[#F1F3F4] hover:text-[#5F6368] transition-colors">
          <span className="material-symbols-outlined text-[18px]">more_vert</span>
        </button>
      </div>
    </div>
  );
}

// ─── Empty card placeholder ───────────────────────────────────────────────────
function EmptyRunCard() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#DADCE0] bg-[#F8F9FA] p-8 text-center min-h-[360px]">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F4] mb-3">
        <Plus className="h-6 w-6 text-[#9AA0A6]" />
      </div>
      <p className="text-sm font-semibold text-[#5F6368]">Start a new run</p>
      <p className="text-xs text-[#9AA0A6] mt-1">Your AI processing history will appear here.</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function HistoryPage() {
  const apiFetch = useApiFetch();
  const isAuthReady = useIsAuthReady();
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [runTypeFilter, setRunTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [timeFilter, setTimeFilter] = useState("30d");

  useEffect(() => {
    if (!isAuthReady) return;
    let isMounted = true;
    async function loadRuns() {
      setIsLoading(true); setUpgradeRequired(false);
      try {
        const response = await apiFetch("/api/ai-runs", { cache: "no-store" });
        const payload = await response.json() as { success: true; runs: HistoryRun[] } | { success: false; message: string };
        if (!isMounted) return;
        if (!response.ok || !payload.success) {
          if (response.status === 403) { setUpgradeRequired(true); setLoadError(null); return; }
          setLoadError("message" in payload ? payload.message : "Failed to load run history.");
          return;
        }
        setRuns(payload.runs);
      } catch (error) {
        if (isMounted) setLoadError(error instanceof Error ? error.message : "Failed to load run history.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    void loadRuns();
    return () => { isMounted = false; };
  }, [isAuthReady]);

  const filteredRuns = useMemo(() => {
    let result = runs;
    if (runTypeFilter !== "all") result = result.filter(r => r.tool.slug === runTypeFilter);
    if (statusFilter !== "all") result = result.filter(r => r.status === statusFilter);
    if (timeFilter !== "all") {
      const days = timeFilter === "7d" ? 7 : timeFilter === "30d" ? 30 : 90;
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
      result = result.filter(r => new Date(r.createdAt) >= cutoff);
    }
    return result;
  }, [runs, runTypeFilter, statusFilter, timeFilter]);

  const totalPages = Math.max(Math.ceil(filteredRuns.length / ITEMS_PER_PAGE), 1);
  const paginatedRuns = useMemo(
    () => filteredRuns.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
    [currentPage, filteredRuns]
  );

  // Pad to 6 cards with empty placeholder
  const displayCards = [...paginatedRuns];
  if (displayCards.length < ITEMS_PER_PAGE && displayCards.length > 0) {
    displayCards.push(...Array(ITEMS_PER_PAGE - displayCards.length).fill(null));
  }

  const uniqueTools = [...new Set(runs.map(r => r.tool.slug))];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-semibold text-[#202124]" style={{ fontFamily: "'Work Sans', sans-serif" }}>History</h1>
        <p className="text-sm text-[#5F6368] mt-0.5">Track every AI run across your account</p>
      </div>

      {/* Filter bar — Stitch style */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Run Type */}
        <div className="flex items-center gap-2 rounded-lg border border-[#DADCE0] bg-white px-3 py-2 text-sm text-[#5F6368]">
          <span className="text-xs font-semibold text-[#202124]">Run Type:</span>
          <select value={runTypeFilter} onChange={(e) => { setRunTypeFilter(e.target.value); setCurrentPage(1); }}
            className="bg-transparent text-xs font-semibold text-[#6C3FF5] outline-none cursor-pointer">
            <option value="all">All Tools</option>
            {uniqueTools.map(slug => (
              <option key={slug} value={slug}>{getToolConfig(slug).label}</option>
            ))}
          </select>
          <span className="material-symbols-outlined text-[14px] text-[#9AA0A6]">expand_more</span>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 rounded-lg border border-[#DADCE0] bg-white px-3 py-2 text-sm text-[#5F6368]">
          <span className="text-xs font-semibold text-[#202124]">Status:</span>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            className="bg-transparent text-xs font-semibold text-[#6C3FF5] outline-none cursor-pointer">
            <option value="all">Any Status</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="processing">Processing</option>
          </select>
          <span className="material-symbols-outlined text-[14px] text-[#9AA0A6]">expand_more</span>
        </div>

        {/* Timeframe */}
        <div className="flex items-center gap-2 rounded-lg border border-[#DADCE0] bg-white px-3 py-2 text-sm text-[#5F6368]">
          <span className="text-xs font-semibold text-[#202124]">Timeframe:</span>
          <select value={timeFilter} onChange={(e) => { setTimeFilter(e.target.value); setCurrentPage(1); }}
            className="bg-transparent text-xs font-semibold text-[#6C3FF5] outline-none cursor-pointer">
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="all">All Time</option>
          </select>
          <span className="material-symbols-outlined text-[14px] text-[#9AA0A6]">calendar_today</span>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-52 animate-pulse rounded-xl bg-white border border-[#DADCE0]" />
          ))}
        </div>
      ) : upgradeRequired ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-600">Locked Feature</p>
          <h2 className="text-lg font-bold text-[#202124]">History requires Pro or Elite</h2>
          <p className="text-sm text-amber-700">Upgrade to unlock run history for meetings and workflow runs.</p>
          <div className="flex gap-2">
            <Button asChild><Link href="/dashboard/billing">View plans <ArrowRight className="h-4 w-4" /></Link></Button>
            <Button asChild variant="secondary"><Link href="/dashboard/tools">Keep using tools</Link></Button>
          </div>
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-[#FCE8E6] bg-[#FCE8E6] p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-[#C5221F]">{loadError}</p>
        </div>
      ) : filteredRuns.length === 0 ? (
        <EmptyState icon={History} title="No runs found"
          description="Completed AI runs will appear here. Try adjusting your filters." />
      ) : (
        <>
          {/* 3-column card grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayCards.map((run, i) =>
              run ? <RunCard key={run.id} run={run} /> : <EmptyRunCard key={`empty-${i}`} />
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-[#5F6368]">
              Showing {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, filteredRuns.length)}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredRuns.length)} of {filteredRuns.length} results
            </p>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredRuns.length}
              pageSize={ITEMS_PER_PAGE}
              itemLabel="runs"
              onPageChange={setCurrentPage}
            />
          </div>
        </>
      )}
    </div>
  );
}
