import { Suspense } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Video } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { SectionHeader } from "@/components/shared/section-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MeetingsSearchInput } from "./search-input";

type Meeting = {
  id: string;
  title: string;
  userId: string;
  status: string;
  workspaceMoveStatus: string | null;
  createdAt: string;
  scheduledStartTime: string | null;
  summary: string | null;
  participants: Array<{ name: string; talkTimePercent: number }> | null;
};

type PageProps = {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ search?: string; page?: string }>;
};

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

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function MeetingCard({
  meeting,
  workspaceId,
}: {
  meeting: Meeting;
  workspaceId: string;
}) {
  const statusLabel = getMeetingStatusLabel(meeting.status);
  const statusVariant = getMeetingStatusVariant(meeting.status);
  const date = meeting.scheduledStartTime ?? meeting.createdAt;

  return (
    <div className="grid gap-4 rounded-3xl border border-slate-200 bg-white/80 p-5 transition-all hover:-translate-y-[1px] hover:border-sky-200 hover:bg-white md:grid-cols-[minmax(0,1fr)_160px_140px_120px_120px] md:items-center">
      {/* Title */}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-950">
          {meeting.title || "Untitled meeting"}
        </p>
        {meeting.summary ? (
          <p className="line-clamp-1 text-xs text-slate-500">{meeting.summary}</p>
        ) : null}
      </div>

      {/* Recorded by */}
      <div>
        <p className="text-xs text-slate-500">Recorded by</p>
        <div className="mt-1 inline-flex items-center gap-1.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f5f3ff] text-[9px] font-semibold text-[#6c63ff]">
            {meeting.userId.slice(0, 2).toUpperCase()}
          </span>
          <span className="max-w-[100px] truncate text-xs font-medium text-slate-700">
            {meeting.userId.slice(0, 8)}…
          </span>
        </div>
      </div>

      {/* Date */}
      <div>
        <p className="text-xs text-slate-500">Date</p>
        <p className="mt-1 text-xs text-slate-700">{formatDate(date)}</p>
      </div>

      {/* Status badge */}
      <div>
        <Badge variant={statusVariant}>{statusLabel}</Badge>
      </div>

      {/* View Report link */}
      <div>
        <Link
          href={`/dashboard/workspace/${workspaceId}/meetings/${meeting.id}` as Route}
          className="inline-flex h-8 items-center rounded-xl bg-[#6c63ff] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#5b52e0]"
        >
          View Report
        </Link>
      </div>
    </div>
  );
}

async function MeetingsList({
  workspaceId,
  search,
}: {
  workspaceId: string;
  search: string;
}) {
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

  const params = new URLSearchParams({ limit: "50" });
  if (search) params.set("search", search);

  let meetings: Meeting[] = [];
  let errorMessage: string | null = null;

  try {
    const res = await fetch(
      `${baseUrl}/api/workspace/${workspaceId}/meetings?${params.toString()}`,
      {
        cache: "no-store",
        headers: {
          cookie: headersList.get("cookie") ?? "",
        },
      }
    );

    if (res.status === 403) {
      return (
        <Card className="border-[#fecaca] bg-[#fef2f2] p-6">
          <p className="text-sm font-semibold text-[#991b1b]">
            You are not a member of this workspace.
          </p>
        </Card>
      );
    }

    const payload = (await res.json()) as
      | { success: true; meetings: Meeting[] }
      | { success: false; message?: string };

    if (!res.ok || !payload.success) {
      errorMessage =
        "message" in payload
          ? (payload.message ?? "Failed to load meetings.")
          : "Failed to load meetings.";
    } else {
      meetings = payload.meetings;
    }
  } catch (err) {
    errorMessage =
      err instanceof Error ? err.message : "Failed to load meetings.";
  }

  if (errorMessage) {
    return (
      <Card className="border-[#fecaca] bg-[#fef2f2] p-6">
        <p className="text-sm font-semibold text-[#991b1b]">
          Unable to load meetings
        </p>
        <p className="mt-1 text-sm text-[#991b1b]">{errorMessage}</p>
      </Card>
    );
  }

  if (meetings.length === 0) {
    return (
      <EmptyState
        icon={Video}
        title="No meetings found"
        description={
          search
            ? "Try adjusting your search."
            : "Meetings shared to this workspace will appear here."
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Column headers */}
      <div className="hidden grid-cols-[minmax(0,1fr)_160px_140px_120px_120px] gap-4 rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 p-4 md:grid">
        {["Title", "Recorded by", "Date", "Status", ""].map((col, i) => (
          <div key={i} className="text-sm font-medium text-slate-500">
            {col}
          </div>
        ))}
      </div>
      {meetings.map((meeting) => (
        <MeetingCard
          key={meeting.id}
          meeting={meeting}
          workspaceId={workspaceId}
        />
      ))}
    </div>
  );
}

export default async function WorkspaceMeetingsPage({
  params,
  searchParams,
}: PageProps) {
  const { workspaceId } = await params;
  const { search = "" } = await searchParams;

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Workspace"
        title="Meetings"
        description="All meetings shared to this workspace."
      />

      {/* Search bar */}
      <Card className="p-4">
        <Suspense>
          <MeetingsSearchInput defaultValue={search} />
        </Suspense>
      </Card>

      {/* Meetings list */}
      <Suspense
        fallback={
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="shimmer h-20 rounded-3xl" />
            ))}
          </div>
        }
      >
        <MeetingsList workspaceId={workspaceId} search={search} />
      </Suspense>
    </div>
  );
}
