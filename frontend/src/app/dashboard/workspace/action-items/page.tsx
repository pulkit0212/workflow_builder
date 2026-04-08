"use client";

import { useEffect, useState, useCallback } from "react";
import { CheckSquare } from "lucide-react";
import { SectionHeader } from "@/components/shared/section-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { workspaceFetch } from "@/lib/workspace-fetch";

const ITEMS_PER_PAGE = 20;

type ActionItem = {
  id: string;
  task: string;
  owner: string | null;
  dueDate: string | null;
  priority: string | null;
  completed: boolean;
  status: string | null;
  meetingId: string | null;
  meetingTitle: string | null;
  workspaceId: string | null;
  userId: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
};

type WorkspaceMember = {
  id: string;
  name: string;
};

type Workspace = {
  id: string;
  name: string;
  role: string;
};

const PRIORITY_OPTIONS = ["", "high", "medium", "low"] as const;
const STATUS_OPTIONS = ["", "pending", "in_progress", "completed"] as const;

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getPriorityBadgeVariant(priority: string | null): "danger" | "pending" | "available" | "neutral" {
  switch (priority) {
    case "high": return "danger";
    case "medium": return "pending";
    case "low": return "available";
    default: return "neutral";
  }
}

function getStatusBadgeVariant(status: string | null): "available" | "pending" | "neutral" | "info" {
  switch (status) {
    case "completed": return "available";
    case "in_progress": return "info";
    case "pending": return "pending";
    default: return "neutral";
  }
}

function ActionItemRow({
  item,
  selected,
  onToggle,
}: {
  item: ActionItem;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="grid gap-4 rounded-3xl border border-slate-200 bg-white/80 p-5 transition-all hover:-translate-y-[1px] hover:border-sky-200 hover:bg-white md:grid-cols-[32px_minmax(0,1fr)_140px_120px_120px_120px] md:items-center">
      <div className="flex items-center justify-center">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(item.id)}
          className="h-4 w-4 rounded border-slate-300 text-[#6c63ff] focus:ring-[#6c63ff]"
          aria-label={`Select action item: ${item.task}`}
        />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-950">{item.task}</p>
        {item.meetingTitle ? (
          <p className="text-xs text-slate-500">From: {item.meetingTitle}</p>
        ) : null}
      </div>
      <div>
        <p className="text-xs text-slate-500">Assignee</p>
        <p className="mt-1 text-xs text-slate-700 font-medium">{item.owner ?? "Unassigned"}</p>
      </div>
      <div>
        <p className="text-xs text-slate-500">Due</p>
        <p className="mt-1 text-xs text-slate-700">{formatDate(item.dueDate)}</p>
      </div>
      <div>
        {item.priority ? (
          <Badge variant={getPriorityBadgeVariant(item.priority)}>
            {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
          </Badge>
        ) : (
          <Badge variant="neutral">—</Badge>
        )}
      </div>
      <div>
        <Badge variant={getStatusBadgeVariant(item.status)}>
          {item.status ? item.status.replace("_", " ") : "—"}
        </Badge>
      </div>
    </div>
  );
}

