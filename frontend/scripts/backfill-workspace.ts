import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { actionItems } from "../src/db/schema/action-items";
import { meetingSessions } from "../src/db/schema/meeting-sessions";
import { workspaceMembers } from "../src/db/schema/workspaces";
import { db } from "../src/lib/db/client";

async function backfillWorkspace() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }

  await db.execute(sql`
    ALTER TABLE "meeting_sessions"
    ADD COLUMN IF NOT EXISTS "workspace_id" uuid REFERENCES "workspaces"("id") ON DELETE SET NULL
  `);

  await db.execute(sql`
    ALTER TABLE "action_items"
    ADD COLUMN IF NOT EXISTS "workspace_id" uuid REFERENCES "workspaces"("id") ON DELETE SET NULL
  `);

  console.log("[Backfill] Starting workspace backfill...");

  const meetings = await db
    .select({
      id: meetingSessions.id,
      userId: meetingSessions.userId
    })
    .from(meetingSessions)
    .where(isNull(meetingSessions.workspaceId));

  console.log(`[Backfill] Found ${meetings.length} meetings to update`);

  for (const meeting of meetings) {
    const [membership] = await db
      .select({
        workspaceId: workspaceMembers.workspaceId
      })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.userId, meeting.userId),
          eq(workspaceMembers.status, "active")
        )
      )
      .orderBy(asc(workspaceMembers.createdAt))
      .limit(1);

    if (!membership) {
      console.warn(`[Backfill] No active workspace found for meeting ${meeting.id}`);
      continue;
    }

    await db
      .update(meetingSessions)
      .set({ workspaceId: membership.workspaceId })
      .where(eq(meetingSessions.id, meeting.id));
  }

  console.log("[Backfill] Done!");

  const items = await db
    .select({
      id: actionItems.id,
      userId: actionItems.userId,
      meetingId: actionItems.meetingId
    })
    .from(actionItems)
    .where(isNull(actionItems.workspaceId));

  console.log(`[Backfill] Found ${items.length} action items to update`);

  for (const item of items) {
    let workspaceId: string | null = null;

    if (item.meetingId) {
      const [meeting] = await db
        .select({
          workspaceId: meetingSessions.workspaceId
        })
        .from(meetingSessions)
        .where(eq(meetingSessions.id, item.meetingId))
        .limit(1);

      workspaceId = meeting?.workspaceId ?? null;
    }

    if (!workspaceId) {
      const [membership] = await db
        .select({
          workspaceId: workspaceMembers.workspaceId
        })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.userId, item.userId),
            eq(workspaceMembers.status, "active")
          )
        )
        .orderBy(asc(workspaceMembers.createdAt))
        .limit(1);

      workspaceId = membership?.workspaceId ?? null;
    }

    if (!workspaceId) {
      console.warn(`[Backfill] No active workspace found for action item ${item.id}`);
      continue;
    }

    await db
      .update(actionItems)
      .set({ workspaceId })
      .where(eq(actionItems.id, item.id));
  }

  console.log("[Backfill] Action item backfill done!");
}

backfillWorkspace()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
