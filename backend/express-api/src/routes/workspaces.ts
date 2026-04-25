import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { pool } from "../db/client";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors";

export const workspacesRouter = Router();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createWorkspaceSchema = z.object({
  name: z.string().min(1, "Workspace name is required"),
  members: z.array(z.string().uuid()).optional().default([]),
});

const updateWorkspaceSchema = z.object({
  name: z.string().min(1).optional(),
  settings: z.record(z.unknown()).optional(),
}).strict();

// ─── Helper: require active workspace membership ──────────────────────────────

async function requireWorkspaceMember(workspaceId: string, userId: string) {
  const result = await pool.query(
    `SELECT id, role, status FROM workspace_members
     WHERE workspace_id = $1 AND user_id = $2
     LIMIT 1`,
    [workspaceId, userId]
  );
  const member = result.rows[0] ?? null;
  if (!member || member.status !== "active") {
    throw new ForbiddenError("You are not a member of this workspace");
  }
  return member as { id: string; role: string; status: string };
}

// ─── GET / — list workspaces the user is a member of ─────────────────────────

workspacesRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.appUser.id;

    const result = await pool.query(
      `SELECT
         w.*,
         wm.role,
         wm.status AS member_status,
         (SELECT COUNT(*)::int FROM workspace_members wm2 WHERE wm2.workspace_id = w.id AND wm2.status = 'active') AS member_count,
         (SELECT COUNT(*)::int FROM meeting_sessions ms WHERE ms.workspace_id = w.id) AS meeting_count
       FROM workspaces w
       JOIN workspace_members wm ON wm.workspace_id = w.id
       WHERE wm.user_id = $1 AND wm.status = 'active'
       ORDER BY w.created_at DESC`,
      [userId]
    );

    const rows = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      type: 'team' as const,
      memberCount: row.member_count ?? 0,
      meetingCount: row.meeting_count ?? 0,
      createdAt: row.created_at,
    }));

    res.json({ success: true, workspaces: rows });
  } catch (err) {
    next(err);
  }
});

// ─── POST / — create workspace ────────────────────────────────────────────────

workspacesRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new BadRequestError(parsed.error.message));
    }

    const { name, members } = parsed.data;
    const userId = req.appUser.id;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Create workspace
      const wsResult = await client.query(
        `INSERT INTO workspaces (name, owner_id) VALUES ($1, $2) RETURNING *`,
        [name, userId]
      );
      const workspace = wsResult.rows[0];

      // Add creator as admin
      await client.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role, status)
         VALUES ($1, $2, 'admin', 'active')`,
        [workspace.id, userId]
      );

      // Add additional members (as 'member' role, 'active' status)
      for (const memberId of members) {
        if (memberId !== userId) {
          await client.query(
            `INSERT INTO workspace_members (workspace_id, user_id, role, status)
             VALUES ($1, $2, 'member', 'active')
             ON CONFLICT (workspace_id, user_id) DO NOTHING`,
            [workspace.id, memberId]
          );
        }
      }

      await client.query("COMMIT");
      res.status(201).json(workspace);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// ─── POST /join — accept invite token, add user as member ────────────────────
// Must be registered BEFORE /:workspaceId

workspacesRouter.post("/join", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body as { token?: string };
    if (!token) {
      return next(new BadRequestError("Invite token is required"));
    }

    const userId = req.appUser.id;

    // Look up the invite
    const inviteResult = await pool.query(
      `SELECT * FROM workspace_invites
       WHERE token = $1 AND status = 'pending' AND expires_at > NOW()
       LIMIT 1`,
      [token]
    );
    const invite = inviteResult.rows[0] ?? null;

    if (!invite) {
      return next(new NotFoundError("Invalid or expired invite token"));
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Add user as member
      await client.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role, status)
         VALUES ($1, $2, 'member', 'active')
         ON CONFLICT (workspace_id, user_id) DO UPDATE SET status = 'active'`,
        [invite.workspace_id, userId]
      );

      // Mark invite as accepted
      await client.query(
        `UPDATE workspace_invites SET status = 'accepted', accepted_at = NOW() WHERE id = $1`,
        [invite.id]
      );

      await client.query("COMMIT");

      // Return the workspace
      const wsResult = await pool.query(
        `SELECT * FROM workspaces WHERE id = $1 LIMIT 1`,
        [invite.workspace_id]
      );
      res.json({ workspace: wsResult.rows[0] });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// ─── GET /join — accept invite token via query param ─────────────────────────
// Must be registered BEFORE /:workspaceId

