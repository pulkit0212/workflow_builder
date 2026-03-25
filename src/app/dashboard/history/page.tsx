"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { History } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { SectionHeader } from "@/components/shared/section-header";
import { ResultState } from "@/components/tools/result-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatHistoryDate, formatPreview } from "@/features/history/helpers";

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

export default function HistoryPage() {
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadRuns() {
      setIsLoading(true);

      try {
        const response = await fetch("/api/ai-runs", {
          cache: "no-store"
        });
        const payload = (await response.json()) as
          | { success: true; runs: HistoryRun[] }
          | { success: false; message: string };

        if (!isMounted) {
          return;
        }

        if (!response.ok || !payload.success) {
          setLoadError("message" in payload ? payload.message : "Failed to load run history.");
          return;
        }

        setRuns(payload.runs);
      } catch (error) {
        if (isMounted) {
          setLoadError(error instanceof Error ? error.message : "Failed to load run history.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadRuns();

    return () => {
      isMounted = false;
    };
  }, []);

  const totalPages = Math.max(Math.ceil(runs.length / ITEMS_PER_PAGE), 1);
  const paginatedRuns = useMemo(
    () => runs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
    [currentPage, runs]
  );

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="History"
        title="Workflow run history"
        description="Shared history across the authenticated user’s workflow runs, designed to support every tool that plugs into the registry."
      />
      <Card className="p-6">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="shimmer h-16 rounded-3xl" />
            ))}
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
          <div className="space-y-4">
            <p className="text-sm text-[#6b7280]">
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, runs.length)} of {runs.length} meetings
            </p>
            <div className="hidden grid-cols-[160px_minmax(0,1fr)_180px_120px] gap-4 rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 p-4 md:grid">
              {["Tool", "Title & Preview", "Created", "Status"].map((column) => (
                <div key={column} className="text-sm font-medium text-slate-500">
                  {column}
                </div>
              ))}
            </div>
            {paginatedRuns.map((run) => (
              <Link
                key={run.id}
                href={`/dashboard/history/${run.id}`}
                className="grid gap-4 rounded-3xl border border-slate-200 bg-white/80 p-5 transition-all hover:-translate-y-[1px] hover:border-sky-200 hover:bg-white md:grid-cols-[160px_minmax(0,1fr)_180px_120px] md:items-start"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{run.tool.name}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{run.tool.slug}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-950">{run.title || "Untitled run"}</p>
                  <p className="text-sm leading-6 text-slate-600">{formatPreview(run)}</p>
                </div>
                <div className="text-sm text-slate-600">{formatHistoryDate(run.createdAt)}</div>
                <div>
                  <Badge variant={run.status === "completed" ? "available" : "pending"}>{run.status}</Badge>
                </div>
              </Link>
            ))}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={runs.length}
              pageSize={ITEMS_PER_PAGE}
              itemLabel="meetings"
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
