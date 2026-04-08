import { Suspense } from "react";
import Link from "next/link";
import type { Route } from "next";
import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import {
  ArrowLeft,
  CheckSquare,
  Clock,
  Loader2,
  Radio,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/shared/section-header";
import { db } from "@/lib/db/client";
import { workspaceMembers } from "@/db/schema";
import { actionItems } from "@/db/schema/action-items";
import { users } from "@/db/schema/users";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import type { MeetingDetailRecord } from "@/features/meetings/types";
import {
  formatMeetingDate,
  formatMeetingDuration,
  formatMeetingTime,
  getMeetingDetailStatusBadgeVariant,
  getMeetingDetailStatusLabel,
  hasProcessedMeetingContent,
} from "@/features/meetings/helpers";
import { WorkspaceMeetingControls, AssignToDropdown, type WorkspaceMember } from "./controls";

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkspaceRole = "admin" | "member" | "viewer";

type PageProps = {
  params: Promise<{ workspaceId: string; meetingId: string }>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPriorityTone(priority: string | null | undefined) {
  switch ((priority ?? "Medium").toLowerCase()) {
    case "high":
      return "bg-[#fef2f2] text-[#dc2626]";
    case "low":
      return "bg-[#f0fdf4] text-[#16a34a]";
    default:
      return "bg-[#fefce8] text-[#ca8a04]";
  }
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Status screens ───────────────────────────────────────────────────────────

function WaitingScreen({ scheduledStartTime }: { scheduledStartTime: string | null }) {
  return (
    <Card className="p-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#f5f3ff]">
        <Clock className="h-7 w-7 text-[#6c63ff]" />
      </div>
      <h2 className="text-xl font-bold text-slate-900">Meeting not started yet</h2>
      <p className="mt-2 text-sm text-slate-500">
        {scheduledStartTime
          ? `Scheduled for ${formatMeetingDate(scheduledStartTime)} at ${formatMeetingTime(scheduledStartTime)}`
          : "No scheduled time set."}
      </p>
    </Card>
  );
}

function LiveScreen({
  meeting,
  role,
}: {
  meeting: MeetingDetailRecord;
  role: WorkspaceRole;
}) {
  const isAdminOrOwner = role === "admin";
  return (
    <Card className="p-8 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#fef2f2]">
        <Radio className="h-7 w-7 animate-pulse text-[#dc2626]" />
      </div>
      <h2 className="text-xl font-bold text-slate-900">Recording in progress</h2>
      <p className="mt-2 text-sm text-slate-500">
        {meeting.title} is currently being recorded.
      </p>
      {isAdminOrOwner && (
        <p className="mt-4 text-xs text-slate-400">
          As an admin, you can stop the recording from the personal meeting page.
        </p>
      )}
      {!isAdminOrOwner && (
        <p className="mt-4 text-xs text-slate-400">
          The report will be available once the recording is complete.
        </p>
      )}
    </Card>
  );
}

// ─── Full report ──────────────────────────────────────────────────────────────

type DbActionItem = {
  id: string;
  task: string;
  owner: string;
};

function FullReport({
  meeting,
  role,
  workspaceId,
  members,
  dbActionItems,
}: {
  meeting: MeetingDetailRecord;
  role: WorkspaceRole;
  workspaceId: string;
  members: WorkspaceMember[];
  dbActionItems: DbActionItem[];
}) {
  const durationLabel = formatMeetingDuration(meeting.meetingDuration);

  return (
    <div className="space-y-6">
      {/* Meta card */}
      <Card className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={getMeetingDetailStatusBadgeVariant(meeting.status)}>
                {getMeetingDetailStatusLabel(meeting.status)}
              </Badge>
              <Badge variant="neutral">
                {meeting.provider === "google_meet"
                  ? "Google Meet"
                  : meeting.provider === "zoom_web"
                    ? "Zoom"
                    : "Teams"}
              </Badge>
            </div>
            <p className="text-sm text-slate-500">
              {meeting.scheduledStartTime
                ? `${formatMeetingDate(meeting.scheduledStartTime)} at ${formatMeetingTime(meeting.scheduledStartTime)}`
                : "Date unavailable"}
              {durationLabel ? ` · ${durationLabel}` : ""}
            </p>
          </div>

          {/* Role-gated controls (client component) */}
          <WorkspaceMeetingControls
            meeting={meeting}
            role={role}
            workspaceId={workspaceId}
          />
        </div>
      </Card>

      {/* Summary */}
      <Card className="border-l-4 border-l-[#6c63ff] p-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[#6c63ff]" />
          <h2 className="text-lg font-semibold">Summary</h2>
        </div>
        <p className="mt-4 text-sm leading-7 text-slate-700">
          {meeting.summary ?? "No summary available for this meeting."}
        </p>
      </Card>

      {/* Key Decisions */}
      <Card className="p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Key Decisions</h2>
          <Badge variant="neutral">{meeting.keyDecisions.length}</Badge>
        </div>
        <div className="mt-4 space-y-3">
          {(meeting.keyDecisions.length > 0
            ? meeting.keyDecisions
            : ["No key decisions were captured for this meeting."]
          ).map((decision, index) => (
            <div
              key={`${decision}-${index}`}
              className="flex items-start gap-3 rounded-xl bg-slate-50 p-4"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f5f3ff] text-sm font-semibold text-[#6c63ff]">
                {index + 1}
              </span>
              <p className="text-sm leading-6 text-slate-700">{decision}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Action Items */}
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <CheckSquare className="h-5 w-5 text-[#6c63ff]" />
          <h2 className="text-lg font-semibold">Action Items</h2>
        </div>

        {meeting.actionItems.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            No action items were saved for this meeting.
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-slate-500">Task</th>
                  <th className="px-4 py-3 font-semibold text-slate-500">Owner</th>
                  <th className="px-4 py-3 font-semibold text-slate-500">Due Date</th>
                  <th className="px-4 py-3 font-semibold text-slate-500">Priority</th>
                  {/* ADMIN gets an extra Assign column — rendered by client controls */}
                  {role === "admin" && (
                    <th className="px-4 py-3 font-semibold text-slate-500">Assign</th>
                  )}
                  {/* MEMBER gets a Status column for own items */}
                  {role === "member" && (
                    <th className="px-4 py-3 font-semibold text-slate-500">Status</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {meeting.actionItems.map((item, index) => (
                  <tr
                    key={`${item.task}-${index}`}
                    className={index % 2 === 0 ? "bg-white" : "bg-slate-50/50"}
                  >
                    <td className="px-4 py-4 text-slate-900">{item.task}</td>
                    <td className="px-4 py-4 text-slate-600">{item.owner ?? "Unassigned"}</td>
                    <td className="px-4 py-4 text-slate-600">
                      {item.dueDate ?? item.deadline ?? "Not specified"}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getPriorityTone(item.priority)}`}
                      >
                        {item.priority ?? "Medium"}
                      </span>
                    </td>
                    {/* ADMIN: AssignToDropdown per action item */}
                    {role === "admin" && (
                      <td className="px-4 py-4">
                        {(() => {
                          const dbItem = dbActionItems.find((d) => d.task === item.task);
                          if (!dbItem) return null;
                          return (
                            <AssignToDropdown
                              itemId={dbItem.id}
                              workspaceId={workspaceId}
                              currentOwner={item.owner ?? null}
                              members={members}
                            />
                          );
                        })()}
                      </td>
                    )}
                    {role === "member" && <td className="px-4 py-4" />}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Risks & Blockers */}
      {meeting.risksAndBlockers.length > 0 && (
        <Card className="border-l-4 border-l-[#ca8a04] p-6">
          <div className="flex items-center gap-2">
            <TriangleAlert className="h-5 w-5 text-[#ca8a04]" />
            <h2 className="text-lg font-semibold">Risks &amp; Blockers</h2>
          </div>
          <div className="mt-4 space-y-3">
            {meeting.risksAndBlockers.map((item) => (
              <div key={item} className="rounded-xl bg-[#fffbea] p-4">
                <p className="text-sm leading-6 text-[#713f12]">{item}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Transcript */}
      {meeting.transcript && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Transcript</h2>
          <div className="mt-4 max-h-96 overflow-y-auto rounded-xl bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-700 whitespace-pre-wrap">
            {meeting.transcript}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Main data-fetching component ─────────────────────────────────────────────

async function WorkspaceMeetingDetailContent({
  workspaceId,
  meetingId,
}: {
  workspaceId: string;
  meetingId: string;
}) {
  const { userId } = await auth();

  if (!userId) {
    return (
      <Card className="border-[#fecaca] bg-[#fef2f2] p-6">
        <p className="text-sm font-semibold text-[#991b1b]">Not authenticated.</p>
      </Card>
    );
  }

  try {
    await ensureDatabaseReady();

    if (!db) {
      return (
        <Card className="border-[#fecaca] bg-[#fef2f2] p-6">
          <p className="text-sm font-semibold text-[#991b1b]">Database not configured.</p>
        </Card>
      );
    }

    const user = await syncCurrentUserToDatabase(userId);

    // Determine workspace role
    const [membership] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, user.id),
          eq(workspaceMembers.status, "active")
        )
      )
      .limit(1);

    if (!membership) {
      return (
        <Card className="border-[#fecaca] bg-[#fef2f2] p-6">
          <p className="text-sm font-semibold text-[#991b1b]">
            You are not a member of this workspace.
          </p>
        </Card>
      );
    }

    const rawRole = membership.role;
    const role: WorkspaceRole =
      rawRole === "admin" || rawRole === "owner" ? "admin" : rawRole === "viewer" ? "viewer" : "member";

    // Fetch meeting via internal API (reuses auth + workspace membership logic)
    const headersList = await headers();
    const host = headersList.get("host") ?? "localhost:3000";
    const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
    const baseUrl = `${protocol}://${host}`;

    const res = await fetch(`${baseUrl}/api/meetings/${meetingId}`, {
      cache: "no-store",
      headers: {
        cookie: headersList.get("cookie") ?? "",
        "x-workspace-id": workspaceId,
      },
    });

    if (res.status === 404 || res.status === 403) {
      return (
        <Card className="border-[#fecaca] bg-[#fef2f2] p-6">
          <p className="text-sm font-semibold text-[#991b1b]">Meeting not found.</p>
        </Card>
      );
    }

    if (!res.ok) {
      return (
        <Card className="border-[#fecaca] bg-[#fef2f2] p-6">
          <p className="text-sm font-semibold text-[#991b1b]">Failed to load meeting.</p>
        </Card>
      );
    }

    const payload = (await res.json()) as
      | { success: true; meeting: MeetingDetailRecord }
      | { success: false; message?: string };

    if (!payload.success) {
      return (
        <Card className="border-[#fecaca] bg-[#fef2f2] p-6">
          <p className="text-sm font-semibold text-[#991b1b]">
            {"message" in payload ? payload.message : "Failed to load meeting."}
          </p>
        </Card>
      );
    }

    const meeting = payload.meeting;
    const status = meeting.status;

    // Fetch workspace members (for ADMIN assign dropdown) and action items from DB
    const meetingSessionId = meeting.meetingSessionId ?? meetingId;

    const [memberRows, dbActionItemRows] = await Promise.all([
      role === "admin"
        ? db
            .select({
              id: workspaceMembers.userId,
              name: users.fullName,
            })
            .from(workspaceMembers)
            .innerJoin(users, eq(users.id, workspaceMembers.userId))
            .where(
              and(
                eq(workspaceMembers.workspaceId, workspaceId),
                eq(workspaceMembers.status, "active")
              )
            )
        : Promise.resolve([]),
      role === "admin"
        ? db
            .select({
              id: actionItems.id,
              task: actionItems.task,
              owner: actionItems.owner,
            })
            .from(actionItems)
            .where(
              and(
                eq(actionItems.meetingId, meetingSessionId),
                eq(actionItems.workspaceId, workspaceId)
              )
            )
        : Promise.resolve([]),
    ]);

    const members: WorkspaceMember[] = memberRows.map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
    }));

    const dbActionItems = dbActionItemRows.map((a) => ({
      id: a.id,
      task: a.task,
      owner: a.owner,
    }));

    // Determine which screen to show based on meeting status
    const isNotStarted =
      status === "scheduled" && !hasProcessedMeetingContent(meeting);
    const isLive =
      status === "joining" ||
      status === "waiting_for_join" ||
      status === "waiting_for_admission" ||
      status === "joined" ||
      status === "capturing";
    const isCompleted =
      status === "completed" ||
      status === "processing" ||
      status === "summarizing" ||
      hasProcessedMeetingContent(meeting);

    return (
      <div className="space-y-6">
        <SectionHeader
          eyebrow="Workspace Meeting"
          title={meeting.title}
          description="Meeting report for workspace members."
          action={
            <Button asChild variant="ghost">
              <Link href={`/dashboard/workspace/${workspaceId}/meetings` as Route}>
                <ArrowLeft className="h-4 w-4" />
                Back to meetings
              </Link>
            </Button>
          }
        />

        {/* Role badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Your role:</span>
          <Badge
            variant={
              role === "admin" ? "available" : role === "member" ? "info" : "neutral"
            }
          >
            {role === "admin" ? "Admin" : role === "member" ? "Member" : "Viewer"}
          </Badge>
          <span className="text-xs text-slate-400">
            {formatDate(meeting.scheduledStartTime ?? meeting.createdAt)}
          </span>
        </div>

        {isNotStarted && (
          <WaitingScreen scheduledStartTime={meeting.scheduledStartTime} />
        )}

        {isLive && !isNotStarted && (
          <LiveScreen meeting={meeting} role={role} />
        )}

        {isCompleted && (
          <FullReport meeting={meeting} role={role} workspaceId={workspaceId} members={members} dbActionItems={dbActionItems} />
        )}

        {/* Failed state */}
        {status === "failed" && !isCompleted && (
          <Card className="border-[#fecaca] bg-[#fef2f2] p-6">
            <p className="text-sm font-semibold text-[#991b1b]">
              This meeting recording failed. No report is available.
            </p>
          </Card>
        )}
      </div>
    );
  } catch (err) {
    return (
      <Card className="border-[#fecaca] bg-[#fef2f2] p-6">
        <p className="text-sm font-semibold text-[#991b1b]">
          {err instanceof Error ? err.message : "An unexpected error occurred."}
        </p>
      </Card>
    );
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function WorkspaceMeetingDetailPage({ params }: PageProps) {
  const { workspaceId, meetingId } = await params;

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#6c63ff]" />
        </div>
      }
    >
      <WorkspaceMeetingDetailContent
        workspaceId={workspaceId}
        meetingId={meetingId}
      />
    </Suspense>
  );
}
