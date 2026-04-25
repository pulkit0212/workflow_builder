import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../db/client";
import { ForbiddenError, NotFoundError } from "../lib/errors";

export const actionItemsRouter = Router();

function requirePaidPlan(req: Request, res: Response): boolean {
  if (req.appUser.plan === "free") {
    res.status(403).json({ error: "upgrade_required", currentPlan: "free" });
    return true;
  }
  return false;
}

async function getWorkspaceRole(workspaceId: string, userId: string): Promise<string | null> {
  const r = await pool.query(
    "SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND status = 'active' LIMIT 1",
    [workspaceId, userId]
  );
  return r.rows[0]?.role ?? null;
}

// GET / — list with workspace + role filtering, status/priority/member filters
actionItemsRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;
    const workspaceId = req.headers["x-workspace-id"] as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const { tab, status, priority, memberId, meetingId } = req.query as Record<string, string | undefined>;

    let role: string | null = null;
    if (workspaceId) {
      role = await getWorkspaceRole(workspaceId, userId);
      if (!role) return res.status(403).json({ error: "Not a member of this workspace" });
    }

    const conditions: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    if (workspaceId) {
      conditions.push("ai.workspace_id = $" + p++);
      values.push(workspaceId);
      if (role !== "admin") {
        conditions.push("ai.user_id = $" + p++);
        values.push(userId);
      } else if (memberId) {
        conditions.push("ai.user_id = $" + p++);
        values.push(memberId);
      }
    } else {
      conditions.push("ai.user_id = $" + p++);
      values.push(userId);
      conditions.push("ai.workspace_id IS NULL");
    }

    if (tab === "high_priority") {
      conditions.push("ai.priority = $" + p++);
      values.push("High");
    } else if (tab === "this_week") {
      conditions.push("ai.created_at >= NOW() - INTERVAL '7 days'");
    }

    if (status && status !== "all") {
      conditions.push("ai.status = $" + p++);
      values.push(status);
    }
    if (priority && priority !== "all") {
      conditions.push("ai.priority = $" + p++);
      values.push(priority);
    }
    if (meetingId) {
      conditions.push("ai.meeting_id = $" + p++);
      values.push(meetingId);
    }

    const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
    const countResult = await pool.query(
      "SELECT COUNT(*)::int AS total FROM action_items ai " + where,
      values
    );
    const total: number = countResult.rows[0]?.total ?? 0;
    const itemsResult = await pool.query(
      "SELECT ai.*, u.full_name AS assignee_name, u.email AS assignee_email " +
      "FROM action_items ai LEFT JOIN users u ON u.id = ai.user_id " +
      where + " ORDER BY ai.created_at DESC LIMIT $" + p++ + " OFFSET $" + p++,
      [...values, limit, offset]
    );
    res.json({
      success: true,
      role: role ?? "personal",
      items: itemsResult.rows,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
});

// GET /export
actionItemsRouter.get("/export", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;
    const result = await pool.query(
      "SELECT id, task, status, source, created_at FROM action_items WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    const lines = ["id,task,status,source,createdAt"];
    for (const row of result.rows) {
      lines.push(row.id + ',"' + String(row.task).replace(/"/g, '""') + '",' + row.status + "," + row.source + "," + row.created_at);
    }
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="action-items.csv"');
    res.send(lines.join("\n"));
  } catch (err) { next(err); }
});

// POST /bulk-save
actionItemsRouter.post("/bulk-save", async (req: Request, res: Response, next: NextFunction) => {
  if (requirePaidPlan(req, res)) return;
  try {
    const userId = req.appUser.id;
    const items: Array<Record<string, unknown>> = Array.isArray(req.body) ? req.body : req.body.items ?? [];
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const saved: unknown[] = [];
      for (const item of items) {
        if (item.id) {
          const r = await client.query(
            "UPDATE action_items SET task=COALESCE($2,task),owner=COALESCE($3,owner),due_date=COALESCE($4,due_date),priority=COALESCE($5,priority),completed=COALESCE($6,completed),status=COALESCE($7,status),source=COALESCE($8,source),updated_at=NOW() WHERE id=$1 AND user_id=$9 RETURNING *",
            [item.id, item.task ?? null, item.owner ?? null, item.dueDate ?? null, item.priority ?? null, item.completed ?? null, item.status ?? null, item.source ?? null, userId]
          );
          if (r.rows[0]) saved.push(r.rows[0]);
        } else {
          const r = await client.query(
            "INSERT INTO action_items (task,owner,due_date,priority,completed,status,source,user_id,meeting_id,meeting_title,workspace_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *",
            [item.task ?? "", item.owner ?? "Unassigned", item.dueDate ?? "Not specified", item.priority ?? "Medium", item.completed ?? false, item.status ?? "pending", item.source ?? "meeting", userId, item.meetingId ?? null, item.meetingTitle ?? null, item.workspaceId ?? null]
          );
          if (r.rows[0]) saved.push(r.rows[0]);
        }
      }
      await client.query("COMMIT");
      res.json({ saved });
    } catch (err) { await client.query("ROLLBACK"); throw err; } finally { client.release(); }
  } catch (err) { next(err); }
});

