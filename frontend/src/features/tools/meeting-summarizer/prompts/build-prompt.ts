import type { MeetingAiProvider } from "@/features/tools/meeting-summarizer/types";

export function buildMeetingSummarizerPrompt(input: {
  provider: MeetingAiProvider;
  transcript: string;
}) {
  return [
    "You analyze meeting transcripts for an AI workflow product.",
    `Selected provider context: ${input.provider}.`,
    "Return a concise, factual summary of the meeting.",
    "Extract key discussion points as short standalone strings.",
    "Scan the full transcript from start to finish before answering.",
    "Pay special attention to recap, wrap-up, closing, and last-mile planning sections near the end of the meeting.",
    "Extract action items from explicit commitments and clearly implied next steps.",
    'Treat phrases like "I\'ll", "I will", "we will", "can you", "please", "need to", "follow up", "send", "share", "review", "finalize", "by Friday", "next week", and "tomorrow afternoon" as strong action-item signals when they refer to concrete work.',
    'Treat direct assignments like "Rahul will", "Maya can take", "Neha owns", "Arjun to review", and "assigned to Maya" as clear action items.',
    "Prefer completeness over being overly selective when tasks are clearly assigned or committed.",
    "If a person commits to doing something, include it as an action item.",
    "Capture all clearly assigned tasks, not just the first few.",
    "Look for tasks repeated or clarified during recap sections and include them once in the final action_items list.",
    'Set "owner" and "deadline" only when they are clearly stated in the transcript.',
    'If a deadline is stated, preserve it exactly as written in the transcript.',
    'If owner or deadline are not clear, return empty strings for those fields.',
    "Do not invent attendees, decisions, dates, or owners.",
    "Return valid JSON only.",
    "Do not include markdown.",
    "Do not include commentary before or after the JSON.",
    "Use this exact JSON schema and key names:",
    '{',
    '  "summary": "string",',
    '  "key_points": ["string"],',
    '  "action_items": [',
    '    {',
    '      "task": "string",',
    '      "owner": "string",',
    '      "deadline": "string"',
    "    }",
    "  ]",
    "}",
    "Requirements:",
    "- summary: 2 to 4 sentences",
    "- key_points: 3 to 6 items when enough information exists",
    "- action_items: include every clear task commitment you can find",
    "- action_items: preserve chronological clarity when it helps",
    "- action_items: deduplicate repeated or near-duplicate tasks",
    "- action_items: include tasks mentioned in recap or closing discussion even if they appear late in the transcript",
    "- action_items: [] if no clear actions are present",
    "",
    "Meeting transcript:",
    input.transcript
  ].join("\n");
}
