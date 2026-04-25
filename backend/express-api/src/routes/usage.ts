import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../db/client";

export const usageRouter = Router();

// GET /api/usage/stats
usageRouter.get("/stats", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;
    const workspaceId = (req.query.workspaceId as string) ?? null;

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [
      meetingsThisMonthRes,
      meetingsAllTimeRes,
      transcriptsRes,
      actionItemsRes,
      documentsRes,
    ] = await Promise.all([
      pool.query(
        workspaceId
          ? `SELECT COUNT(*)::int AS value FROM meeting_sessions WHERE workspace_id = $1 AND user_id = $2 AND created_at >= $3`
          : `SELECT COUNT(*)::int AS value FROM meeting_sessions WHERE user_id = $1 AND created_at >= $2`,
        workspaceId
          ? [workspaceId, userId, monthStart]
          : [userId, monthStart]
      ),
      pool.query(
        workspaceId
          ? `SELECT COUNT(*)::int AS value FROM meeting_sessions WHERE workspace_id = $1 AND user_id = $2`
          : `SELECT COUNT(*)::int AS value FROM meeting_sessions WHERE user_id = $1`,
        workspaceId ? [workspaceId, userId] : [userId]
      ),
      pool.query(
        workspaceId
          ? `SELECT COUNT(*)::int AS value FROM meeting_sessions WHERE user_id = $1 AND workspace_id = $2 AND transcript IS NOT NULL AND transcript != ''`
          : `SELECT COUNT(*)::int AS value FROM meeting_sessions WHERE user_id = $1 AND transcript IS NOT NULL AND transcript != ''`,
        workspaceId ? [userId, workspaceId] : [userId]
      ),
      pool.query(
        workspaceId
          ? `SELECT COUNT(*)::int AS value FROM action_items WHERE workspace_id = $1 AND user_id = $2`
          : `SELECT COUNT(*)::int AS value FROM action_items WHERE user_id = $1`,
        workspaceId ? [workspaceId, userId] : [userId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS value FROM uploaded_files WHERE user_id = $1`,
        [userId]
      ),
    ]);

    return res.json({
      success: true,
      meetingsThisMonth: meetingsThisMonthRes.rows[0]?.value ?? 0,
      meetingsAllTime: meetingsAllTimeRes.rows[0]?.value ?? 0,
      transcriptsGenerated: transcriptsRes.rows[0]?.value ?? 0,
      actionItemsCreated: actionItemsRes.rows[0]?.value ?? 0,
      documentsAnalyzed: documentsRes.rows[0]?.value ?? 0,
      memberSince: new Date(req.appUser.createdAt).toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/usage/data
usageRouter.delete("/data", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;
    const clerkUserId = req.clerkUserId;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM uploaded_files WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM action_items WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM meeting_sessions WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM ai_runs WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM usage_logs WHERE user_id = $1`, [userId]);
      await client.query(
        `UPDATE subscriptions
         SET meetings_used_this_month = 0, last_reset_date = NOW()
         WHERE user_id = $1`,
        [clerkUserId]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