workspacesRouter.get("/join", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.query.token as string | undefined;
    if (!token) {
      return next(new BadRequestError("Invite token is required"));
    }

    const userId = req.appUser.id;

    const inviteResult = await pool.query(
      `SELECT * FROM workspace_invites
       WHERE token = $1 AND status = 'pending' AND expires_at > NOW()
       LIMIT 1`,
      [token]
    );
    const invite = inviteResult.rows[0] ?? null;

    if (!invite) {
      return next(new NotFoundError("Invalid or expired invite token"));
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role, status)
         VALUES ($1, $2, 'member', 'active')
         ON CONFLICT (workspace_id, user_id) DO UPDATE SET status = 'active'`,
        [invite.workspace_id, userId]
      );

      await client.query(
        `UPDATE workspace_invites SET status = 'accepted', accepted_at = NOW() WHERE id = $1`,
        [invite.id]
      );

      await client.query("COMMIT");

      const wsResult = await pool.query(
        `SELECT * FROM workspaces WHERE id = $1 LIMIT 1`,
        [invite.workspace_id]
      );
      res.json({ workspace: wsResult.rows[0] });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// ─── GET /:workspaceId — get workspace details ────────────────────────────────

workspacesRouter.get("/:workspaceId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.appUser.id;

    const member = await requireWorkspaceMember(workspaceId, userId);

    const [workspaceResult, membersResult] = await Promise.all([
      pool.query(`SELECT * FROM workspaces WHERE id = $1 LIMIT 1`, [workspaceId]),
      pool.query(
        `SELECT wm.*, u.id AS u_id, u.full_name, u.email
         FROM workspace_members wm
         LEFT JOIN users u ON u.id = wm.user_id
         WHERE wm.workspace_id = $1`,
        [workspaceId]
      ),
    ]);

    const workspace = workspaceResult.rows[0] ?? null;
    if (!workspace) {
      return next(new NotFoundError("Workspace not found"));
    }

    const members = membersResult.rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      role: row.role,
      status: row.status,
      createdAt: row.created_at,
      user: {
        id: row.u_id,
        fullName: row.full_name ?? null,
        email: row.email ?? null,
      },
    }));

    res.json({
      id: workspace.id,
      name: workspace.name,
      ownerId: workspace.owner_id,
      createdAt: workspace.created_at,
      currentUserRole: member.role,
      members,
      joinRequests: [],
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /:workspaceId — update workspace (owner/admin only) ────────────────

workspacesRouter.patch("/:workspaceId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.appUser.id;

    const member = await requireWorkspaceMember(workspaceId, userId);

    if (member.role !== "owner" && member.role !== "admin") {
      return next(new ForbiddenError("Only workspace owners and admins can update workspace settings"));
    }

    const parsed = updateWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new BadRequestError(parsed.error.message));
    }

    const updates = parsed.data;
    if (Object.keys(updates).length === 0) {
      const current = await pool.query(`SELECT * FROM workspaces WHERE id = $1 LIMIT 1`, [workspaceId]);
      return res.json(current.rows[0]);
    }

    const setClauses: string[] = ["updated_at = NOW()"];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIdx++}`);
      values.push(updates.name);
    }

    values.push(workspaceId);
    const result = await pool.query(
      `UPDATE workspaces SET ${setClauses.join(", ")} WHERE id = $${paramIdx} RETURNING *`,
      values
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /:workspaceId — delete workspace (owner only) ────────────────────

workspacesRouter.delete("/:workspaceId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.appUser.id;

    const member = await requireWorkspaceMember(workspaceId, userId);

    if (member.role !== "owner") {
      return next(new ForbiddenError("Only the workspace owner can delete this workspace"));
    }

    await pool.query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ─── GET /:workspaceId/meetings — meetings scoped to workspace ────────────────

workspacesRouter.get("/:workspaceId/meetings", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.appUser.id;

    await requireWorkspaceMember(workspaceId, userId);

    const result = await pool.query(
      `SELECT * FROM meeting_sessions
       WHERE workspace_id = $1
       ORDER BY created_at DESC`,
      [workspaceId]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// ─── GET /:workspaceId/action-items — action items scoped to workspace ────────

workspacesRouter.get("/:workspaceId/action-items", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.appUser.id;

    const member = await requireWorkspaceMember(workspaceId, userId);

    // Owners and admins see all workspace action items; members/viewers see only their own
    let result;
    if (member.role === "owner" || member.role === "admin") {
      result = await pool.query(
        `SELECT * FROM action_items
         WHERE workspace_id = $1
         ORDER BY created_at DESC`,
        [workspaceId]
      );
    } else {
      result = await pool.query(
        `SELECT * FROM action_items
         WHERE workspace_id = $1 AND user_id = $2
         ORDER BY created_at DESC`,
        [workspaceId, userId]
      );
    }

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// ─── GET /:workspaceId/dashboard — aggregated workspace statistics ─────────────

workspacesRouter.get("/:workspaceId/dashboard", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.appUser.id;

    await requireWorkspaceMember(workspaceId, userId);

    const [
      workspaceResult,
      membersResult,
      meetingsResult,
      actionItemsResult,
      recentMeetingsResult,
    ] = await Promise.all([
      pool.query(`SELECT * FROM workspaces WHERE id = $1 LIMIT 1`, [workspaceId]),
      pool.query(
        `SELECT COUNT(*)::int AS total FROM workspace_members WHERE workspace_id = $1 AND status = 'active'`,
        [workspaceId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total FROM meeting_sessions WHERE workspace_id = $1`,
        [workspaceId]
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE completed = true)::int AS completed,
           COUNT(*) FILTER (WHERE completed = false)::int AS pending
         FROM action_items WHERE workspace_id = $1`,
        [workspaceId]
      ),
      pool.query(
        `SELECT id, title, status, created_at FROM meeting_sessions
         WHERE workspace_id = $1
         ORDER BY created_at DESC
         LIMIT 5`,
        [workspaceId]
      ),
    ]);

    const workspace = workspaceResult.rows[0] ?? null;
    if (!workspace) {
      return next(new NotFoundError("Workspace not found"));
    }

    const actionItemStats = actionItemsResult.rows[0] ?? { total: 0, completed: 0, pending: 0 };

    res.json({
      workspace,
      stats: {
        totalMembers: membersResult.rows[0]?.total ?? 0,
        totalMeetings: meetingsResult.rows[0]?.total ?? 0,
        actionItems: {
          total: actionItemStats.total,
          completed: actionItemStats.completed,
          pending: actionItemStats.pending,
        },
      },
      recentMeetings: recentMeetingsResult.rows,
    });
  } catch (err) {
    next(err);
  }
});
