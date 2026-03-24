const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const DEFAULT_JOIN_TIMEOUT_MS = 45_000;
const POST_CLICK_SETTLE_MS = 5_000;
const STATE_POLL_INTERVAL_MS = 1_500;

function normalizeText(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function trimForLog(value, maxLength = 1000) {
  const normalized = normalizeText(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

async function getVisibleBodyText(page) {
  try {
    const text = await page.locator("body").innerText({ timeout: 3_000 });
    return normalizeText(text);
  } catch {
    return "";
  }
}

async function getVisibleButtons(page) {
  try {
    const buttons = await page.locator("button").evaluateAll((elements) =>
      elements
        .map((element) => {
          const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
          const aria = (element.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
          return text || aria || "";
        })
        .filter(Boolean)
    );

    return buttons;
  } catch {
    return [];
  }
}

async function getPageDiagnostics(page) {
  const currentUrl = page.url();
  const title = normalizeText(await page.title().catch(() => ""));
  const bodyText = await getVisibleBodyText(page);
  const visibleButtons = await getVisibleButtons(page);

  return {
    currentUrl,
    title,
    bodyText,
    visibleButtons,
  };
}

function classifyPageSurface(bodyText, visibleButtons, currentUrl) {
  const body = bodyText.toLowerCase();
  const buttons = visibleButtons.map((button) => button.toLowerCase());
  const url = (currentUrl || "").toLowerCase();

  if (
    url.includes("accounts.google.com") ||
    body.includes("sign in") ||
    body.includes("choose an account to continue") ||
    buttons.some((button) => button.includes("sign in"))
  ) {
    return "sign-in wall";
  }

  if (
    body.includes("choose an account") ||
    body.includes("use another account") ||
    buttons.some((button) => button.includes("use another account"))
  ) {
    return "account chooser";
  }

  if (
    body.includes("you can't join this video call") ||
    body.includes("you can’t join this video call") ||
    body.includes("access denied") ||
    body.includes("you have been removed") ||
    body.includes("not allowed")
  ) {
    return "access denied";
  }

  if (
    body.includes("meeting not found") ||
    body.includes("the meeting has ended") ||
    body.includes("meeting ended") ||
    body.includes("unable to join") ||
    body.includes("couldn't find")
  ) {
    return "invalid meeting";
  }

  if (
    body.includes("someone will let you in soon") ||
    body.includes("waiting for someone to let you in") ||
    body.includes("you asked to join") ||
    body.includes("ask to join")
  ) {
    return "waiting room";
  }

  if (
    body.includes("join now") ||
    body.includes("ready to join") ||
    buttons.some((button) => button.includes("join now") || button === "join")
  ) {
    return "prejoin screen";
  }

  if (
    body.includes("leave call") ||
    body.includes("end call") ||
    buttons.some((button) => button.includes("leave call") || button.includes("end call"))
  ) {
    return "joined meeting";
  }

  return "unknown";
}

async function logFailureDiagnostics(page, meetingId, matchedFailureTexts = [], reason = "") {
  const diagnostics = await getPageDiagnostics(page);
  const surface = classifyPageSurface(
    diagnostics.bodyText,
    diagnostics.visibleButtons,
    diagnostics.currentUrl
  );

  console.log(`[Bot] Failure diagnostics for ${meetingId}`);
  console.log(`[Bot] Failure reason for ${meetingId}: ${reason || "unknown reason"}`);
  console.log(`[Bot] Failure surface for ${meetingId}: ${surface}`);
  console.log(
    `[Bot] Failure matched text for ${meetingId}: ${
      matchedFailureTexts.length > 0 ? matchedFailureTexts.join(" | ") : "none"
    }`
  );
  console.log(
    `[Bot] Failure page snapshot for ${meetingId}: url="${diagnostics.currentUrl}" title="${diagnostics.title}"`
  );
  console.log(
    `[Bot] Failure visible buttons for ${meetingId}: ${
      diagnostics.visibleButtons.length > 0 ? diagnostics.visibleButtons.join(" | ") : "none"
    }`
  );
  console.log(
    `[Bot] Failure body text for ${meetingId}: ${trimForLog(diagnostics.bodyText, 1000) || "empty"}`
  );
}

async function detectMeetingState(page) {
  const joinedControlSelectors = [
    '[aria-label*="Leave call"]',
    '[aria-label*="End call"]',
    '[data-tooltip-id*="leave"]',
    'button[aria-label*="Leave"]',
    'button[aria-label*="End"]',
  ];

  for (const selector of joinedControlSelectors) {
    try {
      const count = await page.locator(selector).count();
      if (count > 0) {
        return {
          state: "joined",
          reason: `Detected in-call control: ${selector}`,
        };
      }
    } catch {
      continue;
    }
  }

  const bodyText = (await getVisibleBodyText(page)).toLowerCase();

  const waitingIndicators = [
    "someone will let you in soon",
    "ask to join",
    "asking to join",
    "waiting to be let in",
    "waiting for someone to let you in",
    "you asked to join",
  ];

  if (waitingIndicators.some((indicator) => bodyText.includes(indicator))) {
    return {
      state: "waiting_for_admission",
      reason: "Detected waiting-room text on page",
    };
  }

  const failureIndicators = [
    "you can't join this video call",
    "you can’t join this video call",
    "the meeting has ended",
    "meeting ended",
    "meeting not found",
    "no one responded",
    "you have been removed",
    "unable to join",
    "couldn't join",
    "could not join",
    "not allowed",
  ];

  const matchedFailureTexts = failureIndicators.filter((indicator) => bodyText.includes(indicator));

  if (matchedFailureTexts.length > 0) {
    return {
      state: "failed",
      reason: "Detected failure text on page",
      matchedFailureTexts,
    };
  }

  const preJoinIndicators = [
    "join now",
    "ready to join",
    "ask to join",
    "camera",
    "microphone",
  ];

  if (preJoinIndicators.some((indicator) => bodyText.includes(indicator))) {
    return {
      state: "pre_join",
      reason: "Detected pre-join screen text",
    };
  }

  return {
    state: "unknown",
    reason: "Unable to determine meeting state from current heuristics",
  };
}

async function logPageSnapshot(page, meetingId, label) {
  try {
    const diagnostics = await getPageDiagnostics(page);
    console.log(
      `[Bot] ${label} for ${meetingId}: url="${diagnostics.currentUrl}" title="${diagnostics.title}"`
    );
  } catch (error) {
    console.log(
      `[Bot] ${label} for ${meetingId}: unable to read page snapshot (${error instanceof Error ? error.message : "unknown error"})`
    );
  }
}

async function clickFirstAvailable(page, candidates, meetingId) {
  for (const candidate of candidates) {
    try {
      console.log(`[Bot] Trying join selector for ${meetingId}: ${candidate.label}`);

      if (candidate.kind === "role") {
        const locator = page.getByRole("button", { name: candidate.value });
        const count = await locator.count();
        console.log(`[Bot] Selector result for ${meetingId}: ${candidate.label} count=${count}`);
        if (count > 0) {
          await locator.first().click({ timeout: 4_000 });
          console.log(`[Bot] Clicked ${candidate.label} for ${meetingId}`);
          return candidate.label;
        }
      } else {
        const locator = page.locator(candidate.value);
        const count = await locator.count();
        console.log(`[Bot] Selector result for ${meetingId}: ${candidate.label} count=${count}`);
        if (count > 0) {
          await locator.first().click({ timeout: 4_000 });
          console.log(`[Bot] Clicked ${candidate.label} for ${meetingId}`);
          return candidate.label;
        }
      }
    } catch (error) {
      console.log(
        `[Bot] Selector attempt failed for ${meetingId}: ${candidate.label} (${error instanceof Error ? error.message : "unknown error"})`
      );
      continue;
    }
  }

  return null;
}

async function waitForJoinOutcome(page, meetingId, timeoutMs) {
  const startedAt = Date.now();
  console.log(`[Bot] Waiting for join outcome for ${meetingId} with timeout ${timeoutMs}ms`);

  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await detectMeetingState(page);
    console.log(`[Bot] Join state for ${meetingId}: ${snapshot.state} (${snapshot.reason})`);

    if (snapshot.state === "joined") {
      return {
        success: true,
        state: "joined",
        reason: snapshot.reason,
      };
    }

    if (snapshot.state === "failed") {
      await logFailureDiagnostics(
        page,
        meetingId,
        snapshot.matchedFailureTexts || [],
        snapshot.reason
      );
      return {
        success: false,
        state: "failed",
        reason: snapshot.reason,
      };
    }

    await page.waitForTimeout(STATE_POLL_INTERVAL_MS);
  }

  const finalSnapshot = await detectMeetingState(page);
  console.log(
    `[Bot] Final join state after timeout for ${meetingId}: ${finalSnapshot.state} (${finalSnapshot.reason})`
  );

  if (finalSnapshot.state === "waiting_for_admission") {
    console.log(`[Bot] ${meetingId} remained in waiting room until timeout`);
    return {
      success: false,
      state: "waiting_for_admission",
      reason: "Timed out while waiting for host admission",
    };
  }

  if (finalSnapshot.state === "joined") {
    return {
      success: true,
      state: "joined",
      reason: finalSnapshot.reason,
    };
  }

  if (finalSnapshot.state === "failed") {
    await logFailureDiagnostics(
      page,
      meetingId,
      finalSnapshot.matchedFailureTexts || [],
      finalSnapshot.reason
    );
  }

  return {
    success: false,
    state: "failed",
    reason: finalSnapshot.reason || "Timed out waiting for a confirmed join outcome",
  };
}

async function joinMeeting(meetingUrl, meetingId) {
  const profilePath = path.join(process.cwd(), "tmp", "bot-profile");
  fs.mkdirSync(profilePath, { recursive: true });

  console.log("[Bot] Using profile:", profilePath);
  console.log("[Bot] Joining meeting:", meetingUrl);

  const browser = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--no-first-run",
      "--no-default-browser-check",
    ],
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
    permissions: ["microphone", "camera"],
    ignoreHTTPSErrors: true,
  });

  try {
    let page = browser.pages()[0] || null;
    if (!page) {
      page = await browser.newPage();
    }

    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      window.chrome = { runtime: {} };
    });

    await page.goto(meetingUrl, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(4_000);

    const pageTitle = await page.title();
    const pageUrl = page.url();
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 600) || "");

    console.log("[Bot] Page title:", pageTitle);
    console.log("[Bot] Page URL:", pageUrl);
    console.log("[Bot] Body text preview:", bodyText);

    if (
      bodyText.includes("can't join") ||
      bodyText.includes("cannot join") ||
      bodyText.includes("not allowed")
    ) {
      console.error("[Bot] HARD REJECTION: Google Meet rejected the browser.");
      console.error("[Bot] Reason likely: no logged-in account or org policy.");
      console.error("[Bot] Fix: run npm run setup:bot-profile first.");
      await logFailureDiagnostics(page, meetingId, ["meet_access_denied"], "meet_access_denied");
      await browser.close();
      return { browser: null, page: null, status: "failed", reason: "meet_access_denied" };
    }

    try {
      const nameInput = await page.waitForSelector('input[placeholder="Your name"]', { timeout: 5_000 });
      await nameInput.fill("AI Notetaker");
      console.log("[Bot] Name set to: AI Notetaker");
    } catch {
      console.log("[Bot] Name input not found — may already be logged in with account name");
    }

    const joinSelectors = [
      'button:has-text("Join now")',
      'button:has-text("Ask to join")',
      'button:has-text("Join")',
      '[data-promo-anchor-id="join-button"]',
    ];

    let joined = false;
    for (const selector of joinSelectors) {
      try {
        await page.click(selector, { timeout: 4_000 });
        console.log("[Bot] Clicked:", selector);
        joined = true;
        break;
      } catch {
        continue;
      }
    }

    if (!joined) {
      console.error("[Bot] Could not find any join button.");
      const visibleButtons = await page.evaluate(() =>
        Array.from(document.querySelectorAll("button"))
          .map((button) => button.innerText.trim())
          .filter((text) => text)
      );
      console.log("[Bot] Visible buttons:", visibleButtons);
    }

    await page.waitForTimeout(POST_CLICK_SETTLE_MS);
    const afterJoinText = await page.evaluate(() => document.body?.innerText?.substring(0, 400) || "");
    console.log("[Bot] After join text:", afterJoinText);

    const postJoinSnapshot = await detectMeetingState(page);
    if (postJoinSnapshot.state === "failed") {
      await logFailureDiagnostics(
        page,
        meetingId,
        postJoinSnapshot.matchedFailureTexts || [],
        postJoinSnapshot.reason
      );
      return { browser, page, status: "failed", reason: "meet_access_denied" };
    }

    let status = "joined";
    if (afterJoinText.includes("waiting") || afterJoinText.includes("admitted")) {
      status = "waiting_for_admission";
      console.log("[Bot] Status: waiting for host to admit");
    } else if (afterJoinText.includes("can't join") || afterJoinText.includes("denied")) {
      status = "failed";
      console.log("[Bot] Status: failed — access denied");
      await logFailureDiagnostics(page, meetingId, ["meet_access_denied"], "meet_access_denied");
    } else {
      console.log("[Bot] Status: joined meeting");
    }

    if (status === "joined") {
      const outcome = await waitForJoinOutcome(page, meetingId, DEFAULT_JOIN_TIMEOUT_MS);
      if (outcome.state === "waiting_for_admission") {
        return { browser, page, status: "waiting_for_admission", reason: outcome.reason };
      }

      if (outcome.state === "failed") {
        return { browser, page, status: "failed", reason: "meet_access_denied" };
      }
    }

    return { browser, page, status, reason: status === "failed" ? "meet_access_denied" : undefined };
  } catch (error) {
    console.error(`[Bot] Join flow crashed for ${meetingId}:`, error);
    try {
      await browser.close();
    } catch {
      // ignore cleanup errors
    }

    return {
      browser: null,
      page: null,
      status: "failed",
      reason: error instanceof Error ? error.message : "Unknown join error",
    };
  }
}

async function leaveMeeting(browser) {
  try {
    await browser.close();
    console.log("[Bot] Left meeting");
  } catch (error) {
    console.error("[Bot] Error leaving meeting:", error.message);
  }
}

module.exports = { joinMeeting, leaveMeeting };
