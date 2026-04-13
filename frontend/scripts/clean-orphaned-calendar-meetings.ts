/**
 * Cleanup: delete unrecorded calendar-shared meetings (status=scheduled/draft, no transcript/summary).
 * These are orphaned records created by repeated share/remove cycles.
 * Run with: npx tsx scripts/clean-orphaned-calendar-meetings.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq, isNull, or, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { meetingSessions } from "../src/db/schema/meeting-sessions";
import { sql } from "drizzle-orm";

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  const db = drizzle(pool);

  console.log("[Cleanup] Deleting orphaned unrecorded calendar-shared meetings...");

  const result = await db
    .delete(meetingSessions)
    .where(
      and(
        inArray(meetingSessions.status, ["scheduled", "draft"]),
        or(
          isNull(meetingSessions.transcript),
          eq(meetingSessions.transcript, "")
        ),
        or(
          isNull(meetingSessions.summary),
          eq(meetingSessions.summary, "")
        )
      )
    )
    .returning({ id: meetingSessions.id, title: meetingSessions.title });

  console.log(`[Cleanup] Deleted ${result.length} orphaned meeting(s):`);
  result.forEach((m) => console.log(`  - ${m.id}: ${m.title}`));
  console.log("[Cleanup] Done.");
  await pool.end();
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
