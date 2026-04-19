"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Check, CheckSquare, Download, Pencil, RefreshCw, Search, Sparkles, Square, Trash2, Users, Wand2, X,
} from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { CopyButton } from "@/components/tools/copy-button";
import { LoadingSpinner } from "@/components/tools/loading-spinner";
import { cn } from "@/lib/utils";
import { fetchMeetingReports } from "@/features/meetings/api";

type InputMode = "raw" | "voice" | "meeting";
type OutputFormat = "detailed" | "simple" | "jira";
type Priority = "High" | "Medium" | "Low";

type MeetingOption = {
  id: string;
  title: string;
  summary: string | null;
  transcript: string | null;
  createdAt: string;
  scheduledStartTime: string | null;
};

type GeneratedTask = {
  id: string;
  task: string;
  owner: string;
  due_date: string;
  priority: Priority;
  type: string;
  notes: string;
  completed: boolean;
};

type TaskGeneratorResponse = {
  success: true;
  tasks: Array<{
    task: string;
    owner: string;
    due_date: string;
    priority: Priority;
    type: string;
    notes: string;
  }>;
  summary: string;
  total_tasks: number;
  unextractable?: string;
};

function formatMeetingDate(value: string | null) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatCurrentDate() {
  return new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function getPriorityStyles(priority: Priority) {
  if (priority === "High") return "bg-red-50 text-red-600 ring-red-200";
  if (priority === "Low") return "bg-emerald-50 text-emerald-600 ring-emerald-200";
  return "bg-amber-50 text-amber-600 ring-amber-200";
}

function getStats(tasks: GeneratedTask[]) {
  return {
    high: tasks.filter((task) => task.priority === "High").length,
    medium: tasks.filter((task) => task.priority === "Medium").length,
    low: tasks.filter((task) => task.priority === "Low").length,
    assigned: tasks.filter((task) => task.owner && task.owner !== "Unassigned").length,
    unassigned: tasks.filter((task) => !task.owner || task.owner === "Unassigned").length,
  };
}

function toPlainText(tasks: GeneratedTask[]) {
  return tasks
    .map((task) => `• ${task.task} — ${task.owner || "Unassigned"} (Due: ${task.due_date || "Not specified"}) [${task.priority}]`)
    .join("\n");
}

function toMarkdown(tasks: GeneratedTask[]) {
  return ["## Generated Tasks", ...tasks.map((task) => `- [ ] ${task.task} — ${task.owner || "Unassigned"} (Due: ${task.due_date || "Not specified"})`)].join("\n");
}

function toCsv(tasks: GeneratedTask[]) {
  const rows = [["Task", "Owner", "Due Date", "Priority"], ...tasks.map((task) => [task.task, task.owner, task.due_date, task.priority])];
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "");
          const escaped = value.replace(/"/g, '""');
          return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
        })
        .join(",")
    )
    .join("\n");
}

const INPUT_MODES: Array<{ id: InputMode; label: string }> = [
  { id: "raw", label: "Raw Notes" },
  { id: "voice", label: "Voice Dump" },
  { id: "meeting", label: "From Meeting" },
];

const OUTPUT_FORMATS: Array<{ id: OutputFormat; label: string }> = [
  { id: "detailed", label: "Detailed" },
  { id: "simple", label: "Simple" },
  { id: "jira", label: "Jira-style" },
];

