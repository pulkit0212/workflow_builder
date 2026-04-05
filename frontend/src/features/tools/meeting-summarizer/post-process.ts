import type { MeetingActionItem, MeetingSummarizerOutput } from "@/features/tools/meeting-summarizer/types";

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeTask(task: string) {
  return normalizeWhitespace(task)
    .replace(/^[*-]\s*/, "")
    .replace(/\.$/, "");
}

function normalizeOwner(owner: string) {
  return normalizeWhitespace(owner).replace(/^(owner|assigned to|with)\s+/i, "");
}

function normalizeDeadline(deadline: string) {
  return normalizeWhitespace(deadline).replace(/^(by|before|on|for)\s+/i, "");
}

function taskSimilarityKey(item: MeetingActionItem) {
  return normalizeTask(item.task)
    .toLowerCase()
    .replace(/\b(the|a|an|please|kindly)\b/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickPreferredActionItem(current: MeetingActionItem, candidate: MeetingActionItem) {
  const currentScore = Number(Boolean(normalizeOwner(current.owner))) + Number(Boolean(normalizeDeadline(current.deadline)));
  const candidateScore = Number(Boolean(normalizeOwner(candidate.owner))) + Number(Boolean(normalizeDeadline(candidate.deadline)));

  return candidateScore > currentScore ? candidate : current;
}

function dedupeActionItems(items: MeetingActionItem[]) {
  const deduped = new Map<string, MeetingActionItem>();

  for (const item of items) {
    const normalizedItem: MeetingActionItem = {
      task: normalizeTask(item.task),
      owner: normalizeOwner(item.owner),
      deadline: normalizeDeadline(item.deadline),
      dueDate: normalizeDeadline(item.dueDate || item.deadline),
      priority: item.priority ?? "Medium",
      completed: item.completed ?? false
    };

    if (!normalizedItem.task) {
      continue;
    }

    const key = taskSimilarityKey(normalizedItem);
    const existing = deduped.get(key);

    if (!existing) {
      deduped.set(key, normalizedItem);
      continue;
    }

    deduped.set(key, pickPreferredActionItem(existing, normalizedItem));
  }

  return [...deduped.values()];
}

export function normalizeMeetingSummarizerOutput(output: MeetingSummarizerOutput): MeetingSummarizerOutput {
  return {
    summary: normalizeWhitespace(output.summary),
    key_points: output.key_points.map((item) => normalizeWhitespace(item)).filter(Boolean),
    action_items: dedupeActionItems(output.action_items)
  };
}
