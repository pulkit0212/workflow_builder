import type { MeetingSessionRecord } from "@/features/meeting-assistant/types";
import type { MeetingDetailRecord, MeetingDetailStatus } from "@/features/meetings/types";

export function formatMeetingDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function formatMeetingDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export function formatMeetingTime(value: string | null) {
  if (!value) {
    return "Unavailable";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
}

export function getMeetingSummaryPreview(meeting: Pick<MeetingSessionRecord, "summary" | "transcript">) {
  const summary = meeting.summary?.trim();

  if (summary) {
    return summary.length > 180 ? `${summary.slice(0, 177).trimEnd()}...` : summary;
  }

  const transcript = meeting.transcript?.replace(/\s+/g, " ").trim();

  if (transcript) {
    return transcript.length > 180 ? `${transcript.slice(0, 177).trimEnd()}...` : transcript;
  }

  return "No preview available yet.";
}

export function getMeetingDetailStatusLabel(status: MeetingDetailStatus) {
  switch (status) {
    case "joining":
      return "Joining";
    case "waiting_for_join":
      return "Preparing to Join";
    case "joined":
      return "Joined";
    case "capturing":
      return "Capturing";
    case "processing":
      return "Processing";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return "Scheduled";
  }
}

export function getMeetingDetailStatusBadgeVariant(status: MeetingDetailStatus) {
  switch (status) {
    case "completed":
      return "available" as const;
    case "joining":
    case "waiting_for_join":
      return "info" as const;
    case "joined":
    case "capturing":
    case "processing":
      return "pending" as const;
    default:
      return "neutral" as const;
  }
}

export function mapMeetingSessionToDetailStatus(status: MeetingSessionRecord["status"]): MeetingDetailStatus {
  if (status.startsWith("waiting_for_")) {
    return "waiting_for_join";
  }

  switch (status) {
    case "joining":
      return "joining";
    case "waiting_for_join":
      return "waiting_for_join";
    case "joined":
      return "joined";
    case "capturing":
    case "recording":
    case "recorded":
      return "capturing";
    case "processing":
    case "processing_transcript":
    case "processing_summary":
    case "transcribed":
      return "processing";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    default:
      return "scheduled";
  }
}

export function hasProcessedMeetingContent(meeting: Pick<MeetingDetailRecord, "transcript" | "summary" | "keyPoints" | "actionItems">) {
  return Boolean(
    meeting.transcript?.trim() ||
      meeting.summary?.trim() ||
      meeting.keyPoints.length > 0 ||
      meeting.actionItems.length > 0
  );
}
