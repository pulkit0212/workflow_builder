import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { db } from "@/lib/db/client";
import { meetingSessions } from "@/db/schema";
import { resolveWorkspaceIdForRequest } from "@/lib/workspaces/server";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ meetingId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return new Response(null, { status: 401 });
  }

  if (!db) {
    return new Response(JSON.stringify({ error: "Database not configured" }), { status: 503 });
  }

  // Resolve internal DB user ID from Clerk ID
  const user = await syncCurrentUserToDatabase(clerkUserId);
  const userId = user.id;

  const workspaceId = await resolveWorkspaceIdForRequest(request, userId);

  const { meetingId } = await context.params;

  if (!meetingId || meetingId.length < 5) {
    return new Response(JSON.stringify({ error: "Invalid meeting ID" }), { status: 400 });
  }

  let session: {
    id: string;
    userId: string;
    workspaceId: string | null;
    sharedWithUserIds: string[] | null;
    recordingUrl: string | null;
  } | null = null;

  try {
    const rows = await db
      .select({
        id: meetingSessions.id,
        userId: meetingSessions.userId,
        workspaceId: meetingSessions.workspaceId,
        sharedWithUserIds: meetingSessions.sharedWithUserIds,
        recordingUrl: meetingSessions.recordingUrl,
      })
      .from(meetingSessions)
      .where(
        workspaceId
          ? and(
              eq(meetingSessions.id, meetingId),
              eq(meetingSessions.workspaceId, workspaceId)
            )
          : eq(meetingSessions.id, meetingId)
      )
      .limit(1);
    session = rows[0] ?? null;
  } catch (dbError: unknown) {
    const msg = dbError instanceof Error ? dbError.message : String(dbError);
    console.error("[Recording] DB error:", msg);
    if (
      msg.includes("normalized_meeting_url") ||
      msg.includes("column") ||
      msg.includes("does not exist")
    ) {
      return new Response(
        JSON.stringify({ error: "Database migration required. Run: npm run db:push" }),
        { status: 503 }
      );
    }
    return new Response(JSON.stringify({ error: "Database error" }), { status: 500 });
  }

  if (!session) {
    return new Response(null, { status: 404 });
  }

  const authorized =
    session.userId === userId ||
    (session.sharedWithUserIds ?? []).includes(userId);

  if (!authorized) {
    return new Response(null, { status: 403 });
  }

  if (!session.recordingUrl) {
    return new Response(
      JSON.stringify({ error: "No recording available for this meeting" }),
      { status: 404 }
    );
  }

  const filePath = path.join(
    process.cwd(),
    "private",
    "recordings",
    `meeting-${meetingId}.wav`
  );

  if (!fs.existsSync(filePath)) {
    console.warn("[Recording] File not found:", filePath);
    return new Response(
      JSON.stringify({ error: "Recording file not found" }),
      { status: 404 }
    );
  }

  try {
    const file = fs.readFileSync(filePath);
    return new Response(file, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": file.length.toString(),
        "Content-Disposition": `inline; filename="recording.wav"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Recording] File read error:", msg);
    return new Response(JSON.stringify({ error: "Failed to read recording" }), { status: 500 });
  }
}
