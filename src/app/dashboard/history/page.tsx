import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { History } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionHeader } from "@/components/shared/section-header";
import { ResultState } from "@/components/tools/result-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatHistoryDate, formatPreview } from "@/features/history/helpers";
import { getRunsForUser } from "@/lib/ai/execute-tool";

export default async function HistoryPage() {
  const { userId } = await auth();
  let runs = [] as Awaited<ReturnType<typeof getRunsForUser>>;
  let loadError: string | null = null;

  if (userId) {
    try {
      runs = await getRunsForUser(userId);
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Failed to load run history.";
    }
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="History"
        title="Workflow run history"
        description="Shared history across the authenticated user’s workflow runs, designed to support every tool that plugs into the registry."
      />
      <Card className="p-6">
        {loadError ? (
          <ResultState icon="error" title="Unable to load history" description={loadError} className="border-none p-0 shadow-none" />
        ) : runs.length === 0 ? (
          <EmptyState
            icon={History}
            title="No workflow history yet"
            description="Completed Meeting Summarizer runs will appear here immediately, and future tools can reuse the same history structure."
          />
        ) : (
          <div className="space-y-4">
            <div className="hidden grid-cols-[160px_minmax(0,1fr)_180px_120px] gap-4 rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 p-4 md:grid">
              {["Tool", "Title & Preview", "Created", "Status"].map((column) => (
                <div key={column} className="text-sm font-medium text-slate-500">
                  {column}
                </div>
              ))}
            </div>
            {runs.map((run) => (
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
                <div className="text-sm text-slate-600">{formatHistoryDate(run.createdAt.toISOString())}</div>
                <div>
                  <Badge variant={run.status === "completed" ? "available" : "pending"}>{run.status}</Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
