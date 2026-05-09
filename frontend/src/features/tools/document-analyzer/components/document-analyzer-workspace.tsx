"use client";

import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  AlertTriangle, CheckCircle2, CheckSquare, ClipboardList, FileText,
  Lightbulb, PencilLine, RefreshCw, ShieldAlert, Sparkles, UploadCloud,
  Wand2, X, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/tools/copy-button";
import { LoadingSpinner } from "@/components/tools/loading-spinner";
import { cn } from "@/lib/utils";
import { clientApiFetch } from "@/lib/api-client";

type ExtractOption = "summary" | "actionItems" | "keyPoints" | "decisions" | "risks" | "rawInsights";

type DocumentAnalysisResult = {
  summary: string | null;
  action_items: Array<{ task: string; owner: string; due_date: string; priority: "High" | "Medium" | "Low" }>;
  key_points: string[];
  decisions: string[];
  risks: string[];
  raw_insights: string | null;
};

const defaultOptions: Record<ExtractOption, boolean> = {
  summary: true, actionItems: true, keyPoints: true,
  decisions: true, risks: true, rawInsights: false,
};

const EXTRACT_OPTIONS: Array<{ key: ExtractOption; label: string; icon: string; desc: string }> = [
  { key: "summary",     label: "Summary",        icon: "📋", desc: "Overview of the document" },
  { key: "actionItems", label: "Action Items",    icon: "✅", desc: "Tasks with owners & dates" },
  { key: "keyPoints",   label: "Key Points",      icon: "💡", desc: "Most important details" },
  { key: "decisions",   label: "Decisions Made",  icon: "🎯", desc: "Final decisions captured" },
  { key: "risks",       label: "Risks",           icon: "⚠️", desc: "Blockers & concerns" },
  { key: "rawInsights", label: "Raw Insights",    icon: "🔍", desc: "Additional observations" },
];

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getPriorityClass(priority: string) {
  if (priority === "High") return "bg-red-50 text-red-600 ring-red-200";
  if (priority === "Low") return "bg-emerald-50 text-emerald-600 ring-emerald-200";
  return "bg-amber-50 text-amber-600 ring-amber-200";
}

function buildCopyText(result: DocumentAnalysisResult) {
  return [
    result.summary ? `Summary\n${result.summary}` : null,
    result.action_items.length
      ? ["Action Items", ...result.action_items.map((item, i) => `${i + 1}. ${item.task} | Owner: ${item.owner || "Unassigned"} | Due: ${item.due_date || "Not specified"} | Priority: ${item.priority}`)].join("\n")
      : null,
    result.key_points.length ? `Key Points\n${result.key_points.map((p) => `- ${p}`).join("\n")}` : null,
    result.decisions.length ? `Decisions Made\n${result.decisions.map((d, i) => `${i + 1}. ${d}`).join("\n")}` : null,
    result.risks.length ? `Risks & Concerns\n${result.risks.map((r) => `- ${r}`).join("\n")}` : null,
    result.raw_insights ? `Raw Insights\n${result.raw_insights}` : null,
  ].filter(Boolean).join("\n\n");
}

