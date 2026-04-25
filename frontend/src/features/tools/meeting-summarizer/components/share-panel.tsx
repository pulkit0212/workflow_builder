"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ExternalLink,
  Loader2, Send, X, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiFetch } from "@/hooks/useApiFetch";

type IntegrationType = "slack" | "gmail" | "notion" | "jira";
type Integration = { type: IntegrationType; enabled: boolean; config: Record<string, unknown> };
type ShareResult = { success: boolean; message: string };

type SharePanelProps = {
  runId: string;
  output: {
    summary?: string;
    action_items?: Array<{ task: string; owner?: string; priority?: string }>;
  };
  onClose: () => void;
};

const INTEGRATION_META: Record<IntegrationType, { label: string; icon: string; what: string }> = {
  slack:  { label: "Slack",  icon: "💬", what: "Full summary + action items" },
  gmail:  { label: "Gmail",  icon: "📧", what: "Summary email to recipients" },
  notion: { label: "Notion", icon: "📝", what: "Summary + action items + transcript" },
  jira:   { label: "Jira",   icon: "🎯", what: "One ticket per action item" },
};

export function SharePanel({ runId, output, onClose }: SharePanelProps) {
  const apiFetch = useApiFetch();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [selected, setSelected] = useState<Set<IntegrationType>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  const [results, setResults] = useState<Record<string, ShareResult> | null>(null);
  const actionItemCount = output.action_items?.length ?? 0;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const [res, googleRes] = await Promise.all([
          apiFetch("/api/integrations", { cache: "no-store" }),
          apiFetch("/api/google/integration", { cache: "no-store" }),
        ]);
        if (cancelled) return;
        const data = (await res.json()) as Integration[] | { integrations?: Integration[] };
        const list: Integration[] = Array.isArray(data) ? data : (data.integrations ?? []);
        const googleData = googleRes.ok ? (await googleRes.json()) as { integration?: { connected: boolean } } : null;
        const isGoogleConnected = googleData?.integration?.connected ?? false;
        const enabled = list.filter((i) => {
          if (!i.enabled) return false;
          if (i.type === "gmail" && !isGoogleConnected) return false;
          return true;
        });
        if (cancelled) return;
        setIntegrations(enabled);
        setSelected(new Set(enabled.map((i) => i.type)));
      } catch { /* silent */ }
      finally { if (!cancelled) setIsLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

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

              {/* Footer */}
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
                    <button type="button" onClick={() => { setResults(null); setSelected(new Set(integrations.map((i) => i.type))); }} className="text-xs text-slate-400 hover:text-slate-600 transition">
                      Share again
                    </button>
                    <button type="button" onClick={onClose} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
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
