import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";
import { listMeetingSessionsByUser } from "@/lib/db/queries/meeting-sessions";
import { canUseActionItems } from "@/lib/subscription";
import { getUserSubscription } from "@/lib/subscription.server";

type ActionItemsTab = "all" | "high_priority" | "my_items" | "this_week";

type ActionItemRecord = {
  id: string;
  task: string;
  owner: string;
  dueDate: string;
  priority: string;
  completed: boolean;
  meetingId: string;
  meetingTitle: string;
  createdAt: string;
};

function normalizeTab(value: string | null): ActionItemsTab {
  switch (value) {
    case "high_priority":
    case "my_items":
    case "this_week":
      return value;
    default:
      return "all";
  }
}

function normalizePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (Number.isNaN(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

function isWithinLastWeek(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  return date >= sevenDaysAgo;
}

function buildActionItemsFilter(tab: ActionItemsTab, firstName: string) {
  const normalizedFirstName = firstName.trim().toLowerCase();

  return (item: ActionItemRecord) => {
    switch (tab) {
      case "high_priority":
        return item.priority.toLowerCase() === "high";
      case "my_items":
        return normalizedFirstName ? item.owner.toLowerCase().includes(normalizedFirstName) : false;
      case "this_week":
        return isWithinLastWeek(item.createdAt);
      default:
        return true;
    }
  };
}

export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const subscription = await getUserSubscription(user.clerkUserId);

    if (!canUseActionItems(subscription.plan)) {
      return apiError("Action items require Pro or Elite plan.", 403, {
        error: "upgrade_required",
        currentPlan: subscription.plan
      });
    }

    const { searchParams } = new URL(request.url);
    const page = normalizePositiveInteger(searchParams.get("page"), 1);
    const limit = normalizePositiveInteger(searchParams.get("limit"), 10);
    const tab = normalizeTab(searchParams.get("tab"));
    const firstName = searchParams.get("firstName") ?? "";

    const meetings = await listMeetingSessionsByUser(user.id, {
      completedOnly: true
    });

    const items = meetings
      .flatMap((meeting) =>
        (Array.isArray(meeting.actionItems) ? meeting.actionItems : []).map((item, index) => ({
          id: `${meeting.id}-${index}`,
          task: item.task,
          owner: item.owner || "Unassigned",
          dueDate: item.dueDate || item.deadline || "Not specified",
          priority: item.priority || "Medium",
          completed: item.completed ?? false,
          meetingId: meeting.id,
          meetingTitle: meeting.title,
          createdAt: meeting.updatedAt.toISOString()
        }))
      )
      .filter(buildActionItemsFilter(tab, firstName))
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

    const total = items.length;
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const currentPage = Math.min(page, totalPages);
    const startIndex = (currentPage - 1) * limit;

    return apiSuccess({
      success: true,
      items: items.slice(startIndex, startIndex + limit),
      pagination: {
        total,
        page: currentPage,
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

    return apiError(error instanceof Error ? error.message : "Failed to load action items.", 500);
  }
}
