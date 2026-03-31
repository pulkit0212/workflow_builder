const { chromium } = require("playwright");
const path = require("path");

async function setupBotProfile() {
  const profilePath = path.join(process.cwd(), "tmp", "bot-profile");

  console.log("[Setup] Opening browser for manual multi-platform login...");
  console.log("[Setup] Profile will be saved to:", profilePath);
  console.log("[Setup] You have 120 seconds to log in manually.");
  console.log("");
  console.log("[Setup] IMPORTANT: For best results:");
  console.log("[Setup] 1. Log in to Google (for Google Meet)");
  console.log("[Setup] 2. Log in to Zoom at zoom.us (for Zoom meetings)");
  console.log("[Setup] 3. Log in to Microsoft at teams.microsoft.com (for Teams)");
  console.log("[Setup] Multiple logins = all platforms work!");
  console.log("");

  const browser = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    args: [
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-web-security",
    ],
  });

  const page = await browser.newPage();
  await page.goto("https://accounts.google.com");

  console.log("[Setup] Browser opened. Please log in to Google now...");

  await page.waitForTimeout(120000);

  console.log("[Setup] Now navigate to zoom.us and log in...");
  await page.goto("https://zoom.us/signin");
  await page.waitForTimeout(60000);

  console.log("[Setup] Now navigate to Teams...");
  await page.goto("https://teams.microsoft.com");
  await page.waitForTimeout(60000);

  await page.goto("https://myaccount.google.com");
  const title = await page.title();
  console.log("[Setup] Account page title:", title);

  const emailElement = await page.$("[data-email]");
  if (emailElement) {
    const email = await emailElement.getAttribute("data-email");
    console.log("[Setup] Logged in as:", email);
  }

  await browser.close();
  console.log("[Setup] All platforms configured!");
  console.log("[Setup] Profile saved. Bot is ready to use this account.");
}

setupBotProfile().catch(console.error);
