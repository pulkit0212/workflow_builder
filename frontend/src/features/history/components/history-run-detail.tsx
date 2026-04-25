"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowLeft, ArrowRight, CalendarDays,
  CheckCircle2, CheckSquare, ExternalLink, FileText,
  Lightbulb, ListTodo, Loader2, Mail, Send, ShieldAlert,
  TrendingUp, X, XCircle,
} from "lucide-react";
import { ResultState } from "@/components/tools/result-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatHistoryDateTime } from "@/features/history/helpers";
import { cn } from "@/lib/utils";
import { useApiFetch, useIsAuthReady } from "@/hooks/useApiFetch";
import type { AiRunDetailResponse, AiRunErrorResponse } from "@/features/history/types";

type RunDetail = AiRunDetailResponse["run"];
type IntegrationType = "slack" | "gmail" | "notion" | "jira";
type Integration = { type: IntegrationType; enabled: boolean; config: Record<string, unknown> };
type ShareResult = { success: boolean; message: string };

const INTEGRATION_META: Record<IntegrationType, { label: string; icon: string; what: string }> = {
  slack:  { label: "Slack",  icon: "💬", what: "Full summary + action items" },
  gmail:  { label: "Gmail",  icon: "📧", what: "Summary email to recipients" },
  notion: { label: "Notion", icon: "📝", what: "Summary + action items + transcript" },
  jira:   { label: "Jira",   icon: "🎯", what: "One ticket per action item" },
};

// ── Share Modal ───────────────────────────────────────────────────────────────

