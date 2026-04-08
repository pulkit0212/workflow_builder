/**
 * One-time data migration: set type = 'personal' for workspaces whose name
 * matches the personal workspace convention (case-insensitive "personal").
 *
 * All other workspaces default to 'team' (already set by the column default).
 *
 * Run with: npx tsx scripts/backfill-workspace-type.ts
 */

import { ilike, eq } from "drizzle-orm";
import { workspaces } from "../src/db/schema/workspaces";
import { db } from "../src/lib/db/client";

async function backfillWorkspaceType() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }

  console.log("[Backfill] Starting workspace type backfill...");

  // Find workspaces whose name matches the personal workspace convention
  const personalWorkspaces = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(ilike(workspaces.name, "personal"));

  console.log(`[Backfill] Found ${personalWorkspaces.length} personal workspace(s) to update`);

  for (const workspace of personalWorkspaces) {
    await db
      .update(workspaces)
      .set({ type: "personal" })
      .where(eq(workspaces.id, workspace.id));

    console.log(`[Backfill] Set type='personal' for workspace "${workspace.name}" (${workspace.id})`);
  }

  console.log("[Backfill] Workspace type backfill complete.");
}

backfillWorkspaceType()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[Backfill] Error:", error);
    process.exit(1);
  });
