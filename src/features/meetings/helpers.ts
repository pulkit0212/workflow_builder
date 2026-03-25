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
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
}

export function formatMeetingDuration(value: number | null | undefined) {
  if (!value || value <= 0) {
    return null;
  }

  const totalMinutes = Math.round(value / 60);

  if (totalMinutes < 60) {
    return `${Math.max(totalMinutes, 1)} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
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
    case "waiting_for_join":
      return "Preparing...";
    case "waiting_for_admission":
      return "Waiting";
    case "capturing":
      return "Recording";
    case "processing":
      return "Processing";
    case "summarizing":
      return "Summarizing";
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
    case "waiting_for_join":
      return "info" as const;
    case "waiting_for_admission":
      return "pending" as const;
    case "capturing":
      return "available" as const;
    case "processing":
      return "info" as const;
    case "summarizing":
      return "accent" as const;
    case "joining":
    case "joined":
      return "neutral" as const;
    case "failed":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

export function mapMeetingSessionToDetailStatus(status: MeetingSessionRecord["status"]): MeetingDetailStatus {
  switch (status) {
    case "waiting_for_join":
      return "waiting_for_join";
    case "waiting_for_admission":
      return "waiting_for_admission";
    case "joined":
    case "joining":
      return "waiting_for_join";
    case "capturing":
    case "recording":
    case "recorded":
      return "capturing";
    case "processing":
    case "processing_transcript":
    case "processing_summary":
    case "transcribed":
      return "processing";
    case "summarizing":
      return "summarizing";
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
