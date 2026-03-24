import type { MeetingActionItem } from "@/features/tools/meeting-summarizer/types";

type BuildMeetingFollowUpPromptInput = {
  title: string;
  summary: string;
  keyPoints: string[];
  actionItems: MeetingActionItem[];
};

function formatActionItems(items: MeetingActionItem[]) {
  if (items.length === 0) {
    return "- No explicit action items were captured.";
  }

  return items
    .map((item) => {
      const metadata = [
        item.owner ? `Owner: ${item.owner}` : null,
        item.deadline ? `Deadline: ${item.deadline}` : null
      ]
        .filter(Boolean)
        .join(", ");

      return metadata ? `- ${item.task} (${metadata})` : `- ${item.task}`;
    })
    .join("\n");
}

export function buildMeetingFollowUpPrompt(input: BuildMeetingFollowUpPromptInput) {
  return [
    "Write a professional, concise follow-up email after a meeting.",
    "Return plain text only. Do not use markdown fences.",
    "Use this structure:",
    "1. Greeting",
    "2. Brief meeting summary",
    "3. Key points discussed",
    "4. Action items / next steps",
    "5. Professional closing",
    "",
    "Tone requirements:",
    "- Professional and clear",
    "- Concise but useful",
    "- Suitable to send directly after light editing",
    "",
    `Meeting title: ${input.title}`,
    "",
    "Summary:",
    input.summary,
    "",
    "Key points:",
    ...input.keyPoints.map((item) => `- ${item}`),
    "",
    "Action items:",
    formatActionItems(input.actionItems),
    "",
    "Write the final email now."
  ].join("\n");
}
