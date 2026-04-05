function detectPlatform(meetingUrl) {
  if (!meetingUrl) return "unknown";

  const url = meetingUrl.toLowerCase();

  if (url.includes("meet.google.com")) return "google";
  if (url.includes("zoom.us") || url.includes("zoom.com")) return "zoom";
  if (url.includes("teams.microsoft.com")) return "teams";
  if (url.includes("teams.live.com")) return "teams";
  if (url.includes("webex.com")) return "webex";

  return "unknown";
}

function getPlatformName(platform) {
  const names = {
    google: "Google Meet",
    zoom: "Zoom",
    teams: "Microsoft Teams",
    webex: "Webex",
    unknown: "Unknown Platform"
  };

  return names[platform] || "Unknown";
}

function isPlatformSupported(platform) {
  return ["google", "zoom", "teams"].includes(platform);
}

module.exports = { detectPlatform, getPlatformName, isPlatformSupported };
