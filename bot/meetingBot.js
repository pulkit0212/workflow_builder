const { chromium } = require("playwright");

async function joinMeeting(meetingUrl, meetingId) {
  console.log(`[Bot] Joining meeting ${meetingId}: ${meetingUrl}`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--disable-web-security",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  const context = await browser.newContext({
    permissions: ["microphone", "camera"],
  });

  const page = await context.newPage();

  await page.goto(meetingUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);

  try {
    const nameInput = await page.$('input[placeholder="Your name"]');
    if (nameInput) {
      await nameInput.fill("AI Notetaker");
    }
  } catch (error) {
    console.log("[Bot] Name input not found, continuing...");
  }

  try {
    const joinSelectors = [
      'button:has-text("Join now")',
      'button:has-text("Ask to join")',
      'button:has-text("Join")',
      '[data-promo-anchor-id="join-button"]',
    ];

    for (const selector of joinSelectors) {
      try {
        await page.click(selector, { timeout: 3000 });
        console.log(`[Bot] Clicked join button for ${meetingId}: ${selector}`);
        break;
      } catch {
        continue;
      }
    }
  } catch (error) {
    console.log("[Bot] Could not find a join button, continuing...");
  }

  console.log(`[Bot] Joined meeting ${meetingId}`);
  return { browser, page };
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
