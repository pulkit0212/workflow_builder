"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import type { Route } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, CheckSquare, Download, ListChecks, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SkeletonList } from "@/components/SkeletonCard";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { useApiFetch } from "@/hooks/useApiFetch";
import { useWorkspaceContext } from "@/contexts/workspace-context";
import { cn } from "@/lib/utils";
import { AssigneeCell } from "@/features/action-items/components/AssigneeCell";

const ITEMS_PER_PAGE = 10;

type ActionItemTab = "all" | "assigned_to_me" | "created_by_me";
export type WorkspaceRole = "admin" | "member" | "viewer" | "personal";

// Filter state — priority and status are multi-select arrays
type FilterState = {
  priorities: string[];   // [] means "all"
  statuses: string[];     // [] means "all"
  dueDateFrom: string;
  dueDateTo: string;
  assigneeName: string;
};

const EMPTY_FILTERS: FilterState = { priorities: [], statuses: [], dueDateFrom: "", dueDateTo: "", assigneeName: "" };

export type ActionItemRow = {
  id: string; task: string; assignee: string; due_date: string;
  priority: string; status: string; source: string;
  meeting_title: string | null; meeting_id: string | null;
  created_at: string; reporter_id: string;
  reporter_name: string | null;
  assignee_id: string | null;
  assignee_name: string | null; assignee_email: string | null;
};

type WorkspaceMember = { id: string; name: string; email: string };

const STATUS_OPTIONS: { value: string; label: string; color: string; bg: string }[] = [
  { value: "pending",     label: "Pending",     color: "#5F6368", bg: "#F1F3F4" },
  { value: "in_progress", label: "In Progress", color: "#1A73E8", bg: "#E8F0FE" },
  { value: "done",        label: "Done",        color: "#137333", bg: "#E6F4EA" },
  { value: "hold",        label: "On Hold",     color: "#B06000", bg: "#FEF7E0" },
];