// POST / — create
actionItemsRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  if (requirePaidPlan(req, res)) return;
  try {
    const userId = req.appUser.id;
    const { task, owner = "Unassigned", dueDate = "Not specified", priority = "Medium", completed = false, status = "pending", source = "meeting", meetingId = null, meetingTitle = null, workspaceId = null } = req.body;
    const result = await pool.query(
      "INSERT INTO action_items (task,owner,due_date,priority,completed,status,source,user_id,meeting_id,meeting_title,workspace_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *",
      [task, owner, dueDate, priority, completed, status, source, userId, meetingId, meetingTitle, workspaceId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

// PATCH /:id — role-based update
actionItemsRouter.patch("/:id", async (req: Request, res: Response, next: NextFunction) => {
  if (requirePaidPlan(req, res)) return;
  try {
    const { id } = req.params;
    const userId = req.appUser.id;
    const updates = req.body as Record<string, unknown>;
    const itemResult = await pool.query(
      "SELECT id, user_id, workspace_id FROM action_items WHERE id = $1 LIMIT 1",
      [id]
    );
    const item = itemResult.rows[0];
    if (!item) return next(new NotFoundError("Action item not found"));
    let role: string | null = null;
    if (item.workspace_id) {
      role = await getWorkspaceRole(item.workspace_id as string, userId);
      if (!role) return next(new ForbiddenError("Not a member of this workspace"));
    }
    const isOwner = item.user_id === userId;
    const isAdmin = role === "admin";
    const isMember = role === "member";
    const isViewer = role === "viewer";
    if (isViewer) return next(new ForbiddenError("Viewers cannot edit action items"));
    if (role && !isAdmin && !isOwner) return next(new ForbiddenError("You can only edit your own action items"));
    const adminFields = ["task", "owner", "dueDate", "priority", "completed", "status", "source", "meetingId", "meetingTitle", "workspaceId", "completedAt"];
    const memberFields = ["status", "dueDate", "completed", "completedAt"];
    const allowedFields = (!role || isAdmin) ? adminFields : (isMember && isOwner) ? memberFields : [];
    const fieldMap: Record<string, string> = {
      task: "task", owner: "owner", dueDate: "due_date", priority: "priority",
      completed: "completed", status: "status", source: "source",
      meetingId: "meeting_id", meetingTitle: "meeting_title",
      workspaceId: "workspace_id", completedAt: "completed_at",
    };
    const setClauses: string[] = ["updated_at = NOW()"];
    const values: unknown[] = [];
    let p = 1;
    for (const [key, col] of Object.entries(fieldMap)) {
      if (key in updates && allowedFields.includes(key)) {
        setClauses.push(col + " = $" + p++);
        values.push(updates[key]);
      }
    }
    if (setClauses.length === 1) {
      const current = await pool.query("SELECT * FROM action_items WHERE id = $1", [id]);
      return res.json(current.rows[0]);
    }
    values.push(id);
    const result = await pool.query(
      "UPDATE action_items SET " + setClauses.join(", ") + " WHERE id = $" + p + " RETURNING *",
      values
    );
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// DELETE /:id — admin or personal owner only
actionItemsRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  if (requirePaidPlan(req, res)) return;
  try {
    const { id } = req.params;
    const userId = req.appUser.id;
    const itemResult = await pool.query(
      "SELECT id, user_id, workspace_id FROM action_items WHERE id = $1 LIMIT 1",
      [id]
    );
    const item = itemResult.rows[0];
    if (!item) return next(new NotFoundError("Action item not found"));
    if (item.workspace_id) {
      const role = await getWorkspaceRole(item.workspace_id as string, userId);
      if (!role) return next(new ForbiddenError("Not a member of this workspace"));
      if (role !== "admin") return next(new ForbiddenError("Only admins can delete workspace action items"));
    } else {
      if (item.user_id !== userId) return next(new ForbiddenError("Not authorized"));
    }
    await pool.query("DELETE FROM action_items WHERE id = $1", [id]);
    res.status(204).send();
  } catch (err) { next(err); }
});
