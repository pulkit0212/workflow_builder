import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db/client";
import { meetingSessions } from "@/db/schema";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ meetingId: string }>;
};

export async function GET(_req: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return new Response(null, { status: 401 });
  }

  if (!db) {
    return new Response(null, { status: 503 });
  }

  const { meetingId } = await context.params;

  let session;
  try {
    session = await db
      .select({
        id: meetingSessions.id,
        userId: meetingSessions.userId,
        sharedWithUserIds: meetingSessions.sharedWithUserIds,
      })
      .from(meetingSessions)
      .where(eq(meetingSessions.id, meetingId))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  } catch {
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

  const filePath = path.join(
    process.cwd(),
    "private",
    "recordings",
    `meeting-${meetingId}.wav`
  );

  try {
    const file = await fs.readFile(filePath);
    return new Response(file, {
      headers: { "Content-Type": "audio/wav" },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
