#!/usr/bin/env node
/**
 * Generate artivaa-investor-slides.pdf from HTML.
 * Usage: node scripts/generate-pitch-pdf.mjs
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const htmlPath = path.join(root, "artivaa-investor-slides.html");
const pdfPath = path.join(root, "artivaa-investor-slides.pdf");

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
  await page.pdf({
    path: pdfPath,
    format: "A4",
    landscape: true,
    printBackground: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
  });
  console.log(`PDF written: ${pdfPath}`);
} finally {
  await browser.close();
}
