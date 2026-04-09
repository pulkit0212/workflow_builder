import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

export const runtime = "nodejs";

type TestResult = {
  id: number;
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
};

function getSubscriptionTableCheck() {
  if (!db) {
    throw new Error("DATABASE_URL not configured");
  }

  return db.execute(sql`select count(*) from subscriptions`);
}

function getDatabaseCheck() {
  if (!db) {
    throw new Error("DATABASE_URL not configured");
  }

  return db.execute(sql`select 1`);
}

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const results: TestResult[] = [];

  try {
    await getDatabaseCheck();
    results.push({ id: 1, name: "Database Connection", status: "pass", message: "Connected successfully" });
  } catch (error: any) {
    results.push({ id: 1, name: "Database Connection", status: "fail", message: error.message });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey.length > 10) {
    results.push({ id: 2, name: "Gemini API Key", status: "pass", message: "Key configured" });
  } else {
    results.push({ id: 2, name: "Gemini API Key", status: "fail", message: "GEMINI_API_KEY not set" });
  }

  const profilePath = path.join(process.cwd(), "tmp", "bot-profile");
  const profileExists = fs.existsSync(profilePath) && fs.readdirSync(profilePath).length > 0;
  results.push({
    id: 3,
    name: "Bot Profile",
    status: profileExists ? "pass" : "fail",
    message: profileExists ? "Profile configured" : "Run: npm run setup:bot-profile"
  });

  const audioDir = path.join(process.cwd(), "tmp", "audio");
  const audioDirExists = fs.existsSync(audioDir);
  results.push({
    id: 4,
    name: "Audio Directory",
    status: audioDirExists ? "pass" : "warn",
    message: audioDirExists ? "Directory exists" : "Will be created on first recording"
  });

  try {
    execSync('python3 -c "import whisper; print(\'ok\')"', { timeout: 10000, stdio: "pipe" });
    results.push({ id: 5, name: "Whisper (Python)", status: "pass", message: "Whisper installed" });
  } catch {
    results.push({ id: 5, name: "Whisper (Python)", status: "fail", message: "Run: pip3 install openai-whisper" });
  }

  try {
    execSync("ffmpeg -version", { timeout: 5000, stdio: "pipe" });
    results.push({ id: 6, name: "ffmpeg", status: "pass", message: "ffmpeg installed" });
  } catch {
    results.push({ id: 6, name: "ffmpeg", status: "fail", message: "Run: sudo apt install ffmpeg" });
  }

  const rzpKey = process.env.RAZORPAY_KEY_ID;
  const rzpSecret = process.env.RAZORPAY_KEY_SECRET;
  if (rzpKey && rzpSecret && rzpKey.startsWith("rzp_")) {
    results.push({ id: 7, name: "Razorpay Keys", status: "pass", message: "Payment configured" });
  } else {
    results.push({ id: 7, name: "Razorpay Keys", status: "warn", message: "Payment keys not configured" });
  }

  const audioSource = process.env.MEETING_AUDIO_SOURCE;
  results.push({
    id: 8,
    name: "Audio Source",
    status: audioSource && audioSource !== "default" ? "pass" : "warn",
    message: audioSource ? `Using: ${audioSource}` : "Using default — may not capture meeting audio"
  });

  const sessionsFile = path.join(process.cwd(), "tmp", "bot-sessions.json");
  const sessionsExist = fs.existsSync(sessionsFile);
  results.push({
    id: 9,
    name: "Bot Sessions File",
    status: "pass",
    message: sessionsExist ? "Sessions file exists" : "No active sessions"
  });

  try {
    await getSubscriptionTableCheck();
    results.push({ id: 10, name: "Subscription Table", status: "pass", message: "Table exists" });
  } catch {
    results.push({ id: 10, name: "Subscription Table", status: "fail", message: "Run: npx prisma db push" });
  }

  const passed = results.filter((result) => result.status === "pass").length;
  const failed = results.filter((result) => result.status === "fail").length;
  const warned = results.filter((result) => result.status === "warn").length;

  return NextResponse.json({
    results,
    summary: { passed, failed, warned, total: results.length },
    productionReady: failed === 0
  });
}