function ShareModal({
  runId,
  output,
  onClose,
}: {
  runId: string;
  output: { summary?: string; action_items?: Array<{ task: string; owner?: string; priority?: string }> };
  onClose: () => void;
}) {
  const apiFetch = useApiFetch();
  const isAuthReady = useIsAuthReady();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [selected, setSelected] = useState<Set<IntegrationType>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  const [results, setResults] = useState<Record<string, ShareResult> | null>(null);
  const actionItemCount = output.action_items?.length ?? 0;

  useEffect(() => {
    if (!isAuthReady) return;
    let mounted = true;
    async function load() {
      try {
        const res = await apiFetch("/api/integrations", { cache: "no-store" });
        const data = (await res.json()) as Integration[] | { integrations?: Integration[] };
        if (!mounted) return;
        const list: Integration[] = Array.isArray(data) ? data : (data.integrations ?? []);
        const enabled = list.filter((i) => i.enabled);
        setIntegrations(enabled);
        setSelected(new Set(enabled.map((i) => i.type)));
      } catch { /* silent */ }
      finally { if (mounted) setIsLoading(false); }
    }
    void load();
    return () => { mounted = false; };
  }, [isAuthReady]);

  function toggle(type: IntegrationType) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  }

  async function handleShare() {
    if (selected.size === 0) return;
    setIsSharing(true);
    try {
      const res = await apiFetch(`/api/ai-runs/${runId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets: Array.from(selected) }),
      });
      const data = (await res.json()) as { results?: Record<string, ShareResult> };
      setResults(data.results ?? {});
    } catch {
      setResults(Object.fromEntries(Array.from(selected).map((t) => [t, { success: false, message: "Network error." }])));
    } finally {
      setIsSharing(false);
    }
  }

  const allDone = results !== null;
  const successCount = results ? Object.values(results).filter((r) => r.success).length : 0;
  const totalCount = results ? Object.keys(results).length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#f5f3ff]">
              <Send className="h-4 w-4 text-[#6c63ff]" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Share Summary</p>
              <p className="text-xs text-slate-400">Select where to send this run</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading integrations…
            </div>
          ) : integrations.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-sm text-slate-500">No integrations connected yet.</p>
              <a href="/dashboard/integrations" className="inline-flex items-center gap-1.5 rounded-xl bg-[#6c63ff] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5b52e0] transition">
                <ExternalLink className="h-3.5 w-3.5" /> Connect integrations
              </a>
            </div>
          ) : (
            <>
              {/* Result summary banner */}
              {allDone && (
                <div className={cn(
                  "flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold",
                  successCount === totalCount
                    ? "bg-emerald-50 text-emerald-700"
                    : successCount === 0
                      ? "bg-red-50 text-red-600"
                      : "bg-amber-50 text-amber-700"
                )}>
                  {successCount === totalCount
                    ? <><CheckCircle2 className="h-4 w-4" /> Shared successfully to all {totalCount} destination{totalCount !== 1 ? "s" : ""}</>
                    : <><AlertTriangle className="h-4 w-4" /> {successCount} of {totalCount} succeeded</>}
                </div>
              )}

              {/* Integration rows */}
              <div className="space-y-2">
                {integrations.map((integration) => {
                  const meta = INTEGRATION_META[integration.type];
                  const isSelected = selected.has(integration.type);
                  const result = results?.[integration.type];

                  return (
                    <button
                      key={integration.type}
                      type="button"
                      onClick={() => { if (!allDone) toggle(integration.type); }}
                      disabled={allDone}
                      className={cn(
                        "w-full rounded-xl border px-4 py-3 text-left transition-all",
                        allDone ? "cursor-default" : "hover:border-[#c4b5fd] hover:bg-[#faf9ff]",
                        isSelected && !allDone ? "border-[#c4b5fd] bg-[#f5f3ff]" : "border-slate-200 bg-white"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {!allDone && (
                            <div className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition",
                              isSelected ? "border-[#6c63ff] bg-[#6c63ff]" : "border-slate-300 bg-white"
                            )}>
                              {isSelected && (
                                <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 10 8">
                                  <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </div>
                          )}
                          <span className="text-lg leading-none">{meta.icon}</span>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{meta.label}</p>
                            <p className="text-xs text-slate-400">
                              {integration.type === "jira"
                                ? actionItemCount > 0 ? `${actionItemCount} ticket${actionItemCount !== 1 ? "s" : ""} will be created` : "No action items"
                                : meta.what}
                            </p>
                          </div>
                        </div>
                        {result ? (
                          result.success
                            ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200"><CheckCircle2 className="h-3 w-3" /> Done</span>
                            : <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600 ring-1 ring-red-200"><XCircle className="h-3 w-3" /> Failed</span>
                        ) : null}
                      </div>
                      {result && !result.success && (
                        <p className="mt-1.5 text-xs text-red-500">{result.message}</p>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Footer actions */}
              <div className="flex items-center justify-between gap-3 pt-1">
                {!allDone ? (
                  <>
                    <a href="/dashboard/integrations" className="flex items-center gap-1 text-xs text-slate-400 hover:text-[#6c63ff] transition-colors">
                      <ExternalLink className="h-3 w-3" /> Manage
                    </a>
                    <button
                      type="button"
                      onClick={() => void handleShare()}
                      disabled={selected.size === 0 || isSharing}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#6c63ff] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5b52e0] disabled:opacity-50"
                    >
                      {isSharing ? <><Loader2 className="h-4 w-4 animate-spin" /> Sharing…</> : <><Send className="h-4 w-4" /> Share to {selected.size}</>}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => { setResults(null); setSelected(new Set(integrations.map((i) => i.type))); }}
                      className="text-xs text-slate-400 hover:text-slate-600 transition"
                    >
                      Share again
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                    >
                      Close
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function HistoryRunDetailSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
      {[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />)}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ icon, title, accent = "purple", children }: {
  icon: React.ReactNode; title: string;
  accent?: "purple" | "blue" | "green" | "amber" | "red";
  children: React.ReactNode;
}) {
  const map = {
    purple: { bg: "bg-[#f5f3ff]", text: "text-[#6c63ff]", border: "border-[#ede9fe]" },
    blue:   { bg: "bg-blue-50",   text: "text-blue-600",   border: "border-blue-100" },
    green:  { bg: "bg-emerald-50",text: "text-emerald-600",border: "border-emerald-100" },
    amber:  { bg: "bg-amber-50",  text: "text-amber-600",  border: "border-amber-100" },
    red:    { bg: "bg-red-50",    text: "text-red-500",    border: "border-red-100" },
  };
  const c = map[accent];
  return (
    <div className={`overflow-hidden rounded-2xl border ${c.border} bg-white shadow-sm`}>
      <div className={`flex items-center gap-2.5 border-b ${c.border} ${c.bg} px-5 py-3.5`}>
        <span className={c.text}>{icon}</span>
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function BulletList({ items, dotColor }: { items: string[]; dotColor: string }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-sm text-slate-600">
          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
          {item}
        </li>
      ))}
    </ul>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    High: "bg-red-50 text-red-600 ring-red-200",
    Medium: "bg-amber-50 text-amber-600 ring-amber-200",
    Low: "bg-emerald-50 text-emerald-600 ring-emerald-200",
  };
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${map[priority] ?? "bg-slate-50 text-slate-500 ring-slate-200"}`}>
      {priority}
    </span>
  );
}