export default function WorkspaceActionItemsPage() {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [userRole, setUserRole] = useState<string>("member");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk-assign state
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [isBulkAssigning, setIsBulkAssigning] = useState(false);
  const [bulkAssignError, setBulkAssignError] = useState<string | null>(null);

  // Filter state
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [meetingIdFilter, setMeetingIdFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Debounced assignee filter
  const [debouncedAssignee, setDebouncedAssignee] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedAssignee(assigneeFilter), 300);
    return () => clearTimeout(timer);
  }, [assigneeFilter]);

  const isAdminOrOwner = userRole === "admin" || userRole === "owner";

  // Fetch user role from workspaces list
  useEffect(() => {
    async function loadRole() {
      try {
        const res = await workspaceFetch("/api/workspaces", { cache: "no-store" });
        if (res.ok) {
          const payload = await res.json() as { success: boolean; workspaces?: Workspace[] };
          if (payload.success && payload.workspaces && payload.workspaces.length > 0) {
            // The active workspace is the one matching the stored id; fall back to first
            const { getActiveWorkspaceId } = await import("@/lib/workspace-fetch");
            const activeId = getActiveWorkspaceId();
            const active = activeId
              ? payload.workspaces.find((w) => w.id === activeId)
              : payload.workspaces[0];
            if (active) setUserRole(active.role);
          }
        }
      } catch {
        // Role detection is best-effort
      }
    }
    void loadRole();
  }, []);

  // Load workspace members for bulk-assign dropdown
  useEffect(() => {
    async function loadMembers() {
      try {
        const res = await workspaceFetch("/api/workspaces/members", { cache: "no-store" });
        if (res.ok) {
          const payload = await res.json() as { success: boolean; members?: WorkspaceMember[] };
          if (payload.success && payload.members) {
            setMembers(payload.members);
          }
        }
      } catch {
        // Members list is optional
      }
    }
    void loadMembers();
  }, []);

  const loadItems = useCallback(async (page: number) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(ITEMS_PER_PAGE) });
      if (debouncedAssignee) params.set("assignee", debouncedAssignee);
      if (meetingIdFilter) params.set("meetingId", meetingIdFilter);
      if (priorityFilter) params.set("priority", priorityFilter);
      if (statusFilter) params.set("status", statusFilter);

      const res = await workspaceFetch(`/api/workspace/action-items?${params}`, { cache: "no-store" });
      const payload = await res.json() as
        | { success: true; actionItems: ActionItem[]; page: number; limit: number }
        | { success: false; message?: string };

      if (!res.ok || !payload.success) {
        const msg = "message" in payload ? payload.message : undefined;
        setLoadError(msg ?? "Failed to load workspace action items.");
        return;
      }

      setItems(payload.actionItems);
      const count = payload.actionItems.length;
      setTotalItems(count < ITEMS_PER_PAGE ? (page - 1) * ITEMS_PER_PAGE + count : page * ITEMS_PER_PAGE + 1);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load workspace action items.");
    } finally {
      setIsLoading(false);
    }
  }, [debouncedAssignee, meetingIdFilter, priorityFilter, statusFilter]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [debouncedAssignee, meetingIdFilter, priorityFilter, statusFilter]);

  useEffect(() => {
    void loadItems(currentPage);
  }, [loadItems, currentPage]);

  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  }

  async function handleBulkAssign() {
    if (selectedIds.size === 0 || !bulkAssignee.trim()) return;
    setIsBulkAssigning(true);
    setBulkAssignError(null);
    try {
      const res = await workspaceFetch("/api/workspace/action-items/bulk-assign", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: Array.from(selectedIds), assignee: bulkAssignee.trim() }),
      });
      const payload = await res.json() as { success: boolean; message?: string };
      if (!res.ok || !payload.success) {
        setBulkAssignError(payload.message ?? "Bulk assign failed.");
        return;
      }
      setSelectedIds(new Set());
      setBulkAssignee("");
      void loadItems(currentPage);
    } catch (err) {
      setBulkAssignError(err instanceof Error ? err.message : "Bulk assign failed.");
    } finally {
      setIsBulkAssigning(false);
    }
  }

  const hasFilters = assigneeFilter || meetingIdFilter || priorityFilter || statusFilter;

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Workspace"
        title="Action Items"
        description="All action items from workspace meetings."
      />

      {/* Filter bar */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          {/* Assignee filter */}
          <input
            type="text"
            placeholder="Filter by assignee…"
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="h-9 flex-1 min-w-[160px] rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:border-[#6c63ff] focus:outline-none focus:ring-1 focus:ring-[#6c63ff]"
          />

          {/* Meeting ID filter */}
          <input
            type="text"
            placeholder="Filter by meeting ID…"
            value={meetingIdFilter}
            onChange={(e) => setMeetingIdFilter(e.target.value)}
            className="h-9 flex-1 min-w-[160px] rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:border-[#6c63ff] focus:outline-none focus:ring-1 focus:ring-[#6c63ff]"
          />

          {/* Priority filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="h-9 rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm text-[#111827] focus:border-[#6c63ff] focus:outline-none focus:ring-1 focus:ring-[#6c63ff]"
          >
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>{p === "" ? "All priorities" : p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm text-[#111827] focus:border-[#6c63ff] focus:outline-none focus:ring-1 focus:ring-[#6c63ff]"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s === "" ? "All statuses" : s.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase())}</option>
            ))}
          </select>

          {/* Clear filters */}
          {hasFilters ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setAssigneeFilter(""); setMeetingIdFilter(""); setPriorityFilter(""); setStatusFilter(""); }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      </Card>

      {/* Bulk-assign panel — ADMIN/OWNER only */}
      {isAdminOrOwner && selectedIds.size > 0 ? (
        <Card className="border-[#6c63ff]/20 bg-[#f5f3ff] p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-[#4c1d95]">
              {selectedIds.size} item{selectedIds.size !== 1 ? "s" : ""} selected
            </span>
            <div className="flex flex-1 flex-wrap items-center gap-3">
              {members.length > 0 ? (
                <select
                  value={bulkAssignee}
                  onChange={(e) => setBulkAssignee(e.target.value)}
                  className="h-9 rounded-xl border border-[#6c63ff]/30 bg-white px-3 text-sm text-[#111827] focus:border-[#6c63ff] focus:outline-none focus:ring-1 focus:ring-[#6c63ff]"
                >
                  <option value="">Select assignee…</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="Enter assignee name…"
                  value={bulkAssignee}
                  onChange={(e) => setBulkAssignee(e.target.value)}
                  className="h-9 flex-1 min-w-[160px] rounded-xl border border-[#6c63ff]/30 bg-white px-3 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:border-[#6c63ff] focus:outline-none focus:ring-1 focus:ring-[#6c63ff]"
                />
              )}
              <Button
                type="button"
                onClick={() => void handleBulkAssign()}
                disabled={isBulkAssigning || !bulkAssignee.trim()}
              >
                {isBulkAssigning ? "Assigning…" : "Assign"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSelectedIds(new Set())}
              >
                Cancel
              </Button>
            </div>
            {bulkAssignError ? (
              <p className="w-full text-xs text-red-600">{bulkAssignError}</p>
            ) : null}
          </div>
        </Card>
      ) : null}

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="shimmer h-20 rounded-3xl" />
          ))}
        </div>
      ) : loadError ? (
        <Card className="border-[#fecaca] bg-[#fef2f2] p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#991b1b]">Unable to load action items</p>
              <p className="mt-1 text-sm text-[#991b1b]">{loadError}</p>
            </div>
            <Button type="button" variant="outline" onClick={() => void loadItems(currentPage)}>Retry</Button>
          </div>
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No action items found"
          description={hasFilters ? "Try adjusting your filters." : "Action items from workspace meetings will appear here."}
        />
      ) : (
        <div className="space-y-4">
          {/* Column headers */}
          <div className="hidden grid-cols-[32px_minmax(0,1fr)_140px_120px_120px_120px] gap-4 rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 p-4 md:grid">
            <div className="flex items-center justify-center">
              <input
                type="checkbox"
                checked={selectedIds.size === items.length && items.length > 0}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-slate-300 text-[#6c63ff] focus:ring-[#6c63ff]"
                aria-label="Select all action items"
              />
            </div>
            {["Task", "Assignee", "Due Date", "Priority", "Status"].map((col) => (
              <div key={col} className="text-sm font-medium text-slate-500">{col}</div>
            ))}
          </div>

          {items.map((item) => (
            <ActionItemRow
              key={item.id}
              item={item}
              selected={selectedIds.has(item.id)}
              onToggle={toggleSelect}
            />
          ))}

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={ITEMS_PER_PAGE}
            itemLabel="action items"
            onPageChange={setCurrentPage}
          />
        </div>
      )}
    </div>
  );
}
