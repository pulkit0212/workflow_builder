"use client";

import { useEffect, useState, useCallback } from "react";
import { Video } from "lucide-react";
import { SectionHeader } from "@/components/shared/section-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { workspaceFetch } from "@/lib/workspace-fetch";

const ITEMS_PER_PAGE = 20;

type WorkspaceMeeting = {
  id: string;
  userId: string;
  workspaceId: string | null;
  title: string;
  status: string;
  visibility: string;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
};

type WorkspaceMember = {
  id: string;
  name: string;
};

const STATUS_OPTIONS = ["", "pending", "active", "completed", "failed"] as const;

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getStatusBadgeVariant(status: string): "available" | "pending" | "neutral" | "info" | "danger" {
  switch (status) {
    case "completed": return "available";
    case "active": return "info";
    case "failed": return "danger";
    case "pending": return "pending";
    default: return "neutral";
  }
}

function getVisibilityBadgeVariant(visibility: string): "neutral" | "accent" | "info" {
  switch (visibility) {
    case "private": return "neutral";
    case "shared": return "info";
    case "workspace":
    default: return "accent";
  }
}

function getVisibilityLabel(visibility: string) {
  switch (visibility) {
    case "private": return "Private";
    case "shared": return "Shared";
    case "workspace": return "Workspace";
    default: return visibility;
  }
}

function MeetingCard({ meeting }: { meeting: WorkspaceMeeting }) {
  return (
    <div className="grid gap-4 rounded-3xl border border-slate-200 bg-white/80 p-5 transition-all hover:-translate-y-[1px] hover:border-sky-200 hover:bg-white md:grid-cols-[minmax(0,1fr)_160px_160px_120px_100px] md:items-center">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-950">{meeting.title || "Untitled meeting"}</p>
        {meeting.summary ? (
          <p className="line-clamp-1 text-xs text-slate-500">{meeting.summary}</p>
        ) : null}
      </div>
      <div>
        <p className="text-xs text-slate-500">Recorder</p>
        <div className="mt-1 inline-flex items-center gap-1.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f5f3ff] text-[9px] font-semibold text-[#6c63ff]">
            {meeting.userId.slice(0, 2).toUpperCase()}
          </span>
          <span className="text-xs text-slate-700 font-medium truncate max-w-[100px]">{meeting.userId.slice(0, 8)}…</span>
        </div>
      </div>
      <div>
        <p className="text-xs text-slate-500">Created</p>
        <p className="mt-1 text-xs text-slate-700">{formatDate(meeting.createdAt)}</p>
      </div>
      <div>
        <Badge variant={getStatusBadgeVariant(meeting.status)}>{meeting.status}</Badge>
      </div>
      <div>
        <Badge variant={getVisibilityBadgeVariant(meeting.visibility)}>{getVisibilityLabel(meeting.visibility)}</Badge>
      </div>
    </div>
  );
}

export default function WorkspaceMeetingsPage() {
  const [meetings, setMeetings] = useState<WorkspaceMeeting[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Filter state
  const [search, setSearch] = useState("");
  const [memberId, setMemberId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadMeetings = useCallback(async (page: number) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(ITEMS_PER_PAGE) });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (memberId) params.set("memberId", memberId);
      if (statusFilter) params.set("status", statusFilter);

      const res = await workspaceFetch(`/api/workspace/meetings?${params}`, { cache: "no-store" });
      const payload = await res.json() as
        | { success: true; meetings: WorkspaceMeeting[]; page: number; limit: number }
        | { success: false; message?: string };

      if (!res.ok || !payload.success) {
        const msg = "message" in payload ? payload.message : undefined;
        setLoadError(msg ?? "Failed to load workspace meetings.");
        return;
      }

      setMeetings(payload.meetings);
      setTotalItems(payload.meetings.length < ITEMS_PER_PAGE ? (page - 1) * ITEMS_PER_PAGE + payload.meetings.length : page * ITEMS_PER_PAGE + 1);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load workspace meetings.");
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, memberId, statusFilter]);

  // Load workspace members for the member picker
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
        // Members list is optional — silently ignore
      }
    }
    void loadMembers();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, memberId, statusFilter]);

  useEffect(() => {
    void loadMeetings(currentPage);
  }, [loadMeetings, currentPage]);

  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Workspace"
        title="Meeting History"
        description="All meetings recorded within your workspace."
      />

      {/* Filter bar */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <input
            type="text"
            placeholder="Search meetings…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 flex-1 min-w-[180px] rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:border-[#6c63ff] focus:outline-none focus:ring-1 focus:ring-[#6c63ff]"
          />

          {/* Member picker */}
          <select
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            className="h-9 rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm text-[#111827] focus:border-[#6c63ff] focus:outline-none focus:ring-1 focus:ring-[#6c63ff]"
          >
            <option value="">All members</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm text-[#111827] focus:border-[#6c63ff] focus:outline-none focus:ring-1 focus:ring-[#6c63ff]"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s === "" ? "All statuses" : s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>

          {/* Clear filters */}
          {(search || memberId || statusFilter) ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setSearch(""); setMemberId(""); setStatusFilter(""); }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      </Card>

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
              <p className="text-sm font-semibold text-[#991b1b]">Unable to load meetings</p>
              <p className="mt-1 text-sm text-[#991b1b]">{loadError}</p>
            </div>
            <Button type="button" variant="outline" onClick={() => void loadMeetings(currentPage)}>Retry</Button>
          </div>
        </Card>
      ) : meetings.length === 0 ? (
        <EmptyState
          icon={Video}
          title="No meetings found"
          description={search || memberId || statusFilter ? "Try adjusting your filters." : "Meetings recorded in this workspace will appear here."}
        />
      ) : (
        <div className="space-y-4">
          {/* Column headers */}
          <div className="hidden grid-cols-[minmax(0,1fr)_160px_160px_120px_100px] gap-4 rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 p-4 md:grid">
            {["Title", "Recorder", "Created", "Status", "Visibility"].map((col) => (
              <div key={col} className="text-sm font-medium text-slate-500">{col}</div>
            ))}
          </div>
          {meetings.map((meeting) => (
            <MeetingCard key={meeting.id} meeting={meeting} />
          ))}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={ITEMS_PER_PAGE}
            itemLabel="meetings"
            onPageChange={setCurrentPage}
          />
        </div>
      )}
    </div>
  );
}
