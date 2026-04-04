/**
 * One-time migration: fix meeting_sessions rows where title is a platform name or empty.
 * Run: npm run fix:titles
 */
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, or, isNull } from "drizzle-orm";
import { meetingSessions } from "../src/db/schema/meeting-sessions";

const PLATFORM_TITLES = ["Google Meet", "Zoom Meeting", "Microsoft Teams Meeting", "Zoom", "Teams", ""];

async function fixMeetingTitles() {
  if (!process.env.DATABASE_URL) {
    console.error("[Migration] DATABASE_URL is not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  console.log("[Migration] Finding meetings with wrong titles...");

  const allRows = await db
    .select({
      id: meetingSessions.id,
      title: meetingSessions.title,
      meetingLink: meetingSessions.meetingLink,
      createdAt: meetingSessions.createdAt,
    })
    .from(meetingSessions);

  const badRows = allRows.filter(
    (row) => !row.title || PLATFORM_TITLES.includes(row.title.trim())
  );

  console.log(`[Migration] Found ${badRows.length} rows to fix`);

  let fixed = 0;

  for (const row of badRows) {
    const date = new Date(row.createdAt);
    const dateStr = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const newTitle = `Meeting — ${dateStr}`;

    await db
      .update(meetingSessions)
      .set({ title: newTitle, updatedAt: new Date() })
      .where(eq(meetingSessions.id, row.id));

    console.log(`[Migration] Fixed: ${row.id} → "${newTitle}" (was: "${row.title}")`);
    fixed++;
  }

  console.log(`[Migration] Done. Fixed ${fixed} rows.`);
  await pool.end();
}

fixMeetingTitles()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[Migration] Failed:", e);
    process.exit(1);
  });
