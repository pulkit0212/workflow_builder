"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Check, CheckSquare, Download, Pencil, Search, Sparkles, Square, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
  if (priority === "High") return "border-transparent bg-[#fef2f2] text-[#dc2626]";
  if (priority === "Low") return "border-transparent bg-[#f0fdf4] text-[#16a34a]";
  return "border-transparent bg-[#fefce8] text-[#ca8a04]";
}

function getStats(tasks: GeneratedTask[]) {
  return {
    high: tasks.filter((task) => task.priority === "High").length,
    medium: tasks.filter((task) => task.priority === "Medium").length,
    low: tasks.filter((task) => task.priority === "Low").length,
    assigned: tasks.filter((task) => task.owner && task.owner !== "Unassigned").length,
    unassigned: tasks.filter((task) => !task.owner || task.owner === "Unassigned").length
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

export function TaskGeneratorWorkspace() {
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
        const payload = await fetchMeetingReports({ page: 1, limit: 20, status: "completed", date: "all", search: "" });
        if (!mounted) return;
        setMeetings(
          payload.meetings.map((meeting) => ({
            id: meeting.id,
            title: meeting.title,
            summary: meeting.summary,
            transcript: meeting.transcript,
            createdAt: meeting.createdAt,
            scheduledStartTime: meeting.scheduledStartTime
          }))
        );
      } catch (loadError) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : "Failed to load meetings.");
      } finally {
        if (mounted) setIsLoadingMeetings(false);
      }
    }

    void loadMeetings();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function searchMeetings() {
      setIsLoadingMeetings(true);
      try {
        const payload = await fetchMeetingReports({ 
          page: 1, 
          limit: 20, 
          status: "completed", 
          date: "all", 
          search: deferredSearchTerm 
        });
        if (!mounted) return;
        setMeetings(
          payload.meetings.map((meeting) => ({
            id: meeting.id,
            title: meeting.title,
            summary: meeting.summary,
            transcript: meeting.transcript,
            createdAt: meeting.createdAt,
            scheduledStartTime: meeting.scheduledStartTime
          }))
        );
      } catch (loadError) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : "Failed to load meetings.");
      } finally {
        if (mounted) setIsLoadingMeetings(false);
      }
    }

    void searchMeetings();
    return () => {
      mounted = false;
    };
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
    if (!input.trim()) {
      setError("Input is required.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/tools/task-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, mode, teamMembers, dateContext, outputFormat, autoPriority })
      });

      const payload = (await response.json()) as TaskGeneratorResponse | { success: false; message?: string };
      if (!response.ok || !("success" in payload) || payload.success !== true) {
        throw new Error("message" in payload ? payload.message || "Failed to generate tasks." : "Failed to generate tasks.");
      }

      setTasks(
        payload.tasks.map((task) => ({
          id: crypto.randomUUID(),
          task: task.task,
          owner: task.owner || "Unassigned",
          due_date: task.due_date || "Not specified",
          priority: task.priority,
          type: task.type || "Task",
          notes: task.notes || "",
          completed: false
        }))
      );
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

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/action-items/bulk-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "task-generator",
          items: tasks.map((task) => ({
            task: task.task,
            owner: task.owner || "Unassigned",
            dueDate: task.due_date || "Not specified",
            priority: task.priority,
            completed: task.completed
          }))
        })
      });

      const payload = (await response.json()) as { success: true; count: number } | { success: false; message?: string };
      if (!response.ok || !("success" in payload) || payload.success !== true) {
        throw new Error("message" in payload ? payload.message || "Failed to save tasks." : "Failed to save tasks.");
      }

      setStatusMessage(`${payload.count} tasks saved to Action Items!`);
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
    <div className="grid gap-6 xl:grid-cols-[minmax(0,45fr)_minmax(0,55fr)]">
      <Card className="p-5">
        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">Task Generator</h1>
            <p className="text-sm leading-6 text-slate-600">Turn messy notes into structured tasks instantly</p>
          </div>

          <section className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {[
                { id: "raw" as const, label: "Raw Notes", icon: "📝" },
                { id: "voice" as const, label: "Voice Dump", icon: "🎤" },
                { id: "meeting" as const, label: "From Meeting", icon: "📋" }
              ].map((item) => (
                <Button key={item.id} type="button" variant={mode === item.id ? "default" : "outline"} onClick={() => setMode(item.id)} className="rounded-full">
                  <span>{item.icon}</span>
                  {item.label}
                </Button>
              ))}
            </div>

            {mode === "meeting" ? (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search completed meetings..."
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-[#6c63ff] focus:ring-2 focus:ring-[#6c63ff]/20"
                  />
                </div>

                {isLoadingMeetings ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div key={index} className="h-16 animate-pulse rounded-2xl bg-slate-100" />
                    ))}
                  </div>
                ) : meetings.length === 0 ? (
                  <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
                    <div className="mb-4 animate-bounce rounded-full bg-slate-100 p-5 text-slate-400">
                      <CheckSquare className="h-10 w-10" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">No recorded meetings yet</h3>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">Complete a meeting to load transcript and summary context.</p>
                  </div>
                ) : (
                  <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
                    {meetings.map((meeting) => {
                      const selected = meeting.id === selectedMeetingId;
                      return (
                        <button
                          key={meeting.id}
                          type="button"
                          onClick={() => applyMeetingInput(meeting)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-2xl border bg-white p-3 text-left transition",
                            selected ? "border-[#6c63ff] bg-[#f5f3ff] shadow-sm" : "border-slate-200 hover:border-[#c7c2ff] hover:bg-slate-50"
                          )}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#6c63ff] text-sm font-semibold text-white">
                            {meeting.title
                              .split(/\s+/)
                              .filter(Boolean)
                              .slice(0, 2)
                              .map((part) => part[0]?.toUpperCase() ?? "")
                              .join("") || "M"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate font-medium text-slate-950">{meeting.title}</p>
                              {selected ? <Check className="h-4 w-4 text-[#6c63ff]" /> : null}
                            </div>
                            <p className="text-sm text-slate-500">{formatMeetingDate(meeting.scheduledStartTime || meeting.createdAt)}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            <div className="space-y-3">
              <label className="text-sm font-semibold text-slate-900" htmlFor="task-input">
                {mode === "meeting" ? "Meeting context" : "Task input"}
              </label>
              <textarea
                id="task-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={12}
                className="min-h-[250px] w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-900 outline-none transition focus:border-[#6c63ff] focus:ring-2 focus:ring-[#6c63ff]/20"
                placeholder={
                  mode === "voice"
                    ? `Paste your voice-to-text transcript here...

Example:
okay so um we need to uh get the proposal done
by thursday sarah is handling that and then
mike needs to review it before we send and
also dont forget the client call on friday morning`
                    : mode === "meeting"
                      ? "Select a completed meeting to load transcript or summary here..."
                      : `Paste anything here - rough notes, brain dump,
WhatsApp messages, bullet points...

Example:
need to call john about the contract asap
priya should finish the homepage design by friday
someone needs to fix the login bug - critical
team meeting next tuesday 3pm
send invoice to acme corp before month end`
                }
              />
              <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                <span>
                  {mode === "voice"
                    ? "Works great with Google Voice transcripts"
                    : mode === "meeting"
                      ? "Loads summary or transcript from a completed meeting"
                      : "The messier the better - Artivaa will structure it"}
                </span>
                <span>{input.length.toLocaleString()} characters</span>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-900" htmlFor="team-members">
                Team members (optional)
              </label>
              <input
                id="team-members"
                value={teamMembers}
                onChange={(event) => setTeamMembers(event.target.value)}
                placeholder="e.g. Rahul, Priya, David, Sarah"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#6c63ff] focus:ring-2 focus:ring-[#6c63ff]/20"
              />
              <p className="text-xs text-slate-500">Helps assign tasks to right people</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-900" htmlFor="date-context">
                Date reference
              </label>
              <input
                id="date-context"
                value={dateContext}
                onChange={(event) => setDateContext(event.target.value)}
                placeholder={`Today is ${formatCurrentDate()}`}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#6c63ff] focus:ring-2 focus:ring-[#6c63ff]/20"
              />
              <p className="text-xs text-slate-500">Helps interpret relative dates like Friday or next week</p>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-900">Output format</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "detailed" as const, label: "Detailed" },
                  { id: "simple" as const, label: "Simple" },
                  { id: "jira" as const, label: "Jira-style" }
                ].map((item) => (
                  <Button key={item.id} type="button" variant={outputFormat === item.id ? "default" : "outline"} onClick={() => setOutputFormat(item.id)} className="rounded-full">
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <input
                type="checkbox"
                checked={autoPriority}
                onChange={(event) => setAutoPriority(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-[#6c63ff] focus:ring-[#6c63ff]"
              />
              <div className="space-y-1">
                <span className="block text-sm font-semibold text-slate-900">Auto-detect priority</span>
                <p className="text-xs leading-5 text-slate-500">Artivaa will infer urgency from language used</p>
              </div>
            </label>
          </section>

          <div className="space-y-3">
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="h-12 w-full rounded-2xl bg-[linear-gradient(135deg,#6c63ff,#8b5cf6)] text-base font-semibold shadow-lg shadow-[#6c63ff]/20 hover:opacity-95"
            >
              {isGenerating ? <LoadingSpinner className="text-white" /> : <Sparkles className="h-5 w-5" />}
              {isGenerating ? "Structuring your tasks..." : "Generate Tasks →"}
            </Button>
            {error ? <p className="text-sm text-[#dc2626]">{error}</p> : null}
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex min-h-[720px] flex-col">
          {!tasks.length ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
              <div className="mb-4 animate-bounce rounded-full bg-slate-100 p-6 text-slate-400">
                <CheckSquare className="h-12 w-12" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900">Your structured tasks will appear here</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">Paste any messy notes and click Generate.</p>
            </div>
          ) : isGenerating ? (
            <div className="flex flex-1 flex-col justify-center space-y-4">
              <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4 text-slate-700">
                <LoadingSpinner />
                <span className="font-medium">Artivaa is reading your notes...</span>
              </div>
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : (
            <div className="flex h-full flex-col gap-5">
              <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-slate-950">{tasks.length} tasks generated</h2>
                  <Badge className="rounded-full bg-[#f5f3ff] text-[#6c63ff]">{tasks.length}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleGenerate} disabled={isGenerating || !input.trim()}>
                    <Sparkles className="h-4 w-4" />
                    Regenerate ↺
                  </Button>
                  <Button type="button" size="sm" onClick={handleSaveAll} disabled={isSaving || tasks.length === 0}>
                    {isSaving ? <LoadingSpinner className="text-white" size="sm" /> : null}
                    {hasSaved ? "✓ Saved" : "Save All →"}
                  </Button>
                  <CopyButton text={toPlainText(tasks)} label="Copy All" disabled={tasks.length === 0} />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <div className="rounded-full bg-[#fef2f2] px-3 py-1 text-xs font-semibold text-[#dc2626]">{stats.high} High</div>
                <div className="rounded-full bg-[#fefce8] px-3 py-1 text-xs font-semibold text-[#ca8a04]">{stats.medium} Medium</div>
                <div className="rounded-full bg-[#f0fdf4] px-3 py-1 text-xs font-semibold text-[#16a34a]">{stats.low} Low</div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{stats.assigned} Assigned</div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{stats.unassigned} Unassigned</div>
              </div>

              {statusMessage ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  <span>{statusMessage}</span>
                  {" "}
                  <a href="/dashboard/action-items?source=task-generator" className="font-semibold underline hover:no-underline">View Action Items →</a>
                </div>
              ) : null}
              {summary ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-900">Summary</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{summary}</p>
                </div>
              ) : null}
              {unextractable ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-semibold text-amber-800">Additional context</p>
                  <p className="mt-2 text-sm leading-6 text-amber-900/80">{unextractable}</p>
                </div>
              ) : null}

              <div className="space-y-4">
                {tasks.map((task, index) => {
                  const isEditing = editingId === task.id;
                  return (
                    <Card key={task.id} className="border border-slate-200 p-4">
                      {isEditing ? (
                        <div className="space-y-4">
                          <div className="flex items-start gap-3">
                            <button type="button" onClick={() => updateTask(task.id, { completed: !task.completed })} className="mt-0.5 text-slate-400 transition hover:text-[#6c63ff]">
                              {task.completed ? <CheckSquare className="h-5 w-5 text-[#6c63ff]" /> : <Square className="h-5 w-5" />}
                            </button>
                            <div className="flex-1 space-y-3">
                              <input
                                value={task.task}
                                onChange={(event) => updateTask(task.id, { task: event.target.value })}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#6c63ff] focus:ring-2 focus:ring-[#6c63ff]/20"
                              />
                              <textarea
                                value={task.notes}
                                onChange={(event) => updateTask(task.id, { notes: event.target.value })}
                                rows={3}
                                placeholder="Notes"
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#6c63ff] focus:ring-2 focus:ring-[#6c63ff]/20"
                              />
                              <div className="grid gap-3 md:grid-cols-3">
                                <input
                                  value={task.owner}
                                  onChange={(event) => updateTask(task.id, { owner: event.target.value })}
                                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#6c63ff] focus:ring-2 focus:ring-[#6c63ff]/20"
                                />
                                <input
                                  value={task.due_date}
                                  onChange={(event) => updateTask(task.id, { due_date: event.target.value })}
                                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#6c63ff] focus:ring-2 focus:ring-[#6c63ff]/20"
                                />
                                <select
                                  value={task.priority}
                                  onChange={(event) => updateTask(task.id, { priority: event.target.value as Priority })}
                                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#6c63ff] focus:ring-2 focus:ring-[#6c63ff]/20"
                                >
                                  <option value="High">High</option>
                                  <option value="Medium">Medium</option>
                                  <option value="Low">Low</option>
                                </select>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => setEditingId(null)}>
                              <X className="h-4 w-4" />
                              Cancel
                            </Button>
                            <Button type="button" size="sm" onClick={() => setEditingId(null)}>
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex items-start gap-3">
                            <button type="button" onClick={() => updateTask(task.id, { completed: !task.completed })} className="mt-0.5 text-slate-400 transition hover:text-[#6c63ff]">
                              {task.completed ? <CheckSquare className="h-5 w-5 text-[#6c63ff]" /> : <Square className="h-5 w-5" />}
                            </button>
                            <div className="min-w-0 flex-1 space-y-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge className={cn("rounded-full", getPriorityStyles(task.priority))}>{task.priority}</Badge>
                                <span className="text-xs text-slate-400">Task {index + 1}</span>
                              </div>
                              <p className={cn("text-sm leading-7 text-slate-900", task.completed && "text-slate-400 line-through")}>{task.task}</p>
                              {task.notes ? <p className="text-sm leading-6 text-slate-500">{task.notes}</p> : null}
                              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
                                <span>👤 {task.owner || "Unassigned"}</span>
                                <span>📅 {task.due_date || "Not specified"}</span>
                                <span>🏷️ {task.type || "Task"}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => setEditingId(task.id)}>
                              <Pencil className="h-4 w-4" />
                              Edit
                            </Button>
                            <Button type="button" variant="danger" size="sm" onClick={() => removeTask(task.id)}>
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>

              {removedTaskNotice && undoTask ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <span>Task removed. Undo?</span>
                  <Button type="button" variant="outline" size="sm" onClick={undoRemove}>
                    Undo
                  </Button>
                </div>
              ) : null}

              <div className="mt-auto space-y-3 border-t border-slate-200 pt-4">
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={handleSaveAll} disabled={isSaving || tasks.length === 0}>
                    {isSaving ? <LoadingSpinner className="text-white" size="sm" /> : null}
                    Save All to Action Items
                  </Button>
                  <CopyButton text={toPlainText(tasks)} label="Copy as Text" disabled={tasks.length === 0} />
                  <CopyButton text={toMarkdown(tasks)} label="Copy as Markdown" disabled={tasks.length === 0} />
                  <Button type="button" variant="outline" onClick={handleCopyCsv} disabled={tasks.length === 0}>
                    <Download className="h-4 w-4" />
                    Export as CSV
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