function ActionItemRow({ item }: { item: { task: string; owner?: string; due_date?: string; priority?: string } }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 transition-colors hover:bg-[#faf9ff]">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#6c63ff]/10">
        <CheckSquare className="h-3 w-3 text-[#6c63ff]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">{item.task}</p>
        {(item.owner ?? item.due_date) && (
          <p className="mt-0.5 text-xs text-slate-400">{[item.owner, item.due_date].filter(Boolean).join(" · ")}</p>
        )}
      </div>
      {item.priority && <PriorityBadge priority={item.priority} />}
    </div>
  );
}

// ── Tool output renderers ─────────────────────────────────────────────────────

function MeetingSummarizerOutput({ output }: { output: Record<string, unknown> }) {
  const summary = typeof output.summary === "string" ? output.summary : null;
  const keyPoints = Array.isArray(output.key_points) ? (output.key_points as string[]) : [];
  const actionItems = Array.isArray(output.action_items)
    ? (output.action_items as Array<{ task: string; owner?: string; due_date?: string; priority?: string }>)
    : [];
  return (
    <div className="space-y-4">
      {summary && <Section icon={<FileText className="h-4 w-4" />} title="Summary" accent="purple"><p className="text-sm leading-relaxed text-slate-600 whitespace-pre-wrap">{summary}</p></Section>}
      {keyPoints.length > 0 && <Section icon={<Lightbulb className="h-4 w-4" />} title="Key Points" accent="blue"><BulletList items={keyPoints} dotColor="bg-[#6c63ff]" /></Section>}
      {actionItems.length > 0 && (
        <Section icon={<CheckSquare className="h-4 w-4" />} title={`Action Items (${actionItems.length})`} accent="green">
          <div className="space-y-2">{actionItems.map((item, i) => <ActionItemRow key={i} item={item} />)}</div>
        </Section>
      )}
    </div>
  );
}

function EmailGeneratorOutput({ output }: { output: Record<string, unknown> }) {
  const subject = typeof output.subject === "string" ? output.subject : "";
  const body = typeof output.body === "string" ? output.body : "";
  return (
    <div className="space-y-4">
      <Section icon={<Mail className="h-4 w-4" />} title="Subject" accent="blue"><p className="rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900">{subject}</p></Section>
      <Section icon={<FileText className="h-4 w-4" />} title="Email Body" accent="purple"><div className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-4 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">{body}</div></Section>
    </div>
  );
}

