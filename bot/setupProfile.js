const { chromium } = require("playwright");
const path = require("path");

async function setupBotProfile() {
  const profilePath = path.join(process.cwd(), "tmp", "bot-profile");

  console.log("[Setup] Opening browser for manual Google login...");
  console.log("[Setup] Profile will be saved to:", profilePath);
  console.log("[Setup] You have 120 seconds to log in manually.");

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

  await page.goto("https://myaccount.google.com");
  const title = await page.title();
  console.log("[Setup] Account page title:", title);

  const emailElement = await page.$("[data-email]");
  if (emailElement) {
    const email = await emailElement.getAttribute("data-email");
    console.log("[Setup] Logged in as:", email);
  }

  await browser.close();
  console.log("[Setup] Profile saved. Bot is ready to use this account.");
}

setupBotProfile().catch(console.error);
