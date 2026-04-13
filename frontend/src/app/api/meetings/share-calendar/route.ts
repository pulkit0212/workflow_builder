import { auth } from "@clerk/nextjs/server";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { meetingSessions, workspaceMembers } from "@/db/schema";

const schema = z.object({
  workspaceId: z.string().uuid(),
  title: z.string().min(1),
  meetingLink: z.string().min(1),
  scheduledStartTime: z.string().optional(),
  scheduledEndTime: z.string().optional(),
  provider: z.string().default("google_meet"),
  externalCalendarEventId: z.string().optional(),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return apiError("Unauthorized.", 401);

  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError("Request body must be valid JSON.", 400); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError("Invalid input.", 400, parsed.error.flatten());

  const { workspaceId, title, meetingLink, scheduledStartTime, scheduledEndTime, provider, externalCalendarEventId } = parsed.data;

  try {
    await ensureDatabaseReady();
    if (!db) return apiError("DATABASE_URL is not configured.", 503);

    const user = await syncCurrentUserToDatabase(userId);

    // Verify user is admin of the target workspace
    const [membership] = await db
      .select()
      .from(workspaceMembers)
      .where(and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, user.id),
        eq(workspaceMembers.status, "active")
      ))
      .limit(1);

    if (!membership) return apiError("You are not a member of this workspace.", 403);
    if (membership.role !== "admin") return apiError("Only workspace admins can share meetings.", 403, { error: "admin_required" });

    const now = new Date();

    // Check if a DB record already exists for this calendar event (by eventId or meetingLink)
    // to avoid creating duplicates on repeated share/remove cycles
    const conditions = [eq(meetingSessions.userId, user.id)];
    if (externalCalendarEventId) {
      conditions.push(eq(meetingSessions.externalCalendarEventId, externalCalendarEventId));
    } else {
      conditions.push(eq(meetingSessions.meetingLink, meetingLink));
    }

    const [existing] = await db
      .select({ id: meetingSessions.id })
      .from(meetingSessions)
      .where(and(...conditions))
      .limit(1);

    let sessionId: string;

    if (existing) {
      // Reuse existing record — just update workspace sharing fields
      await db
        .update(meetingSessions)
        .set({
          workspaceId,
          workspaceMoveStatus: "approved",
          workspaceMovedBy: user.id,
          workspaceMovedAt: now,
          updatedAt: now,
        })
        .where(eq(meetingSessions.id, existing.id));
      sessionId = existing.id;
    } else {
      // Create new record
      const [session] = await db
        .insert(meetingSessions)
        .values({
          userId: user.id,
          workspaceId,
          title,
          meetingLink,
          provider,
          externalCalendarEventId: externalCalendarEventId ?? null,
          scheduledStartTime: scheduledStartTime ? new Date(scheduledStartTime) : null,
          scheduledEndTime: scheduledEndTime ? new Date(scheduledEndTime) : null,
          status: "scheduled",
          workspaceMoveStatus: "approved",
          workspaceMovedBy: user.id,
          workspaceMovedAt: now,
        })
        .returning({ id: meetingSessions.id });

      if (!session) return apiError("Failed to create meeting.", 500);
      sessionId = session.id;
    }

    return apiSuccess({ success: true, meetingId: sessionId, workspaceId }, 201);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Failed to share meeting.", 500);
  }
}
