export function generateRunTitle(sourceText: string, fallback = "Meeting Summary") {
  const normalized = sourceText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length >= 8);

  const base = normalized ?? sourceText.trim();
  const compact = base.replace(/\s+/g, " ").replace(/^[-*•\d.)\s]+/, "").trim();

  if (!compact) {
    return fallback;
  }

  return compact.length > 72 ? `${compact.slice(0, 69).trimEnd()}...` : compact;
}
