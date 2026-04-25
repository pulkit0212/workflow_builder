import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../db/client";

export const searchRouter = Router();

// GET /api/search?q=
searchRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = ((req.query.q as string) ?? "").trim();
    if (q.length < 2) {
      return res.json({ results: [] });
    }

    const userId = req.appUser.id;
    const pattern = `%${q}%`;

    const [runRows, sessionRows] = await Promise.all([
      pool.query(
        `SELECT ar.id, ar.title, ar.status, ar.created_at,
                t.name AS tool_name, t.slug AS tool_slug
         FROM ai_runs ar
         INNER JOIN tools t ON ar.tool_id = t.id
         WHERE ar.user_id = $1 AND ar.title ILIKE $2
         ORDER BY ar.created_at DESC
         LIMIT 5`,
        [userId, pattern]
      ),
      pool.query(
        `SELECT id, title, summary, status, created_at, scheduled_start_time
         FROM meeting_sessions
         WHERE user_id = $1 AND (title ILIKE $2 OR summary ILIKE $2)
         ORDER BY created_at DESC
         LIMIT 5`,
        [userId, pattern]
      ),
    ]);

    const results = [
      ...runRows.rows.map((r: Record<string, unknown>) => ({
        type: "run" as const,
        id: r.id,
        title: (r.title as string) ?? "Untitled run",
        subtitle: r.tool_name,
        status: r.status,
        href: `/dashboard/history/${r.id}`,
        createdAt: new Date(r.created_at as string).toISOString(),
      })),
      ...sessionRows.rows.map((s: Record<string, unknown>) => ({
        type: "meeting" as const,
        id: s.id,
        title: (s.title as string) ?? "Untitled meeting",
        subtitle: s.summary
          ? (s.summary as string).slice(0, 80).trimEnd() + "…"
          : "Meeting",
        status: s.status,
        href: `/dashboard/meetings/${s.id}`,
        createdAt: new Date(
          (s.scheduled_start_time as string) ?? (s.created_at as string)
        ).toISOString(),
      })),
    ]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, 8);

    return res.json({ results });
  } catch (err) {
    next(err);
  }
});
