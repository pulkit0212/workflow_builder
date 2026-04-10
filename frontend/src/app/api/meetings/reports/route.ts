import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { listMeetingSessionsByUserPaginated } from "@/lib/db/queries/meeting-sessions";
import { toMeetingSessionRecord } from "@/features/meeting-assistant/server/session-record";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";
import { canUseHistory } from "@/lib/subscription";
import { getUserSubscription } from "@/lib/subscription.server";
import { resolveWorkspaceIdForRequest } from "@/lib/workspaces/server";

type ReportStatusFilter = "all" | "completed" | "recording" | "failed";
type ReportDateFilter = "all" | "week" | "month";

function getRecordingStatuses() {
  return new Set([
    "joining",
    "waiting_for_join",
    "waiting_for_admission",
    "joined",
    "capturing",
    "recording",
    "recorded",
    "processing_transcript",
    "transcribed",
    "processing_summary",
    "processing",
    "summarizing"
  ]);
}

export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(Number.parseInt(searchParams.get("page") || "1", 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(searchParams.get("limit") || "6", 10) || 6, 1), 50);
  const status = (searchParams.get("status") || "all") as ReportStatusFilter;
  const search = (searchParams.get("search") || "").trim().toLowerCase();
  const dateFilter = (searchParams.get("date") || "all") as ReportDateFilter;

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const workspaceId = await resolveWorkspaceIdForRequest(request, user.id);
    const subscription = await getUserSubscription(user.clerkUserId);

    if (!canUseHistory(subscription.plan)) {
      return apiError("Meeting history requires Pro or Elite plan.", 403, {
        error: "upgrade_required",
        currentPlan: subscription.plan
      });
    }

    const recordingStatuses = getRecordingStatuses();
    const now = Date.now();

    // Build DB-level filters
    let statuses: string[] | undefined;
    if (status === "completed") {
      statuses = ["completed"];
    } else if (status === "failed") {
      statuses = ["failed"];
    } else if (status === "recording") {
      statuses = [...recordingStatuses];
    }

    let dateFrom: Date | undefined;
    if (dateFilter === "week") {
      dateFrom = new Date(now - 7 * 24 * 60 * 60 * 1000);
    } else if (dateFilter === "month") {
      dateFrom = new Date(now - 30 * 24 * 60 * 60 * 1000);
    }

    const result = await listMeetingSessionsByUserPaginated(user.id, workspaceId ?? null, {
      page,
      limit,
      excludeDrafts: true,
      requireApprovedForWorkspace: true, // only show explicitly shared meetings in workspace mode
      statuses,
      search: search.length > 0 ? search : undefined,
      dateFrom
    });

    const paginated = result.sessions.map(toMeetingSessionRecord);

    return apiSuccess({
      meetings: paginated,
      pagination: result.pagination
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return apiError(
        "Your database tables are not set up yet. Run your database migrations, then try again.",
        503
      );
    }

    return apiError(error instanceof Error ? error.message : "Failed to load meeting reports.", 500);
  }
}
