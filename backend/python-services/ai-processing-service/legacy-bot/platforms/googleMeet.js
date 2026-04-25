const BOT_NAME = process.env.BOT_NAME || "AI Notetaker";

async function joinGoogleMeet(page, meetingUrl) {
  console.log("[GoogleMeet] Navigating to:", meetingUrl);

  await page.goto(meetingUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });
  await page.waitForTimeout(4000);

  const pageTitle = await page.title();
  const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 800) || "");

  console.log("[GoogleMeet] Page title:", pageTitle);

  const rejectionPatterns = [
    "can't join this video call",
    "cannot join",
    "you are not allowed",
    "meeting not found",
    "invalid meeting"
  ];

  for (const pattern of rejectionPatterns) {
    if (bodyText.toLowerCase().includes(pattern)) {
      console.error("[GoogleMeet] Access denied:", pattern);
      return {
        status: "failed",
        reason: "meet_access_denied",
        message: "Run npm run setup:bot-profile to configure bot access"
      };
    }
  }

  try {
    const nameInput = await page.waitForSelector('input[placeholder="Your name"]', {
      timeout: 5000
    });
    await nameInput.fill(BOT_NAME);
    console.log("[GoogleMeet] Name set:", BOT_NAME);
  } catch {
    console.log("[GoogleMeet] Name input not found — using account name");
  }

  try {
    const micBtn = await page.$('[data-is-muted="false"][aria-label*="microphone"]');
    if (micBtn) await micBtn.click();

    const camBtn = await page.$('[data-is-muted="false"][aria-label*="camera"]');
    if (camBtn) await camBtn.click();
  } catch {
    console.log("[GoogleMeet] Could not mute mic/camera");
  }

  const joinSelectors = [
    'button:has-text("Join now")',
    'button:has-text("Ask to join")',
    'button:has-text("Join")',
    '[data-promo-anchor-id="join-button"]'
  ];

  let joined = false;
  for (const selector of joinSelectors) {
    try {
      await page.click(selector, { timeout: 4000 });
      console.log("[GoogleMeet] Clicked:", selector);
      joined = true;
      break;
    } catch {
      continue;
    }
  }

  if (!joined) {
    const buttons = await page.evaluate(() =>
      Array.from(document.querySelectorAll("button"))
        .map((button) => button.innerText.trim())
        .filter((text) => text)
    );
    console.log("[GoogleMeet] Visible buttons:", buttons);
  }

  await page.waitForTimeout(5000);

  const afterText = await page.evaluate(() => document.body?.innerText?.toLowerCase() || "");

  if (
    afterText.includes("waiting") ||
    afterText.includes("ask to be let in") ||
    afterText.includes("someone will let you in")
  ) {
    return { status: "waiting_for_admission" };
  }

  if (afterText.includes("can't join") || afterText.includes("denied")) {
    return { status: "failed", reason: "meet_access_denied" };
  }

  console.log("[GoogleMeet] Successfully joined");
  return { status: "joined" };
}

async function watchGoogleMeetEnd(page) {
  const endPatterns = [
    "meeting ended",
    "left the meeting",
    "the meeting has ended",
    "return to home screen",
    "you've left",
    "call ended"
  ];

  const bodyText = await page.evaluate(() => document.body?.innerText?.toLowerCase() || "");

  return endPatterns.some((pattern) => bodyText.includes(pattern));
}

module.exports = { joinGoogleMeet, watchGoogleMeetEnd };
