/**
 * One-time cleanup: clear workspaceId from meetings that were auto-assigned.
 * Run with: npx tsx scripts/clear-auto-assigned-workspace.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { and, isNotNull, ne, isNull, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { meetingSessions } from "../src/db/schema/meeting-sessions";
import { actionItems } from "../src/db/schema/action-items";

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  const db = drizzle(pool);

  console.log("[Cleanup] Clearing auto-assigned workspaceId from meetings...");

  const result = await db
    .update(meetingSessions)
    .set({ workspaceId: null, workspaceMoveStatus: null, workspaceMovedBy: null, workspaceMovedAt: null })
    .where(
      and(
        isNotNull(meetingSessions.workspaceId),
        or(isNull(meetingSessions.workspaceMoveStatus), ne(meetingSessions.workspaceMoveStatus, "approved"))
      )
    )
    .returning({ id: meetingSessions.id });

  console.log(`[Cleanup] Cleared workspaceId from ${result.length} meeting(s).`);

  const itemResult = await db
    .update(actionItems)
    .set({ workspaceId: null })
    .where(isNotNull(actionItems.workspaceId))
    .returning({ id: actionItems.id });

  console.log(`[Cleanup] Cleared workspaceId from ${itemResult.length} action item(s).`);
  console.log("[Cleanup] Done.");
  await pool.end();
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
