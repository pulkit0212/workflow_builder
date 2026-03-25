import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { listMeetingSessionsByUser } from "@/lib/db/queries/meeting-sessions";
import { toMeetingSessionRecord } from "@/features/meeting-assistant/server/session-record";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";

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
    const meetings = await listMeetingSessionsByUser(user.id, {
      excludeDrafts: true
    });
    const normalized = meetings.map(toMeetingSessionRecord);
    const recordingStatuses = getRecordingStatuses();
    const now = Date.now();

    const filtered = normalized.filter((meeting) => {
      const statusMatch =
        status === "all" ||
        (status === "completed" && meeting.status === "completed") ||
        (status === "failed" && meeting.status === "failed") ||
        (status === "recording" && recordingStatuses.has(meeting.status));

      const searchMatch =
        search.length === 0 ||
        meeting.title.toLowerCase().includes(search) ||
        (meeting.summary || "").toLowerCase().includes(search) ||
        (meeting.failureReason || "").toLowerCase().includes(search);

      const referenceDate = new Date(meeting.scheduledStartTime ?? meeting.createdAt).getTime();
      const dateMatch =
        dateFilter === "all" ||
        (dateFilter === "week" && referenceDate >= now - 7 * 24 * 60 * 60 * 1000) ||
        (dateFilter === "month" && referenceDate >= now - 30 * 24 * 60 * 60 * 1000);

      return statusMatch && searchMatch && dateMatch;
    });

    const total = filtered.length;
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const start = (page - 1) * limit;
    const paginated = filtered.slice(start, start + limit);

    return apiSuccess({
      meetings: paginated,
      pagination: {
        total,
        page,
        limit,
        totalPages
      }
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
