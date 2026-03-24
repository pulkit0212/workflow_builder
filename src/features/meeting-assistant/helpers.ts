import type { MeetingSessionProvider, MeetingSessionStatus } from "@/features/meeting-assistant/types";
import type { MeetingActionItem } from "@/features/tools/meeting-summarizer/types";

export function normalizeMeetingActionItems(items: MeetingActionItem[] | null | undefined) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item) => ({
    task: item.task,
    owner: item.owner || "",
    deadline: item.deadline || "",
    completed: item.completed ?? false
  }));
}

export function getMeetingSessionStatusLabel(status: MeetingSessionStatus) {
  switch (status) {
    case "joining":
      return "Joining";
    case "waiting_for_join":
      return "Waiting to Join";
    case "joined":
      return "Joined";
    case "capturing":
      return "Capturing";
    case "processing_transcript":
      return "Processing Transcript";
    case "processing_summary":
      return "Processing Summary";
    case "processing":
      return "Processing";
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
      return "pending" as const;
    case "joined":
    case "capturing":
    case "processing_transcript":
    case "processing_summary":
    case "processing":
    case "recording":
    case "recorded":
    case "transcribed":
      return "pending" as const;
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
        item.deadline ? `deadline: ${item.deadline}` : null,
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