function TaskGeneratorOutput({ output }: { output: Record<string, unknown> }) {
  const tasks = Array.isArray(output.tasks)
    ? (output.tasks as Array<{ task: string; owner?: string; due_date?: string; priority?: string; notes?: string }>)
    : [];
  const summary = typeof output.summary === "string" ? output.summary : "";
  return (
    <div className="space-y-4">
      {summary && <Section icon={<FileText className="h-4 w-4" />} title="Summary" accent="purple"><p className="text-sm text-slate-600">{summary}</p></Section>}
      <Section icon={<ListTodo className="h-4 w-4" />} title={`Tasks (${tasks.length})`} accent="green">
        <div className="space-y-2">
          {tasks.map((task, i) => (
            <div key={i} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 hover:bg-[#faf9ff]">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#6c63ff]/10 text-[10px] font-bold text-[#6c63ff]">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">{task.task}</p>
                {(task.owner ?? task.due_date) && <p className="mt-0.5 text-xs text-slate-400">{[task.owner, task.due_date].filter(Boolean).join(" · ")}</p>}
                {task.notes && <p className="mt-1 text-xs italic text-slate-400">{task.notes}</p>}
              </div>
              {task.priority && <PriorityBadge priority={task.priority} />}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function DocumentAnalyzerOutput({ output }: { output: Record<string, unknown> }) {
  const summary = typeof output.summary === "string" ? output.summary : null;
  const keyPoints = Array.isArray(output.key_points) ? (output.key_points as string[]) : [];
  const actionItems = Array.isArray(output.action_items) ? (output.action_items as Array<{ task: string; owner?: string; due_date?: string; priority?: string }>) : [];
  const decisions = Array.isArray(output.decisions) ? (output.decisions as string[]) : [];
  const risks = Array.isArray(output.risks) ? (output.risks as string[]) : [];
  return (
    <div className="space-y-4">
      {summary && <Section icon={<FileText className="h-4 w-4" />} title="Summary" accent="purple"><p className="text-sm leading-relaxed text-slate-600">{summary}</p></Section>}
      {keyPoints.length > 0 && <Section icon={<Lightbulb className="h-4 w-4" />} title="Key Points" accent="blue"><BulletList items={keyPoints} dotColor="bg-[#6c63ff]" /></Section>}
      {actionItems.length > 0 && <Section icon={<CheckSquare className="h-4 w-4" />} title={`Action Items (${actionItems.length})`} accent="green"><div className="space-y-2">{actionItems.map((item, i) => <ActionItemRow key={i} item={item} />)}</div></Section>}
      {decisions.length > 0 && <Section icon={<TrendingUp className="h-4 w-4" />} title="Decisions" accent="amber"><BulletList items={decisions} dotColor="bg-emerald-500" /></Section>}
      {risks.length > 0 && <Section icon={<ShieldAlert className="h-4 w-4" />} title="Risks & Blockers" accent="red"><BulletList items={risks} dotColor="bg-red-400" /></Section>}
    </div>
  );
}

function ToolOutput({ run }: { run: RunDetail }) {
  const output = (run.outputJson ?? {}) as Record<string, unknown>;
  switch (run.tool.slug) {
    case "email-generator":   return <EmailGeneratorOutput output={output} />;
    case "task-generator":    return <TaskGeneratorOutput output={output} />;
    case "document-analyzer": return <DocumentAnalyzerOutput output={output} />;
    default:                  return <MeetingSummarizerOutput output={output} />;
  }
}

// ── Main component ────────────────────────────────────────────────────────────

const TOOL_ICONS: Record<string, React.ReactNode> = {
  "email-generator":    <Mail className="h-4 w-4" />,
  "task-generator":     <ListTodo className="h-4 w-4" />,
  "document-analyzer":  <FileText className="h-4 w-4" />,
  "meeting-summarizer": <FileText className="h-4 w-4" />,
};

export function HistoryRunDetail({ runId }: { runId: string }) {
  const apiFetch = useApiFetch();
  const isAuthReady = useIsAuthReady();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (!isAuthReady) return;
    let isMounted = true;
    async function loadRun() {
      setIsLoading(true); setError(null); setNotFound(false);
      try {
        const response = await apiFetch(`/api/ai-runs/${runId}`, { cache: "no-store" });
        const payload = (await response.json()) as AiRunDetailResponse | AiRunErrorResponse;
        if (!response.ok || !payload.success) {
          if (response.status === 403) { if (isMounted) setUpgradeRequired(true); return; }
          if (response.status === 404) { if (isMounted) setNotFound(true); return; }
          throw new Error("message" in payload ? payload.message : "Failed to load run.");
        }
        if (isMounted) setRun((payload as AiRunDetailResponse).run);
      } catch (e) {
        if (isMounted) setError(e instanceof Error ? e.message : "Failed to load run details.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    void loadRun();
    return () => { isMounted = false; };
  }, [runId, isAuthReady]);

  if (isLoading) return <HistoryRunDetailSkeleton />;

  if (notFound) return (
    <ResultState title="Run not found" description="This saved run is unavailable or you no longer have access to it.">
      <Button asChild variant="secondary"><Link href="/dashboard/history">Back to history</Link></Button>
    </ResultState>
  );

  if (upgradeRequired) return (
    <div className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 p-8 space-y-4">
      <p className="text-xs font-bold uppercase tracking-widest text-amber-600">Locked Feature</p>
      <h1 className="text-xl font-bold text-slate-900">History requires Pro or Elite</h1>
      <p className="text-sm text-amber-700">Upgrade to view saved tool runs and meeting history.</p>
      <div className="flex gap-2">
        <Button asChild><Link href="/dashboard/billing">Upgrade now <ArrowRight className="h-4 w-4" /></Link></Button>
        <Button asChild variant="secondary"><Link href="/dashboard/history">Back to history</Link></Button>
      </div>
    </div>
  );

  if (error || !run) return (
    <ResultState icon="error" title="Unable to load run details" description={error || "An unexpected error occurred."}>
      <Button asChild variant="secondary"><Link href="/dashboard/history">Back to history</Link></Button>
    </ResultState>
  );

  const isCompleted = run.status === "completed";
  const isFailed = run.status === "failed";
  const output = (run.outputJson ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-5">

      {/* ── Header card ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Top bar: tool name + back */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#f5f3ff] text-[#6c63ff]">
              {TOOL_ICONS[run.tool.slug] ?? <FileText className="h-3.5 w-3.5" />}
            </span>
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">{run.tool.name}</span>
          </div>
          <Button asChild variant="secondary" className="h-8 px-3 text-xs">
            <Link href="/dashboard/history"><ArrowLeft className="h-3.5 w-3.5" /> Back</Link>
          </Button>
        </div>

        {/* Title + meta */}
        <div className="px-5 py-4">
          <h1 className="text-lg font-bold text-slate-900 leading-snug">{run.title ?? "Untitled run"}</h1>
          {run.tool.description && <p className="mt-0.5 text-sm text-slate-400">{run.tool.description}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {/* Date */}
            <div className="flex items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-1.5 text-xs text-slate-500 ring-1 ring-slate-200">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatHistoryDateTime(run.createdAt)}
            </div>

            {/* Status */}
            {isCompleted && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                <CheckCircle2 className="h-3 w-3" /> Completed
              </span>
            )}
            {isFailed && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 ring-1 ring-red-200">
                <AlertTriangle className="h-3 w-3" /> Failed
              </span>
            )}
            {!isCompleted && !isFailed && <Badge variant="pending">{run.status}</Badge>}

            {/* Tokens */}
            {run.tokensUsed != null && (
              <span className="ml-auto text-xs text-slate-400">{run.tokensUsed.toLocaleString()} tokens used</span>
            )}

            {/* Share button — only for completed runs */}
            {isCompleted && run.outputJson && (
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-[#6c63ff] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#5b52e0]"
              >
                <Send className="h-3.5 w-3.5" /> Share
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Tool output ── */}
      <ToolOutput run={run} />

      {/* ── Share modal ── */}
      {shareOpen && isCompleted && run.outputJson && (
        <ShareModal
          runId={run.id}
          output={{
            summary: typeof output.summary === "string" ? output.summary : undefined,
            action_items: Array.isArray(output.action_items)
              ? (output.action_items as Array<{ task: string; owner?: string; priority?: string }>)
              : [],
          }}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}
