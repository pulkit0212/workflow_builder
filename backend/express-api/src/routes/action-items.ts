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
        conditions.push("(ai.reporter_id = $" + p + " OR ai.assignee_id = $" + p + ")");
        p++;
        values.push(userId);
      } else if (memberId) {
        conditions.push("(ai.reporter_id = $" + p + " OR ai.assignee_id = $" + p + ")");
        p++;
        values.push(memberId);
      }
    } else {
      conditions.push("(ai.reporter_id = $" + p + " OR ai.assignee_id = $" + p + ")");
      p++;
      values.push(userId);
      conditions.push("ai.workspace_id IS NULL");
    }

    if (tab === "high_priority") {
      conditions.push("ai.priority = $" + p++);
      values.push("High");
    } else if (tab === "this_week") {
      // "Assigned to Me" — always scope to current user regardless of role
      if (workspaceId && role === "admin") {
        conditions.push("(ai.reporter_id = $" + p + " OR ai.assignee_id = $" + p + ")");
        p++;
        values.push(userId);
      }
      conditions.push("ai.created_at >= NOW() - INTERVAL '7 days'");
    } else if (tab === "completed") {
      conditions.push("ai.status = $" + p++);
      values.push("done");
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
      "SELECT ai.*, " +
      "au.full_name AS assignee_name, au.email AS assignee_email, " +
      "ru.full_name AS reporter_name " +
      "FROM action_items ai " +
      "LEFT JOIN users au ON au.id = ai.assignee_id " +
      "LEFT JOIN users ru ON ru.id = ai.reporter_id " +
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

// GET /by-user/:userId — fetch action items for a specific user
// Personal mode: pass "me" → resolves to current user, returns only their items (workspace_id IS NULL)
// Workspace admin: pass any member's DB user ID + x-workspace-id header → returns that member's workspace items
actionItemsRouter.get("/by-user/:userId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requesterId = req.appUser.id;
    const rawUserId = req.params.userId;
    // "me" is a convenience alias for the authenticated user's own ID
    const targetUserId = rawUserId === "me" ? requesterId : rawUserId;
    const workspaceId = req.headers["x-workspace-id"] as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const { tab, status, priority } = req.query as Record<string, string | undefined>;

    // Security: requester can only query their own ID unless they are a workspace admin
    if (targetUserId !== requesterId) {
      if (!workspaceId) return res.status(403).json({ error: "Forbidden" });
      const role = await getWorkspaceRole(workspaceId, requesterId);
      if (role !== "admin") return res.status(403).json({ error: "Only admins can view other members' items" });
    }

    const conditions: string[] = ["(ai.reporter_id = $1 OR ai.assignee_id = $1)"];
    const values: unknown[] = [targetUserId];
    let p = 2;

    if (workspaceId) {
      // Workspace-scoped: items belonging to this workspace
      conditions.push("ai.workspace_id = $" + p++);
      values.push(workspaceId);
    } else {
      // Personal mode: only items NOT in any workspace
      conditions.push("ai.workspace_id IS NULL");
    }

    if (tab === "assigned_to_me") {
      conditions.push("ai.assignee_id = $" + p++);
      values.push(requesterId);
    } else if (tab === "created_by_me") {
      conditions.push("ai.reporter_id = $" + p++);
      values.push(requesterId);
    } else if (tab === "high_priority") {
      conditions.push("ai.priority = $" + p++);
      values.push("High");
    } else if (tab === "this_week") {
      conditions.push("ai.created_at >= NOW() - INTERVAL '7 days'");
    } else if (tab === "completed") {
      conditions.push("ai.status = $" + p++);
      values.push("done");
    }

    if (status && status !== "all") {
      conditions.push("ai.status = $" + p++);
      values.push(status);
    }
    if (priority && priority !== "all") {
      conditions.push("ai.priority = $" + p++);
      values.push(priority);
    }

    const where = "WHERE " + conditions.join(" AND ");
    const countResult = await pool.query(
      "SELECT COUNT(*)::int AS total FROM action_items ai " + where,
      values
    );
    const total: number = countResult.rows[0]?.total ?? 0;
    const itemsResult = await pool.query(
      "SELECT ai.*, " +
      "au.full_name AS assignee_name, au.email AS assignee_email, " +
      "ru.full_name AS reporter_name " +
      "FROM action_items ai " +
      "LEFT JOIN users au ON au.id = ai.assignee_id " +
      "LEFT JOIN users ru ON ru.id = ai.reporter_id " +
      where + " ORDER BY ai.created_at DESC LIMIT $" + p++ + " OFFSET $" + p++,
      [...values, limit, offset]
    );

    res.json({
      success: true,
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
      "SELECT ai.id, ai.task, COALESCE(assignee_user.full_name, ai.assignee) AS assignee_name, ai.status, ai.source, ai.created_at " +
      "FROM action_items ai " +
      "LEFT JOIN users assignee_user ON assignee_user.id = ai.assignee_id " +
      "WHERE ai.reporter_id = $1 ORDER BY ai.created_at DESC",
      [userId]
    );
    const lines = ["id,task,assignee_name,status,source,createdAt"];
    for (const row of result.rows) {
      lines.push(
        row.id + ',"' + String(row.task).replace(/"/g, '""') + '",' +
        '"' + String(row.assignee_name ?? "").replace(/"/g, '""') + '",' +
        row.status + "," + row.source + "," + row.created_at
      );
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
          // UPDATE: never overwrite reporter_id
          const r = await client.query(
            "UPDATE action_items SET task=COALESCE($2,task),assignee=COALESCE($3,assignee),due_date=COALESCE($4,due_date),priority=COALESCE($5,priority),completed=COALESCE($6,completed),status=COALESCE($7,status),source=COALESCE($8,source),updated_at=NOW() WHERE id=$1 AND reporter_id=$9 RETURNING *",
            [item.id, item.task ?? null, item.assignee ?? null, item.dueDate ?? null, item.priority ?? null, item.completed ?? null, item.status ?? null, item.source ?? null, userId]
          );
          if (r.rows[0]) saved.push(r.rows[0]);
        } else {
          // INSERT: reporter_id = authenticated user; assignee text from AI, assignee_id null by default
          const assigneeText = (item.assignee as string | undefined) ?? (item.owner as string | undefined) ?? "Unassigned";
          const assigneeId = (item.assigneeId as string | null | undefined) ?? null;
          const r = await client.query(
            "INSERT INTO action_items (task,assignee,due_date,priority,completed,status,source,reporter_id,meeting_id,meeting_title,workspace_id,assignee_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *",
            [item.task ?? "", assigneeText, item.dueDate ?? "Not specified", item.priority ?? "Medium", item.completed ?? false, item.status ?? "pending", item.source ?? "meeting", userId, item.meetingId ?? null, item.meetingTitle ?? null, item.workspaceId ?? null, assigneeId]
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
    // Strip any client-supplied reporter_id; always use authenticated user's ID
    const { task, dueDate = "Not specified", priority = "Medium", completed = false, status = "pending", source = "meeting", meetingId = null, meetingTitle = null, workspaceId = null } = req.body;
    // assignee text from body (AI-extracted or user-provided), default "Unassigned"
    const assigneeText: string = (req.body.assignee as string | undefined) ?? (req.body.owner as string | undefined) ?? "Unassigned";
    // assignee_id: null by default (set when user explicitly assigns to an Artivaa user)
    const assigneeId: string | null = (req.body.assigneeId as string | null | undefined) ?? null;
    const result = await pool.query(
      "INSERT INTO action_items (task,assignee,due_date,priority,completed,status,source,reporter_id,meeting_id,meeting_title,workspace_id,assignee_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *",
      [task, assigneeText, dueDate, priority, completed, status, source, userId, meetingId, meetingTitle, workspaceId, assigneeId]
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
      "SELECT id, reporter_id, workspace_id FROM action_items WHERE id = $1 LIMIT 1",
      [id]
    );
    const item = itemResult.rows[0];
    if (!item) return next(new NotFoundError("Action item not found"));
    let role: string | null = null;
    if (item.workspace_id) {
      role = await getWorkspaceRole(item.workspace_id as string, userId);
      if (!role) return next(new ForbiddenError("Not a member of this workspace"));
    }
    const isOwner = item.reporter_id === userId;
    const isAdmin = role === "admin";
    const isMember = role === "member";
    const isViewer = role === "viewer";
    if (isViewer) return next(new ForbiddenError("Viewers cannot edit action items"));
    if (role && !isAdmin && !isOwner) return next(new ForbiddenError("You can only edit your own action items"));

    // assignee_id authorization: only Admin or Reporter can update it
    if ("assigneeId" in updates) {
      if (!isAdmin && !isOwner) {
        return res.status(403).json({ error: "Only admins or the reporter can reassign action items" });
      }
      const newAssigneeId = updates.assigneeId;
      if (newAssigneeId !== null && newAssigneeId !== undefined) {
        // Validate user exists and fetch their name to update assignee text
        const userCheck = await pool.query("SELECT id, full_name, email FROM users WHERE id = $1 LIMIT 1", [newAssigneeId]);
        if (userCheck.rows.length === 0) {
          return res.status(422).json({ error: "Assignee user not found" });
        }
        // Always sync assignee text with the selected user's name
        updates.assignee = userCheck.rows[0].full_name || userCheck.rows[0].email || "Unknown";
      } else {
        // Unassigning — clear both assignee_id and assignee text
        updates.assignee = "Unassigned";
      }
    }

    // reporter_id is never in allowedFields — it cannot be updated
    const adminFields = ["task", "assignee", "dueDate", "priority", "completed", "status", "source", "meetingId", "meetingTitle", "workspaceId", "completedAt", "assigneeId"];
    const memberFields = ["status", "dueDate", "completed", "completedAt"];
    const allowedFields = (!role || isAdmin) ? adminFields : (isMember && isOwner) ? memberFields : [];
    const fieldMap: Record<string, string> = {
      task: "task", assignee: "assignee", dueDate: "due_date", priority: "priority",
      completed: "completed", status: "status", source: "source",
      meetingId: "meeting_id", meetingTitle: "meeting_title",
      workspaceId: "workspace_id", completedAt: "completed_at",
      assigneeId: "assignee_id",
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
      const current = await pool.query(
        "SELECT ai.*, au.full_name AS assignee_name, au.email AS assignee_email, ru.full_name AS reporter_name " +
        "FROM action_items ai LEFT JOIN users au ON au.id = ai.assignee_id LEFT JOIN users ru ON ru.id = ai.reporter_id " +
        "WHERE ai.id = $1", [id]
      );
      return res.json(current.rows[0]);
    }
    values.push(id);
    await pool.query(
      "UPDATE action_items SET " + setClauses.join(", ") + " WHERE id = $" + p,
      values
    );
    // Return full item with JOIN so assignee_name is populated
    const updated = await pool.query(
      "SELECT ai.*, au.full_name AS assignee_name, au.email AS assignee_email, ru.full_name AS reporter_name " +
      "FROM action_items ai LEFT JOIN users au ON au.id = ai.assignee_id LEFT JOIN users ru ON ru.id = ai.reporter_id " +
      "WHERE ai.id = $1", [id]
    );
    res.json(updated.rows[0]);
  } catch (err) { next(err); }
});

// DELETE /:id — admin or personal owner only
actionItemsRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  if (requirePaidPlan(req, res)) return;
  try {
    const { id } = req.params;
    const userId = req.appUser.id;
    const itemResult = await pool.query(
      "SELECT id, reporter_id, workspace_id FROM action_items WHERE id = $1 LIMIT 1",
      [id]
    );
    const item = itemResult.rows[0];
    if (!item) return next(new NotFoundError("Action item not found"));
    if (item.workspace_id) {
      const role = await getWorkspaceRole(item.workspace_id as string, userId);
      if (!role) return next(new ForbiddenError("Not a member of this workspace"));
      if (role !== "admin") return next(new ForbiddenError("Only admins can delete workspace action items"));
    } else {
      if (item.reporter_id !== userId) return next(new ForbiddenError("Not authorized"));
    }
    await pool.query("DELETE FROM action_items WHERE id = $1", [id]);
    res.status(204).send();
  } catch (err) { next(err); }
});