function ActionItemsSection({
  items,
  isSavingItems,
  actionItemsSaved,
  onSave,
  currentUserName,
}: {
  items: DocumentAnalysisResult["action_items"];
  isSavingItems: boolean;
  actionItemsSaved: boolean;
  onSave: (selectedIndices: number[]) => void;
  currentUserName: string;
}) {
  // Pre-select items assigned to the current user
  const myIndices = items.reduce<number[]>((acc, item, i) => {
    const owner = (item.owner ?? "").toLowerCase().trim();
    const me = currentUserName.toLowerCase().trim();
    if (me && owner && (owner.includes(me) || me.includes(owner))) acc.push(i);
    return acc;
  }, []);

  const [selected, setSelected] = useState<Set<number>>(new Set(myIndices));

  function toggle(i: number) {
    // Only allow toggling items assigned to the current user
    const owner = (items[i]?.owner ?? "").toLowerCase().trim();
    const me = currentUserName.toLowerCase().trim();
    const isMyItem = me && owner && (owner.includes(me) || me.includes(owner));
    if (!isMyItem) return;

    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400">
        Items assigned to you are pre-selected. Only your tasks can be saved to Action Items.
      </p>
      {items.map((item, i) => {
        const owner = (item.owner ?? "").toLowerCase().trim();
        const me = currentUserName.toLowerCase().trim();
        const isMyItem = me && owner && (owner.includes(me) || me.includes(owner));
        const isSelected = selected.has(i);

        return (
          <button
            key={i}
            type="button"
            onClick={() => toggle(i)}
            disabled={!isMyItem}
            className={cn(
              "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all",
              !isMyItem
                ? "cursor-not-allowed border-slate-100 bg-slate-50/40 opacity-50"
                : isSelected
                  ? "border-[#6C3FF5] bg-[#f5f3ff]"
                  : "border-slate-100 bg-slate-50/60 hover:bg-[#faf9ff]"
            )}
          >
            <div className={cn(
              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition",
              !isMyItem
                ? "border-slate-200 bg-slate-100"
                : isSelected
                  ? "border-[#6C3FF5] bg-[#6C3FF5]"
                  : "border-slate-300 bg-white"
            )}>
              {isSelected && isMyItem && (
                <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 10 8">
                  <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-medium", isSelected && isMyItem ? "text-[#6C3FF5]" : "text-slate-900")}>{item.task}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                {[item.owner || "Unassigned", item.due_date || "No date"].join(" · ")}
                {isMyItem && <span className="ml-1.5 rounded-full bg-[#f5f3ff] px-1.5 py-0.5 text-[10px] font-semibold text-[#6C3FF5]">You</span>}
              </p>
            </div>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", getPriorityClass(item.priority))}>
              {item.priority}
            </span>
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => onSave(Array.from(selected))}
        disabled={selected.size === 0 || isSavingItems || actionItemsSaved}
        className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-[#6C3FF5] px-4 py-2.5 text-sm font-semibold text-[#6C3FF5] transition hover:bg-[#f5f3ff] disabled:opacity-50"
      >
        {isSavingItems ? <><LoadingSpinner size="sm" /> Saving…</>
          : actionItemsSaved ? <><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Saved!</>
          : selected.size === 0 ? "No tasks assigned to you"
          : <><Zap className="h-4 w-4" /> Save {selected.size} task{selected.size !== 1 ? "s" : ""} to Action Items</>}
      </button>
    </div>
  );
}

function ResultSection({
  icon: Icon,
  title,
  accent = "purple",
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  accent?: "purple" | "amber" | "blue" | "green";
  action?: ReactNode;
  children: ReactNode;
}) {
  const map = {
    purple: { border: "border-[#EDE9FE]", hdr: "bg-[#F5F3FF]", text: "text-[#6C3FF5]", leftBorder: "border-l-[#6C3FF5]" },
    amber:  { border: "border-[#FEF7E0]", hdr: "bg-[#FFFDF5]", text: "text-[#B06000]", leftBorder: "border-l-[#B06000]" },
    blue:   { border: "border-[#DBEAFE]", hdr: "bg-[#EFF6FF]", text: "text-[#2563EB]", leftBorder: "border-l-[#2563EB]" },
    green:  { border: "border-[#E6F4EA]", hdr: "bg-[#F0FDF4]", text: "text-[#137333]", leftBorder: "border-l-[#34A853]" },
  };
  const c = map[accent];
  return (
    <div className={`overflow-hidden rounded-xl border border-l-4 ${c.border} ${c.leftBorder} bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]`}>
      <div className={`flex items-center justify-between gap-3 border-b ${c.border} ${c.hdr} px-5 py-3.5`}>
        <div className="flex items-center gap-2.5">
          <span className={c.text}><Icon className="h-4 w-4" /></span>
          <h3 className="text-sm font-semibold text-[#202124]">{title}</h3>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export function DocumentAnalyzerWorkspace() {
  const { user } = useUser();
  const currentUserName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || user?.fullName || "";
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<"file" | "text">("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [extractOptions, setExtractOptions] = useState(defaultOptions);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSavingItems, setIsSavingItems] = useState(false);
  const [actionItemsSaved, setActionItemsSaved] = useState(false);
  const [result, setResult] = useState<DocumentAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!actionItemsSaved) return;
    const t = window.setTimeout(() => setActionItemsSaved(false), 2500);
    return () => window.clearTimeout(t);
  }, [actionItemsSaved]);

  function handleFile(f: File | null) {
    setFile(f); setError(null);
    if (f) setMode("file");
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files?.[0] ?? null;
    if (f) handleFile(f);
  }

  async function handleAnalyze() {
    const hasText = text.trim().length > 0;
    const hasFile = Boolean(file);
    if (!hasText && !hasFile) { setError("Upload a file or paste some text first."); return; }

    setIsAnalyzing(true); setError(null); setActionItemsSaved(false);

    try {
      const extractOptionValues = (Object.entries(extractOptions).filter(([, v]) => v).map(([k]) => k) as ExtractOption[]);
      const response = mode === "text" || (!hasFile && hasText)
        ? await clientApiFetch("/api/tools/document-analyzer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: text.trim(), extractOptions: extractOptionValues }),
          })
        : await clientApiFetch("/api/tools/document-analyzer", {
            method: "POST",
            body: (() => { const fd = new FormData(); fd.append("file", file as File); fd.append("extractOptions", JSON.stringify(extractOptionValues)); return fd; })(),
          });

      const payload = (await response.json()) as { success: true; result: DocumentAnalysisResult } | { success: false; message?: string };
      if (!response.ok || !payload.success) throw new Error("message" in payload ? payload.message ?? "Failed." : "Failed.");
      setResult(payload.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to analyze document.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleSaveSelectedActionItems(selectedIndices: number[]) {
    if (!result || selectedIndices.length === 0) return;
    setIsSavingItems(true); setError(null);
    try {
      const selectedItems = selectedIndices.map((i) => result.action_items[i]).filter(Boolean);
      const res = await clientApiFetch("/api/action-items/bulk-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "document-analyzer",
          items: selectedItems.map((item) => ({ task: item.task, owner: item.owner || "Unassigned", dueDate: item.due_date || "Not specified", priority: item.priority, completed: false })),
        }),
      });
      const payload = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !payload.success) throw new Error(payload.message ?? "Failed.");
      setActionItemsSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save action items.");
    } finally {
      setIsSavingItems(false);
    }
  }

  const copyText = result ? buildCopyText(result) : "";
  const canAnalyze = !isAnalyzing && (text.trim().length > 0 || Boolean(file));

  return (
    <div className="grid gap-6 xl:grid-cols-[400px_minmax(0,1fr)]">

      {/* ── Left panel ── */}
      <div className="space-y-4">

        {/* Mode toggle */}
        <div className="overflow-hidden rounded-xl border border-[#DADCE0] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          <div className="flex">
            {(["file", "text"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "flex-1 py-3 text-sm font-semibold transition-all",
                  mode === m ? "bg-[#6C3FF5] text-white" : "text-[#5F6368] hover:bg-[#F8F9FA]"
                )}
              >
                {m === "file" ? "Upload File" : "Paste Text"}
              </button>
            ))}
          </div>
        </div>

        {/* Source Document */}
        <div className="overflow-hidden rounded-xl border border-[#DADCE0] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          <div className="border-b border-[#DADCE0] bg-[#F8F9FA] px-4 py-3">
            <p className="text-sm font-semibold text-[#202124]">Source Document</p>
            <p className="mt-0.5 text-xs text-[#5F6368]">
              {mode === "file" ? "PDF, DOCX, TXT, PNG, JPG · Max 25MB" : "Paste meeting notes, reports, or any text"}
            </p>
          </div>
          <div className="p-4">
            {mode === "text" ? (
              <div className="space-y-2">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={10}
                  placeholder="Paste document text, meeting notes, or any content here..."
                  className="w-full resize-none rounded-lg border border-[#DADCE0] bg-[#F8F9FA] p-3 text-sm leading-6 text-[#202124] outline-none transition focus:border-[#6C3FF5] focus:bg-white focus:ring-2 focus:ring-[#6C3FF5]/20 placeholder:text-[#9AA0A6]"
                />
                <p className="text-right text-xs text-[#9AA0A6]">{text.length.toLocaleString()} / 2,000 characters</p>
              </div>
            ) : file ? (
              <div className="flex items-center gap-3 rounded-lg border border-[#EDE9FE] bg-[#F5F3FF] px-4 py-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm">
                  <FileText className="h-5 w-5 text-[#6C3FF5]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#202124]">{file.name}</p>
                  <p className="text-xs text-[#5F6368]">{formatFileSize(file.size)}</p>
                </div>
                <button type="button" onClick={() => setFile(null)} className="rounded-lg p-1.5 text-[#9AA0A6] hover:bg-white hover:text-[#5F6368] transition">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 text-center transition-all",
                  isDragging ? "border-[#6C3FF5] bg-[#EDE9FE]" : "border-[#DADCE0] bg-[#F8F9FA] hover:border-[#6C3FF5]/50 hover:bg-[#faf9ff]"
                )}
              >
                <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl transition-all", isDragging ? "bg-[#6C3FF5] text-white" : "bg-white text-[#DADCE0] shadow-sm")}>
                  <UploadCloud className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#202124]">Click or drag to upload</p>
                  <p className="mt-0.5 text-xs text-[#5F6368]">PDF, DOCX, or TXT (Max 25MB)</p>
                </div>
                <div className="flex gap-2">
                  {["PDF", "DOCX"].map((f) => (
                    <span key={f} className="rounded-full border border-[#DADCE0] bg-white px-2.5 py-0.5 text-[11px] font-bold text-[#5F6368]">{f}</span>
                  ))}
                </div>
              </div>
            )}
            <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>

        {/* What to extract */}
        <div className="overflow-hidden rounded-xl border border-[#DADCE0] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          <div className="border-b border-[#DADCE0] bg-[#F8F9FA] px-4 py-3">
            <p className="text-sm font-semibold text-[#202124]">What to extract</p>
            <p className="mt-0.5 text-xs text-[#5F6368]">Select the insights you need</p>
          </div>
          <div className="grid grid-cols-2 gap-2 p-4">
            {EXTRACT_OPTIONS.map(({ key, label, icon }) => {
              const checked = extractOptions[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setExtractOptions((c) => ({ ...c, [key]: !c[key] }))}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all",
                    checked ? "border-[#6C3FF5] bg-[#EDE9FE]" : "border-[#DADCE0] bg-white hover:border-[#6C3FF5]/40 hover:bg-[#faf9ff]"
                  )}
                >
                  <div className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition",
                    checked ? "border-[#6C3FF5] bg-[#6C3FF5]" : "border-[#DADCE0] bg-white"
                  )}>
                    {checked && (
                      <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 10 8">
                        <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm leading-none">{icon}</span>
                  <span className={cn("text-xs font-semibold", checked ? "text-[#6C3FF5]" : "text-[#5F6368]")}>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-[#FCE8E6] bg-[#FCE8E6] px-4 py-3 text-sm text-[#C5221F]">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <button
          id="document-analyzer-form"
          type="button"
          disabled={!canAnalyze}
          onClick={() => void handleAnalyze()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#6C3FF5] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#5B2FE0] disabled:opacity-50 shadow-sm"
        >
          {isAnalyzing
            ? <><LoadingSpinner size="sm" /> Analyzing…</>
            : <><Wand2 className="h-4 w-4" /> Run Analysis</>}
        </button>
      </div>

      {/* ── Right panel ── */}
      <div>
        {!result ? (
          isAnalyzing ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-[#EDE9FE] bg-[#F5F3FF] px-5 py-4">
                <div className="flex items-center gap-3">
                  <LoadingSpinner />
                  <div>
                    <p className="text-sm font-semibold text-[#6C3FF5]">Artivaa is reading your document…</p>
                    <p className="text-xs text-[#9AA0A6]">Extracting insights, action items, and key points</p>
                  </div>
                </div>
                <span className="text-xs font-bold text-[#6C3FF5]">PROCESSING</span>
              </div>
              {[0, 1, 2].map((i) => (
                <div key={i} className="overflow-hidden rounded-xl border border-[#DADCE0] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                  <div className="h-11 animate-pulse bg-[#F8F9FA]" />
                  <div className="space-y-3 p-5">
                    <div className="h-3.5 w-3/4 animate-pulse rounded-full bg-[#F1F3F4]" />
                    <div className="h-3.5 w-full animate-pulse rounded-full bg-[#F1F3F4]" />
                    <div className="h-3.5 w-5/6 animate-pulse rounded-full bg-[#F1F3F4]" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[500px] flex-col items-center justify-center gap-5 rounded-xl border-2 border-dashed border-[#DADCE0] bg-white p-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[#FEF3C7]">
                <Sparkles className="h-8 w-8 text-[#D97706]" />
              </div>
              <div>
                <p className="text-base font-bold text-[#202124]">Upload a document to get started</p>
                <p className="mt-1 text-sm text-[#5F6368]">AI will extract summaries, action items, key points, and more</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {["PDF", "DOCX", "TXT", "PNG", "JPG"].map((fmt) => (
                  <span key={fmt} className="rounded-full border border-[#DADCE0] bg-[#F8F9FA] px-3 py-1 text-xs font-semibold text-[#5F6368]">{fmt}</span>
                ))}
              </div>
            </div>
          )
        ) : (
          <div className="space-y-4">
            {/* Analysis complete banner */}
            <div className="flex items-center justify-between rounded-xl border border-[#E6F4EA] bg-[#E6F4EA] px-5 py-3.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-[#137333]" />
                <p className="text-sm font-bold text-[#137333]">Analysis complete</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => void navigator.clipboard.writeText(copyText)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#34A853]/30 bg-white px-3 py-1.5 text-xs font-semibold text-[#137333] transition hover:bg-[#E6F4EA]">
                  Copy All
                </button>
                <button type="button" onClick={() => { setResult(null); setError(null); }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#DADCE0] bg-white px-3 py-1.5 text-xs font-semibold text-[#5F6368] transition hover:bg-[#F8F9FA]">
                  <RefreshCw className="h-3.5 w-3.5" /> Analyze Another
                </button>
              </div>
            </div>

            {/* Executive Summary */}
            {extractOptions.summary && result.summary && (
              <ResultSection icon={Sparkles} title="Executive Summary" accent="purple" action={<CopyButton text={result.summary} label="Copy" />}>
                <div className="space-y-3 text-sm leading-7 text-[#374151]">
                  {result.summary.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}
                </div>
              </ResultSection>
            )}

            {/* Action Items */}
            {extractOptions.actionItems && (
              <ResultSection icon={ClipboardList} title={`Action Items${result.action_items.length > 0 ? ` (${result.action_items.length})` : ""}`} accent="green"
                action={<CopyButton text={result.action_items.map((item, i) => `${i + 1}. ${item.task} | ${item.owner || "Unassigned"} | ${item.due_date || "No date"} | ${item.priority}`).join("\n")} label="Copy" />}
              >
                {result.action_items.length === 0 ? (
                  <p className="text-sm text-[#9AA0A6]">No action items extracted.</p>
                ) : (
                  <ActionItemsSection items={result.action_items} isSavingItems={isSavingItems}
                    actionItemsSaved={actionItemsSaved} onSave={handleSaveSelectedActionItems} currentUserName={currentUserName} />
                )}
              </ResultSection>
            )}

            {/* Key Points */}
            {extractOptions.keyPoints && result.key_points.length > 0 && (
              <ResultSection icon={Lightbulb} title="Key Points" accent="blue" action={<CopyButton text={result.key_points.map((p) => `• ${p}`).join("\n")} label="Copy" />}>
                <div className="flex flex-wrap gap-2">
                  {result.key_points.map((point, i) => (
                    <span key={i} className="rounded-full bg-[#EDE9FE] px-3 py-1 text-xs font-semibold text-[#6C3FF5]">{point}</span>
                  ))}
                </div>
              </ResultSection>
            )}

            {/* Decisions */}
            {extractOptions.decisions && result.decisions.length > 0 && (
              <ResultSection icon={CheckSquare} title="Decisions Made" accent="purple" action={<CopyButton text={result.decisions.map((d, i) => `${i + 1}. ${d}`).join("\n")} label="Copy" />}>
                <ol className="space-y-2">
                  {result.decisions.map((decision, i) => (
                    <li key={i} className="flex gap-3 text-sm text-[#374151]">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] text-[10px] font-bold text-[#6C3FF5]">{i + 1}</span>
                      {decision}
                    </li>
                  ))}
                </ol>
              </ResultSection>
            )}

            {/* Critical Risks */}
            {extractOptions.risks && result.risks.length > 0 && (
              <ResultSection icon={ShieldAlert} title="Critical Risks" accent="amber" action={<CopyButton text={result.risks.map((r) => `• ${r}`).join("\n")} label="Copy" />}>
                <ul className="space-y-2">
                  {result.risks.map((risk, i) => (
                    <li key={i} className="rounded-lg border border-[#FEF7E0] bg-[#FFFDF5] px-4 py-3 text-sm italic text-[#713f12]">
                      &ldquo;{risk}&rdquo;
                    </li>
                  ))}
                </ul>
              </ResultSection>
            )}

            {/* Raw Insights */}
            {extractOptions.rawInsights && result.raw_insights && (
              <ResultSection icon={PencilLine} title="Raw Insights" accent="blue" action={<CopyButton text={result.raw_insights} label="Copy" />}>
                <div className="rounded-lg border border-[#DADCE0] bg-[#F8F9FA] p-4 text-sm leading-7 text-[#374151] whitespace-pre-wrap font-mono">
                  {result.raw_insights}
                </div>
              </ResultSection>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
