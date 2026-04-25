"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import type { Route } from "next";
import Link from "next/link";
import {
  AlertTriangle, ArrowRight, CheckCircle2, CheckSquare,
  Download, ListChecks, Loader2, Pencil, Trash2, X,
} from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SkeletonList } from "@/components/SkeletonCard";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { useApiFetch } from "@/hooks/useApiFetch";
import { useWorkspaceContext } from "@/contexts/workspace-context";
import { cn } from "@/lib/utils";

const ITEMS_PER_PAGE = 10;

type ActionItemTab = "all" | "this_week";
type SourceFilter = "all" | "meeting" | "task-generator" | "document";
type ItemStatus = "pending" | "in_progress" | "done" | "hold";
type WorkspaceRole = "admin" | "member" | "viewer" | "personal";

type ActionItemRow = {
  id: string;
  task: string;
  owner: string;
  due_date: string;
  priority: string;
  status: string;
  source: string;
  meeting_title: string | null;
  meeting_id: string | null;
  created_at: string;
  user_id: string;
  assignee_name: string | null;
  assignee_email: string | null;
};

const STATUS_OPTIONS: { value: ItemStatus; label: string; color: string; bg: string; ring: string }[] = [
  { value: "pending",    label: "Pending",     color: "#6b7280", bg: "#f3f4f6", ring: "#d1d5db" },
  { value: "in_progress",label: "In Progress", color: "#2563eb", bg: "#eff6ff", ring: "#bfdbfe" },
  { value: "done",       label: "Done",        color: "#16a34a", bg: "#f0fdf4", ring: "#bbf7d0" },
  { value: "hold",       label: "On Hold",     color: "#ca8a04", bg: "#fefce8", ring: "#fde68a" },
];

