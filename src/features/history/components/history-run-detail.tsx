"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarDays, FileText } from "lucide-react";
import { ActionItemsCard } from "@/components/tools/action-items-card";
import { KeyPointsCard } from "@/components/tools/key-points-card";
import { ResultState } from "@/components/tools/result-state";
import { SummaryCard } from "@/components/tools/summary-card";
import { SectionHeader } from "@/components/shared/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getMeetingProviderLabel } from "@/features/tools/meeting-summarizer/config";
import { meetingSummarizerOutputSchema } from "@/features/tools/meeting-summarizer/schema";
import { formatHistoryDateTime } from "@/features/history/helpers";
import type { AiRunDetailResponse, AiRunErrorResponse, MeetingHistoryRun } from "@/features/history/types";
import { getProviderFromInput } from "@/features/history/types";

type HistoryRunDetailProps = {
  runId: string;
};

function HistoryRunDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 w-24 rounded-full bg-slate-100" />
          <div className="h-8 w-72 rounded-full bg-slate-200" />
          <div className="h-5 w-64 rounded-full bg-slate-100" />
        </div>
      </Card>
      {[0, 1, 2].map((index) => (
        <Card key={index} className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-5 w-36 rounded-full bg-slate-200" />
            <div className="h-24 rounded-2xl bg-slate-100" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function parseMeetingHistoryRun(run: AiRunDetailResponse["run"]): MeetingHistoryRun | null {
  const parsedOutput = meetingSummarizerOutputSchema.safeParse(run.outputJson);

  if (!parsedOutput.success) {
    return null;
  }

  return {
    ...run,
    outputJson: parsedOutput.data
  };
}

export function HistoryRunDetail({ runId }: HistoryRunDetailProps) {
  const [run, setRun] = useState<MeetingHistoryRun | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [upgradeRequired, setUpgradeRequired] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadRun() {
      setIsLoading(true);
      setError(null);
      setNotFound(false);

      try {
        const response = await fetch(`/api/ai-runs/${runId}`, {
          cache: "no-store"
        });
        const payload = (await response.json()) as AiRunDetailResponse | AiRunErrorResponse;

        if (!response.ok || !payload.success) {
          if (response.status === 404 || response.status === 403) {
            if (isMounted) {
              if (response.status === 403) {
                setUpgradeRequired(true);
              } else {
                setNotFound(true);
              }
            }
            return;
          }

          throw new Error("message" in payload ? payload.message : "Failed to load run details.");
        }

        const parsedRun = parseMeetingHistoryRun(payload.run);

        if (!parsedRun) {
          throw new Error("This run could not be rendered in the detail view.");
        }

        if (isMounted) {
          setRun(parsedRun);
        }
      } catch (fetchError) {
        if (isMounted) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load run details.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadRun();

    return () => {
      isMounted = false;
    };
  }, [runId]);

  if (isLoading) {
    return <HistoryRunDetailSkeleton />;
  }

  if (notFound) {
    return (
      <ResultState
        title="Run not found"
        description="This saved run is unavailable or you no longer have access to it."
      >
        <Button asChild variant="secondary">
          <Link href="/dashboard/history">Back to history</Link>
        </Button>
      </ResultState>
    );
  }

  if (upgradeRequired) {
    return (
      <Card className="border-[#fde68a] bg-[#fffbeb] p-6">
        <div className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b45309]">Locked Feature</p>
          <h1 className="text-2xl font-bold text-[#111827]">Meeting history requires Pro or Elite</h1>
          <p className="max-w-2xl text-sm leading-6 text-[#92400e]">
            Upgrade to view saved transcripts, summaries, and action items from your meeting history.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/dashboard/billing">
                Upgrade now
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/dashboard/history">Back to history</Link>
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  if (error || !run) {
    return (
      <ResultState
        icon="error"
        title="Unable to load run details"
        description={error || "An unexpected error occurred while loading this run."}
      >
        <Button asChild variant="secondary">
          <Link href="/dashboard/history">Back to history</Link>
        </Button>
      </ResultState>
    );
  }

  const transcript = typeof run.inputJson?.transcript === "string" ? run.inputJson.transcript : "";
  const provider = getProviderFromInput(run.inputJson);

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Run Detail"
        title={run.title || "Meeting Summary"}
        description="Review the full saved transcript and structured result loaded directly from your run history."
        action={
          <Button asChild variant="secondary">
            <Link href="/dashboard/history">
              <ArrowLeft className="h-4 w-4" />
              Back to history
            </Link>
          </Button>
        }
      />

      <Card className="p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="available">{run.tool.name}</Badge>
              {provider ? <Badge variant="pending">{getMeetingProviderLabel(provider)}</Badge> : null}
              <Badge variant={run.status === "completed" ? "available" : "pending"}>{run.status}</Badge>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{run.title || "Meeting Summary"}</h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-600">{run.tool.description || "Saved workflow result loaded from your run history."}</p>
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
            <div className="flex items-center gap-2 font-medium text-slate-800">
              <CalendarDays className="h-4 w-4 text-slate-500" />
              {formatHistoryDateTime(run.createdAt)}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="rounded-2xl bg-sky-50 p-3 text-sky-700">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Transcript</h2>
              <p className="text-sm text-slate-500">The original transcript saved with this run.</p>
            </div>
          </div>
          <div className="max-h-[420px] overflow-y-auto rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5 text-sm leading-7 text-slate-700 whitespace-pre-wrap">
            {transcript || "No transcript was saved for this run."}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <SummaryCard summary={run.outputJson.summary} />
          <KeyPointsCard items={run.outputJson.key_points} />
        </div>
        <aside className="space-y-6">
          <ActionItemsCard items={run.outputJson.action_items} />
        </aside>
      </div>
    </div>
  );
}
