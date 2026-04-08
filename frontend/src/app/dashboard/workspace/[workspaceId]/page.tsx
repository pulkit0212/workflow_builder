import { Suspense } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  Video,
  CheckSquare,
  Calendar,
  Clock,
  Users,
  ClipboardList,
  Loader2,
} from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { SectionHeader } from "@/components/shared/section-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type RecentMeeting = {
  id: string;
  title: string;
  userId: string;
  status: string;
  workspaceMoveStatus: string | null;
  workspaceMovedAt: string | null;
  createdAt: string;
  scheduledStartTime: string | null;
};

type AssigneeRow = {
  owner: string | null;
  count: number;
};

type Member = {
  id: string;
  userId: string;
  role: string;
  status: string;
  createdAt: string;
};

type DashboardData = {
  success: true;
  totalMeetings: number;
  meetingsThisMonth: number;
  totalActionItems: number;
  pendingActionItems: number;
  recentMeetings: RecentMeeting[];
  actionItemsByAssignee: AssigneeRow[];
  members: Member[];
  pendingMoveRequestsCount?: number;
};

type PageProps = {
  params: Promise<{ workspaceId: string }>;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getMeetingStatusLabel(status: string): string {
  switch (status) {
    case "draft":
    case "scheduled":
      return "Not Started";
    case "joining":
    case "joined":
    case "capturing":
      return "Recording";
    case "processing":
    case "summarizing":
      return "Processing";
    case "completed":
      return "Ready";
    default:
      return status;
  }
}

function getMeetingStatusVariant(
  status: string
): "neutral" | "pending" | "info" | "available" {
  switch (status) {
    case "draft":
    case "scheduled":
      return "neutral";
    case "joining":
    case "joined":
    case "capturing":
      return "info";
    case "processing":
    case "summarizing":
      return "pending";
    case "completed":
      return "available";
    default:
      return "neutral";
  }
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white/80 p-6">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f5f3ff]">
        <Icon className="h-5 w-5 text-[#6c63ff]" />
      </div>
      <div>
        <p className="text-3xl font-bold text-slate-950">{value}</p>
        <p className="mt-1 text-sm font-medium text-slate-500">{label}</p>
        {sub ? <p className="mt-0.5 text-xs text-slate-400">{sub}</p> : null}
      </div>
    </div>
  );
}

function RecentMeetingRow({
  meeting,
  workspaceId,
}: {
  meeting: RecentMeeting;
  workspaceId: string;
}) {
  const date = meeting.workspaceMovedAt ?? meeting.scheduledStartTime ?? meeting.createdAt;
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3 transition-colors hover:border-sky-200 hover:bg-white">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900">
          {meeting.title || "Untitled meeting"}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">{formatDate(date)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Badge variant={getMeetingStatusVariant(meeting.status)}>
          {getMeetingStatusLabel(meeting.status)}
        </Badge>
        <Link
          href={`/dashboard/workspace/${workspaceId}/meetings/${meeting.id}` as Route}
          className="inline-flex h-7 items-center rounded-xl bg-[#6c63ff] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#5b52e0]"
        >
          View
        </Link>
      </div>
    </div>
  );
}

