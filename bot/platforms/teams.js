const BOT_NAME = process.env.BOT_NAME || "AI Notetaker";

async function joinTeams(page, meetingUrl) {
  console.log("[Teams] Navigating to:", meetingUrl);

  await page.goto(meetingUrl, {
    waitUntil: "networkidle",
    timeout: 30000
  });
  await page.waitForTimeout(5000);

  const browserSelectors = [
    "text=Continue on this browser",
    "text=Join on the web instead",
    "text=Use the web app",
    '[data-tid="joinOnWeb"]'
  ];

  for (const selector of browserSelectors) {
    try {
      await page.click(selector, { timeout: 4000 });
      await page.waitForTimeout(3000);
      console.log("[Teams] Clicked browser option:", selector);
      break;
    } catch {
      continue;
    }
  }

  try {
    const nameSelectors = [
      'input[placeholder="Type your name"]',
      'input[placeholder="Enter name"]',
      'input[data-tid="prejoin-display-name-input"]',
      'input[type="text"]'
    ];

    for (const selector of nameSelectors) {
      try {
        await page.fill(selector, BOT_NAME, { timeout: 3000 });
        console.log("[Teams] Name filled:", BOT_NAME);
        break;
      } catch {
        continue;
      }
    }
  } catch {
    console.log("[Teams] Could not fill name");
  }

  try {
    const toggleSelectors = [
      '[data-tid="toggle-video"]',
      '[data-tid="toggle-mute"]',
      'button[aria-label*="camera"]',
      'button[aria-label*="microphone"]'
    ];

    for (const selector of toggleSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          await button.click();
        }
      } catch {}
    }
  } catch {}

  const joinSelectors = [
    'button:has-text("Join now")',
    'button:has-text("Join meeting")',
    'button:has-text("Join")',
    '[data-tid="prejoin-join-button"]',
    'button[data-tid="joinOnWeb"]'
  ];

  for (const selector of joinSelectors) {
    try {
      await page.click(selector, { timeout: 4000 });
      console.log("[Teams] Clicked join:", selector);
      break;
    } catch {
      continue;
    }
  }

  await page.waitForTimeout(6000);

  const afterText = await page.evaluate(() => document.body?.innerText?.toLowerCase() || "");

  if (
    afterText.includes("lobby") ||
    afterText.includes("waiting") ||
    afterText.includes("someone will admit you")
  ) {
    console.log("[Teams] In lobby");
    return { status: "waiting_for_admission" };
  }

  if (afterText.includes("leave") || afterText.includes("mute") || afterText.includes("participants")) {
    console.log("[Teams] Successfully joined");
    return { status: "joined" };
  }

  return { status: "joined" };
}

async function watchTeamsEnd(page) {
  const endPatterns = ["meeting ended", "call ended", "you left the meeting", "this call has ended"];

  try {
    const bodyText = await page.evaluate(() => document.body?.innerText?.toLowerCase() || "");
    return endPatterns.some((pattern) => bodyText.includes(pattern));
  } catch {
    return true;
  }
}

module.exports = { joinTeams, watchTeamsEnd };
