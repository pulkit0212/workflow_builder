export function formatHistoryDateTime(value: string) {
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

export function formatHistoryDate(value: string) {
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

export function formatPreview(run: {
  outputJson: unknown;
  inputJson: unknown;
}) {
  const outputJson =
    run.outputJson !== null &&
    typeof run.outputJson === "object" &&
    !Array.isArray(run.outputJson)
      ? (run.outputJson as Record<string, unknown>)
      : null;
  const inputJson =
    run.inputJson !== null &&
    typeof run.inputJson === "object" &&
    !Array.isArray(run.inputJson)
      ? (run.inputJson as Record<string, unknown>)
      : null;

  const summary = outputJson?.summary;

  if (typeof summary === "string" && summary.trim()) {
    return summary.length > 140 ? `${summary.slice(0, 137).trimEnd()}...` : summary;
  }

  const transcript = inputJson?.transcript;

  if (typeof transcript === "string" && transcript.trim()) {
    const compact = transcript.replace(/\s+/g, " ").trim();
    return compact.length > 140 ? `${compact.slice(0, 137).trimEnd()}...` : compact;
  }

  return "No preview available.";
}
