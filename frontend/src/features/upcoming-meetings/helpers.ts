import type { UpcomingMeeting, UpcomingMeetingStatus } from "@/features/upcoming-meetings/types";

const STARTING_SOON_WINDOW_MS = 15 * 60 * 1000;

function getTimestamp(value: string) {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

export function getUpcomingMeetingStatus(
  meeting: Pick<UpcomingMeeting, "startTime" | "endTime">,
  now = new Date()
): UpcomingMeetingStatus {
  const startTime = getTimestamp(meeting.startTime);
  const endTime = getTimestamp(meeting.endTime);
  const nowTime = now.getTime();

  if (startTime === null || endTime === null) {
    return "upcoming";
  }

  if (endTime <= nowTime) {
    return "completed";
  }

  if (startTime <= nowTime && nowTime < endTime) {
    return "ongoing";
  }

  if (startTime - nowTime <= STARTING_SOON_WINDOW_MS) {
    return "starting_soon";
  }

  return "upcoming";
}

export function getUpcomingMeetingStatusLabel(status: UpcomingMeetingStatus) {
  switch (status) {
    case "starting_soon":
      return "Starting soon";
    case "ongoing":
      return "Ongoing";
    case "completed":
      return "Completed";
    default:
      return "Upcoming";
  }
}

export function getUpcomingMeetingStatusBadgeVariant(status: UpcomingMeetingStatus) {
  switch (status) {
    case "ongoing":
      return "available" as const;
    case "starting_soon":
      return "pending" as const;
    default:
      return "neutral" as const;
  }
}

export function formatUpcomingMeetingDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function formatUpcomingMeetingTimeRange(meeting: Pick<UpcomingMeeting, "startTime" | "endTime">) {
  const start = new Date(meeting.startTime);
  const end = new Date(meeting.endTime);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Time unavailable";
  }

  const sameDay = start.toDateString() === end.toDateString();
  const startLabel = start.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
  const endLabel = end.toLocaleString("en-US", sameDay ? {
    hour: "numeric",
    minute: "2-digit"
  } : {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

  return `${startLabel} - ${endLabel}`;
}

export function getMinutesUntilMeeting(meeting: Pick<UpcomingMeeting, "startTime">, now = new Date()) {
  const startTime = getTimestamp(meeting.startTime);

  if (startTime === null) {
    return null;
  }

  return Math.max(0, Math.ceil((startTime - now.getTime()) / 60000));
}

export function getNextUpcomingMeeting(meetings: UpcomingMeeting[], now = new Date()) {
  return meetings
    .filter((meeting) => {
      const status = getUpcomingMeetingStatus(meeting, now);

      return status === "starting_soon" || status === "upcoming" || status === "ongoing";
    })
    .sort((left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime())[0] ?? null;
}
