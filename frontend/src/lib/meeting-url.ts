/**
 * Normalize meeting URLs for deduplication across supported platforms.
 * Returns a canonical string key for Google Meet, Zoom, and Teams URLs.
 * Returns null for unrecognized URLs (no bot support).
 *
 * - Google Meet: `meet.google.com/{code}` (strips query params)
 * - Zoom:        `zoom.us/j/{id}` (strips query params)
 * - Teams:       `teams.microsoft.com/l/meetup-join/{encodedContext}` (strips query params)
 */
export function normalizeMeetingUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim());

    // Google Meet: meet.google.com/{code}
    if (parsed.hostname === "meet.google.com") {
      const segments = parsed.pathname.split("/").filter(Boolean);
      const code = segments[0]?.trim() ?? "";
      return `meet.google.com/${code}`.toLowerCase();
    }

    // Zoom: zoom.us/j/{meetingId}
    if (parsed.hostname === "zoom.us" || parsed.hostname.endsWith(".zoom.us")) {
      const segments = parsed.pathname.split("/").filter(Boolean);
      if (segments[0] === "j" && segments[1]) {
        return `zoom.us/j/${segments[1]}`.toLowerCase();
      }
      return null;
    }

    // Microsoft Teams: teams.microsoft.com/l/meetup-join/...
    if (parsed.hostname === "teams.microsoft.com") {
      const segments = parsed.pathname.split("/").filter(Boolean);
      if (segments[0] === "l" && segments[1] === "meetup-join" && segments[2]) {
        return `teams.microsoft.com/l/meetup-join/${segments[2]}`.toLowerCase();
      }
      return null;
    }

    return null;
  } catch {
    return null;
  }
}

export function isGoogleMeetUrl(url: string): boolean {
  try {
    return new URL(url.trim()).hostname === "meet.google.com";
  } catch {
    return false;
  }
}
