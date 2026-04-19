import { auth } from "@clerk/nextjs/server";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { aiRuns, meetingSessions, tools } from "@/db/schema";

export const runtime = "nodejs";

function getDbOrThrow() {
  if (!db) throw new Error("DATABASE_URL is not configured.");
  return db;
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return apiError("Unauthorized.", 401);

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();

  if (q.length < 2) return apiSuccess({ results: [] });

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const database = getDbOrThrow();
    const pattern = `%${q}%`;

    const [runResults, sessionResults] = await Promise.all([
      // Search ai_runs by title
      database
        .select({
          id: aiRuns.id,
          title: aiRuns.title,
          status: aiRuns.status,
          createdAt: aiRuns.createdAt,
          toolName: tools.name,
          toolSlug: tools.slug,
        })
        .from(aiRuns)
        .innerJoin(tools, eq(aiRuns.toolId, tools.id))
        .where(and(eq(aiRuns.userId, user.id), ilike(aiRuns.title, pattern)))
        .orderBy(desc(aiRuns.createdAt))
        .limit(5),

      // Search meeting_sessions by title or summary
      database
        .select({
          id: meetingSessions.id,
          title: meetingSessions.title,
          summary: meetingSessions.summary,
          status: meetingSessions.status,
          createdAt: meetingSessions.createdAt,
          scheduledStartTime: meetingSessions.scheduledStartTime,
        })
        .from(meetingSessions)
        .where(
          and(
            eq(meetingSessions.userId, user.id),
            or(
              ilike(meetingSessions.title, pattern),
              ilike(meetingSessions.summary, pattern)
            )
          )
        )
        .orderBy(desc(meetingSessions.createdAt))
        .limit(5),
    ]);

    const results = [
      ...runResults.map((r) => ({
        type: "run" as const,
        id: r.id,
        title: r.title ?? "Untitled run",
        subtitle: r.toolName,
        status: r.status,
        href: `/dashboard/history/${r.id}`,
        createdAt: r.createdAt.toISOString(),
      })),
      ...sessionResults.map((s) => ({
        type: "meeting" as const,
        id: s.id,
        title: s.title ?? "Untitled meeting",
        subtitle: s.summary ? s.summary.slice(0, 80).trimEnd() + "…" : "Meeting",
        status: s.status,
        href: `/dashboard/meetings/${s.id}`,
        createdAt: (s.scheduledStartTime ?? s.createdAt).toISOString(),
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
     .slice(0, 8);

    return apiSuccess({ results });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Search failed.", 500);
  }
}
