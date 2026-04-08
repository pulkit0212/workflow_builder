import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { ClipboardList, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/shared/section-header";
import { EmptyState } from "@/components/shared/empty-state";
import { db } from "@/lib/db/client";
import { workspaceMembers } from "@/db/schema";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { RequestActions } from "./request-actions";

type MoveRequest = {
  id: string;
  meetingId: string;
  workspaceId: string;
  requestedBy: string;
  status: string;
  adminNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  meetingTitle: string | null;
  requestedByName: string | null;
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

function RequestCard({
  request,
  workspaceId,
}: {
  request: MoveRequest;
  workspaceId: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 transition-all hover:border-sky-200 hover:bg-white">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <p className="text-base font-semibold text-slate-950">
            {request.meetingTitle ?? "Untitled meeting"}
          </p>
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
            <span>
              Requested by{" "}
              <span className="font-medium text-slate-700">
                {request.requestedByName ?? request.requestedBy.slice(0, 8) + "…"}
              </span>
            </span>
            <span>·</span>
            <span>{formatDate(request.createdAt)}</span>
          </div>
        </div>
      </div>

      <RequestActions requestId={request.id} workspaceId={workspaceId} />
    </div>
  );
}

async function RequestsList({ workspaceId }: { workspaceId: string }) {
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

  let requests: MoveRequest[] = [];
  let errorMessage: string | null = null;

  try {
    const res = await fetch(
      `${baseUrl}/api/workspace/${workspaceId}/move-requests`,
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
      | { success: true; moveRequests: MoveRequest[] }
      | { success: false; message?: string };

    if (!res.ok || !payload.success) {
      errorMessage =
        "message" in payload
          ? (payload.message ?? "Failed to load requests.")
          : "Failed to load requests.";
    } else {
      requests = payload.moveRequests;
    }
  } catch (err) {
    errorMessage =
      err instanceof Error ? err.message : "Failed to load requests.";
  }

  if (errorMessage) {
    return (
      <Card className="border-[#fecaca] bg-[#fef2f2] p-6">
        <p className="text-sm font-semibold text-[#991b1b]">
          Unable to load requests
        </p>
        <p className="mt-1 text-sm text-[#991b1b]">{errorMessage}</p>
      </Card>
    );
  }

  if (requests.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No pending requests"
        description="Move requests submitted by workspace members will appear here."
      />
    );
  }

  return (
    <div className="space-y-4">
      {requests.map((request) => (
        <RequestCard key={request.id} request={request} workspaceId={workspaceId} />
      ))}
    </div>
  );
}

export default async function MoveRequestsPage({ params }: PageProps) {
  const { workspaceId } = await params;

  // Admin-only: check role and redirect non-admins
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in" as Route);
  }

  try {
    await ensureDatabaseReady();

    if (db) {
      const user = await syncCurrentUserToDatabase(userId);

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

      if (!membership || !["admin", "owner"].includes(membership.role)) {
        redirect(`/dashboard/workspace/${workspaceId}` as Route);
      }
    }
  } catch {
    // If DB check fails, let the inner component handle it
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Workspace"
        title="Move Requests"
        description="Review and approve or reject pending meeting move requests."
      />

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-[#6c63ff]" />
          </div>
        }
      >
        <RequestsList workspaceId={workspaceId} />
      </Suspense>
    </div>
  );
}