export function TaskGeneratorWorkspace() {
  const { user } = useUser();
  const currentUserName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || user?.fullName || "";
  const [mode, setMode] = useState<InputMode>("raw");
  const [input, setInput] = useState("");
  const [teamMembers, setTeamMembers] = useState("");
  const [dateContext, setDateContext] = useState(`Today is ${formatCurrentDate()}`);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("detailed");
  const [autoPriority, setAutoPriority] = useState(true);
  const [meetings, setMeetings] = useState<MeetingOption[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<GeneratedTask[]>([]);
  const [summary, setSummary] = useState("");
  const [unextractable, setUnextractable] = useState("");
  const [isLoadingMeetings, setIsLoadingMeetings] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [undoTask, setUndoTask] = useState<{ task: GeneratedTask; index: number } | null>(null);
  const [removedTaskNotice, setRemovedTaskNotice] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadMeetings() {
      setIsLoadingMeetings(true);
      try {
        const payload = await fetchMeetingReports({ page: 1, limit: 20, status: "all", date: "all", search: deferredSearchTerm });
        if (!mounted) return;
        setMeetings(
          payload.meetings.map((meeting) => ({
            id: meeting.id,
            title: meeting.title,
            summary: meeting.summary,
            transcript: meeting.transcript,
            createdAt: meeting.createdAt,
            scheduledStartTime: meeting.scheduledStartTime,
          }))
        );
      } catch (loadError) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : "Failed to load meetings.");
      } finally {
        if (mounted) setIsLoadingMeetings(false);
      }
    }

    void loadMeetings();
    return () => { mounted = false; };
  }, [deferredSearchTerm]);

  useEffect(() => {
    if (!removedTaskNotice) return;
    const timeout = window.setTimeout(() => {
      setRemovedTaskNotice(false);
      setUndoTask(null);
    }, 3500);
    return () => window.clearTimeout(timeout);
  }, [removedTaskNotice]);

  const stats = useMemo(() => getStats(tasks), [tasks]);
  const canGenerate = input.trim().length > 0 && !isGenerating;

  function applyMeetingInput(meeting: MeetingOption) {
    setSelectedMeetingId(meeting.id);
    setMode("raw");
    setInput((meeting.transcript || meeting.summary || meeting.title).trim());
    setStatusMessage(null);
    setError(null);
    setHasSaved(false);
  }

  async function handleGenerate() {
    if (!input.trim()) { setError("Input is required."); return; }
    setIsGenerating(true);
    setError(null);
    setStatusMessage(null);
    try {
      const response = await fetch("/api/tools/task-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, mode, teamMembers, dateContext, outputFormat, autoPriority }),
      });
      const payload = (await response.json()) as TaskGeneratorResponse | { success: false; message?: string };
      if (!response.ok || !("success" in payload) || payload.success !== true) {
        throw new Error("message" in payload ? payload.message || "Failed to generate tasks." : "Failed to generate tasks.");
      }
      const generated = payload.tasks.map((task) => ({
        id: crypto.randomUUID(),
        task: task.task,
        owner: task.owner || "Unassigned",
        due_date: task.due_date || "Not specified",
        priority: task.priority,
        type: task.type || "Task",
        notes: task.notes || "",
        completed: false,
      }));
      setTasks(generated);
      // Auto-select tasks assigned to the current user
      if (currentUserName) {
        const me = currentUserName.toLowerCase().trim();
        const myIds = new Set(
          generated
            .filter((t) => {
              const owner = t.owner.toLowerCase().trim();
              return owner !== "unassigned" && (owner.includes(me) || me.includes(owner));
            })
            .map((t) => t.id)
        );
        setSelectedTaskIds(myIds);
      } else {
        setSelectedTaskIds(new Set());
      }
      setSummary(payload.summary);
      setUnextractable(payload.unextractable || "");
      setEditingId(null);
      setHasSaved(false);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Failed to generate tasks.");
    } finally {
      setIsGenerating(false);
    }
  }

  function updateTask(taskId: string, updates: Partial<GeneratedTask>) {
    setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, ...updates } : task)));
    setHasSaved(false);
  }

  function removeTask(taskId: string) {
    setTasks((current) => {
      const index = current.findIndex((task) => task.id === taskId);
      if (index < 0) return current;
      setUndoTask({ task: current[index], index });
      setRemovedTaskNotice(true);
      setHasSaved(false);
      return current.filter((task) => task.id !== taskId);
    });
  }

  function undoRemove() {
    if (!undoTask) return;
    setTasks((current) => {
      const next = current.slice();
      next.splice(undoTask.index, 0, undoTask.task);
      return next;
    });
    setRemovedTaskNotice(false);
    setUndoTask(null);
    setHasSaved(false);
  }

  async function handleSaveAll() {
    if (tasks.length === 0) return;
    const tasksToSave = tasks.filter((t) => selectedTaskIds.has(t.id));
    if (tasksToSave.length === 0) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/action-items/bulk-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "task-generator",
          items: tasksToSave.map((task) => ({
            task: task.task,
            owner: task.owner || "Unassigned",
            dueDate: task.due_date || "Not specified",
            priority: task.priority,
            completed: task.completed,
          })),
        }),
      });
      const payload = (await response.json()) as { success: true; count: number } | { success: false; message?: string };
      if (!response.ok || !("success" in payload) || payload.success !== true) {
        throw new Error("message" in payload ? payload.message || "Failed to save tasks." : "Failed to save tasks.");
      }
      setStatusMessage(`${payload.count} task${payload.count !== 1 ? "s" : ""} saved to Action Items!`);
      setHasSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save tasks.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleCopyCsv() {
    const blob = new Blob([toCsv(tasks)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "tasks.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[400px_minmax(0,1fr)]">

      {/* ── Left panel ── */}
      <div className="space-y-4">

        {/* Mode toggle — segmented control */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex">
            {INPUT_MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setMode(item.id)}
                className={cn(
                  "flex-1 py-3 text-xs font-semibold transition-all",
                  mode === item.id
                    ? "bg-[#6c63ff] text-white"
                    : "text-slate-500 hover:bg-slate-50"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Meeting selector — only when mode === "meeting" */}
        {mode === "meeting" && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
              <p className="text-sm font-bold text-slate-900">Select a meeting</p>
              <p className="mt-0.5 text-xs text-slate-400">Pick a completed meeting to load its context</p>
            </div>
            <div className="p-3">
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search completed meetings..."
                  className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm text-slate-900 outline-none transition focus:border-[#6c63ff] focus:bg-white focus:ring-2 focus:ring-[#6c63ff]/20"
                />
              </div>
              {isLoadingMeetings ? (
                <div className="space-y-2">
                  {[0, 1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}
                </div>
              ) : meetings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f5f3ff]">
                    <CheckSquare className="h-6 w-6 text-[#6c63ff]" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">No completed meetings</p>
                  <p className="mt-1 text-xs text-slate-400">Complete a meeting to load its context here</p>
                </div>
              ) : (
                <div className="max-h-[280px] space-y-1.5 overflow-y-auto pr-0.5">
                  {meetings.map((meeting) => {
                    const selected = meeting.id === selectedMeetingId;
                    return (
                      <button
                        key={meeting.id}
                        type="button"
                        onClick={() => applyMeetingInput(meeting)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all",
                          selected
                            ? "border-[#6c63ff] bg-[#f5f3ff] shadow-sm"
                            : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                        )}
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#6c63ff] text-xs font-bold text-white">
                          {meeting.title.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "M"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={cn("truncate text-sm font-semibold", selected ? "text-[#6c63ff]" : "text-slate-900")}>
                            {meeting.title}
                          </p>
                          <p className="text-xs text-slate-400">{formatMeetingDate(meeting.scheduledStartTime ?? meeting.createdAt)}</p>
                        </div>
                        {selected && <Check className="h-4 w-4 shrink-0 text-[#6c63ff]" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Task input */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
            <p className="text-sm font-bold text-slate-900">
              {mode === "meeting" ? "Meeting context" : "Task input"}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              {mode === "voice"
                ? "Works great with Google Voice transcripts"
                : mode === "meeting"
                  ? "Loads summary or transcript from a completed meeting"
                  : "The messier the better — Artivaa will structure it"}
            </p>
          </div>
          <div className="p-3">
            <textarea
              id="task-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={12}
              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-[#6c63ff] focus:bg-white focus:ring-2 focus:ring-[#6c63ff]/20"
              placeholder={
                mode === "voice"
                  ? `Paste your voice-to-text transcript here...\n\nExample:\nokay so um we need to uh get the proposal done\nby thursday sarah is handling that and then\nmike needs to review it before we send`
                  : mode === "meeting"
                    ? "Select a completed meeting to load transcript or summary here..."
                    : `Paste anything here - rough notes, brain dump,\nWhatsApp messages, bullet points...\n\nExample:\nneed to call john about the contract asap\npriya should finish the homepage design by friday\nsomeone needs to fix the login bug - critical`
              }
            />
            <p className="mt-1.5 text-right text-xs text-slate-400">{input.length.toLocaleString()} characters</p>
          </div>
        </div>

        {/* Settings */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
            <p className="text-sm font-bold text-slate-900">Settings</p>
            <p className="mt-0.5 text-xs text-slate-400">Customize how tasks are generated</p>
          </div>
          <div className="space-y-4 p-3">

            {/* Team members */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600" htmlFor="team-members">
                Team members (optional)
              </label>
              <div className="relative">
                <Users className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  id="team-members"
                  value={teamMembers}
                  onChange={(e) => setTeamMembers(e.target.value)}
                  placeholder="e.g. Rahul, Priya, David, Sarah"
                  className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm text-slate-900 outline-none transition focus:border-[#6c63ff] focus:bg-white focus:ring-2 focus:ring-[#6c63ff]/20"
                />
              </div>
              <p className="text-xs text-slate-400">Helps assign tasks to the right people</p>
            </div>

            {/* Date reference */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600" htmlFor="date-context">
                Date reference
              </label>
              <input
                id="date-context"
                value={dateContext}
                onChange={(e) => setDateContext(e.target.value)}
                placeholder={`Today is ${formatCurrentDate()}`}
                className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-[#6c63ff] focus:bg-white focus:ring-2 focus:ring-[#6c63ff]/20"
              />
              <p className="text-xs text-slate-400">Helps interpret relative dates like "Friday" or "next week"</p>
            </div>

            {/* Output format chips */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-600">Output format</p>
              <div className="flex gap-1.5">
                {OUTPUT_FORMATS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setOutputFormat(item.id)}
                    className={cn(
                      "flex-1 rounded-xl border px-2 py-2 text-center text-xs font-semibold transition-all",
                      outputFormat === item.id
                        ? "border-[#6c63ff] bg-[#f5f3ff] text-[#6c63ff]"
                        : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto-priority toggle */}
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <input
                type="checkbox"
                checked={autoPriority}
                onChange={(e) => setAutoPriority(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#6c63ff] focus:ring-[#6c63ff]"
              />
              <div>
                <span className="block text-sm font-semibold text-slate-900">Auto-detect priority</span>
                <p className="mt-0.5 text-xs text-slate-400">Artivaa will infer urgency from language used</p>
              </div>
            </label>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        <button
          type="button"
          disabled={!canGenerate}
          onClick={() => void handleGenerate()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#6c63ff] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#5b52e0] disabled:opacity-50"
        >
          {isGenerating ? (
            <><LoadingSpinner size="sm" /> Structuring your tasks…</>
          ) : (
            <><Wand2 className="h-4 w-4" /> Generate Tasks</>
          )}
        </button>
      </div>

      {/* ── Right panel ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {isGenerating ? (
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-3 border-b border-[#ede9fe] bg-[#f5f3ff] px-5 py-4">
              <LoadingSpinner />
              <div>
                <p className="text-sm font-semibold text-[#6c63ff]">Artivaa is reading your notes…</p>
                <p className="text-xs text-[#9b8fff]">Extracting and structuring tasks</p>
              </div>
            </div>
            <div className="space-y-3 p-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="overflow-hidden rounded-xl border border-slate-100">
                  <div className="h-10 animate-pulse bg-slate-50" />
                  <div className="space-y-2 p-4">
                    <div className="h-4 w-3/4 animate-pulse rounded-full bg-slate-100" />
                    <div className="h-4 w-full animate-pulse rounded-full bg-slate-100" />
                    <div className="h-3 w-1/2 animate-pulse rounded-full bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex min-h-[500px] flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f5f3ff]">
              <Sparkles className="h-8 w-8 text-[#6c63ff]" />
            </div>
            <div>
              <p className="text-base font-bold text-slate-900">Your structured tasks will appear here</p>
              <p className="mt-1 text-sm text-slate-400">Paste any messy notes and click Generate Tasks</p>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            {/* Header bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-slate-900">{tasks.length} tasks generated</p>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", "bg-red-50 text-red-600 ring-red-200")}>
                  {stats.high} High
                </span>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", "bg-amber-50 text-amber-600 ring-amber-200")}>
                  {stats.medium} Med
                </span>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", "bg-emerald-50 text-emerald-600 ring-emerald-200")}>
                  {stats.low} Low
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                  {stats.assigned} Assigned
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={isGenerating || !input.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Regenerate
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveAll()}
                  disabled={isSaving || tasks.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#6c63ff] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#5b52e0] disabled:opacity-50"
                >
                  {isSaving ? <LoadingSpinner size="sm" /> : null}
                  {hasSaved ? "✓ Saved" : "Save All"}
                </button>
                <CopyButton text={toPlainText(tasks)} label="Copy" disabled={tasks.length === 0} />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {statusMessage && (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {statusMessage}{" "}
                  <a href="/dashboard/action-items?source=task-generator" className="font-semibold underline hover:no-underline">
                    View Action Items →
                  </a>
                </div>
              )}

              {summary && (
                <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
                    <p className="text-xs font-bold text-slate-700">Summary</p>
                  </div>
                  <p className="p-4 text-sm leading-6 text-slate-600">{summary}</p>
                </div>
              )}

              {unextractable && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-bold text-amber-800">Additional context</p>
                  <p className="mt-1 text-sm leading-6 text-amber-900/80">{unextractable}</p>
                </div>
              )}

              <div className="space-y-3">
                {tasks.map((task, index) => {
                  const isEditing = editingId === task.id;
                  return (
                    <div key={task.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                      {isEditing ? (
                        <div className="p-4 space-y-3">
                          <div className="flex items-start gap-3">
                            <button
                              type="button"
                              onClick={() => updateTask(task.id, { completed: !task.completed })}
                              className="mt-0.5 text-slate-400 transition hover:text-[#6c63ff]"
                            >
                              {task.completed ? <CheckSquare className="h-5 w-5 text-[#6c63ff]" /> : <Square className="h-5 w-5" />}
                            </button>
                            <div className="flex-1 space-y-2">
                              <input
                                value={task.task}
                                onChange={(e) => updateTask(task.id, { task: e.target.value })}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#6c63ff] focus:bg-white focus:ring-2 focus:ring-[#6c63ff]/20"
                              />
                              <textarea
                                value={task.notes}
                                onChange={(e) => updateTask(task.id, { notes: e.target.value })}
                                rows={2}
                                placeholder="Notes"
                                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#6c63ff] focus:bg-white focus:ring-2 focus:ring-[#6c63ff]/20"
                              />
                              <div className="grid gap-2 md:grid-cols-3">
                                <input
                                  value={task.owner}
                                  onChange={(e) => updateTask(task.id, { owner: e.target.value })}
                                  placeholder="Owner"
                                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#6c63ff] focus:bg-white focus:ring-2 focus:ring-[#6c63ff]/20"
                                />
                                <input
                                  value={task.due_date}
                                  onChange={(e) => updateTask(task.id, { due_date: e.target.value })}
                                  placeholder="Due date"
                                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#6c63ff] focus:bg-white focus:ring-2 focus:ring-[#6c63ff]/20"
                                />
                                <select
                                  value={task.priority}
                                  onChange={(e) => updateTask(task.id, { priority: e.target.value as Priority })}
                                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#6c63ff] focus:bg-white focus:ring-2 focus:ring-[#6c63ff]/20"
                                >
                                  <option value="High">High</option>
                                  <option value="Medium">Medium</option>
                                  <option value="Low">Low</option>
                                </select>
                              </div>
                            </div>
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                            >
                              <X className="h-3.5 w-3.5" /> Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-[#6c63ff] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#5b52e0]"
                            >
                              <Check className="h-3.5 w-3.5" /> Save
                            </button>
                          </div>
                        </div>
                      ) : (() => {
                          const me = currentUserName.toLowerCase().trim();
                          const owner = task.owner.toLowerCase().trim();
                          const isMyTask = Boolean(me && owner && owner !== "unassigned" && (owner.includes(me) || me.includes(owner)));
                          const isSelected = selectedTaskIds.has(task.id);
                          return (
                            <div className={cn("flex items-start gap-3 px-4 py-3.5", !isMyTask && "opacity-55")}>
                              {/* Checkbox — only selectable for user's own tasks */}
                              <button
                                type="button"
                                disabled={!isMyTask}
                                onClick={() => {
                                  if (!isMyTask) return;
                                  setSelectedTaskIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(task.id)) next.delete(task.id); else next.add(task.id);
                                    return next;
                                  });
                                }}
                                className={cn("mt-0.5 shrink-0", isMyTask ? "cursor-pointer" : "cursor-not-allowed")}
                              >
                                <div className={cn(
                                  "flex h-4 w-4 items-center justify-center rounded border transition",
                                  !isMyTask ? "border-slate-200 bg-slate-100"
                                    : isSelected ? "border-[#6c63ff] bg-[#6c63ff]"
                                    : "border-slate-300 bg-white hover:border-[#6c63ff]"
                                )}>
                                  {isSelected && isMyTask && (
                                    <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 10 8">
                                      <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  )}
                                </div>
                              </button>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f5f3ff] text-[10px] font-bold text-[#6c63ff]">
                                    {index + 1}
                                  </span>
                                  <p className={cn("text-sm font-medium text-slate-900 leading-snug", task.completed && "text-slate-400 line-through")}>
                                    {task.task}
                                  </p>
                                  {isMyTask && (
                                    <span className="rounded-full bg-[#f5f3ff] px-1.5 py-0.5 text-[10px] font-semibold text-[#6c63ff]">You</span>
                                  )}
                                </div>
                                {task.notes && (
                                  <p className="mb-1.5 text-xs leading-5 text-slate-500">{task.notes}</p>
                                )}
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                                  <span>👤 {task.owner || "Unassigned"}</span>
                                  <span>📅 {task.due_date || "Not specified"}</span>
                                  <span>🏷️ {task.type || "Task"}</span>
                                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", getPriorityStyles(task.priority))}>
                                    {task.priority}
                                  </span>
                                </div>
                              </div>
                              <div className="flex shrink-0 gap-1">
                                <button type="button" onClick={() => setEditingId(task.id)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button type="button" onClick={() => removeTask(task.id)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })()}
                    </div>
                  );
                })}
              </div>

              {removedTaskNotice && undoTask && (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <span>Task removed.</span>
                  <button
                    type="button"
                    onClick={undoRemove}
                    className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-white"
                  >
                    Undo
                  </button>
                </div>
              )}
            </div>

            {/* Footer export actions */}
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3.5">
              <button
                type="button"
                onClick={() => void handleSaveAll()}
                disabled={isSaving || selectedTaskIds.size === 0}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#6c63ff] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5b52e0] disabled:opacity-50"
              >
                {isSaving ? <LoadingSpinner size="sm" /> : null}
                {hasSaved ? "✓ Saved" : selectedTaskIds.size === 0 ? "No tasks selected" : `Save ${selectedTaskIds.size} task${selectedTaskIds.size !== 1 ? "s" : ""} to Action Items`}
              </button>
              <CopyButton text={toPlainText(tasks)} label="Copy as Text" disabled={tasks.length === 0} />
              <CopyButton text={toMarkdown(tasks)} label="Copy as Markdown" disabled={tasks.length === 0} />
              <button
                type="button"
                onClick={handleCopyCsv}
                disabled={tasks.length === 0}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <Download className="h-4 w-4" /> Export CSV
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
