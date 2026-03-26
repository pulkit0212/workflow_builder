"use client";

import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { CheckSquare, ClipboardList, FileText, PencilLine, ShieldAlert, Sparkles, UploadCloud, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { CopyButton } from "@/components/tools/copy-button";
import { LoadingSpinner } from "@/components/tools/loading-spinner";
import { cn } from "@/lib/utils";

type ExtractOption = "summary" | "actionItems" | "keyPoints" | "decisions" | "risks" | "rawInsights";

type DocumentAnalysisResult = {
  summary: string | null;
  action_items: Array<{
    task: string;
    owner: string;
    due_date: string;
    priority: "High" | "Medium" | "Low";
  }>;
  key_points: string[];
  decisions: string[];
  risks: string[];
  raw_insights: string | null;
};

const defaultOptions: Record<ExtractOption, boolean> = {
  summary: true,
  actionItems: true,
  keyPoints: true,
  decisions: true,
  risks: true,
  rawInsights: false
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getPriorityVariant(priority: string) {
  if (priority === "High") {
    return "danger" as const;
  }

  if (priority === "Low") {
    return "available" as const;
  }

  return "pending" as const;
}

function buildCopyText(result: DocumentAnalysisResult) {
  return [
    result.summary ? `Summary\n${result.summary}` : null,
    result.action_items.length
      ? [
          "Action Items",
          ...result.action_items.map(
            (item, index) =>
              `${index + 1}. ${item.task} | Owner: ${item.owner || "Unassigned"} | Due: ${item.due_date || "Not specified"} | Priority: ${item.priority}`
          )
        ].join("\n")
      : null,
    result.key_points.length ? `Key Points\n${result.key_points.map((item) => `- ${item}`).join("\n")}` : null,
    result.decisions.length ? `Decisions Made\n${result.decisions.map((item, index) => `${index + 1}. ${item}`).join("\n")}` : null,
    result.risks.length ? `Risks & Concerns\n${result.risks.map((item) => `- ${item}`).join("\n")}` : null,
    result.raw_insights ? `Raw Insights\n${result.raw_insights}` : null
  ]
    .filter(Boolean)
    .join("\n\n");
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
  action,
  className
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-[#f5f3ff] p-3 text-[#6c63ff]">
              <Icon className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
              {description ? <p className="text-sm text-slate-500">{description}</p> : null}
            </div>
          </div>
          {action ? <div>{action}</div> : null}
        </div>
        {children}
      </div>
    </Card>
  );
}

export function DocumentAnalyzerWorkspace() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<"file" | "text">("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [extractOptions, setExtractOptions] = useState(defaultOptions);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSavingItems, setIsSavingItems] = useState(false);
  const [actionItemsSaved, setActionItemsSaved] = useState(false);
  const [historySaved, setHistorySaved] = useState(false);
  const [result, setResult] = useState<DocumentAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!historySaved) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setHistorySaved(false);
    }, 2000);

    return () => window.clearTimeout(timeout);
  }, [historySaved]);

  useEffect(() => {
    if (!actionItemsSaved) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setActionItemsSaved(false);
    }, 2000);

    return () => window.clearTimeout(timeout);
  }, [actionItemsSaved]);

  function selectedExtractOptions() {
    return (Object.entries(extractOptions).filter(([, checked]) => checked).map(([key]) => key) as ExtractOption[]).slice();
  }

  function handleFile(fileInput: File | null) {
    setFile(fileInput);
    setError(null);
    if (fileInput) {
      setMode("file");
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);

    const droppedFile = event.dataTransfer.files?.[0] ?? null;
    if (droppedFile) {
      handleFile(droppedFile);
    }
  }

  async function handleAnalyze() {
    const hasText = text.trim().length > 0;
    const hasFile = Boolean(file);

    if (!hasText && !hasFile) {
      setError("Upload a file or paste some text first.");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setActionItemsSaved(false);
    setHistorySaved(false);

    try {
      const extractOptionValues = selectedExtractOptions();

      const response = mode === "text" || (!hasFile && hasText)
        ? await fetch("/api/tools/document-analyzer", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              text: text.trim(),
              extractOptions: extractOptionValues
            })
          })
        : await fetch("/api/tools/document-analyzer", {
            method: "POST",
            body: (() => {
              const formData = new FormData();
              formData.append("file", file as File);
              formData.append("extractOptions", JSON.stringify(extractOptionValues));
              return formData;
            })()
          });

      const payload = (await response.json()) as
        | {
            success: true;
            result: DocumentAnalysisResult;
          }
        | {
            success: false;
            message?: string;
          };

      if (!response.ok || !("success" in payload) || payload.success !== true) {
        throw new Error("message" in payload ? payload.message || "Failed to analyze document." : "Failed to analyze document.");
      }

      setResult(payload.result);
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "Failed to analyze document.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleSaveAllToActionItems() {
    if (!result || result.action_items.length === 0) {
      return;
    }

    setIsSavingItems(true);
    setError(null);

    try {
      const response = await fetch("/api/action-items/bulk-save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          source: "document-analyzer",
          items: result.action_items.map((item) => ({
            task: item.task,
            owner: item.owner || "Unassigned",
            dueDate: item.due_date || "Not specified",
            priority: item.priority,
            completed: false
          }))
        })
      });
      const payload = (await response.json()) as
        | {
            success: true;
            count: number;
          }
        | {
            success: false;
            message?: string;
          };

      if (!response.ok || !("success" in payload) || payload.success !== true) {
        throw new Error("message" in payload ? payload.message || "Failed to save action items." : "Failed to save action items.");
      }

      setActionItemsSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save action items.");
    } finally {
      setIsSavingItems(false);
    }
  }

  async function handleSaveToHistory() {
    if (!result) {
      return;
    }

    const historyKey = "artiva-document-analyzer-history";
    const existing = window.localStorage.getItem(historyKey);
    const history = existing ? (JSON.parse(existing) as Array<Record<string, unknown>>) : [];

    history.unshift({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      mode,
      fileName: file?.name ?? null,
      text,
      result
    });

    window.localStorage.setItem(historyKey, JSON.stringify(history.slice(0, 20)));
    setHistorySaved(true);
  }

  function handleAnalyzeAnother() {
    setResult(null);
    setError(null);
    setActionItemsSaved(false);
    setHistorySaved(false);
  }

  const copyText = result ? buildCopyText(result) : "";

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,45fr)_minmax(0,55fr)]">
      <Card className="p-5">
        <div className="space-y-6">
          <div className="flex gap-2">
            <Button type="button" variant={mode === "file" ? "default" : "outline"} onClick={() => setMode("file")}>
              Upload File
            </Button>
            <Button type="button" variant={mode === "text" ? "default" : "outline"} onClick={() => setMode("text")}>
              Paste Text
            </Button>
          </div>

          <section className="space-y-4">
            {mode === "text" ? (
              <div className="space-y-3">
                <label className="text-sm font-semibold text-slate-900" htmlFor="document-text">
                  Paste document text, meeting notes, or any content here...
                </label>
                <textarea
                  id="document-text"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  rows={14}
                  className="min-h-[220px] w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-900 outline-none transition focus:border-[#6c63ff] focus:ring-2 focus:ring-[#6c63ff]/20"
                />
                <div className="text-right text-xs text-slate-500">{text.length.toLocaleString()} characters</div>
              </div>
            ) : file ? (
              <Card className="border-dashed border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-white p-3 text-slate-400 shadow-sm">
                      <FileText className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-950">{file.name}</p>
                      <p className="text-sm text-slate-500">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="rounded-full p-1 text-slate-400 transition hover:bg-white hover:text-slate-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            ) : (
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={cn(
                  "flex min-h-[200px] flex-col items-center justify-center rounded-3xl border-2 border-dashed p-6 text-center transition",
                  isDragging ? "border-[#6c63ff] bg-[#f5f3ff]" : "border-slate-200 bg-slate-50/70"
                )}
              >
                <UploadCloud className="h-14 w-14 text-slate-300" />
                <div className="mt-4 space-y-2">
                  <p className="text-lg font-semibold text-slate-950">Drop your file here</p>
                  <p className="text-sm text-slate-500">or</p>
                </div>
                <Button type="button" variant="outline" className="mt-4" onClick={() => fileInputRef.current?.click()}>
                  Browse Files
                </Button>
                <p className="mt-4 text-sm text-slate-500">PDF, PNG, JPG, JPEG, DOCX, TXT - Max 10MB</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.docx,.txt,image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
            />
          </section>

          <section className="space-y-3">
            <label className="text-sm font-semibold text-slate-900">Extract:</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["summary", "Summary"],
                  ["actionItems", "Action Items"],
                  ["keyPoints", "Key Points"],
                  ["decisions", "Decisions Made"],
                  ["risks", "Risks & Concerns"],
                  ["rawInsights", "Raw Insights"]
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={extractOptions[key]}
                    onChange={(event) =>
                      setExtractOptions((current) => ({
                        ...current,
                        [key]: event.target.checked
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-300 text-[#6c63ff] focus:ring-[#6c63ff]"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </section>

          {error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

          <Button type="button" className="w-full" disabled={isAnalyzing || (!text.trim() && !file)} onClick={() => void handleAnalyze()}>
            {isAnalyzing ? (
              <>
                <LoadingSpinner size="sm" />
                Analyzing...
              </>
            ) : (
              "Analyze Document →"
            )}
          </Button>
        </div>
      </Card>

      <div className="space-y-6">
        {!result ? (
          isAnalyzing ? (
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-slate-500">
                  <LoadingSpinner />
                  <span>Artiva is reading your document...</span>
                </div>
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="h-5 w-40 animate-pulse rounded-full bg-slate-200" />
                    <div className="h-4 w-full animate-pulse rounded-full bg-slate-200" />
                    <div className="h-4 w-5/6 animate-pulse rounded-full bg-slate-200" />
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <EmptyState
              icon={FileText}
              title="Upload a document to get started"
              description="Supports PDF, images, and text files"
            />
          )
        ) : (
          <>
            {extractOptions.summary && result.summary ? (
              <SectionCard
                icon={Sparkles}
                title="Summary"
                description="2-4 paragraph summary of the document"
                action={<CopyButton text={result.summary} label="Copy" />}
              >
                <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm leading-7 text-slate-700">
                  {result.summary.split(/\n\s*\n/).map((paragraph) => (
                    <p key={paragraph.slice(0, 24)}>{paragraph}</p>
                  ))}
                </div>
              </SectionCard>
            ) : null}

            {extractOptions.actionItems ? (
              <SectionCard
                icon={ClipboardList}
                title="Action Items"
                description="Tasks, owners, due dates, and priority"
                action={<CopyButton text={buildCopyText({ ...result, summary: null, key_points: [], decisions: [], risks: [], raw_insights: null })} label="Copy" />}
              >
                {result.action_items.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-500">
                    No action items were extracted.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-left text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Task</th>
                          <th className="px-4 py-3 font-semibold">Owner</th>
                          <th className="px-4 py-3 font-semibold">Due Date</th>
                          <th className="px-4 py-3 font-semibold">Priority</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.action_items.map((item, index) => (
                          <tr key={`${item.task}-${index}`} className={index % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                            <td className="px-4 py-3 text-slate-900">{item.task}</td>
                            <td className="px-4 py-3 text-slate-600">{item.owner || "Unassigned"}</td>
                            <td className="px-4 py-3 text-slate-600">{item.due_date || "Not specified"}</td>
                            <td className="px-4 py-3">
                              <Badge variant={getPriorityVariant(item.priority)}>{item.priority}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="pt-3">
                  <Button
                    type="button"
                    className="w-full"
                    variant="secondary"
                    onClick={() => void handleSaveAllToActionItems()}
                    disabled={isSavingItems || result.action_items.length === 0}
                  >
                    {isSavingItems ? (
                      <>
                        <LoadingSpinner size="sm" />
                        Saving...
                      </>
                    ) : actionItemsSaved ? (
                      "Saved to Action Items"
                    ) : (
                      "Save All to Action Items"
                    )}
                  </Button>
                </div>
              </SectionCard>
            ) : null}

            {extractOptions.keyPoints && result.key_points.length > 0 ? (
              <SectionCard
                icon={Sparkles}
                title="Key Points"
                description="Most important details from the document"
                action={<CopyButton text={result.key_points.map((item) => `- ${item}`).join("\n")} label="Copy" />}
              >
                <ul className="space-y-3">
                  {result.key_points.map((point) => (
                    <li key={point} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-700">
                      {point}
                    </li>
                  ))}
                </ul>
              </SectionCard>
            ) : null}

            {extractOptions.decisions && result.decisions.length > 0 ? (
              <SectionCard
                icon={CheckSquare}
                title="Decisions Made"
                description="Final decisions captured from the document"
                action={<CopyButton text={result.decisions.map((item, index) => `${index + 1}. ${item}`).join("\n")} label="Copy" />}
              >
                <ol className="space-y-3 pl-5">
                  {result.decisions.map((decision) => (
                    <li key={decision} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-700">
                      {decision}
                    </li>
                  ))}
                </ol>
              </SectionCard>
            ) : null}

            {extractOptions.risks && result.risks.length > 0 ? (
              <SectionCard
                icon={ShieldAlert}
                title="Risks & Concerns"
                description="Potential blockers or concerns to track"
                action={<CopyButton text={result.risks.map((item) => `- ${item}`).join("\n")} label="Copy" />}
                className="border-l-4 border-l-amber-400"
              >
                <ul className="space-y-3">
                  {result.risks.map((risk) => (
                    <li key={risk} className="rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm leading-6 text-amber-900">
                      {risk}
                    </li>
                  ))}
                </ul>
              </SectionCard>
            ) : null}

            {extractOptions.rawInsights && result.raw_insights ? (
              <SectionCard
                icon={PencilLine}
                title="Raw Insights"
                description="Additional observations from the model"
                action={<CopyButton text={result.raw_insights} label="Copy" />}
              >
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm leading-7 text-slate-700 whitespace-pre-wrap">
                  {result.raw_insights}
                </div>
              </SectionCard>
            ) : null}

            <Card className="p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => void navigator.clipboard.writeText(copyText)} disabled={!copyText}>
                    Copy All Results
                  </Button>
                  <Button type="button" variant={historySaved ? "secondary" : "outline"} onClick={() => void handleSaveToHistory()} disabled={!result}>
                    {historySaved ? "Saved" : "Save to History"}
                  </Button>
                </div>
                <Button type="button" variant="ghost" onClick={handleAnalyzeAnother}>
                  Analyze Another
                </Button>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
