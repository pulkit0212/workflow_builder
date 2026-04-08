"use client";

import { useEffect, useState } from "react";
import { LayoutDashboard, Video, CheckSquare, Users, Calendar } from "lucide-react";
import { SectionHeader } from "@/components/shared/section-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { workspaceFetch } from "@/lib/workspace-fetch";

type RecentMeeting = {
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

type PendingActionItem = {
  id: string;
  task: string;
  owner: string | null;
  dueDate: string | null;
  priority: string | null;
  status: string | null;
  meetingId: string | null;
  meetingTitle: string | null;
  workspaceId: string | null;
  createdAt: string;
  updatedAt: string;
};

type DashboardData = {
  totalMeetings: number;
  meetingsThisWeek: number;
  totalActionItems: number;
  activeMemberCount: number;
  recentMeetings: RecentMeeting[];
  pendingActionItems: PendingActionItem[];
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
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

function getPriorityBadgeVariant(priority: string | null): "danger" | "pending" | "available" | "neutral" {
  switch (priority) {
    case "high": return "danger";
    case "medium": return "pending";
    case "low": return "available";
    default: return "neutral";
  }
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${color}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-950">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </Card>
  );
}

export default function WorkspaceOverviewPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadDashboard() {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await workspaceFetch("/api/workspace/dashboard", { cache: "no-store" });
      const payload = await res.json() as
        | ({ success: true } & DashboardData)
        | { success: false; message?: string };

      if (!res.ok || !payload.success) {
        const msg = "message" in payload ? payload.message : undefined;
        setLoadError(msg ?? "Failed to load workspace overview.");
        return;
      }

      const { success: _s, ...rest } = payload;
      setData(rest as DashboardData);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load workspace overview.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Workspace"
        title="Overview"
        description="A snapshot of your workspace activity."
      />

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="shimmer h-24 rounded-3xl" />
            ))}
          </div>
          <div className="shimmer h-48 rounded-3xl" />
          <div className="shimmer h-48 rounded-3xl" />
        </div>
      ) : loadError ? (
        <Card className="border-[#fecaca] bg-[#fef2f2] p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#991b1b]">Unable to load overview</p>
              <p className="mt-1 text-sm text-[#991b1b]">{loadError}</p>
            </div>
            <Button type="button" variant="outline" onClick={() => void loadDashboard()}>Retry</Button>
          </div>
        </Card>
      ) : data ? (
        <>
          {/* Stats cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Video} label="Total Meetings" value={data.totalMeetings} color="bg-[#6c63ff]" />
            <StatCard icon={Calendar} label="Meetings This Week" value={data.meetingsThisWeek} color="bg-[#0ea5e9]" />
            <StatCard icon={CheckSquare} label="Total Action Items" value={data.totalActionItems} color="bg-[#10b981]" />
            <StatCard icon={Users} label="Active Members" value={data.activeMemberCount} color="bg-[#f59e0b]" />
          </div>

          {/* Recent meetings */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-950">Recent Meetings</h2>
              <a href="/dashboard/workspace/meetings" className="text-xs text-[#6c63ff] hover:underline">View all</a>
            </div>
            {data.recentMeetings.length === 0 ? (
              <Card className="p-6 text-center">
                <LayoutDashboard className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                <p className="text-sm text-slate-500">No meetings yet.</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {data.recentMeetings.map((meeting) => (
                  <div
                    key={meeting.id}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white/80 px-5 py-3 transition-all hover:border-sky-200 hover:bg-white"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-950">{meeting.title || "Untitled meeting"}</p>
                      <p className="text-xs text-slate-500">{formatDate(meeting.createdAt)}</p>
                    </div>
                    <Badge variant={getStatusBadgeVariant(meeting.status)}>{meeting.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending action items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-950">Pending Action Items</h2>
              <a href="/dashboard/workspace/action-items" className="text-xs text-[#6c63ff] hover:underline">View all</a>
            </div>
            {data.pendingActionItems.length === 0 ? (
              <Card className="p-6 text-center">
                <CheckSquare className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                <p className="text-sm text-slate-500">No pending action items.</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {data.pendingActionItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white/80 px-5 py-3 transition-all hover:border-sky-200 hover:bg-white"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-950">{item.task}</p>
                      <p className="text-xs text-slate-500">
                        {item.owner ? `Assigned to ${item.owner}` : "Unassigned"}
                        {item.meetingTitle ? ` · ${item.meetingTitle}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {item.priority ? (
                        <Badge variant={getPriorityBadgeVariant(item.priority)}>
                          {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
                        </Badge>
                      ) : null}
                      {item.dueDate ? (
                        <span className="text-xs text-slate-500">{formatDate(item.dueDate)}</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