async function DashboardContent({ workspaceId }: { workspaceId: string }) {
  const { userId } = await auth();
  if (!userId) {
    return (
      <Card className="border-[#fecaca] bg-[#fef2f2] p-6">
        <p className="text-sm font-semibold text-[#991b1b]">Not authenticated.</p>
      </Card>
    );
  }

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const baseUrl = `${protocol}://${host}`;

  let data: DashboardData | null = null;
  let errorMessage: string | null = null;
  let isForbidden = false;

  try {
    const res = await fetch(`${baseUrl}/api/workspace/${workspaceId}/dashboard`, {
      cache: "no-store",
      headers: {
        cookie: headersList.get("cookie") ?? "",
      },
    });

    if (res.status === 403) {
      isForbidden = true;
    } else {
      const payload = (await res.json()) as
        | DashboardData
        | { success: false; message?: string };

      if (!res.ok || !payload.success) {
        errorMessage =
          "message" in payload
            ? (payload.message ?? "Failed to load dashboard.")
            : "Failed to load dashboard.";
      } else {
        data = payload as DashboardData;
      }
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Failed to load dashboard.";
  }

  if (isForbidden) {
    return (
      <Card className="border-[#fecaca] bg-[#fef2f2] p-6">
        <p className="text-sm font-semibold text-[#991b1b]">
          You are not a member of this workspace.
        </p>
      </Card>
    );
  }

  if (errorMessage || !data) {
    return (
      <Card className="border-[#fecaca] bg-[#fef2f2] p-6">
        <p className="text-sm font-semibold text-[#991b1b]">Unable to load dashboard</p>
        <p className="mt-1 text-sm text-[#991b1b]">{errorMessage ?? "Unknown error."}</p>
      </Card>
    );
  }

  const isAdmin = data.pendingMoveRequestsCount !== undefined;

  return (
    <div className="space-y-8">
      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Video} label="Total Meetings" value={data.totalMeetings} />
        <StatCard
          icon={Calendar}
          label="Meetings This Month"
          value={data.meetingsThisMonth}
        />
        <StatCard
          icon={CheckSquare}
          label="Total Action Items"
          value={data.totalActionItems}
        />
        <StatCard
          icon={Clock}
          label="Pending Action Items"
          value={data.pendingActionItems}
        />
      </div>

      {/* Admin: pending move requests */}
      {isAdmin && (data.pendingMoveRequestsCount ?? 0) > 0 ? (
        <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <ClipboardList className="h-5 w-5 text-amber-600" />
            <p className="text-sm font-semibold text-amber-800">
              {data.pendingMoveRequestsCount} pending move{" "}
              {data.pendingMoveRequestsCount === 1 ? "request" : "requests"}
            </p>
          </div>
          <Link
            href={`/dashboard/workspace/${workspaceId}/requests` as Route}
            className="inline-flex h-8 items-center rounded-xl bg-amber-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
          >
            Review
          </Link>
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Recent meetings */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Recent Meetings</h3>
            <Link
              href={`/dashboard/workspace/${workspaceId}/meetings` as Route}
              className="text-xs font-medium text-[#6c63ff] hover:underline"
            >
              View all
            </Link>
          </div>
          {data.recentMeetings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center">
              <p className="text-sm text-slate-500">No meetings yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.recentMeetings.map((m) => (
                <RecentMeetingRow key={m.id} meeting={m} workspaceId={workspaceId} />
              ))}
            </div>
          )}
        </div>

        {/* Right column: assignees + members */}
        <div className="space-y-8">
          {/* Action items by assignee */}
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-slate-900">Action Items by Assignee</h3>
            {data.actionItemsByAssignee.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center">
                <p className="text-sm text-slate-500">No action items yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.actionItemsByAssignee.map((row, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f5f3ff] text-[10px] font-semibold text-[#6c63ff]">
                        {(row.owner ?? "?").slice(0, 2).toUpperCase()}
                      </span>
                      <span className="max-w-[120px] truncate text-sm text-slate-700">
                        {row.owner ?? "Unassigned"}
                      </span>
                    </div>
                    <span className="rounded-full bg-[#6c63ff]/10 px-2.5 py-0.5 text-xs font-semibold text-[#6c63ff]">
                      {row.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Members list */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-500" />
              <h3 className="text-base font-semibold text-slate-900">
                Members ({data.members.length})
              </h3>
            </div>
            {data.members.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center">
                <p className="text-sm text-slate-500">No members yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f5f3ff] text-[10px] font-semibold text-[#6c63ff]">
                        {member.userId.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="max-w-[120px] truncate text-xs text-slate-700">
                        {member.userId.slice(0, 8)}…
              </span>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {member.role}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function WorkspaceDashboardPage({ params }: PageProps) {
  const { workspaceId } = await params;

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Workspace"
        title="Overview"
        description="Team stats, recent meetings, and action item summary."
      />

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-[#6c63ff]" />
          </div>
        }
      >
        <DashboardContent workspaceId={workspaceId} />
      </Suspense>
    </div>
  );
}
