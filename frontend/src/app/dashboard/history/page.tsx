"use client";

import { useEffect, useMemo, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  History,
  ListTodo,
  Mail,
  XCircle,
  Zap,
} from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { ResultState } from "@/components/tools/result-state";
import { Button } from "@/components/ui/button";
import { formatHistoryDate, formatPreview } from "@/features/history/helpers";
import { useApiFetch, useIsAuthReady } from "@/hooks/useApiFetch";

const ITEMS_PER_PAGE = 8;

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
  tool: {
    slug: string;
    name: string;
    description: string;
  };
};

const TOOL_ICONS: Record<string, React.ReactNode> = {
  "email-generator": <Mail className="h-4 w-4" />,
  "task-generator": <ListTodo className="h-4 w-4" />,
  "document-analyzer": <FileText className="h-4 w-4" />,
  "meeting-summarizer": <FileText className="h-4 w-4" />,
};

const TOOL_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  "email-generator":     { bg: "bg-blue-50",   text: "text-blue-600",   ring: "ring-blue-200" },
  "task-generator":      { bg: "bg-emerald-50", text: "text-emerald-600", ring: "ring-emerald-200" },
  "document-analyzer":   { bg: "bg-amber-50",  text: "text-amber-600",  ring: "ring-amber-200" },
  "meeting-summarizer":  { bg: "bg-[#f5f3ff]", text: "text-[#6c63ff]",  ring: "ring-[#c4b5fd]" },
};

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
        <CheckCircle2 className="h-3 w-3" /> completed
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600 ring-1 ring-red-200">
        <XCircle className="h-3 w-3" /> failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-600 ring-1 ring-amber-200">
      <Clock className="h-3 w-3" /> {status}
    </span>
  );
}

function ToolChip({ slug, name }: { slug: string; name: string }) {
  const colors = TOOL_COLORS[slug] ?? { bg: "bg-slate-50", text: "text-slate-600", ring: "ring-slate-200" };
  const icon = TOOL_ICONS[slug] ?? <Zap className="h-4 w-4" />;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${colors.bg} ${colors.text} ${colors.ring}`}>
      {icon} {name}
    </span>
  );
}

export default function HistoryPage() {
  const apiFetch = useApiFetch();
  const isAuthReady = useIsAuthReady();
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [upgradeRequired, setUpgradeRequired] = useState(false);

  useEffect(() => {
    if (!isAuthReady) return;
    let isMounted = true;
    async function loadRuns() {
      setIsLoading(true);
      setUpgradeRequired(false);
      try {
        const response = await apiFetch("/api/ai-runs", { cache: "no-store" });
        const payload = (await response.json()) as
          | { success: true; runs: HistoryRun[] }
          | { success: false; message: string };
        if (!isMounted) return;
        if (!response.ok || !payload.success) {
          if (response.status === 403) { setUpgradeRequired(true); setLoadError(null); return; }
          setLoadError("message" in payload ? payload.message : "Failed to load run history.");
          return;
        }
        setUpgradeRequired(false);
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

  const totalPages = Math.max(Math.ceil(runs.length / ITEMS_PER_PAGE), 1);
  const paginatedRuns = useMemo(
    () => runs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
    [currentPage, runs]
  );

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f5f3ff] ring-1 ring-[#ede9fe]">
            <History className="h-5 w-5 text-[#6c63ff]" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">AI Run History</h1>
            <p className="mt-0.5 text-sm text-slate-500">Track every summarizer, generator, and analyzer run across your account.</p>
          </div>
        </div>
        {runs.length > 0 && (
          <div className="shrink-0 rounded-xl bg-[#f5f3ff] px-3.5 py-2 text-center">
            <p className="text-lg font-bold text-[#6c63ff]">{runs.length}</p>
            <p className="text-[10px] font-semibold text-[#9b8fff]">total runs</p>
          </div>
        )}
      </div>

      {/* ── Content ── */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : upgradeRequired ? (
        <div className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 p-8">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-600">Locked Feature</p>
          <h2 className="mt-2 text-xl font-bold text-slate-900">History requires Pro or Elite</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-amber-700">
            Upgrade to unlock run history for meetings and workflow runs. Free users keep unlimited access to the three generator tools.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild><Link href="/dashboard/billing">View plans <ArrowRight className="h-4 w-4" /></Link></Button>
            <Button asChild variant="secondary"><Link href="/dashboard/tools">Keep using tools</Link></Button>
          </div>
        </div>
      ) : loadError ? (
        <ResultState icon="error" title="Unable to load history" description={loadError} className="border-none p-0 shadow-none" />
      ) : runs.length === 0 ? (
        <EmptyState
          icon={History}
          title="No workflow history yet"
          description="Completed Meeting Summarizer runs will appear here immediately, and future tools can reuse the same history structure."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* Table header */}
          <div className="hidden border-b border-slate-100 bg-slate-50/80 px-6 py-3 md:grid md:grid-cols-[190px_minmax(0,1fr)_140px_140px]">
            {["Tool", "Title & Preview", "Created", "Status"].map((col) => (
              <p key={col} className="text-xs font-semibold uppercase tracking-widest text-slate-400">{col}</p>
            ))}
          </div>

          {/* Rows */}
          <div className="divide-y divide-slate-50">
            {paginatedRuns.map((run) => {
              const preview = formatPreview(run);
              return (
                <Link
                  key={run.id}
                  href={`/dashboard/history/${run.id}` as Route}
                  className="group flex flex-col gap-3 px-6 py-5 transition-colors hover:bg-[#faf9ff] md:grid md:grid-cols-[190px_minmax(0,1fr)_140px_140px] md:items-start"
                >
                  {/* Tool */}
                  <div className="pt-0.5">
                    <ToolChip slug={run.tool.slug} name={run.tool.name} />
                  </div>

                  {/* Title + preview */}
                  <div className="min-w-0 space-y-1.5">
                    <p className="text-sm font-semibold text-slate-900 group-hover:text-[#6c63ff] transition-colors leading-snug">
                      {run.title ?? "Untitled run"}
                    </p>
                    <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">{preview}</p>
                  </div>

                  {/* Date */}
                  <p className="pt-0.5 text-xs text-slate-500">{formatHistoryDate(run.createdAt)}</p>

                  {/* Status + arrow */}
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <StatusBadge status={run.status} />
                    <ArrowRight className="h-3.5 w-3.5 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 group-hover:text-[#6c63ff]" />
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="border-t border-slate-100 px-6 py-4">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={runs.length}
                pageSize={ITEMS_PER_PAGE}
                itemLabel="runs"
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
