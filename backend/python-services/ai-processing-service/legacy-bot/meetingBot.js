const { chromium } = require("playwright");
const path = require("path");
const { detectPlatform, getPlatformName, isPlatformSupported } = require("./platforms/index");
const { joinGoogleMeet, watchGoogleMeetEnd } = require("./platforms/googleMeet");
const { joinZoom, watchZoomEnd } = require("./platforms/zoom");
const { joinTeams, watchTeamsEnd } = require("./platforms/teams");

const PROJECT_ROOT = process.cwd();

async function joinMeeting(meetingUrl, meetingId) {
  const platform = detectPlatform(meetingUrl);
  const platformName = getPlatformName(platform);

  console.log(`[Bot] Platform detected: ${platformName}`);
  console.log(`[Bot] Meeting URL: ${meetingUrl}`);

  if (!isPlatformSupported(platform)) {
    return {
      browser: null,
      page: null,
      status: "failed",
      reason: "unsupported_platform",
      message: `${platformName} is not supported yet. Use Google Meet, Zoom, or Teams.`
    };
  }

  const profilePath = path.join(PROJECT_ROOT, "tmp", "bot-profile");

  const browser = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
      "--no-default-browser-check",
      "--use-fake-ui-for-media-stream"
    ],
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
    permissions: ["microphone", "camera"],
    ignoreHTTPSErrors: true
  });

  const page = await browser.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    window.chrome = { runtime: {} };
  });

  let joinResult;

  try {
    switch (platform) {
      case "google":
        joinResult = await joinGoogleMeet(page, meetingUrl);
        break;
      case "zoom":
        joinResult = await joinZoom(page, meetingUrl);
        break;
      case "teams":
        joinResult = await joinTeams(page, meetingUrl);
        break;
      default:
        joinResult = {
          status: "failed",
          reason: "unsupported_platform",
          message: `${platformName} is not supported yet.`
        };
        break;
    }
  } catch (error) {
    console.error(`[Bot] Join error for ${platformName}:`, error instanceof Error ? error.message : error);
    await browser.close();
    return {
      browser: null,
      page: null,
      status: "failed",
      reason: "join_error",
      message: error instanceof Error ? error.message : "Failed to join meeting"
    };
  }

  return { browser, page, platform, platformName, ...joinResult };
}

async function watchMeetingEnd(page, platform, meetingId, onMeetingEnd) {
  console.log(`[Bot] Starting end watcher for ${platform}`);

  const watchFunctions = {
    google: watchGoogleMeetEnd,
    zoom: watchZoomEnd,
    teams: watchTeamsEnd
  };

  const watchFn = watchFunctions[platform] || watchGoogleMeetEnd;

  const kickPatterns = [
    "removed from the meeting",
    "been removed",
    "you were removed",
    "access denied"
  ];

  // Require 2 consecutive end detections to avoid false positives
  let endConfirmCount = 0;

  const checkInterval = setInterval(() => {
    void (async () => {
      try {
        const hasEnded = await watchFn(page);

        if (hasEnded) {
          endConfirmCount++;
          if (endConfirmCount >= 2) {
            console.log("[Bot] Meeting end confirmed (2 consecutive detections)");
            clearInterval(checkInterval);
            onMeetingEnd(meetingId, "ended");
          } else {
            console.log("[Bot] Meeting end detected (waiting for confirmation)");
          }
          return;
        }

        // Reset counter if meeting is still active
        endConfirmCount = 0;

        const bodyText = await page
          .evaluate(() => document.body?.innerText?.toLowerCase() || "")
          .catch(() => "");

        const wasKicked = kickPatterns.some((pattern) => bodyText.includes(pattern));
        if (wasKicked) {
          console.log("[Bot] Bot was kicked");
          clearInterval(checkInterval);
          onMeetingEnd(meetingId, "kicked");
        }
      } catch {
        console.log("[Bot] Page closed — ending meeting");
        clearInterval(checkInterval);
        onMeetingEnd(meetingId, "page_closed");
      }
    })();
  }, 15000); // Check every 15s instead of 30s for faster detection

  return checkInterval;
}

async function leaveMeeting(browser) {
  try {
    await browser.close();
    console.log("[Bot] Browser closed");
  } catch (error) {
    console.error("[Bot] Error closing browser:", error instanceof Error ? error.message : error);
  }
}

module.exports = { joinMeeting, leaveMeeting, watchMeetingEnd };
