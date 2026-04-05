const BOT_NAME = process.env.BOT_NAME || "AI Notetaker";

async function joinZoom(page, meetingUrl) {
  console.log("[Zoom] Navigating to:", meetingUrl);

  let webUrl = meetingUrl;
  if (meetingUrl.includes("zoom.us/j/")) {
    const meetingId = meetingUrl.match(/\/j\/(\d+)/)?.[1];
    const pwd = new URL(meetingUrl).searchParams.get("pwd") || "";
    webUrl = `https://app.zoom.us/wc/${meetingId}/join${pwd ? `?pwd=${pwd}` : ""}`;
  }

  console.log("[Zoom] Web URL:", webUrl);

  await page.goto(webUrl, {
    waitUntil: "networkidle",
    timeout: 30000
  });
  await page.waitForTimeout(4000);

  const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 800) || "");

  if (
    bodyText.toLowerCase().includes("invalid meeting") ||
    bodyText.toLowerCase().includes("meeting not found")
  ) {
    return {
      status: "failed",
      reason: "invalid_meeting_link",
      message: "Zoom meeting not found or expired"
    };
  }

  try {
    await page.click("text=Join from your browser", { timeout: 5000 });
    await page.waitForTimeout(2000);
    console.log("[Zoom] Clicked join from browser");
  } catch {
    console.log("[Zoom] No browser join button found");
  }

  try {
    const nameSelectors = [
      'input[placeholder="Your Name"]',
      'input[placeholder="Enter your name"]',
      'input[id="input-for-name"]',
      'input[name="username"]'
    ];

    for (const selector of nameSelectors) {
      try {
        await page.fill(selector, BOT_NAME, { timeout: 3000 });
        console.log("[Zoom] Name filled:", BOT_NAME);
        break;
      } catch {
        continue;
      }
    }
  } catch {
    console.log("[Zoom] Could not fill name");
  }

  try {
    await page.click('input[type="checkbox"]', { timeout: 2000 });
  } catch {}

  const joinSelectors = [
    'button[id="joinBtn"]',
    'button:has-text("Join")',
    'button:has-text("Join Meeting")',
    'input[type="submit"]'
  ];

  for (const selector of joinSelectors) {
    try {
      await page.click(selector, { timeout: 4000 });
      console.log("[Zoom] Clicked join:", selector);
      break;
    } catch {
      continue;
    }
  }

  await page.waitForTimeout(6000);

  const afterText = await page.evaluate(() => document.body?.innerText?.toLowerCase() || "");

  if (afterText.includes("waiting room") || afterText.includes("host will let you in")) {
    console.log("[Zoom] In waiting room");
    return { status: "waiting_for_admission" };
  }

  if (afterText.includes("leave") || afterText.includes("mute") || afterText.includes("participants")) {
    console.log("[Zoom] Successfully joined");
    return { status: "joined" };
  }

  console.log("[Zoom] Join status uncertain — assuming joined");
  return { status: "joined" };
}

async function watchZoomEnd(page) {
  const endPatterns = [
    "meeting ended",
    "this meeting has been ended",
    "the meeting has ended",
    "meeting is over"
  ];

  try {
    const bodyText = await page.evaluate(() => document.body?.innerText?.toLowerCase() || "");
    return endPatterns.some((pattern) => bodyText.includes(pattern));
  } catch {
    return true;
  }
}

module.exports = { joinZoom, watchZoomEnd };