function getStatusStyle(status: string) {
  return STATUS_OPTIONS.find((s) => s.value === status) ?? STATUS_OPTIONS[0];
}
function getPriorityClass(priority: string) {
  if (priority === "High") return "bg-red-50 text-red-600 ring-red-200";
  if (priority === "Low") return "bg-emerald-50 text-emerald-600 ring-emerald-200";
  return "bg-amber-50 text-amber-600 ring-amber-200";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getSourceLabel(source: string) {
  if (source === "meeting") return "Meeting";
  if (source === "task-generator") return "Task Gen";
  if (source === "document") return "Document";
  return source;
}

function exportToCSV(items: ActionItemRow[]) {
  const headers = ["Task", "Owner", "Due Date", "Priority", "Status", "Source", "Date"];
  const rows = items.map((item) => [item.task, item.owner, item.due_date, item.priority, item.status, item.source, new Date(item.created_at).toLocaleDateString()]);
  const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `action-items-${new Date().toISOString().split("T")[0]}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export default function ActionItemsPage() {
  return <ErrorBoundary><ActionItemsContent /></ErrorBoundary>;
}

// ── Delete confirmation modal ─────────────────────────────────────────────────

function DeleteModal({
  count,
  onConfirm,
  onCancel,
  isDeleting,
}: {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50">
            <AlertTriangle className="h-5 w-5 text-red-500" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Delete {count} action item{count !== 1 ? "s" : ""}?
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              This will permanently remove the selected item{count !== 1 ? "s" : ""} from your action items. This cannot be undone.
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {isDeleting ? "Deleting…" : `Delete ${count} item${count !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Status dropdown ───────────────────────────────────────────────────────────

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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition-opacity hover:opacity-80"
        style={{ background: style.bg, color: style.color, ringColor: style.ring } as React.CSSProperties}
      >
        {style.label}
        <span className="text-[9px]">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"
              onClick={() => { onUpdate(itemId, opt.value); setOpen(false); }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: opt.color }} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main content ──────────────────────────────────────────────────────────────

function ActionItemsContent() {
  const { isLoaded, isSignedIn } = useAuth();
  const { activeWorkspaceId } = useWorkspaceContext();
  const apiFetch = useApiFetch();
  const [items, setItems] = useState<ActionItemRow[]>([]);
  const [role, setRole] = useState<WorkspaceRole>("personal");
  const [activeTab, setActiveTab] = useState<ActionItemTab>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [memberSearch, setMemberSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: ITEMS_PER_PAGE, totalPages: 1 });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingDueDate, setEditingDueDate] = useState<string | null>(null);
  const [editingAssignee, setEditingAssignee] = useState<string | null>(null);

  const isAdmin = role === "admin";
  const isMember = role === "member";
  const isViewer = role === "viewer";
  const isWorkspace = !!activeWorkspaceId;

  function showToast(msg: string, type: "success" | "error") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function loadItems(
    tab = activeTab, page = currentPage,
    src = sourceFilter, st = statusFilter, pri = priorityFilter
  ) {
    if (!isLoaded || !isSignedIn) { setIsLoading(false); return; }
    setIsLoading(true); setLoadError(null); setUpgradeRequired(false);
    try {
      const params = new URLSearchParams({ tab, page: String(page), limit: String(ITEMS_PER_PAGE) });
      if (!isWorkspace && src !== "all") params.set("source", src);
      if (st !== "all") params.set("status", st);
      if (pri !== "all") params.set("priority", pri);
      const res = await apiFetch(`/api/action-items?${params}`, { cache: "no-store" });
      const payload = await res.json() as { success?: boolean; role?: WorkspaceRole; items: ActionItemRow[]; pagination: typeof pagination; message?: string; error?: string };
      if (!res.ok) {
        if (payload.error === "upgrade_required") { setUpgradeRequired(true); return; }
        throw new Error(payload.message || "Failed to load action items.");
      }
      setItems(payload.items ?? []);
      setRole(payload.role ?? "personal");
      setPagination(payload.pagination);
      setCurrentPage(payload.pagination.page);
      setSelected(new Set());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load action items.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
    // reset filters when switching workspace/personal
    setStatusFilter("all");
    setPriorityFilter("all");
    setSourceFilter("all");
    setActiveTab("all");
    setCurrentPage(1);
    setMemberSearch("");
  }, [activeWorkspaceId, isLoaded, isSignedIn]);

  useEffect(() => { void loadItems(); }, [activeTab, currentPage, sourceFilter, statusFilter, priorityFilter]);

  function handleTabChange(tab: ActionItemTab) { setActiveTab(tab); setCurrentPage(1); }
  function handleSourceChange(src: SourceFilter) { setSourceFilter(src); setCurrentPage(1); }

  function toggleSelect(id: string) {
    if (isViewer) return;
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  function toggleAll() {
    if (isViewer) return;
    setSelected((prev) => prev.size === items.length ? new Set() : new Set(items.map((i) => i.id)));
  }

  async function handleStatusUpdate(id: string, status: string) {
    if (isViewer) return;
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, status } : item));
    try {
      await apiFetch(`/api/action-items/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    } catch { void loadItems(); }
  }

  async function handleDueDateUpdate(id: string, dueDate: string) {
    if (isViewer) return;
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, due_date: dueDate } : item));
    setEditingDueDate(null);
    try {
      await apiFetch(`/api/action-items/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dueDate }) });
    } catch { void loadItems(); }
  }

  async function handleAssigneeUpdate(id: string, owner: string) {
    if (!isAdmin) return;
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, owner } : item));
    setEditingAssignee(null);
    try {
      await apiFetch(`/api/action-items/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner }) });
    } catch { void loadItems(); }
  }

  async function handleDeleteSelected() {
    if (!isAdmin && role !== "personal") return;
    setIsDeleting(true);
    const ids = Array.from(selected);
    let failed = 0;
    await Promise.all(ids.map(async (id) => {
      try {
        const res = await apiFetch(`/api/action-items/${id}`, { method: "DELETE" });
        if (!res.ok) failed++;
      } catch { failed++; }
    }));
    setIsDeleting(false);
    setDeleteModal(false);
    showToast(failed === 0 ? `${ids.length} item${ids.length !== 1 ? "s" : ""} deleted.` : `${ids.length - failed} deleted, ${failed} failed.`, failed === 0 ? "success" : "error");
    void loadItems();
  }

  async function handleExportSlack() {
    try {
      const res = await fetch("/api/action-items/export/slack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemIds: [...selected] }) });
      const data = await res.json() as { success: boolean; error?: string };
      showToast(data.success ? "Posted to Slack!" : `Failed: ${data.error}`, data.success ? "success" : "error");
    } catch { showToast("Failed to post to Slack.", "error"); }
  }

  async function handleExportJira() {
    try {
      const res = await fetch("/api/action-items/export/jira", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemIds: [...selected] }) });
      const data = await res.json() as { success: boolean; count?: number; error?: string };
      showToast(data.success ? `Created ${data.count} Jira tickets!` : `Failed: ${data.error}`, data.success ? "success" : "error");
    } catch { showToast("Failed to create Jira tickets.", "error"); }
  }

  const selectedItems = items.filter((i) => selected.has(i.id));
  const canDelete = isAdmin || role === "personal";
  const displayItems = memberSearch.trim()
    ? items.filter((i) => i.owner.toLowerCase().includes(memberSearch.toLowerCase()) || (i.assignee_name ?? "").toLowerCase().includes(memberSearch.toLowerCase()))
    : items;
  const emptyState = activeTab === "this_week"
    ? { title: "No items from this week", description: "Record meetings this week to see tasks here", icon: ListChecks }
    : { title: "No action items yet", description: "Record a meeting to automatically extract tasks", icon: CheckSquare };

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f5f3ff] ring-1 ring-[#ede9fe]">
            <CheckSquare className="h-5 w-5 text-[#6c63ff]" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">Action Items</h1>
            <p className="mt-0.5 text-sm text-slate-500">All tasks extracted from your meetings and tools</p>
          </div>
        </div>
        {pagination.total > 0 && (
          <div className="shrink-0 rounded-xl bg-[#f5f3ff] px-3.5 py-2 text-center">
            <p className="text-lg font-bold text-[#6c63ff]">{pagination.total}</p>
            <p className="text-[10px] font-semibold text-[#9b8fff]">total items</p>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Tab filters */}
        <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {([["all", "All"], ["this_week", "This Week"]] as [ActionItemTab, string][]).map(([id, label]) => (
            <button key={id} type="button" onClick={() => handleTabChange(id)}
              className={cn("px-4 py-2 text-xs font-semibold transition-all", activeTab === id ? "bg-[#6c63ff] text-white" : "text-slate-500 hover:bg-slate-50")}>
              {label}
            </button>
          ))}
        </div>

        {/* Source filter — personal mode only */}
        {!isWorkspace && (
          <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {([["all", "All"], ["meeting", "Meetings"], ["task-generator", "Task Gen"], ["document", "Docs"]] as [SourceFilter, string][]).map(([src, label]) => (
              <button key={src} type="button" onClick={() => handleSourceChange(src)}
                className={cn("px-4 py-2 text-xs font-semibold transition-all", sourceFilter === src ? "bg-[#6c63ff] text-white" : "text-slate-500 hover:bg-slate-50")}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Status filter */}
        <div className="relative">
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            className={cn(
              "appearance-none rounded-xl border px-4 py-2 pr-8 text-xs font-semibold shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#6c63ff]/40 cursor-pointer",
              statusFilter !== "all"
                ? "border-[#6c63ff]/40 bg-[#f5f3ff] text-[#6c63ff]"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            )}>
            <option value="all">Status</option>
            <option value="pending">⏳ Pending</option>
            <option value="in_progress">🔵 In Progress</option>
            <option value="done">✅ Done</option>
            <option value="hold">⏸ On Hold</option>
          </select>
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">▾</span>
        </div>

        {/* Priority filter */}
        <div className="relative">
          <select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); setCurrentPage(1); }}
            className={cn(
              "appearance-none rounded-xl border px-4 py-2 pr-8 text-xs font-semibold shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#6c63ff]/40 cursor-pointer",
              priorityFilter === "High"
                ? "border-red-200 bg-red-50 text-red-600"
                : priorityFilter === "Medium"
                  ? "border-amber-200 bg-amber-50 text-amber-600"
                  : priorityFilter === "Low"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            )}>
            <option value="all">Priority</option>
            <option value="High">🔴 High</option>
            <option value="Medium">🟡 Medium</option>
            <option value="Low">🟢 Low</option>
          </select>
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">▾</span>
        </div>

        {/* Active filter chips */}
        {(statusFilter !== "all" || priorityFilter !== "all") && (
          <button type="button" onClick={() => { setStatusFilter("all"); setPriorityFilter("all"); setCurrentPage(1); }}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 shadow-sm hover:bg-slate-50 transition-all">
            <X className="h-3 w-3" /> Clear filters
          </button>
        )}

        {/* Member search — admin in workspace mode only */}
        {isWorkspace && isAdmin && (
          <div className="relative">
            <input type="text" placeholder="Search member…" value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-8 text-xs text-slate-700 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#6c63ff]/40 w-40 transition-all focus:w-52"
            />
            {memberSearch && (
              <button type="button" onClick={() => setMemberSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Selection action bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#c4b5fd] bg-[#f5f3ff] px-5 py-3">
          <span className="text-sm font-semibold text-[#6c63ff]">{selected.size} selected</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => exportToCSV(selectedItems)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
            {isAdmin && (
              <>
                <button type="button" onClick={() => void handleExportSlack()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
                  Post to Slack
                </button>
                <button type="button" onClick={() => void handleExportJira()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
                  Create Jira Tickets
                </button>
                <button type="button" onClick={() => setDeleteModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </>
            )}
            {role === "personal" && (
              <button type="button" onClick={() => setDeleteModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            )}
          </div>
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-slate-400 hover:text-slate-600 transition">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={cn(
          "fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-lg",
          toast.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-600"
        )}>
          {toast.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <SkeletonList count={6} />
      ) : upgradeRequired ? (
        <div className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 p-8 space-y-4">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-600">Locked Feature</p>
          <h2 className="text-xl font-bold text-slate-900">Action items require Pro or Elite</h2>
          <p className="max-w-xl text-sm leading-6 text-amber-700">Upgrade to view and manage action items extracted from meetings.</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild><Link href="/dashboard/billing">Upgrade now <ArrowRight className="h-4 w-4" /></Link></Button>
            <Button asChild variant="secondary"><Link href="/dashboard/tools">Keep using tools</Link></Button>
          </div>
        </div>
      ) : loadError ? (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
          <p className="text-sm text-red-700">{loadError}</p>
          <Button type="button" variant="outline" onClick={() => void loadItems()}>Retry</Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={emptyState.icon} title={emptyState.title} description={emptyState.description} />
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* Table header */}
            <div className="hidden border-b border-slate-100 bg-slate-50/80 md:grid md:grid-cols-[40px_minmax(0,1fr)_140px_100px_130px_130px_100px_100px] md:items-center">
              <div className="px-4 py-3">
                {!isViewer && (
                  <input type="checkbox" checked={selected.size === items.length && items.length > 0} onChange={toggleAll}
                    className="h-4 w-4 rounded border-slate-300 accent-[#6c63ff]" />
                )}
              </div>
              {["Task", "Owner", "Priority", "Status", "Due Date", "Source", "Date"].map((col) => (
                <p key={col} className="px-3 py-3 text-xs font-semibold uppercase tracking-widest text-slate-400">{col}</p>
              ))}
            </div>

            {/* Rows */}
            <div className="divide-y divide-slate-50">
              {displayItems.map((row) => (
                <div
                  key={row.id}
                  className={cn(
                    "grid grid-cols-1 gap-2 px-4 py-3.5 transition-colors hover:bg-[#faf9ff] md:grid-cols-[40px_minmax(0,1fr)_140px_100px_130px_130px_100px_100px] md:items-center",
                    selected.has(row.id) && "bg-[#f5f3ff]"
                  )}
                >
                  <div>
                    {!isViewer && (
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        className="h-4 w-4 rounded border-slate-300 accent-[#6c63ff]"
                      />
                    )}
                  </div>
                  <p className="text-sm font-medium text-slate-900">{row.task}</p>

                  {/* Assignee — admin can edit */}
                  <div className="flex items-center gap-2">
                    {isAdmin && editingAssignee === row.id ? (
                      <input
                        autoFocus
                        defaultValue={row.owner}
                        onBlur={(e) => void handleAssigneeUpdate(row.id, e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") void handleAssigneeUpdate(row.id, e.currentTarget.value); if (e.key === "Escape") setEditingAssignee(null); }}
                        className="w-full rounded-lg border border-[#6c63ff]/40 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#6c63ff]/40"
                      />
                    ) : (
                      <div className="flex items-center gap-1.5 group">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f5f3ff] text-[10px] font-bold text-[#6c63ff]">
                          {row.owner.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "U"}
                        </span>
                        <span className="text-xs text-slate-600">{row.owner}</span>
                        {isAdmin && (
                          <button type="button" onClick={() => setEditingAssignee(row.id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <Pencil className="h-3 w-3 text-slate-400 hover:text-[#6c63ff]" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <span className={cn("inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", getPriorityClass(row.priority))}>
                    {row.priority}
                  </span>

                  {/* Status — admin + member can edit */}
                  {!isViewer
                    ? <StatusDropdown itemId={row.id} current={row.status || "pending"} onUpdate={handleStatusUpdate} />
                    : <span className="text-xs text-slate-500">{row.status}</span>
                  }

                  {/* Due date — admin + member can edit */}
                  {!isViewer && editingDueDate === row.id ? (
                    <input
                      autoFocus
                      type="text"
                      defaultValue={row.due_date}
                      onBlur={(e) => void handleDueDateUpdate(row.id, e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void handleDueDateUpdate(row.id, e.currentTarget.value); if (e.key === "Escape") setEditingDueDate(null); }}
                      className="w-full rounded-lg border border-[#6c63ff]/40 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#6c63ff]/40"
                    />
                  ) : (
                    <div className="flex items-center gap-1 group">
                      <span className="text-xs text-slate-500">{row.due_date || "—"}</span>
                      {!isViewer && (
                        <button type="button" onClick={() => setEditingDueDate(row.id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <Pencil className="h-3 w-3 text-slate-400 hover:text-[#6c63ff]" />
                        </button>
                      )}
                    </div>
                  )}

                  <span className="inline-flex w-fit rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                    {getSourceLabel(row.source)}
                  </span>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-400">{formatDate(row.created_at)}</span>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => { setSelected(new Set([row.id])); setDeleteModal(true); }}
                        className="rounded-lg p-1 text-slate-300 transition hover:bg-red-50 hover:text-red-500"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={pagination.totalPages}
            totalItems={pagination.total}
            pageSize={pagination.limit}
            itemLabel="items"
            onPageChange={setCurrentPage}
          />
        </>
      )}

      {/* Delete confirmation modal */}
      {deleteModal && (
        <DeleteModal
          count={selected.size}
          onConfirm={() => void handleDeleteSelected()}
          onCancel={() => setDeleteModal(false)}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}