function getStatusStyle(status: string) {
  return STATUS_OPTIONS.find((s) => s.value === status) ?? STATUS_OPTIONS[0];
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ActionItemsPage() {
  return <ErrorBoundary><ActionItemsContent /></ErrorBoundary>;
}

// ─── Delete modal ─────────────────────────────────────────────────────────────
function DeleteModal({ count, onConfirm, onCancel, isDeleting }: { count: number; onConfirm: () => void; onCancel: () => void; isDeleting: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50">
            <AlertTriangle className="h-5 w-5 text-red-500" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#202124]">Delete {count} action item{count !== 1 ? "s" : ""}?</h2>
            <p className="mt-1 text-sm text-[#5F6368]">This will permanently remove the selected item{count !== 1 ? "s" : ""}. This cannot be undone.</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={isDeleting}
            className="rounded-lg border border-[#DADCE0] px-4 py-2 text-sm font-semibold text-[#5F6368] hover:bg-[#F8F9FA] disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={isDeleting}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {isDeleting ? "Deleting…" : `Delete ${count} item${count !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── New Task modal ───────────────────────────────────────────────────────────
function NewTaskModal({ onClose, onSave, isAdmin, members, apiFetch, activeWorkspaceId }: {
  onClose: () => void;
  onSave: (data: { task: string; assignee: string; dueDate: string; priority: string; assigneeId: string | null }) => Promise<void>;
  isAdmin: boolean;
  members: WorkspaceMember[];
  apiFetch: (path: string, init?: RequestInit & { workspaceId?: string | null }) => Promise<Response>;
  activeWorkspaceId: string | null;
}) {
  const [task, setTask] = useState("");
  const [owner, setOwner] = useState("");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [assigneeName, setAssigneeName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // User search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; full_name: string | null; email: string }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSearchChange(q: string) {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); setShowDropdown(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await apiFetch(`/api/users/search?q=${encodeURIComponent(q)}`, {
          workspaceId: activeWorkspaceId,
        });
        const data = await res.json() as { users?: Array<{ id: string; full_name: string | null; email: string }> };
        setSearchResults(data.users ?? []);
        setShowDropdown(true);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 400);
  }

  function selectUser(u: { id: string; full_name: string | null; email: string }) {
    setAssigneeId(u.id);
    setAssigneeName(u.full_name || u.email);
    setSearchQuery(u.full_name || u.email);
    setShowDropdown(false);
  }

  function clearAssignee() {
    setAssigneeId(null);
    setAssigneeName("");
    setSearchQuery("");
    setSearchResults([]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!task.trim()) { setErr("Task is required."); return; }
    setSaving(true);
    try {
      await onSave({
        task: task.trim(),
        assignee: assigneeName || owner || "Unassigned",
        dueDate: dueDate || "Not specified",
        priority,
        assigneeId,
      });
      onClose();
    }
    catch { setErr("Failed to save. Please try again."); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#DADCE0]">
          <p className="text-sm font-bold text-[#202124]">New Action Item</p>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-[#F1F3F4]"><X className="h-4 w-4 text-[#5F6368]" /></button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#5F6368] mb-1">Task *</label>
            <input value={task} onChange={(e) => setTask(e.target.value)} placeholder="Describe the task…"
              className="w-full rounded-lg border border-[#DADCE0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6C3FF5]/30" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#5F6368] mb-1">Assignee</label>
              <div ref={searchRef} className="relative">
                <div className="flex items-center gap-1 rounded-lg border border-[#DADCE0] px-3 py-2">
                  <input
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
                    placeholder="Search users…"
                    className="flex-1 bg-transparent text-sm focus:outline-none"
                  />
                  {isSearching && <Loader2 className="h-3 w-3 animate-spin text-[#9AA0A6]" />}
                  {assigneeId && (
                    <button type="button" onClick={clearAssignee} className="text-[#9AA0A6] hover:text-[#5F6368]">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {showDropdown && (
                  <div className="absolute left-0 top-full z-20 mt-1 w-full overflow-hidden rounded-xl border border-[#DADCE0] bg-white shadow-lg max-h-48 overflow-y-auto">
                    {searchResults.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-[#9AA0A6]">No users found</p>
                    ) : (
                      searchResults.map((u) => (
                        <button key={u.id} type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[#F8F9FA]"
                          onClick={() => selectUser(u)}>
                          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] text-[9px] font-bold text-[#6C3FF5]">
                            {(u.full_name || u.email).slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-[#202124]">{u.full_name || u.email}</p>
                            {u.full_name && <p className="truncate text-[#9AA0A6]">{u.email}</p>}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {!assigneeId && (
                <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Or type a name…"
                  className="mt-1 w-full rounded-lg border border-[#DADCE0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6C3FF5]/30" />
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#5F6368] mb-1">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)}
                className="w-full rounded-lg border border-[#DADCE0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6C3FF5]/30">
                <option>High</option><option>Medium</option><option>Low</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#5F6368] mb-1">Due Date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-[#DADCE0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6C3FF5]/30" />
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-[#DADCE0] px-4 py-2 text-sm font-semibold text-[#5F6368] hover:bg-[#F8F9FA]">Cancel</button>
            <button type="submit" disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[#6C3FF5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5B2FE0] disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {saving ? "Saving…" : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Status dropdown ──────────────────────────────────────────────────────────
function StatusDropdown({ itemId, current, onUpdate }: { itemId: string; current: string; onUpdate: (id: string, status: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const style = getStatusStyle(current);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition-opacity hover:opacity-80"
        style={{ background: style.bg, color: style.color }}>
        {style.label}<span className="text-[9px]">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-xl border border-[#DADCE0] bg-white shadow-lg">
          {STATUS_OPTIONS.map((opt) => (
            <button key={opt.value} type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[#F8F9FA]"
              onClick={() => { onUpdate(itemId, opt.value); setOpen(false); }}>
              <span className="h-2 w-2 rounded-full" style={{ background: opt.color }} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Priority dropdown ────────────────────────────────────────────────────────
const PRIORITY_OPTIONS = [
  { value: "High",   label: "High",   color: "#C5221F", bg: "#FCE8E6", arrow: "↑" },
  { value: "Medium", label: "Medium", color: "#B06000", bg: "#FEF7E0", arrow: "↑" },
  { value: "Low",    label: "Low",    color: "#1A73E8", bg: "#E8F0FE", arrow: "↓" },
];

function getPriorityStyle(priority: string) {
  return PRIORITY_OPTIONS.find((p) => p.value === priority) ?? PRIORITY_OPTIONS[1];
}

function PriorityDropdown({ itemId, current, onUpdate }: { itemId: string; current: string; onUpdate: (id: string, priority: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const style = getPriorityStyle(current);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-semibold uppercase transition-opacity hover:opacity-80"
        style={{ color: style.color }}>
        <span className="text-sm font-bold">{style.arrow}</span>
        {style.label}
        <span className="text-[9px]">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-32 overflow-hidden rounded-xl border border-[#DADCE0] bg-white shadow-lg">
          {PRIORITY_OPTIONS.map((opt) => (
            <button key={opt.value} type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[#F8F9FA]"
              onClick={() => { onUpdate(itemId, opt.value); setOpen(false); }}>
              <span className="font-bold" style={{ color: opt.color }}>{opt.arrow}</span>
              <span className="font-semibold uppercase" style={{ color: opt.color }}>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Share modal ──────────────────────────────────────────────────────────────
function ShareActionItemsModal({ count, onClose, onShareSlack, onShareJira, onShareEmail, onShareNotion }: {
  count: number; onClose: () => void;
  onShareSlack: () => Promise<void>; onShareJira: () => Promise<void>;
  onShareEmail: () => Promise<void>; onShareNotion: () => Promise<void>;
}) {
  const [sharing, setSharing] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);

  async function handle(key: string, fn: () => Promise<void>) {
    setSharing(key);
    try { await fn(); setDone((d) => [...d, key]); }
    finally { setSharing(null); }
  }

  const integrations = [
    { key: "slack",  label: "Slack",  desc: "Post to a Slack channel",   icon: "chat",       color: "#E01E5A", bg: "#FFF0F3", fn: onShareSlack },
    { key: "jira",   label: "Jira",   desc: "Create Jira tickets",        icon: "bug_report", color: "#0052CC", bg: "#EFF6FF", fn: onShareJira },
    { key: "email",  label: "Email",  desc: "Send via Gmail",             icon: "mail",       color: "#EA4335", bg: "#FEF2F2", fn: onShareEmail },
    { key: "notion", label: "Notion", desc: "Export to Notion workspace", icon: "article",    color: "#000000", bg: "#F8F8F8", fn: onShareNotion },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#DADCE0]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EDE9FE]">
              <span className="material-symbols-outlined text-[#6C3FF5] text-[20px]">share</span>
            </div>
            <div>
              <p className="text-sm font-bold text-[#202124]">Share Action Items</p>
              <p className="text-xs text-[#5F6368]">{count} item{count !== 1 ? "s" : ""} selected</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-[#F1F3F4]"><X className="h-4 w-4 text-[#5F6368]" /></button>
        </div>
        <div className="p-4 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5F6368] px-1 mb-3">Share to your connected integrations</p>
          {integrations.map((intg) => (
            <button key={intg.key} type="button" onClick={() => void handle(intg.key, intg.fn)}
              disabled={sharing !== null || done.includes(intg.key)}
              className="w-full flex items-center gap-4 rounded-xl border border-[#DADCE0] p-4 text-left hover:border-[#6C3FF5]/30 hover:bg-[#F8F9FA] transition-all disabled:opacity-60 group">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: intg.bg }}>
                <span className="material-symbols-outlined text-[20px]" style={{ color: intg.color }}>{intg.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#202124]">{intg.label}</p>
                <p className="text-xs text-[#5F6368]">{intg.desc}</p>
              </div>
              <div className="shrink-0">
                {sharing === intg.key ? <Loader2 className="h-4 w-4 animate-spin text-[#6C3FF5]" />
                  : done.includes(intg.key) ? <span className="material-symbols-outlined text-[#34A853] text-[20px]">check_circle</span>
                  : <span className="material-symbols-outlined text-[#DADCE0] group-hover:text-[#6C3FF5] text-[20px] transition-colors">chevron_right</span>}
              </div>
            </button>
          ))}
        </div>
        <div className="px-6 py-4 bg-[#F8F9FA] border-t border-[#DADCE0]">
          <p className="text-xs text-[#5F6368] text-center">
            Only connected integrations will work. <Link href="/dashboard/integrations" className="text-[#6C3FF5] hover:underline">Manage integrations →</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Filter panel ────────────────────────────────────────────────────────────
function FilterPanel({
  filters, onChange, onClose, apiFetch, activeWorkspaceId,
}: {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  onClose: () => void;
  apiFetch: (path: string, init?: RequestInit & { workspaceId?: string | null }) => Promise<Response>;
  activeWorkspaceId: string | null;
}) {
  const [local, setLocal] = useState<FilterState>(filters);
  const [assigneeSuggestions, setAssigneeSuggestions] = useState<Array<{ id: string; full_name: string | null; email: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node)) setShowSuggestions(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function togglePriority(p: string) {
    setLocal((f) => ({
      ...f,
      priorities: f.priorities.includes(p) ? f.priorities.filter((x) => x !== p) : [...f.priorities, p],
    }));
  }

  function toggleStatus(s: string) {
    setLocal((f) => ({
      ...f,
      statuses: f.statuses.includes(s) ? f.statuses.filter((x) => x !== s) : [...f.statuses, s],
    }));
  }

  function handleAssigneeInput(q: string) {
    setLocal((f) => ({ ...f, assigneeName: q }));
    if (!q.trim()) { setAssigneeSuggestions([]); setShowSuggestions(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsSuggesting(true);
      try {
        const res = await apiFetch(`/api/users/search?q=${encodeURIComponent(q)}`, { workspaceId: activeWorkspaceId });
        const data = await res.json() as { users?: Array<{ id: string; full_name: string | null; email: string }> };
        setAssigneeSuggestions(data.users ?? []);
        setShowSuggestions(true);
      } catch { setAssigneeSuggestions([]); }
      finally { setIsSuggesting(false); }
    }, 300);
  }

  function apply() { onChange(local); onClose(); }
  function reset() { setLocal(EMPTY_FILTERS); onChange(EMPTY_FILTERS); onClose(); }

  const activeCount = [
    local.priorities.length > 0,
    local.statuses.length > 0,
    !!local.dueDateFrom,
    !!local.dueDateTo,
    !!local.assigneeName.trim(),
  ].filter(Boolean).length;

  return (
    <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-2xl border border-[#DADCE0] bg-white shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#DADCE0]">
        <p className="text-sm font-bold text-[#202124]">
          Filters {activeCount > 0 && <span className="ml-1 rounded-full bg-[#6C3FF5] px-1.5 py-0.5 text-[10px] text-white">{activeCount}</span>}
        </p>
        <button type="button" onClick={onClose} className="rounded-full p-1 hover:bg-[#F1F3F4]"><X className="h-3.5 w-3.5 text-[#5F6368]" /></button>
      </div>
      <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
        {/* Priority — multi-select */}
        <div>
          <label className="block text-xs font-semibold text-[#5F6368] mb-1.5">
            Priority {local.priorities.length > 0 && <span className="text-[#6C3FF5]">({local.priorities.length})</span>}
          </label>
          <div className="flex gap-2 flex-wrap">
            {["High", "Medium", "Low"].map((p) => {
              const active = local.priorities.includes(p);
              return (
                <button key={p} type="button" onClick={() => togglePriority(p)}
                  className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold border transition-colors",
                    active ? "bg-[#6C3FF5] text-white border-[#6C3FF5]" : "bg-white text-[#5F6368] border-[#DADCE0] hover:border-[#6C3FF5]")}>
                  {active && <span className="text-[10px]">✓</span>}
                  {p}
                </button>
              );
            })}
          </div>
        </div>
        {/* Status — multi-select */}
        <div>
          <label className="block text-xs font-semibold text-[#5F6368] mb-1.5">
            Status {local.statuses.length > 0 && <span className="text-[#6C3FF5]">({local.statuses.length})</span>}
          </label>
          <div className="flex gap-2 flex-wrap">
            {[
              { value: "pending",     label: "Pending" },
              { value: "in_progress", label: "In Progress" },
              { value: "done",        label: "Done" },
              { value: "hold",        label: "On Hold" },
            ].map((s) => {
              const active = local.statuses.includes(s.value);
              return (
                <button key={s.value} type="button" onClick={() => toggleStatus(s.value)}
                  className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold border transition-colors",
                    active ? "bg-[#6C3FF5] text-white border-[#6C3FF5]" : "bg-white text-[#5F6368] border-[#DADCE0] hover:border-[#6C3FF5]")}>
                  {active && <span className="text-[10px]">✓</span>}
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
        {/* Due Date range */}
        <div>
          <label className="block text-xs font-semibold text-[#5F6368] mb-1.5">Due Date Range</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] text-[#9AA0A6] mb-1">From</p>
              <input type="date" value={local.dueDateFrom}
                onChange={(e) => setLocal((f) => ({ ...f, dueDateFrom: e.target.value }))}
                className="w-full rounded-lg border border-[#DADCE0] px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#6C3FF5]/40" />
            </div>
            <div>
              <p className="text-[10px] text-[#9AA0A6] mb-1">To</p>
              <input type="date" value={local.dueDateTo}
                onChange={(e) => setLocal((f) => ({ ...f, dueDateTo: e.target.value }))}
                className="w-full rounded-lg border border-[#DADCE0] px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#6C3FF5]/40" />
            </div>
          </div>
        </div>
        {/* Assignee name with auto-suggest */}
        <div ref={suggestRef} className="relative">
          <label className="block text-xs font-semibold text-[#5F6368] mb-1.5">Assignee Name</label>
          <div className="flex items-center gap-1 rounded-lg border border-[#DADCE0] px-3 py-1.5">
            <input value={local.assigneeName}
              onChange={(e) => handleAssigneeInput(e.target.value)}
              onFocus={() => { if (assigneeSuggestions.length > 0) setShowSuggestions(true); }}
              placeholder="Search assignee…"
              className="flex-1 bg-transparent text-xs focus:outline-none" />
            {isSuggesting && <Loader2 className="h-3 w-3 animate-spin text-[#9AA0A6]" />}
            {local.assigneeName && (
              <button type="button" onClick={() => { setLocal((f) => ({ ...f, assigneeName: "" })); setAssigneeSuggestions([]); }}
                className="text-[#9AA0A6] hover:text-[#5F6368]"><X className="h-3 w-3" /></button>
            )}
          </div>
          {showSuggestions && assigneeSuggestions.length > 0 && (
            <div className="absolute left-0 top-full z-40 mt-1 w-full overflow-hidden rounded-xl border border-[#DADCE0] bg-white shadow-lg max-h-36 overflow-y-auto">
              {assigneeSuggestions.map((u) => (
                <button key={u.id} type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[#F8F9FA]"
                  onClick={() => { setLocal((f) => ({ ...f, assigneeName: u.full_name || u.email })); setShowSuggestions(false); }}>
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] text-[9px] font-bold text-[#6C3FF5]">
                    {(u.full_name || u.email).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[#202124]">{u.full_name || u.email}</p>
                    {u.full_name && <p className="truncate text-[#9AA0A6]">{u.email}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between px-4 py-3 border-t border-[#DADCE0] bg-[#F8F9FA]">
        <button type="button" onClick={reset} className="text-xs font-semibold text-[#5F6368] hover:text-[#202124]">Reset all</button>
        <button type="button" onClick={apply} className="rounded-lg bg-[#6C3FF5] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#5B2FE0]">Apply</button>
      </div>
    </div>
  );
}

// ─── Export CSV modal ─────────────────────────────────────────────────────────
function ExportModal({
  items, onClose, apiFetch, activeWorkspaceId, currentDbUserId,
}: {
  items: ActionItemRow[];
  onClose: () => void;
  apiFetch: (path: string, init?: RequestInit & { workspaceId?: string | null }) => Promise<Response>;
  activeWorkspaceId: string | null;
  currentDbUserId: string | null;
}) {
  // Scope — which base set to export
  const [scope, setScope] = useState<"all" | "assigned_to_me" | "created_by_me">("all");
  // Additional filters on top of scope
  const [exportFilters, setExportFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [assigneeSuggestions, setAssigneeSuggestions] = useState<Array<{ id: string; full_name: string | null; email: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node)) setShowSuggestions(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function togglePriority(p: string) {
    setExportFilters((f) => ({
      ...f, priorities: f.priorities.includes(p) ? f.priorities.filter((x) => x !== p) : [...f.priorities, p],
    }));
  }
  function toggleStatus(s: string) {
    setExportFilters((f) => ({
      ...f, statuses: f.statuses.includes(s) ? f.statuses.filter((x) => x !== s) : [...f.statuses, s],
    }));
  }

  function handleAssigneeInput(q: string) {
    setExportFilters((f) => ({ ...f, assigneeName: q }));
    if (!q.trim()) { setAssigneeSuggestions([]); setShowSuggestions(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsSuggesting(true);
      try {
        const res = await apiFetch(`/api/users/search?q=${encodeURIComponent(q)}`, { workspaceId: activeWorkspaceId });
        const data = await res.json() as { users?: Array<{ id: string; full_name: string | null; email: string }> };
        setAssigneeSuggestions(data.users ?? []);
        setShowSuggestions(true);
      } catch { setAssigneeSuggestions([]); }
      finally { setIsSuggesting(false); }
    }, 300);
  }

  function doExport() {
    // Step 1: apply scope
    let rows = items;
    if (scope === "assigned_to_me") rows = items.filter((i) => i.assignee_id === currentDbUserId);
    else if (scope === "created_by_me") rows = items.filter((i) => i.reporter_id === currentDbUserId);

    // Step 2: apply additional filters
    rows = rows.filter((i) => {
      if (exportFilters.priorities.length > 0 && !exportFilters.priorities.includes(i.priority)) return false;
      if (exportFilters.statuses.length > 0 && !exportFilters.statuses.includes(i.status)) return false;
      if (exportFilters.dueDateFrom) {
        const d = new Date(i.due_date);
        if (!isNaN(d.getTime()) && d < new Date(exportFilters.dueDateFrom)) return false;
      }
      if (exportFilters.dueDateTo) {
        const d = new Date(i.due_date);
        if (!isNaN(d.getTime()) && d > new Date(exportFilters.dueDateTo)) return false;
      }
      if (exportFilters.assigneeName.trim()) {
        const q = exportFilters.assigneeName.toLowerCase();
        if (!(i.assignee_name || i.assignee || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });

    const headers = ["Task", "Assignee", "Reporter", "Due Date", "Priority", "Status", "Source", "Created"];
    const csvRows = rows.map((i) => [
      i.task,
      i.assignee_name || i.assignee || "Unassigned",
      i.reporter_name || "",
      i.due_date,
      i.priority,
      i.status,
      i.source,
      new Date(i.created_at).toLocaleDateString(),
    ]);
    const csv = [headers, ...csvRows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `action-items-${scope}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onClose();
  }

  const SCOPES = [
    { value: "all" as const,            label: "All items",      desc: "Every item visible to you" },
    { value: "assigned_to_me" as const, label: "Assigned to me", desc: "Items where you are the assignee" },
    { value: "created_by_me" as const,  label: "Created by me",  desc: "Items where you are the reporter" },
  ];

  // Preview count
  let previewRows = items;
  if (scope === "assigned_to_me") previewRows = items.filter((i) => i.assignee_id === currentDbUserId);
  else if (scope === "created_by_me") previewRows = items.filter((i) => i.reporter_id === currentDbUserId);
  const previewCount = previewRows.filter((i) => {
    if (exportFilters.priorities.length > 0 && !exportFilters.priorities.includes(i.priority)) return false;
    if (exportFilters.statuses.length > 0 && !exportFilters.statuses.includes(i.status)) return false;
    if (exportFilters.assigneeName.trim() && !(i.assignee_name || i.assignee || "").toLowerCase().includes(exportFilters.assigneeName.toLowerCase())) return false;
    return true;
  }).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#DADCE0]">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 text-[#6C3FF5]" />
            <p className="text-sm font-bold text-[#202124]">Export CSV</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-[#F1F3F4]"><X className="h-4 w-4 text-[#5F6368]" /></button>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Scope */}
          <div>
            <p className="text-xs font-semibold text-[#5F6368] mb-2">Export scope</p>
            <div className="space-y-2">
              {SCOPES.map((s) => (
                <button key={s.value} type="button" onClick={() => setScope(s.value)}
                  className={cn("w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                    scope === s.value ? "border-[#6C3FF5] bg-[#EDE9FE]/40" : "border-[#DADCE0] hover:border-[#6C3FF5]/40 hover:bg-[#F8F9FA]")}>
                  <div className={cn("h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center",
                    scope === s.value ? "border-[#6C3FF5]" : "border-[#DADCE0]")}>
                    {scope === s.value && <div className="h-2 w-2 rounded-full bg-[#6C3FF5]" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#202124]">{s.label}</p>
                    <p className="text-xs text-[#9AA0A6]">{s.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-[#DADCE0]" />

          {/* Priority — multi-select */}
          <div>
            <p className="text-xs font-semibold text-[#5F6368] mb-2">
              Priority {exportFilters.priorities.length > 0 && <span className="text-[#6C3FF5]">({exportFilters.priorities.length})</span>}
            </p>
            <div className="flex gap-2 flex-wrap">
              {["High", "Medium", "Low"].map((p) => {
                const active = exportFilters.priorities.includes(p);
                return (
                  <button key={p} type="button" onClick={() => togglePriority(p)}
                    className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold border transition-colors",
                      active ? "bg-[#6C3FF5] text-white border-[#6C3FF5]" : "bg-white text-[#5F6368] border-[#DADCE0] hover:border-[#6C3FF5]")}>
                    {active && <span className="text-[10px]">✓</span>}{p}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status — multi-select */}
          <div>
            <p className="text-xs font-semibold text-[#5F6368] mb-2">
              Status {exportFilters.statuses.length > 0 && <span className="text-[#6C3FF5]">({exportFilters.statuses.length})</span>}
            </p>
            <div className="flex gap-2 flex-wrap">
              {[
                { value: "pending", label: "Pending" },
                { value: "in_progress", label: "In Progress" },
                { value: "done", label: "Done" },
                { value: "hold", label: "On Hold" },
              ].map((s) => {
                const active = exportFilters.statuses.includes(s.value);
                return (
                  <button key={s.value} type="button" onClick={() => toggleStatus(s.value)}
                    className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold border transition-colors",
                      active ? "bg-[#6C3FF5] text-white border-[#6C3FF5]" : "bg-white text-[#5F6368] border-[#DADCE0] hover:border-[#6C3FF5]")}>
                    {active && <span className="text-[10px]">✓</span>}{s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Due Date range */}
          <div>
            <p className="text-xs font-semibold text-[#5F6368] mb-2">Due Date Range</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-[#9AA0A6] mb-1">From</p>
                <input type="date" value={exportFilters.dueDateFrom}
                  onChange={(e) => setExportFilters((f) => ({ ...f, dueDateFrom: e.target.value }))}
                  className="w-full rounded-lg border border-[#DADCE0] px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#6C3FF5]/40" />
              </div>
              <div>
                <p className="text-[10px] text-[#9AA0A6] mb-1">To</p>
                <input type="date" value={exportFilters.dueDateTo}
                  onChange={(e) => setExportFilters((f) => ({ ...f, dueDateTo: e.target.value }))}
                  className="w-full rounded-lg border border-[#DADCE0] px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#6C3FF5]/40" />
              </div>
            </div>
          </div>

          {/* Assignee search */}
          <div ref={suggestRef} className="relative">
            <p className="text-xs font-semibold text-[#5F6368] mb-2">Assignee</p>
            <div className="flex items-center gap-1 rounded-lg border border-[#DADCE0] px-3 py-1.5">
              <input value={exportFilters.assigneeName}
                onChange={(e) => handleAssigneeInput(e.target.value)}
                onFocus={() => { if (assigneeSuggestions.length > 0) setShowSuggestions(true); }}
                placeholder="Search assignee…"
                className="flex-1 bg-transparent text-xs focus:outline-none" />
              {isSuggesting && <Loader2 className="h-3 w-3 animate-spin text-[#9AA0A6]" />}
              {exportFilters.assigneeName && (
                <button type="button" onClick={() => { setExportFilters((f) => ({ ...f, assigneeName: "" })); setAssigneeSuggestions([]); }}
                  className="text-[#9AA0A6] hover:text-[#5F6368]"><X className="h-3 w-3" /></button>
              )}
            </div>
            {showSuggestions && assigneeSuggestions.length > 0 && (
              <div className="absolute left-0 top-full z-40 mt-1 w-full overflow-hidden rounded-xl border border-[#DADCE0] bg-white shadow-lg max-h-36 overflow-y-auto">
                {assigneeSuggestions.map((u) => (
                  <button key={u.id} type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[#F8F9FA]"
                    onClick={() => { setExportFilters((f) => ({ ...f, assigneeName: u.full_name || u.email })); setShowSuggestions(false); }}>
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] text-[9px] font-bold text-[#6C3FF5]">
                      {(u.full_name || u.email).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[#202124]">{u.full_name || u.email}</p>
                      {u.full_name && <p className="truncate text-[#9AA0A6]">{u.email}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#DADCE0] bg-[#F8F9FA]">
          <span className="text-xs text-[#5F6368]">
            <span className="font-bold text-[#202124]">{previewCount}</span> item{previewCount !== 1 ? "s" : ""} will be exported
          </span>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="rounded-lg border border-[#DADCE0] px-4 py-2 text-sm font-semibold text-[#5F6368] hover:bg-white">Cancel</button>
            <button type="button" onClick={doExport} disabled={previewCount === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-[#6C3FF5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5B2FE0] disabled:opacity-40">
              <Download className="h-4 w-4" />
              Export {previewCount > 0 ? `(${previewCount})` : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
// ─── Bulk Status modal ───────────────────────────────────────────────────────
function BulkStatusModal({ count, onConfirm, onClose }: {
  count: number;
  onConfirm: (status: string) => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState("done");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#DADCE0]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#6C3FF5] text-[20px]">update</span>
            <p className="text-sm font-bold text-[#202124]">Update Status</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-[#F1F3F4]"><X className="h-4 w-4 text-[#5F6368]" /></button>
        </div>
        <div className="p-5 space-y-2">
          <p className="text-xs text-[#5F6368] mb-3">Set status for <span className="font-bold text-[#202124]">{count}</span> selected items:</p>
          {[
            { value: "pending",     label: "Pending",     color: "#5F6368", bg: "#F1F3F4" },
            { value: "in_progress", label: "In Progress", color: "#1A73E8", bg: "#E8F0FE" },
            { value: "done",        label: "Done",        color: "#137333", bg: "#E6F4EA" },
            { value: "hold",        label: "On Hold",     color: "#B06000", bg: "#FEF7E0" },
          ].map((s) => (
            <button key={s.value} type="button" onClick={() => setStatus(s.value)}
              className={cn("w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                status === s.value ? "border-[#6C3FF5] bg-[#EDE9FE]/40" : "border-[#DADCE0] hover:bg-[#F8F9FA]")}>
              <div className={cn("h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center",
                status === s.value ? "border-[#6C3FF5]" : "border-[#DADCE0]")}>
                {status === s.value && <div className="h-2 w-2 rounded-full bg-[#6C3FF5]" />}
              </div>
              <span className="rounded px-2 py-0.5 text-xs font-bold uppercase" style={{ background: s.bg, color: s.color }}>{s.label}</span>
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#DADCE0] bg-[#F8F9FA]">
          <button type="button" onClick={onClose} className="rounded-lg border border-[#DADCE0] px-4 py-2 text-sm font-semibold text-[#5F6368] hover:bg-white">Cancel</button>
          <button type="button" onClick={() => onConfirm(status)}
            className="rounded-lg bg-[#6C3FF5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5B2FE0]">
            Apply to {count} items
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Bulk Priority modal ──────────────────────────────────────────────────────
function BulkPriorityModal({ count, onConfirm, onClose }: {
  count: number;
  onConfirm: (priority: string) => void;
  onClose: () => void;
}) {
  const [priority, setPriority] = useState("Medium");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#DADCE0]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#6C3FF5] text-[20px]">priority_high</span>
            <p className="text-sm font-bold text-[#202124]">Update Priority</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-[#F1F3F4]"><X className="h-4 w-4 text-[#5F6368]" /></button>
        </div>
        <div className="p-5 space-y-2">
          <p className="text-xs text-[#5F6368] mb-3">Set priority for <span className="font-bold text-[#202124]">{count}</span> selected items:</p>
          {[
            { value: "High",   label: "High",   color: "#C5221F", bg: "#FCE8E6", arrow: "↑" },
            { value: "Medium", label: "Medium", color: "#B06000", bg: "#FEF7E0", arrow: "↑" },
            { value: "Low",    label: "Low",    color: "#1A73E8", bg: "#E8F0FE", arrow: "↓" },
          ].map((p) => (
            <button key={p.value} type="button" onClick={() => setPriority(p.value)}
              className={cn("w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                priority === p.value ? "border-[#6C3FF5] bg-[#EDE9FE]/40" : "border-[#DADCE0] hover:bg-[#F8F9FA]")}>
              <div className={cn("h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center",
                priority === p.value ? "border-[#6C3FF5]" : "border-[#DADCE0]")}>
                {priority === p.value && <div className="h-2 w-2 rounded-full bg-[#6C3FF5]" />}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold" style={{ color: p.color }}>{p.arrow}</span>
                <span className="text-sm font-semibold uppercase" style={{ color: p.color }}>{p.label}</span>
              </div>
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#DADCE0] bg-[#F8F9FA]">
          <button type="button" onClick={onClose} className="rounded-lg border border-[#DADCE0] px-4 py-2 text-sm font-semibold text-[#5F6368] hover:bg-white">Cancel</button>
          <button type="button" onClick={() => onConfirm(priority)}
            className="rounded-lg bg-[#6C3FF5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5B2FE0]">
            Apply to {count} items
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Share modal (filter-based, like Export CSV) ─────────────────────────────
function BulkShareModal({ items, onClose, currentDbUserId, apiFetch, activeWorkspaceId }: {
  items: ActionItemRow[];
  onClose: () => void;
  currentDbUserId: string | null;
  apiFetch: (path: string, init?: RequestInit & { workspaceId?: string | null }) => Promise<Response>;
  activeWorkspaceId: string | null;
}) {
  const [scope, setScope] = useState<"all" | "assigned_to_me" | "created_by_me">("all");
  const [shareFilters, setShareFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [sharing, setSharing] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [connectedKeys, setConnectedKeys] = useState<string[] | null>(null);
  const [assigneeSuggestions, setAssigneeSuggestions] = useState<Array<{ id: string; full_name: string | null; email: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node)) setShowSuggestions(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    void apiFetch("/api/integrations")
      .then((r) => r.json())
      .then((data: Array<{ type: string; connected: boolean; enabled: boolean }>) => {
        setConnectedKeys(data.filter((i) => i.connected && i.enabled).map((i) => i.type));
      })
      .catch(() => setConnectedKeys([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function togglePriority(p: string) {
    setShareFilters((f) => ({ ...f, priorities: f.priorities.includes(p) ? f.priorities.filter((x) => x !== p) : [...f.priorities, p] }));
  }
  function toggleStatus(s: string) {
    setShareFilters((f) => ({ ...f, statuses: f.statuses.includes(s) ? f.statuses.filter((x) => x !== s) : [...f.statuses, s] }));
  }
  function handleAssigneeInput(q: string) {
    setShareFilters((f) => ({ ...f, assigneeName: q }));
    if (!q.trim()) { setAssigneeSuggestions([]); setShowSuggestions(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsSuggesting(true);
      try {
        const res = await apiFetch(`/api/users/search?q=${encodeURIComponent(q)}`, { workspaceId: activeWorkspaceId });
        const data = await res.json() as { users?: Array<{ id: string; full_name: string | null; email: string }> };
        setAssigneeSuggestions(data.users ?? []);
        setShowSuggestions(true);
      } catch { setAssigneeSuggestions([]); }
      finally { setIsSuggesting(false); }
    }, 300);
  }

  function getShareItems() {
    let rows = items;
    if (scope === "assigned_to_me") rows = items.filter((i) => i.assignee_id === currentDbUserId);
    else if (scope === "created_by_me") rows = items.filter((i) => i.reporter_id === currentDbUserId);
    return rows.filter((i) => {
      if (shareFilters.priorities.length > 0 && !shareFilters.priorities.includes(i.priority)) return false;
      if (shareFilters.statuses.length > 0 && !shareFilters.statuses.includes(i.status)) return false;
      if (shareFilters.assigneeName.trim() && !(i.assignee_name || i.assignee || "").toLowerCase().includes(shareFilters.assigneeName.toLowerCase())) return false;
      return true;
    });
  }

  const previewItems = getShareItems();
  const previewCount = previewItems.length;

  const [errors, setErrors] = useState<Record<string, string>>({});

  async function shareToTarget(target: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch("/api/meetings/share-integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targets: [target],
          title: "Action Items",
          summary: `${previewItems.length} action item${previewItems.length !== 1 ? "s" : ""} from Artivaa`,
          actionItems: previewItems.map((i) => ({ task: i.task, assignee: i.assignee, dueDate: i.due_date, priority: i.priority })),
          transcript: null,
        }),
      });
      const data = await res.json() as { results?: Record<string, { success: boolean; message: string }> };
      const result = data.results?.[target];
      return { success: result?.success ?? false, message: result?.message ?? "Unknown error" };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : "Network error" };
    }
  }

  async function handle(key: string) {
    setSharing(key);
    setErrors((prev) => { const next = { ...prev }; delete next[key]; return next; });
    try {
      const result = await shareToTarget(key);
      if (result.success) {
        setDone((d) => [...d, key]);
      } else {
        setErrors((prev) => ({ ...prev, [key]: result.message }));
      }
    } finally { setSharing(null); }
  }

  const ALL_INTEGRATIONS = [
    { key: "slack",  label: "Slack",  desc: "Post to a Slack channel",   icon: "chat",       color: "#E01E5A", bg: "#FFF0F3" },
    { key: "jira",   label: "Jira",   desc: "Create Jira tickets",        icon: "bug_report", color: "#0052CC", bg: "#EFF6FF" },
    { key: "gmail",  label: "Email",  desc: "Send via Gmail",             icon: "mail",       color: "#EA4335", bg: "#FEF2F2" },
    { key: "notion", label: "Notion", desc: "Export to Notion workspace", icon: "article",    color: "#000000", bg: "#F8F8F8" },
  ];
  const visibleIntegrations = connectedKeys === null ? ALL_INTEGRATIONS : ALL_INTEGRATIONS.filter((i) => connectedKeys.includes(i.key));

  const SCOPES = [
    { value: "all" as const,            label: "All items",      desc: "Every item visible to you" },
    { value: "assigned_to_me" as const, label: "Assigned to me", desc: "Items where you are the assignee" },
    { value: "created_by_me" as const,  label: "Created by me",  desc: "Items where you are the reporter" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#DADCE0] shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EDE9FE]">
              <span className="material-symbols-outlined text-[#6C3FF5] text-[20px]">share</span>
            </div>
            <div>
              <p className="text-sm font-bold text-[#202124]">Share Action Items</p>
              <p className="text-xs text-[#5F6368]">Choose items and destination</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-[#F1F3F4]"><X className="h-4 w-4 text-[#5F6368]" /></button>
        </div>
        <div className="flex overflow-hidden flex-1 min-h-0">
          {/* Left — filters */}
          <div className="w-72 shrink-0 border-r border-[#DADCE0] overflow-y-auto p-5 space-y-5">
            <div>
              <p className="text-xs font-semibold text-[#5F6368] mb-2">Share scope</p>
              <div className="space-y-1.5">
                {SCOPES.map((s) => (
                  <button key={s.value} type="button" onClick={() => setScope(s.value)}
                    className={cn("w-full flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors",
                      scope === s.value ? "border-[#6C3FF5] bg-[#EDE9FE]/40" : "border-[#DADCE0] hover:bg-[#F8F9FA]")}>
                    <div className={cn("h-3.5 w-3.5 shrink-0 rounded-full border-2 flex items-center justify-center",
                      scope === s.value ? "border-[#6C3FF5]" : "border-[#DADCE0]")}>
                      {scope === s.value && <div className="h-1.5 w-1.5 rounded-full bg-[#6C3FF5]" />}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[#202124]">{s.label}</p>
                      <p className="text-[10px] text-[#9AA0A6]">{s.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="border-t border-[#DADCE0]" />
            <div>
              <p className="text-xs font-semibold text-[#5F6368] mb-2">Priority {shareFilters.priorities.length > 0 && <span className="text-[#6C3FF5]">({shareFilters.priorities.length})</span>}</p>
              <div className="flex gap-1.5 flex-wrap">
                {["High", "Medium", "Low"].map((p) => {
                  const active = shareFilters.priorities.includes(p);
                  return (
                    <button key={p} type="button" onClick={() => togglePriority(p)}
                      className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold border transition-colors",
                        active ? "bg-[#6C3FF5] text-white border-[#6C3FF5]" : "bg-white text-[#5F6368] border-[#DADCE0] hover:border-[#6C3FF5]")}>
                      {active && <span className="text-[9px]">✓</span>}{p}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#5F6368] mb-2">Status {shareFilters.statuses.length > 0 && <span className="text-[#6C3FF5]">({shareFilters.statuses.length})</span>}</p>
              <div className="flex gap-1.5 flex-wrap">
                {[{ value: "pending", label: "Pending" }, { value: "in_progress", label: "In Progress" }, { value: "done", label: "Done" }, { value: "hold", label: "On Hold" }].map((s) => {
                  const active = shareFilters.statuses.includes(s.value);
                  return (
                    <button key={s.value} type="button" onClick={() => toggleStatus(s.value)}
                      className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold border transition-colors",
                        active ? "bg-[#6C3FF5] text-white border-[#6C3FF5]" : "bg-white text-[#5F6368] border-[#DADCE0] hover:border-[#6C3FF5]")}>
                      {active && <span className="text-[9px]">✓</span>}{s.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div ref={suggestRef} className="relative">
              <p className="text-xs font-semibold text-[#5F6368] mb-2">Assignee</p>
              <div className="flex items-center gap-1 rounded-lg border border-[#DADCE0] px-3 py-1.5">
                <input value={shareFilters.assigneeName} onChange={(e) => handleAssigneeInput(e.target.value)}
                  onFocus={() => { if (assigneeSuggestions.length > 0) setShowSuggestions(true); }}
                  placeholder="Search assignee…" className="flex-1 bg-transparent text-xs focus:outline-none" />
                {isSuggesting && <Loader2 className="h-3 w-3 animate-spin text-[#9AA0A6]" />}
                {shareFilters.assigneeName && (
                  <button type="button" onClick={() => { setShareFilters((f) => ({ ...f, assigneeName: "" })); setAssigneeSuggestions([]); }}
                    className="text-[#9AA0A6] hover:text-[#5F6368]"><X className="h-3 w-3" /></button>
                )}
              </div>
              {showSuggestions && assigneeSuggestions.length > 0 && (
                <div className="absolute left-0 top-full z-40 mt-1 w-full overflow-hidden rounded-xl border border-[#DADCE0] bg-white shadow-lg max-h-32 overflow-y-auto">
                  {assigneeSuggestions.map((u) => (
                    <button key={u.id} type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[#F8F9FA]"
                      onClick={() => { setShareFilters((f) => ({ ...f, assigneeName: u.full_name || u.email })); setShowSuggestions(false); }}>
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] text-[9px] font-bold text-[#6C3FF5]">
                        {(u.full_name || u.email).slice(0, 2).toUpperCase()}
                      </div>
                      <span className="truncate">{u.full_name || u.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" onClick={() => setShareFilters(EMPTY_FILTERS)} className="text-xs font-semibold text-[#5F6368] hover:text-[#202124]">Reset filters</button>
          </div>
          {/* Right — integrations */}
          <div className="flex-1 overflow-y-auto p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5F6368] mb-3">Share to your connected integrations</p>
            {connectedKeys === null ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-[#9AA0A6]" /></div>
            ) : visibleIntegrations.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <span className="material-symbols-outlined text-[40px] text-[#DADCE0]">link_off</span>
                <p className="text-sm font-semibold text-[#202124]">No integrations connected</p>
                <p className="text-xs text-[#5F6368]">Connect Slack, Jira, Gmail or Notion to share.</p>
                <Link href="/dashboard/integrations" onClick={onClose}
                  className="mt-1 rounded-lg bg-[#6C3FF5] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5B2FE0]">
                  Manage Integrations
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {visibleIntegrations.map((intg) => (
                  <div key={intg.key}>
                    <button type="button" onClick={() => void handle(intg.key)}
                      disabled={sharing !== null || done.includes(intg.key) || previewCount === 0}
                      className="w-full flex items-center gap-4 rounded-xl border border-[#DADCE0] p-4 text-left hover:border-[#6C3FF5]/30 hover:bg-[#F8F9FA] transition-all disabled:opacity-50 group">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: intg.bg }}>
                        <span className="material-symbols-outlined text-[20px]" style={{ color: intg.color }}>{intg.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#202124]">{intg.label}</p>
                        <p className="text-xs text-[#5F6368]">{intg.desc}</p>
                      </div>
                      <div className="shrink-0">
                        {sharing === intg.key ? <Loader2 className="h-4 w-4 animate-spin text-[#6C3FF5]" />
                          : done.includes(intg.key) ? <span className="material-symbols-outlined text-[#34A853] text-[20px]">check_circle</span>
                          : errors[intg.key] ? <span className="material-symbols-outlined text-[#EA4335] text-[20px]">error</span>
                          : <span className="material-symbols-outlined text-[#DADCE0] group-hover:text-[#6C3FF5] text-[20px] transition-colors">chevron_right</span>}
                      </div>
                    </button>
                    {errors[intg.key] && (
                      <p className="mt-1 px-2 text-xs text-[#EA4335]">{errors[intg.key]}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#DADCE0] bg-[#F8F9FA] shrink-0">
          <span className="text-xs text-[#5F6368]">
            <span className="font-bold text-[#202124]">{previewCount}</span> item{previewCount !== 1 ? "s" : ""} will be shared
          </span>
          <button type="button" onClick={onClose} className="rounded-lg border border-[#DADCE0] px-4 py-2 text-sm font-semibold text-[#5F6368] hover:bg-white">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Row context menu (3-dot) ─────────────────────────────────────────────────
function RowMenu({
  row, canDelete, onDelete,
}: {
  row: ActionItemRow;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!canDelete) return null;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="rounded-lg p-1.5 text-[#9AA0A6] hover:bg-[#F1F3F4] hover:text-[#5F6368] transition-colors">
        <span className="material-symbols-outlined text-[18px]">more_vert</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-36 overflow-hidden rounded-xl border border-[#DADCE0] bg-white shadow-lg">
          <button type="button" onClick={() => { setOpen(false); onDelete(); }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-[#FCE8E6] text-red-600">
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Edit item modal ──────────────────────────────────────────────────────────
function EditItemModal({
  item, onClose, onSave, apiFetch, activeWorkspaceId,
}: {
  item: ActionItemRow;
  onClose: () => void;
  onSave: (id: string, assigneeId: string | null, dueDate: string) => Promise<void>;
  apiFetch: (path: string, init?: RequestInit & { workspaceId?: string | null }) => Promise<Response>;
  activeWorkspaceId: string | null;
}) {
  const [assigneeId, setAssigneeId] = useState<string | null>(item.assignee_id);
  const [assigneeName, setAssigneeName] = useState(item.assignee_name || item.assignee || "");
  const [dueDate, setDueDate] = useState(item.due_date === "Not specified" || item.due_date === "ASAP" ? "" : item.due_date);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState(item.assignee_name || item.assignee || "");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; full_name: string | null; email: string }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSearchChange(q: string) {
    setSearchQuery(q);
    setAssigneeName(q);
    if (!q.trim()) { setSearchResults([]); setShowDropdown(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await apiFetch(`/api/users/search?q=${encodeURIComponent(q)}`, { workspaceId: activeWorkspaceId });
        const data = await res.json() as { users?: Array<{ id: string; full_name: string | null; email: string }> };
        setSearchResults(data.users ?? []);
        setShowDropdown(true);
      } catch { setSearchResults([]); }
      finally { setIsSearching(false); }
    }, 300);
  }

  function selectUser(u: { id: string; full_name: string | null; email: string }) {
    setAssigneeId(u.id);
    setAssigneeName(u.full_name || u.email);
    setSearchQuery(u.full_name || u.email);
    setShowDropdown(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(item.id, assigneeId, dueDate || "Not specified");
      onClose();
    } catch { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#DADCE0]">
          <p className="text-sm font-bold text-[#202124]">Edit Action Item</p>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-[#F1F3F4]"><X className="h-4 w-4 text-[#5F6368]" /></button>
        </div>
        <div className="p-6 space-y-4">
          {/* Task preview */}
          <div className="rounded-xl bg-[#F8F9FA] border border-[#DADCE0] px-4 py-3">
            <p className="text-sm font-medium text-[#202124] line-clamp-2">{item.task}</p>
            <p className="text-xs text-[#9AA0A6] mt-1">{item.priority} priority · {item.source}</p>
          </div>
          {/* Assignee */}
          <div>
            <label className="block text-xs font-semibold text-[#5F6368] mb-1.5">Assignee</label>
            <div ref={searchRef} className="relative">
              <div className="flex items-center gap-2 rounded-lg border border-[#DADCE0] px-3 py-2">
                {assigneeId && (
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] text-[10px] font-bold text-[#6C3FF5]">
                    {assigneeName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <input value={searchQuery} onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
                  placeholder="Search users…"
                  className="flex-1 bg-transparent text-sm focus:outline-none" />
                {isSearching && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#9AA0A6]" />}
                {assigneeId && (
                  <button type="button" onClick={() => { setAssigneeId(null); setAssigneeName(""); setSearchQuery(""); }}
                    className="text-[#9AA0A6] hover:text-[#5F6368]"><X className="h-3.5 w-3.5" /></button>
                )}
              </div>
              {showDropdown && searchResults.length > 0 && (
                <div className="absolute left-0 top-full z-20 mt-1 w-full overflow-hidden rounded-xl border border-[#DADCE0] bg-white shadow-lg max-h-48 overflow-y-auto">
                  {searchResults.map((u) => (
                    <button key={u.id} type="button" onClick={() => selectUser(u)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[#F8F9FA]">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] text-[11px] font-bold text-[#6C3FF5]">
                        {(u.full_name || u.email).slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-[#202124]">{u.full_name || u.email}</p>
                        {u.full_name && <p className="truncate text-xs text-[#9AA0A6]">{u.email}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* Due Date */}
          <div>
            <label className="block text-xs font-semibold text-[#5F6368] mb-1.5">Due Date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-[#DADCE0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6C3FF5]/30" />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#DADCE0] bg-[#F8F9FA]">
          <button type="button" onClick={onClose} className="rounded-lg border border-[#DADCE0] px-4 py-2 text-sm font-semibold text-[#5F6368] hover:bg-white">Cancel</button>
          <button type="button" onClick={() => void handleSave()} disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[#6C3FF5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5B2FE0] disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">check</span>}
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionItemsContent() {
  const { isLoaded, isSignedIn } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspaceContext();
  const apiFetch = useApiFetch();

  const [items, setItems] = useState<ActionItemRow[]>([]);
  const [role, setRole] = useState<WorkspaceRole>("personal");
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [activeTab, setActiveTab] = useState<ActionItemTab>("all");
  const [memberFilter, setMemberFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingDueDate, setEditingDueDate] = useState<string | null>(null);
  const [shareModal, setShareModal] = useState(false);
  const [newTaskModal, setNewTaskModal] = useState(false);
  const [showMemberFilter, setShowMemberFilter] = useState(false);
  const [currentDbUserId, setCurrentDbUserId] = useState<string | null>(null);
  const [currentDbUserName, setCurrentDbUserName] = useState<string | null>(null);
  // Bulk action modals
  const [bulkStatusModal, setBulkStatusModal] = useState(false);
  const [bulkPriorityModal, setBulkPriorityModal] = useState(false);
  const [bulkShareModal, setBulkShareModal] = useState(false);
  // Single delete (from 3-dot menu)
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  // Filter panel
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  // Export modal
  const [showExportModal, setShowExportModal] = useState(false);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const memberFilterRef = useRef<HTMLDivElement>(null);

  const isAdmin = role === "admin";
  const isViewer = role === "viewer";
  const isPersonal = role === "personal";
  const canDelete = isAdmin || isPersonal;
  const canCreate = !isViewer;

  function showToast(msg: string, type: "success" | "error") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  // Fetch DB user ID from profile
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    void apiFetch("/api/profile/me")
      .then((r) => r.json())
      .then((data: { id?: string; user?: { id?: string; fullName?: string; full_name?: string } }) => {
        const id = data.id ?? data.user?.id ?? null;
        const name = data.user?.fullName ?? data.user?.full_name ?? null;
        setCurrentDbUserId(id ?? null);
        setCurrentDbUserName(name);
      })
      .catch(() => { setCurrentDbUserId(null); setCurrentDbUserName(null); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  // Close member filter dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (memberFilterRef.current && !memberFilterRef.current.contains(e.target as Node)) setShowMemberFilter(false);
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) setShowFilterPanel(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Load workspace members for admin filter + new task assignee
  useEffect(() => {
    if (!activeWorkspaceId || !isAdmin) { setMembers([]); return; }
    void apiFetch(`/api/workspaces/${activeWorkspaceId}`)
      .then((r) => r.json())
      .then((data: { members?: Array<{ user_id: string; full_name?: string; email?: string }> }) => {
        setMembers((data.members ?? []).map((m) => ({ id: m.user_id, name: m.full_name ?? "", email: m.email ?? "" })));
      })
      .catch(() => setMembers([]));
  }, [activeWorkspaceId, isAdmin]);

  async function loadItems(tab = activeTab, mid = memberFilter) {
    if (!isLoaded || !isSignedIn) { setIsLoading(false); return; }
    setIsLoading(true); setLoadError(null); setUpgradeRequired(false);
    try {
      const targetUser = (activeWorkspaceId && isAdmin && mid !== "all") ? mid : "me";
      // Fetch ALL items — client handles filtering, pagination, and stats
      const params = new URLSearchParams({ tab, page: "1", limit: "1000" });
      const res = await apiFetch(`/api/action-items/by-user/${targetUser}?${params}`, {
        cache: "no-store",
        workspaceId: activeWorkspaceId,
      });
      const payload = await res.json() as {
        success?: boolean; items: ActionItemRow[];
        pagination: { total: number; page: number; limit: number; totalPages: number };
        message?: string; error?: string;
      };
      if (!res.ok) {
        if (payload.error === "upgrade_required") { setUpgradeRequired(true); return; }
        throw new Error(payload.message || "Failed to load action items.");
      }
      setItems(payload.items ?? []);
      if (!activeWorkspaceId) setRole("personal");
      else if (activeWorkspace?.role) setRole(activeWorkspace.role as WorkspaceRole);
      setCurrentPage(1);
      setSelected(new Set());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load action items.");
    } finally { setIsLoading(false); }
  }

  useEffect(() => {
    void loadItems();
    setMemberFilter("all"); setActiveTab("all"); setCurrentPage(1);
    setFilters(EMPTY_FILTERS);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId, isLoaded, isSignedIn]);

  useEffect(() => {
    void loadItems();
    setCurrentPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, memberFilter]);

  function toggleSelect(id: string) {
    if (isViewer) return;
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  function toggleAll() {
    if (isViewer) return;
    const pageIds = displayItems.map((i) => i.id);
    const allPageSelected = pageIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  async function handleStatusUpdate(id: string, status: string) {
    if (isViewer) return;
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, status } : item));
    try {
      const res = await apiFetch(`/api/action-items/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (res.ok) {
        const updated = await res.json() as ActionItemRow;
        setItems((prev) => prev.map((item) => item.id === id ? { ...item, ...updated } : item));
      } else { void loadItems(); }
    }
    catch { void loadItems(); }
  }

  async function handlePriorityUpdate(id: string, priority: string) {
    if (isViewer) return;
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, priority } : item));
    try {
      const res = await apiFetch(`/api/action-items/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ priority }) });
      if (res.ok) {
        const updated = await res.json() as ActionItemRow;
        setItems((prev) => prev.map((item) => item.id === id ? { ...item, ...updated } : item));
      } else { void loadItems(); }
    }
    catch { void loadItems(); }
  }

  async function handleDueDateUpdate(id: string, dueDate: string) {
    if (isViewer) return;
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, due_date: dueDate } : item));
    setEditingDueDate(null);
    try { await apiFetch(`/api/action-items/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dueDate }) }); }
    catch { void loadItems(); }
  }

  async function handleAssigneeUpdate(id: string, assigneeId: string | null, assigneeName: string | null = null) {
    // Optimistic update immediately
    setItems((prev) => prev.map((item) =>
      item.id === id
        ? {
            ...item,
            assignee_id: assigneeId,
            assignee_name: assigneeName,
            assignee: assigneeId === null ? "Unassigned" : (assigneeName ?? item.assignee),
          }
        : item
    ));
    try {
      const res = await apiFetch(`/api/action-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId, assignee: assigneeId === null ? "Unassigned" : (assigneeName ?? undefined) }),
      });
      if (!res.ok) {
        void loadItems();
        showToast("Failed to update assignee.", "error");
      } else {
        // Update just this item from the response — no page reset
        const updated = await res.json() as ActionItemRow;
        setItems((prev) => prev.map((item) => item.id === id ? { ...item, ...updated } : item));
      }
    } catch {
      void loadItems();
      showToast("Failed to update assignee.", "error");
    }
  }

  async function handleEditSave(id: string, assigneeId: string | null, dueDate: string) {
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, assignee_id: assigneeId, due_date: dueDate } : item));
    try {
      const res = await apiFetch(`/api/action-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId, dueDate }),
      });
      if (!res.ok) { void loadItems(); showToast("Failed to save changes.", "error"); }
      else showToast("Changes saved.", "success");
    } catch { void loadItems(); showToast("Failed to save changes.", "error"); }
  }

  async function handleDeleteSingle(id: string) {
    try {
      const res = await apiFetch(`/api/action-items/${id}`, { method: "DELETE" });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        showToast("Item deleted.", "success");
      } else {
        showToast("Failed to delete item.", "error");
      }
    } catch { showToast("Failed to delete item.", "error"); }
    setDeletingItemId(null);
  }

  async function handleDeleteSelected() {
    if (!canDelete) return;
    setIsDeleting(true);
    const ids = Array.from(selected);
    let failed = 0;
    await Promise.all(ids.map(async (id) => {
      try { const res = await apiFetch(`/api/action-items/${id}`, { method: "DELETE" }); if (!res.ok) failed++; }
      catch { failed++; }
    }));
    setIsDeleting(false); setDeleteModal(false);
    showToast(failed === 0 ? `${ids.length} item${ids.length !== 1 ? "s" : ""} deleted.` : `${ids.length - failed} deleted, ${failed} failed.`, failed === 0 ? "success" : "error");
    void loadItems();
  }

  async function handleBulkStatus(status: string) {
    const ids = Array.from(selected);
    setBulkStatusModal(false);
    // Optimistic update
    setItems((prev) => prev.map((item) => selected.has(item.id) ? { ...item, status } : item));
    let failed = 0;
    await Promise.all(ids.map(async (id) => {
      try {
        const res = await apiFetch(`/api/action-items/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
        if (!res.ok) failed++;
      } catch { failed++; }
    }));
    showToast(failed === 0 ? `Status updated for ${ids.length} items.` : `${ids.length - failed} updated, ${failed} failed.`, failed === 0 ? "success" : "error");
    if (failed > 0) void loadItems();
  }

  async function handleBulkPriority(priority: string) {
    const ids = Array.from(selected);
    setBulkPriorityModal(false);
    // Optimistic update
    setItems((prev) => prev.map((item) => selected.has(item.id) ? { ...item, priority } : item));
    let failed = 0;
    await Promise.all(ids.map(async (id) => {
      try {
        const res = await apiFetch(`/api/action-items/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ priority }) });
        if (!res.ok) failed++;
      } catch { failed++; }
    }));
    showToast(failed === 0 ? `Priority updated for ${ids.length} items.` : `${ids.length - failed} updated, ${failed} failed.`, failed === 0 ? "success" : "error");
    if (failed > 0) void loadItems();
  }

  async function handleCreateTask(data: { task: string; assignee: string; dueDate: string; priority: string; assigneeId: string | null }) {
    const res = await apiFetch("/api/action-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: data.task,
        assignee: data.assignee,
        dueDate: data.dueDate,
        priority: data.priority,
        assigneeId: data.assigneeId,
        workspaceId: activeWorkspaceId ?? null,
        source: "manual",
      }),
    });
    if (!res.ok) throw new Error("Failed to create task");
    showToast("Task created.", "success");
    void loadItems();
  }

  function exportToCSV() {
    setShowExportModal(true);
  }

  async function shareToIntegration(target: string) {
    const selectedItems = items.filter((i) => selected.has(i.id));
    const res = await fetch("/api/meetings/share-integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targets: [target],
        title: "Action Items",
        summary: `${selectedItems.length} action item${selectedItems.length !== 1 ? "s" : ""} from Artivaa`,
        actionItems: selectedItems.map((i) => ({ task: i.task, assignee: i.assignee, dueDate: i.due_date, priority: i.priority })),
        transcript: null,
      }),
    });
    const data = await res.json() as { results?: Record<string, { success: boolean; message: string }> };
    const result = data.results?.[target === "gmail" ? "gmail" : target];
    showToast(result?.success ? `Shared to ${target}!` : `Failed: ${result?.message ?? "Unknown error"}`, result?.success ? "success" : "error");
  }

  // Stats always from ALL items (no filter applied)
  const completedCount = items.filter((i) => i.status === "done").length;
  const completionRate = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;

  const activeFilterCount = [
    filters.priorities.length > 0,
    filters.statuses.length > 0,
    !!filters.dueDateFrom,
    !!filters.dueDateTo,
    !!filters.assigneeName.trim(),
  ].filter(Boolean).length;

  // Client-side filtering on ALL items
  const filteredItems = items.filter((i) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!i.task.toLowerCase().includes(q) && !i.assignee.toLowerCase().includes(q) &&
          !(i.assignee_name ?? "").toLowerCase().includes(q)) return false;
    }
    if (filters.priorities.length > 0 && !filters.priorities.includes(i.priority)) return false;
    if (filters.statuses.length > 0 && !filters.statuses.includes(i.status)) return false;
    if (filters.dueDateFrom) {
      const d = new Date(i.due_date);
      if (!isNaN(d.getTime()) && d < new Date(filters.dueDateFrom)) return false;
    }
    if (filters.dueDateTo) {
      const d = new Date(i.due_date);
      if (!isNaN(d.getTime()) && d > new Date(filters.dueDateTo)) return false;
    }
    if (filters.assigneeName.trim()) {
      const q = filters.assigneeName.toLowerCase();
      if (!(i.assignee_name || i.assignee || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Client-side pagination on filtered results
  const totalFiltered = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const displayItems = filteredItems.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  // 3 tabs only
  const TABS: { id: ActionItemTab; label: string }[] = [
    { id: "all",            label: "All" },
    { id: "assigned_to_me", label: "Assigned to Me" },
    { id: "created_by_me",  label: "Created by Me" },
  ];

  // Mode label
  const modeLabel = isPersonal
    ? "Personal Mode"
    : activeWorkspace?.name ?? "Workspace";

  const emptyState = activeTab === "assigned_to_me"
    ? { title: "No items assigned to you", description: "Items assigned to you will appear here", icon: ListChecks }
    : activeTab === "created_by_me"
    ? { title: "No items created by you", description: "Items you created will appear here", icon: ListChecks }
    : { title: "No action items yet", description: "Record a meeting to automatically extract tasks", icon: CheckSquare };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs text-[#9AA0A6]">Workspaces</span>
            <span className="text-xs text-[#9AA0A6]">›</span>
            <span className="text-xs text-[#9AA0A6]">{modeLabel}</span>
            <span className="text-xs text-[#9AA0A6]">›</span>
            <span className="text-xs font-semibold text-[#5F6368]">Task Backlog</span>
          </div>
          <h1 className="text-[22px] font-bold text-[#202124]" style={{ fontFamily: "'Work Sans', sans-serif" }}>
            Task Backlog
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {!isViewer && (
            <button type="button" onClick={() => setBulkShareModal(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-[#DADCE0] bg-white px-4 py-2 text-sm font-medium text-[#5F6368] hover:bg-[#F8F9FA] transition-colors">
              <span className="material-symbols-outlined text-[16px]">share</span>
              Share
            </button>
          )}
          <button type="button" onClick={exportToCSV}
            className="inline-flex items-center gap-2 rounded-lg border border-[#DADCE0] bg-white px-4 py-2 text-sm font-medium text-[#5F6368] hover:bg-[#F8F9FA] transition-colors">
            <Download className="h-4 w-4" />
            Export to CSV
          </button>
          {canCreate && (
            <button type="button" onClick={() => setNewTaskModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#6C3FF5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5B2FE0] transition-colors shadow-sm">
              <Plus className="h-4 w-4" />
              Create Task
            </button>
          )}
        </div>
      </div>

      {/* Tabs + search + filter row */}
      <div className="flex items-center justify-between gap-4 border-b border-[#DADCE0]">
        <div className="flex items-center gap-0">
          {TABS.map((tab) => (
            <button key={tab.id} type="button"
              onClick={() => { setActiveTab(tab.id); setCurrentPage(1); }}
              className={cn(
                "px-4 pb-3 text-sm font-medium transition-colors border-b-2 -mb-px",
                activeTab === tab.id
                  ? "border-[#6C3FF5] text-[#6C3FF5] font-semibold"
                  : "border-transparent text-[#5F6368] hover:text-[#202124]"
              )}>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 pb-2">
          {/* Search */}
          <div className="flex items-center gap-2 rounded-lg border border-[#DADCE0] bg-white px-3 py-1.5 w-48">
            <span className="material-symbols-outlined text-[#9AA0A6] text-[16px]">search</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="w-full bg-transparent text-sm text-[#202124] outline-none placeholder:text-[#9AA0A6]" />
          </div>
          {/* Filter button */}
          <div ref={filterPanelRef} className="relative">
            <button type="button" onClick={() => setShowFilterPanel((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                activeFilterCount > 0
                  ? "border-[#6C3FF5] bg-[#EDE9FE] text-[#6C3FF5]"
                  : "border-[#DADCE0] bg-white text-[#5F6368] hover:bg-[#F8F9FA]"
              )}>
              <span className="material-symbols-outlined text-[16px]">filter_list</span>
              Filter
              {activeFilterCount > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#6C3FF5] text-[9px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {showFilterPanel && (
              <FilterPanel
                filters={filters}
                onChange={(f) => { setFilters(f); }}
                onClose={() => setShowFilterPanel(false)}
                apiFetch={apiFetch}
                activeWorkspaceId={activeWorkspaceId}
              />
            )}
          </div>
          {/* Member filter — admin only */}
          {isAdmin && members.length > 0 && (
            <div ref={memberFilterRef} className="relative">
              <button type="button" onClick={() => setShowMemberFilter((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                  memberFilter !== "all"
                    ? "border-[#6C3FF5] bg-[#EDE9FE] text-[#6C3FF5]"
                    : "border-[#DADCE0] bg-white text-[#5F6368] hover:bg-[#F8F9FA]"
                )}>
                <span className="material-symbols-outlined text-[16px]">person_search</span>
                {memberFilter === "all" ? "Filter by Member" : (members.find((m) => m.id === memberFilter)?.name || "Member")}
              </button>
              {showMemberFilter && (
                <div className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-xl border border-[#DADCE0] bg-white shadow-lg">
                  <button type="button" onClick={() => { setMemberFilter("all"); setShowMemberFilter(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[#F8F9FA] font-semibold text-[#5F6368]">
                    All Members
                  </button>
                  {members.map((m) => (
                    <button key={m.id} type="button" onClick={() => { setMemberFilter(m.id); setShowMemberFilter(false); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[#F8F9FA]">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] text-[9px] font-bold text-[#6C3FF5]">
                        {(m.name || m.email).slice(0, 2).toUpperCase()}
                      </div>
                      <span className="truncate">{m.name || m.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-[#6C3FF5] px-5 py-3 text-white">
          <span className="text-sm font-semibold shrink-0">{selected.size} selected</span>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => setBulkStatusModal(true)}
              className="flex items-center gap-1.5 rounded-lg border border-white/30 px-3 py-1.5 text-xs font-semibold hover:bg-white/20 transition-colors">
              <span className="material-symbols-outlined text-[14px]">update</span>Status
            </button>
            <button type="button" onClick={() => setBulkPriorityModal(true)}
              className="flex items-center gap-1.5 rounded-lg border border-white/30 px-3 py-1.5 text-xs font-semibold hover:bg-white/20 transition-colors">
              <span className="material-symbols-outlined text-[14px]">priority_high</span>Priority
            </button>
            {canDelete && (
              <button type="button" onClick={() => setDeleteModal(true)}
                className="flex items-center gap-1.5 rounded-lg border border-white/30 px-3 py-1.5 text-xs font-semibold hover:bg-red-500/80 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />Delete
              </button>
            )}
          </div>
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto shrink-0"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={cn("fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold shadow-lg",
          toast.type === "success" ? "border-[#E6F4EA] bg-[#E6F4EA] text-[#137333]" : "border-[#FCE8E6] bg-[#FCE8E6] text-[#C5221F]")}>
          {toast.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <SkeletonList count={5} />
      ) : upgradeRequired ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-600">Locked Feature</p>
          <h2 className="text-lg font-bold text-[#202124]">Action items require Pro or Elite</h2>
          <p className="text-sm text-amber-700">Upgrade to view and manage action items extracted from meetings.</p>
          <Button asChild><Link href="/dashboard/billing">Upgrade now <ArrowRight className="h-4 w-4" /></Link></Button>
        </div>
      ) : loadError ? (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-[#FCE8E6] bg-[#FCE8E6] px-5 py-4">
          <p className="text-sm text-[#C5221F]">{loadError}</p>
          <button type="button" onClick={() => void loadItems()}
            className="rounded-lg border border-[#EA4335] bg-white px-4 py-2 text-sm font-semibold text-[#C5221F] hover:bg-[#FCE8E6]">Retry</button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={emptyState.icon} title={emptyState.title} description={emptyState.description} />
      ) : (
        <>
          {/* Stats cards — 4 cards Jira-style */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Issues */}
            <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#5F6368]">Total Issues</span>
                <span className="material-symbols-outlined text-[#6C3FF5] text-[18px]">list_alt</span>
              </div>
              <p className="text-3xl font-bold text-[#202124]">{items.length}</p>
              <div className="flex items-center gap-1 mt-2">
                <span className="text-[11px] font-semibold text-[#34A853]">
                  +{completionRate}%
                </span>
                <span className="text-[10px] text-[#9AA0A6]">completion rate</span>
              </div>
            </div>
            {/* High Priority */}
            <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#5F6368]">High Priority</span>
                <span className="material-symbols-outlined text-[#EA4335] text-[18px]">priority_high</span>
              </div>
              <p className="text-3xl font-bold text-[#EA4335]">{items.filter((i) => i.priority === "High").length}</p>
              <div className="flex gap-2 mt-2">
                <span className="rounded px-2 py-0.5 text-[10px] font-bold bg-[#FCE8E6] text-[#C5221F]">NEED ATTENTION</span>
              </div>
            </div>
            {/* In Progress */}
            <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#5F6368]">In Progress</span>
                <span className="material-symbols-outlined text-[#1A73E8] text-[18px]">pending</span>
              </div>
              <p className="text-3xl font-bold text-[#1A73E8]">{items.filter((i) => i.status === "in_progress").length}</p>
              <div className="mt-3 h-2 w-full rounded-full bg-[#F1F3F4] overflow-hidden">
                <div className="h-full rounded-full bg-[#1A73E8] transition-all"
                  style={{ width: items.length > 0 ? `${Math.round((items.filter((i) => i.status === "in_progress").length / items.length) * 100)}%` : "0%" }} />
              </div>
              <p className="text-[10px] text-[#9AA0A6] mt-1">
                {items.length > 0 ? Math.round((items.filter((i) => i.status === "in_progress").length / items.length) * 100) : 0}% of total
              </p>
            </div>
            {/* Completed */}
            <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#5F6368]">Completed</span>
                <span className="material-symbols-outlined text-[#34A853] text-[18px]">check_circle</span>
              </div>
              <p className="text-3xl font-bold text-[#34A853]">{completionRate}%</p>
              <div className="mt-3 h-2 w-full rounded-full bg-[#F1F3F4] overflow-hidden">
                <div className="h-full rounded-full bg-[#34A853] transition-all" style={{ width: `${completionRate}%` }} />
              </div>
              <p className="text-[10px] text-[#9AA0A6] mt-1">{completedCount} of {items.length} items done</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-[#DADCE0] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            {/* Table header */}
            <div className="grid grid-cols-[40px_100px_minmax(0,2fr)_160px_100px_120px_110px_48px] border-b border-[#DADCE0] bg-[#F8F9FA]">
              <div className="flex items-center px-4 py-3">
                {!isViewer && (
                  <input type="checkbox"
                    checked={displayItems.length > 0 && displayItems.every((i) => selected.has(i.id))}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-[#DADCE0] accent-[#6C3FF5]" />
                )}
              </div>
              {["KEY", "SUMMARY", "ASSIGNEE", "PRIORITY", "STATUS", "DUE DATE", ""].map((col) => (
                <div key={col} className="px-3 py-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#5F6368]">{col}</span>
                </div>
              ))}
            </div>

            {/* Rows */}
            <div className="divide-y divide-[#F1F3F4]">
              {displayItems.map((row, index) => (
                <div key={row.id}
                  className={cn(
                    "grid grid-cols-[40px_100px_minmax(0,2fr)_160px_100px_120px_110px_48px] items-center transition-colors hover:bg-[#F8F9FA]",
                    selected.has(row.id) && "bg-[#EDE9FE]/30"
                  )}>
                  {/* Checkbox */}
                  <div className="flex items-center px-4 py-3">
                    {!isViewer && (
                      <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)}
                        className="h-4 w-4 rounded border-[#DADCE0] accent-[#6C3FF5]" />
                    )}
                  </div>

                  {/* KEY cell */}
                  <div className="px-3 py-3">
                    <span className="text-xs font-mono font-semibold text-[#6C3FF5]">
                      ART-{String(100 + index + (safePage - 1) * ITEMS_PER_PAGE + 1).padStart(3, "0")}
                    </span>
                  </div>

                  {/* SUMMARY cell */}
                  <div className="px-3 py-3 min-w-0">
                    <p className={cn("text-sm font-medium text-[#202124] line-clamp-2", row.status === "done" && "line-through text-[#9AA0A6]")}>
                      {row.task}
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      {row.meeting_id ? (
                        <Link href={`/dashboard/meetings/${row.meeting_id}` as Route} className="flex items-center gap-1 text-[11px] text-[#6C3FF5] hover:underline">
                          <span className="material-symbols-outlined text-[12px]">link</span>
                          <span className="truncate max-w-[120px]">{row.meeting_title ?? "Meeting Item"}</span>
                        </Link>
                      ) : (
                        <span className="text-[11px] text-[#9AA0A6]">Direct Entry</span>
                      )}
                    </div>
                  </div>

                  {/* ASSIGNEE cell — clickable for personal mode and workspace admin/reporter */}
                  <div className="px-3 py-3">
                    <AssigneeCell
                      item={row}
                      currentUserId={currentDbUserId}
                      currentUserName={currentDbUserName}
                      role={role}
                      activeWorkspaceId={activeWorkspaceId}
                      onUpdate={handleAssigneeUpdate}
                    />
                  </div>

                  {/* PRIORITY cell */}
                  <div className="px-3 py-3">
                    {!isViewer
                      ? <PriorityDropdown itemId={row.id} current={row.priority || "Medium"} onUpdate={handlePriorityUpdate} />
                      : (
                        <div className="flex items-center gap-1.5">
                          {row.priority === "High" && <span className="text-red-500 text-sm font-bold">↑</span>}
                          {row.priority === "Medium" && <span className="text-orange-500 text-sm font-bold">↑</span>}
                          {row.priority === "Low" && <span className="text-blue-500 text-sm font-bold">↓</span>}
                          <span className={cn("text-xs font-semibold uppercase",
                            row.priority === "High" ? "text-red-600" :
                            row.priority === "Medium" ? "text-orange-600" : "text-blue-600")}>
                            {row.priority}
                          </span>
                        </div>
                      )
                    }
                  </div>

                  {/* STATUS cell */}
                  <div className="px-3 py-3">
                    {!isViewer
                      ? <StatusDropdown itemId={row.id} current={row.status || "pending"} onUpdate={handleStatusUpdate} />
                      : <span className="inline-flex items-center rounded px-2 py-1 text-[11px] font-bold uppercase tracking-wider"
                          style={{ background: getStatusStyle(row.status).bg, color: getStatusStyle(row.status).color }}>
                          {getStatusStyle(row.status).label}
                        </span>
                    }
                  </div>

                  {/* DUE DATE cell — click to edit inline */}
                  <div className="px-3 py-3">
                    {!isViewer && editingDueDate === row.id ? (
                      <input autoFocus type="date"
                        defaultValue={row.due_date && !["Not specified", "ASAP", "Tomorrow", "Today", "After the call", "Tomorrow evening"].includes(row.due_date) ? row.due_date : ""}
                        onBlur={(e) => void handleDueDateUpdate(row.id, e.target.value || "Not specified")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleDueDateUpdate(row.id, e.currentTarget.value || "Not specified");
                          if (e.key === "Escape") setEditingDueDate(null);
                        }}
                        className="w-full rounded border border-[#6C3FF5]/40 px-1.5 py-1 text-xs focus:outline-none" />
                    ) : (
                      <button type="button" onClick={() => { if (!isViewer) setEditingDueDate(row.id); }}
                        className={cn("text-xs text-left w-full",
                          row.due_date && row.due_date !== "Not specified" && new Date(row.due_date) < new Date() && row.status !== "done"
                            ? "font-semibold text-[#C5221F]"
                            : "text-[#5F6368]",
                          !isViewer && "hover:text-[#6C3FF5] cursor-pointer"
                        )}>
                        {formatDate(row.due_date)}
                      </button>
                    )}
                  </div>

                  {/* 3-dot menu — Delete only */}
                  <div className="flex items-center justify-center px-1 py-3">
                    <RowMenu
                      row={row}
                      canDelete={canDelete}
                      onDelete={() => setDeletingItemId(row.id)}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-[#DADCE0] bg-[#F8F9FA] px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-[#5F6368]">Showing {totalFiltered === 0 ? 0 : (safePage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(safePage * ITEMS_PER_PAGE, totalFiltered)} of {totalFiltered} items</span>
              <Pagination currentPage={safePage} totalPages={totalPages} totalItems={totalFiltered}
                pageSize={ITEMS_PER_PAGE} itemLabel="items" onPageChange={setCurrentPage} />
            </div>
          </div>

        </>
      )}

      {/* FAB — hidden for viewers */}
      {canCreate && (
        <div className="fixed bottom-8 right-8 z-50">
          <button type="button" onClick={() => setNewTaskModal(true)}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-[#6C3FF5] text-white shadow-xl hover:bg-[#5B2FE0] hover:scale-105 active:scale-95 transition-all">
            <Plus className="h-6 w-6" />
          </button>
        </div>
      )}

      {deleteModal && (
        <DeleteModal count={selected.size} onConfirm={() => void handleDeleteSelected()}
          onCancel={() => setDeleteModal(false)} isDeleting={isDeleting} />
      )}
      {/* Single item delete confirm */}
      {deletingItemId && (
        <DeleteModal count={1} onConfirm={() => void handleDeleteSingle(deletingItemId)}
          onCancel={() => setDeletingItemId(null)} isDeleting={false} />
      )}
      {newTaskModal && (
        <NewTaskModal onClose={() => setNewTaskModal(false)} onSave={handleCreateTask} isAdmin={isAdmin} members={members} apiFetch={apiFetch} activeWorkspaceId={activeWorkspaceId} />
      )}
      {bulkStatusModal && (
        <BulkStatusModal count={selected.size} onConfirm={(s) => void handleBulkStatus(s)} onClose={() => setBulkStatusModal(false)} />
      )}
      {bulkPriorityModal && (
        <BulkPriorityModal count={selected.size} onConfirm={(p) => void handleBulkPriority(p)} onClose={() => setBulkPriorityModal(false)} />
      )}
      {bulkShareModal && (
        <BulkShareModal items={items} currentDbUserId={currentDbUserId} apiFetch={apiFetch} activeWorkspaceId={activeWorkspaceId} onClose={() => setBulkShareModal(false)} />
      )}
      {showExportModal && (
        <ExportModal items={items} currentDbUserId={currentDbUserId} apiFetch={apiFetch} activeWorkspaceId={activeWorkspaceId} onClose={() => setShowExportModal(false)} />
      )}
    </div>
  );
}
