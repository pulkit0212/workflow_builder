import type { MeetingSessionProvider, MeetingSessionStatus } from "@/features/meeting-assistant/types";
import type { MeetingActionItem } from "@/features/tools/meeting-summarizer/types";

export function normalizeMeetingActionItems(items: MeetingActionItem[] | null | undefined) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item) => ({
    task: item.task,
    owner: item.owner || "",
    deadline: item.deadline || item.dueDate || "",
    dueDate: item.dueDate || item.deadline || "",
    priority: item.priority || "Medium",
    completed: item.completed ?? false
  }));
}

export function getMeetingSessionStatusLabel(status: MeetingSessionStatus) {
  switch (status) {
    case "joining":
      return "Joining";
    case "waiting_for_join":
      return "Preparing...";
    case "waiting_for_admission":
      return "Waiting";
    case "joined":
      return "Joined";
    case "capturing":
      return "Recording";
    case "processing_transcript":
      return "Processing";
    case "processing_summary":
      return "Processing";
    case "processing":
      return "Processing";
    case "summarizing":
      return "Summarizing";
    case "failed":
      return "Failed";
    case "recording":
      return "Recording";
    case "recorded":
      return "Recorded";
    case "transcribed":
      return "Transcript Ready";
    case "completed":
      return "Completed";
    default:
      return "Draft";
  }
}

export function getMeetingSessionStatusBadgeVariant(status: MeetingSessionStatus) {
  switch (status) {
    case "completed":
      return "available" as const;
    case "joining":
    case "waiting_for_join":
      return "info" as const;
    case "waiting_for_admission":
      return "pending" as const;
    case "joined":
      return "neutral" as const;
    case "capturing":
      return "available" as const;
    case "processing_transcript":
    case "processing_summary":
    case "processing":
    case "recording":
    case "recorded":
    case "transcribed":
      return "info" as const;
    case "summarizing":
      return "accent" as const;
    case "failed":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

export function getMeetingSessionProviderLabel(provider: MeetingSessionProvider) {
  switch (provider) {
    case "zoom_web":
      return "Zoom";
    case "teams_web":
      return "Microsoft Teams";
    default:
      return "Google Meet";
  }
}

export function buildActionItemsClipboardText(items: MeetingActionItem[]) {
  if (items.length === 0) {
    return "No action items.";
  }

  return items
    .map((item, index) => {
      const metadata = [
        item.owner ? `owner: ${item.owner}` : null,
        (item.dueDate || item.deadline) ? `deadline: ${item.dueDate || item.deadline}` : null,
        item.priority ? `priority: ${item.priority}` : null,
        item.completed ? "completed" : "open"
      ]
        .filter(Boolean)
        .join(" | ");

      return `${index + 1}. ${item.task}${metadata ? ` (${metadata})` : ""}`;
    })
    .join("\n");
}

export async function copyTextToClipboard(text: string) {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard access is not available in this browser.");
  }

  await navigator.clipboard.writeText(text);
}
