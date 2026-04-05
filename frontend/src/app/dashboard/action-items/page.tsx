"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, CheckSquare, Download, ListChecks, X } from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SkeletonList } from "@/components/SkeletonCard";
import { SectionHeader } from "@/components/shared/section-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";

const ITEMS_PER_PAGE = 10;

type ActionItemTab = "all" | "high_priority" | "my_items" | "this_week";
type SourceFilter = "all" | "meeting" | "task-generator" | "document";
type ItemStatus = "pending" | "in_progress" | "done" | "hold";

type ActionItemRow = {
  id: string;
  task: string;
  owner: string;
  dueDate: string;
  priority: string;
  status: string;
  source: string;
  meetingTitle: string | null;
  meetingId: string | null;
  createdAt: string;
};

const STATUS_OPTIONS: { value: ItemStatus; label: string; color: string; bg: string }[] = [
  { value: "pending", label: "Pending", color: "#6b7280", bg: "#f3f4f6" },
  { value: "in_progress", label: "In Progress", color: "#2563eb", bg: "#eff6ff" },
  { value: "done", label: "Done", color: "#16a34a", bg: "#f0fdf4" },
  { value: "hold", label: "On Hold", color: "#ca8a04", bg: "#fefce8" },
];

function getStatusStyle(status: string) {
  return STATUS_OPTIONS.find((s) => s.value === status) ?? STATUS_OPTIONS[0];
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getEmptyStateCopy(activeTab: ActionItemTab) {
  switch (activeTab) {
    case "high_priority": return { title: "No high priority items", description: "High priority tasks from your meetings will appear here", icon: ListChecks };
    case "my_items": return { title: "No items assigned to you", description: "Items where your name is mentioned as owner will appear here", icon: ListChecks };
    case "this_week": return { title: "No items from this week", description: "Record meetings this week to see tasks here", icon: ListChecks };
    default: return { title: "No action items yet", description: "Record a meeting to automatically extract tasks", icon: CheckSquare };
  }
}

function exportToCSV(items: ActionItemRow[]) {
  const headers = ["Task", "Owner", "Due Date", "Priority", "Status", "Meeting", "Date"];
  const rows = items.map((item) => [
    item.task, item.owner, item.dueDate, item.priority, item.status,
    item.meetingTitle || "Manual", new Date(item.createdAt).toLocaleDateString()
  ]);
  const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `action-items-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ActionItemsPage() {
  return <ErrorBoundary><ActionItemsContent /></ErrorBoundary>;
}

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
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-opacity hover:opacity-80"
        style={{ background: style.bg, color: style.color }}
      >
        {style.label}
        <span className="text-[9px]">▾</span>
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-lg">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] hover:bg-[#f9fafb]"
              onClick={() => { onUpdate(itemId, opt.value); setOpen(false); }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: opt.color }} />
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ActionItemsContent() {
  const { user } = useUser();
  const [items, setItems] = useState<ActionItemRow[]>([]);
  const [activeTab, setActiveTab] = useState<ActionItemTab>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: ITEMS_PER_PAGE, totalPages: 1 });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exportToast, setExportToast] = useState<string | null>(null);

  async function loadItems(tab = activeTab, page = currentPage, src = sourceFilter) {
    if (!user) { setIsLoading(false); return; }
    setIsLoading(true);
    setLoadError(null);
    setUpgradeRequired(false);
    try {
      const params = new URLSearchParams({ tab, page: String(page), limit: String(ITEMS_PER_PAGE), firstName: user.firstName || "", source: src });
      const res = await fetch(`/api/action-items?${params}`, { cache: "no-store" });
      const payload = await res.json() as { success: boolean; items: ActionItemRow[]; pagination: typeof pagination; message?: string };
      if (!res.ok || !payload.success) {
        if (res.status === 403) { setUpgradeRequired(true); return; }
        throw new Error(payload.message || "Failed to load action items.");
      }
      setItems(payload.items);
      setPagination(payload.pagination);
      setCurrentPage(payload.pagination.page);
      setSelected(new Set());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load action items.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { void loadItems(); }, [activeTab, currentPage, sourceFilter, user]);

  function handleTabChange(tab: ActionItemTab) { setActiveTab(tab); setCurrentPage(1); }
  function handleSourceChange(src: SourceFilter) { setSourceFilter(src); setCurrentPage(1); }

  function toggleSelect(id: string) {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  function toggleAll() {
    setSelected((prev) => prev.size === items.length ? new Set() : new Set(items.map((i) => i.id)));
  }

  async function handleStatusUpdate(id: string, status: string) {
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, status } : item));
    try {
      await fetch(`/api/action-items/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    } catch {
      void loadItems();
    }
  }

  async function handleExportSlack() {
    const ids = [...selected];
    try {
      const res = await fetch("/api/action-items/export/slack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemIds: ids }) });
      const data = await res.json() as { success: boolean; error?: string };
      setExportToast(data.success ? "Posted to Slack!" : `Failed: ${data.error}`);
    } catch { setExportToast("Failed to post to Slack."); }
    setTimeout(() => setExportToast(null), 3000);
  }

  async function handleExportJira() {
    const ids = [...selected];
    try {
      const res = await fetch("/api/action-items/export/jira", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemIds: ids }) });
      const data = await res.json() as { success: boolean; count?: number; error?: string };
      setExportToast(data.success ? `Created ${data.count} Jira tickets!` : `Failed: ${data.error}`);
    } catch { setExportToast("Failed to create Jira tickets."); }
    setTimeout(() => setExportToast(null), 3000);
  }

  const selectedItems = items.filter((i) => selected.has(i.id));
  const emptyState = getEmptyStateCopy(activeTab);

  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Artivaa" title="Action Items" description="All tasks extracted from your meetings" />

      {/* Tab filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          {([["all", "All"], ["high_priority", "High Priority"], ["my_items", "My Items"], ["this_week", "This Week"]] as [ActionItemTab, string][]).map(([id, label]) => (
            <Button key={id} type="button" variant={activeTab === id ? "default" : "ghost"} onClick={() => handleTabChange(id)}>{label}</Button>
          ))}
        </div>
      </Card>

      {/* Source filter */}
      <div className="flex flex-wrap gap-2">
        {([["all", "All"], ["meeting", "From Meetings"], ["task-generator", "Task Generator"], ["document", "Document Analyzer"]] as [SourceFilter, string][]).map(([src, label]) => (
          <button
            key={src}
            type="button"
            onClick={() => handleSourceChange(src)}
            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${sourceFilter === src ? "bg-[#6c63ff] text-white" : "bg-white text-[#6b7280] border border-[#e5e7eb] hover:border-[#6c63ff] hover:text-[#6c63ff]"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Export action bar */}
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 shadow-sm">
          <span className="text-[13px] font-semibold text-[#111827]">Selected: {selected.size} items</span>
          <Button type="button" size="sm" variant="secondary" onClick={() => exportToCSV(selectedItems)}>
            <Download className="h-4 w-4" />
            Download CSV
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => void handleExportSlack()}>Post to Slack</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => void handleExportJira()}>Create Jira Tickets</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            <X className="h-4 w-4" />
            Clear
          </Button>
        </div>
      ) : null}

      {/* Toast */}
      {exportToast ? (
        <div className="rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-[13px] font-medium text-[#111827] shadow-sm">{exportToast}</div>
      ) : null}

      {isLoading ? (
        <SkeletonList count={6} />
      ) : upgradeRequired ? (
        <Card className="border-[#fde68a] bg-[#fffbeb] p-6">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b45309]">Locked Feature</p>
            <h2 className="text-2xl font-bold text-[#111827]">Action items require Pro or Elite</h2>
            <p className="max-w-2xl text-sm leading-6 text-[#92400e]">Upgrade to view and manage action items extracted from meetings.</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild><Link href="/dashboard/billing">Upgrade now <ArrowRight className="h-4 w-4" /></Link></Button>
              <Button asChild variant="secondary"><Link href="/dashboard/tools">Keep using tools</Link></Button>
            </div>
          </div>
        </Card>
      ) : loadError ? (
        <Card className="border-[#fecaca] bg-[#fef2f2] p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#991b1b]">Unable to load action items</p>
              <p className="mt-2 text-sm text-[#991b1b]">{loadError}</p>
            </div>
            <Button type="button" variant="outline" onClick={() => void loadItems()}>Retry</Button>
          </div>
        </Card>
      ) : items.length === 0 ? (
        <EmptyState icon={emptyState.icon} title={emptyState.title} description={emptyState.description} />
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-[#f9fafb] text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-3">
                      <input type="checkbox" checked={selected.size === items.length && items.length > 0} onChange={toggleAll} className="h-4 w-4 rounded border-[#d1d5db]" />
                    </th>
                    <th className="px-4 py-3 font-semibold">Task</th>
                    <th className="px-4 py-3 font-semibold">Owner</th>
                    <th className="px-4 py-3 font-semibold">Priority</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Due Date</th>
                    <th className="px-4 py-3 font-semibold">Source</th>
                    <th className="px-4 py-3 font-semibold">Meeting</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, index) => (
                    <tr key={row.id} className={index % 2 === 0 ? "bg-white" : "bg-[#fafafa]"}>
                      <td className="px-4 py-4">
                        <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} className="h-4 w-4 rounded border-[#d1d5db]" />
                      </td>
                      <td className="px-4 py-4 text-slate-900">{row.task}</td>
                      <td className="px-4 py-4 text-slate-600">
                        <div className="inline-flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f5f3ff] text-[10px] font-semibold text-[#6c63ff]">
                            {row.owner.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "U"}
                          </span>
                          <span>{row.owner}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={row.priority === "High" ? "danger" : row.priority === "Low" ? "available" : "pending"}>{row.priority}</Badge>
                      </td>
                      <td className="px-4 py-4">
                        <StatusDropdown itemId={row.id} current={row.status || "pending"} onUpdate={handleStatusUpdate} />
                      </td>
                      <td className="px-4 py-4 text-slate-600">{row.dueDate}</td>
                      <td className="px-4 py-4">
                        <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-medium text-[#6b7280]">
                          {row.source === "meeting" ? "Meeting" : row.source === "task-generator" ? "Task Gen" : row.source === "document" ? "Document" : row.source}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {row.meetingId && row.meetingTitle ? (
                          <Link href={`/dashboard/meetings/${row.meetingId}` as Route} className="font-medium text-[#111827] hover:text-[#6c63ff]">{row.meetingTitle}</Link>
                        ) : <span className="text-[#9ca3af]">—</span>}
                      </td>
                      <td className="px-4 py-4 text-slate-600">{formatDate(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Pagination currentPage={currentPage} totalPages={pagination.totalPages} totalItems={pagination.total} pageSize={pagination.limit} itemLabel="items" onPageChange={setCurrentPage} />
        </>
      )}
    </div>
  );
}
