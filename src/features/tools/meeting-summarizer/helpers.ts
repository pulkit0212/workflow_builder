export function getTranscriptGuidance(transcript: string) {
  const length = transcript.trim().length;

  if (length === 0) {
    return "Paste a transcript with enough context for summarization, decisions, and follow-up tasks.";
  }

  if (length < 80) {
    return "Add more detail. Short snippets usually do not produce reliable summaries.";
  }

  if (length < 300) {
    return "Enough content to summarize, but fuller transcripts produce better action items.";
  }

  return "Good input length. The model should have enough context for summary, key points, and actions.";
}

export function formatMeetingRunTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Saved just now";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}
