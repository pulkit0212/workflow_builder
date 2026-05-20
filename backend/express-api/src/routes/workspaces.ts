import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { pool } from "../db/client";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors";
import { canUseTeamWorkspace } from "../lib/subscription";
import { sendWorkspaceInviteEmail } from "../lib/workspace-invite-email";

export const workspacesRouter = Router();

// PostgreSQL returns snake_case columns; frontend expects camelCase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toCamel(row: Record<string, any>): Record<string, any> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    result[camel] = row[key];
  }
  return result;
}

function requireTeamWorkspacePlan(req: Request) {
  const plan = req.appUser.plan ?? "free";
  if (!canUseTeamWorkspace(plan)) {
    throw new ForbiddenError("Team workspaces are available on the Elite plan.");
  }
}

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

    requireTeamWorkspacePlan(req);

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

    const userEmail = (req.appUser.email ?? "").trim().toLowerCase();
    const invitedEmail = String(invite.invited_email).trim().toLowerCase();
    if (!userEmail || userEmail !== invitedEmail) {
      return next(
        new ForbiddenError(`Sign in with ${invite.invited_email} (the invited email) to accept this invite.`)
      );
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

    const userEmail = (req.appUser.email ?? "").trim().toLowerCase();
    const invitedEmail = String(invite.invited_email).trim().toLowerCase();
    if (!userEmail || userEmail !== invitedEmail) {
      return next(
        new ForbiddenError(`Sign in with ${invite.invited_email} (the invited email) to accept this invite.`)
      );
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

    res.json(result.rows.map(toCamel));
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

    // Viewers: only items they report or are assigned to; others: full workspace list
    let result;
    if (member.role === "viewer") {
      result = await pool.query(
        `SELECT * FROM action_items
         WHERE workspace_id = $1 AND (reporter_id = $2 OR assignee_id = $2)
         ORDER BY created_at DESC`,
        [workspaceId, userId]
      );
    } else if (member.role === "owner" || member.role === "admin") {
      result = await pool.query(
        `SELECT * FROM action_items
         WHERE workspace_id = $1
         ORDER BY created_at DESC`,
        [workspaceId]
      );
    } else {
      result = await pool.query(
        `SELECT * FROM action_items
         WHERE workspace_id = $1
         ORDER BY created_at DESC`,
        [workspaceId]
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
      meetingsThisMonthResult,
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
        `SELECT COUNT(*)::int AS total FROM meeting_sessions
         WHERE workspace_id = $1
           AND DATE_TRUNC('month', COALESCE(scheduled_start_time, created_at)) = DATE_TRUNC('month', NOW())`,
        [workspaceId]
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE completed = true OR status = 'done')::int AS completed,
           COUNT(*) FILTER (WHERE completed = false AND status != 'done')::int AS pending
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
        meetingsThisMonth: meetingsThisMonthResult.rows[0]?.total ?? 0,
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

// ─── PATCH /:workspaceId/members/:memberId — change member role ───────────────

workspacesRouter.patch("/:workspaceId/members/:memberId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { workspaceId, memberId } = req.params;
    const userId = req.appUser.id;

    const requester = await requireWorkspaceMember(workspaceId, userId);
    if (requester.role !== "admin" && requester.role !== "owner") {
      return next(new ForbiddenError("Only admins can change member roles"));
    }

    const { role } = req.body as { role?: string };
    if (!role || !["member", "viewer"].includes(role)) {
      return next(new BadRequestError("Role must be 'member' or 'viewer'"));
    }

    const result = await pool.query(
      `UPDATE workspace_members SET role = $1 WHERE id = $2 AND workspace_id = $3 RETURNING *`,
      [role, memberId, workspaceId]
    );

    if (result.rowCount === 0) {
      return next(new NotFoundError("Member not found"));
    }

    res.json({ success: true, member: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /:workspaceId/members/:memberId — remove member ──────────────────

workspacesRouter.delete("/:workspaceId/members/:memberId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { workspaceId, memberId } = req.params;
    const userId = req.appUser.id;

    const requester = await requireWorkspaceMember(workspaceId, userId);
    if (requester.role !== "admin" && requester.role !== "owner") {
      return next(new ForbiddenError("Only admins can remove members"));
    }

    // Prevent removing yourself
    const targetResult = await pool.query(
      `SELECT user_id, role FROM workspace_members WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [memberId, workspaceId]
    );
    const target = targetResult.rows[0] ?? null;
    if (!target) return next(new NotFoundError("Member not found"));
    if (target.user_id === userId) return next(new BadRequestError("You cannot remove yourself"));
    if (target.role === "owner") return next(new ForbiddenError("Cannot remove the workspace owner"));

    await pool.query(
      `DELETE FROM workspace_members WHERE id = $1 AND workspace_id = $2`,
      [memberId, workspaceId]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── POST /:workspaceId/leave — leave workspace ───────────────────────────────

workspacesRouter.post("/:workspaceId/leave", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.appUser.id;

    const member = await requireWorkspaceMember(workspaceId, userId);
    if (member.role === "owner") {
      return next(new BadRequestError("Workspace owners cannot leave. Transfer ownership first or delete the workspace."));
    }

    await pool.query(
      `DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, userId]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── POST /:workspaceId/transfer-ownership — transfer admin rights ────────────

workspacesRouter.post("/:workspaceId/transfer-ownership", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.appUser.id;

    const requester = await requireWorkspaceMember(workspaceId, userId);
    if (requester.role !== "admin" && requester.role !== "owner") {
      return next(new ForbiddenError("Only admins can transfer ownership"));
    }

    const { newOwnerMemberId } = req.body as { newOwnerMemberId?: string };
    if (!newOwnerMemberId) return next(new BadRequestError("newOwnerMemberId is required"));

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Promote new owner to admin
      const result = await client.query(
        `UPDATE workspace_members SET role = 'admin' WHERE id = $1 AND workspace_id = $2 RETURNING user_id`,
        [newOwnerMemberId, workspaceId]
      );
      if (result.rowCount === 0) {
        await client.query("ROLLBACK");
        return next(new NotFoundError("Target member not found"));
      }

      // Demote current admin to member
      await client.query(
        `UPDATE workspace_members SET role = 'member' WHERE workspace_id = $1 AND user_id = $2`,
        [workspaceId, userId]
      );

      await client.query("COMMIT");
      res.json({ success: true });
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

// ─── GET /:workspaceId/move-requests — list pending move requests ─────────────

workspacesRouter.get("/:workspaceId/move-requests", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.appUser.id;

    const member = await requireWorkspaceMember(workspaceId, userId);
    if (member.role !== "admin" && member.role !== "owner") {
      return next(new ForbiddenError("Only admins can view move requests"));
    }

    const result = await pool.query(
      `SELECT mr.*, ms.title AS meeting_title,
              u.id AS requester_id, u.full_name AS requester_full_name, u.email AS requester_email
       FROM workspace_move_requests mr
       LEFT JOIN meeting_sessions ms ON ms.id = mr.meeting_id
       LEFT JOIN users u ON u.id = mr.requested_by
       WHERE mr.workspace_id = $1 AND mr.status = 'pending'
       ORDER BY mr.created_at DESC`,
      [workspaceId]
    );

    const requests = result.rows.map((row) => ({
      id: row.id,
      meetingId: row.meeting_id,
      workspaceId: row.workspace_id,
      requestedBy: row.requested_by,
      status: row.status,
      createdAt: row.created_at,
      meeting: row.meeting_title ? { id: row.meeting_id, title: row.meeting_title } : undefined,
      requester: row.requester_id ? {
        id: row.requester_id,
        fullName: row.requester_full_name ?? null,
        email: row.requester_email,
      } : undefined,
    }));

    res.json({ success: true, requests });
  } catch (err) {
    next(err);
  }
});

// ─── POST /:workspaceId/move-requests/:requestId/approve ─────────────────────

workspacesRouter.post("/:workspaceId/move-requests/:requestId/approve", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { workspaceId, requestId } = req.params;
    const userId = req.appUser.id;

    requireTeamWorkspacePlan(req);

    const member = await requireWorkspaceMember(workspaceId, userId);
    if (member.role !== "admin" && member.role !== "owner") {
      return next(new ForbiddenError("Only admins can approve move requests"));
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const reqResult = await client.query(
        `SELECT * FROM workspace_move_requests WHERE id = $1 AND workspace_id = $2 AND status = 'pending' LIMIT 1`,
        [requestId, workspaceId]
      );
      const moveReq = reqResult.rows[0] ?? null;
      if (!moveReq) {
        await client.query("ROLLBACK");
        return next(new NotFoundError("Move request not found or already handled"));
      }

      // Move the meeting to this workspace and align row with instant-admin share path
      await client.query(
        `UPDATE meeting_sessions
         SET workspace_id = $1,
             workspace_move_status = 'approved',
             workspace_moved_by = $2,
             workspace_moved_at = NOW(),
             updated_at = NOW()
         WHERE id = $3`,
        [workspaceId, userId, moveReq.meeting_id]
      );

      // Mark request as approved
      await client.query(
        `UPDATE workspace_move_requests SET status = 'approved', reviewed_at = NOW(), reviewed_by = $1 WHERE id = $2`,
        [userId, requestId]
      );

      await client.query("COMMIT");
      res.json({ success: true });
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

// ─── POST /:workspaceId/move-requests/:requestId/reject ──────────────────────

workspacesRouter.post("/:workspaceId/move-requests/:requestId/reject", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { workspaceId, requestId } = req.params;
    const userId = req.appUser.id;

    requireTeamWorkspacePlan(req);

    const member = await requireWorkspaceMember(workspaceId, userId);
    if (member.role !== "admin" && member.role !== "owner") {
      return next(new ForbiddenError("Only admins can reject move requests"));
    }

    const result = await pool.query<{ meeting_id: string }>(
      `UPDATE workspace_move_requests SET status = 'rejected', reviewed_at = NOW(), reviewed_by = $1
       WHERE id = $2 AND workspace_id = $3 AND status = 'pending'
       RETURNING meeting_id`,
      [userId, requestId, workspaceId]
    );

    if (result.rowCount === 0) {
      return next(new NotFoundError("Move request not found or already handled"));
    }

    const meetingIdRejected = result.rows[0]?.meeting_id;
    if (meetingIdRejected) {
      await pool.query(
        `UPDATE meeting_sessions SET workspace_move_status = NULL, updated_at = NOW()
         WHERE id = $1 AND workspace_move_status = 'pending'`,
        [meetingIdRejected]
      );
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── GET /:workspaceId/invite — list pending invites ─────────────────────────

workspacesRouter.get("/:workspaceId/invite", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.appUser.id;

    const member = await requireWorkspaceMember(workspaceId, userId);
    if (member.role !== "admin" && member.role !== "owner") {
      return next(new ForbiddenError("Only admins can view invites"));
    }

    const result = await pool.query(
      `SELECT id, invited_email, created_at, expires_at
       FROM workspace_invites
       WHERE workspace_id = $1 AND status = 'pending' AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [workspaceId]
    );

    res.json({
      invites: result.rows.map((row) => ({
        id: row.id,
        invitedEmail: row.invited_email,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /:workspaceId/invite — send email invite ───────────────────────────

workspacesRouter.post("/:workspaceId/invite", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.appUser.id;

    requireTeamWorkspacePlan(req);

    const member = await requireWorkspaceMember(workspaceId, userId);
    if (member.role !== "admin" && member.role !== "owner") {
      return next(new ForbiddenError("Only admins can invite members"));
    }

    const { email } = req.body as { email?: string };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ success: false, details: { code: "invalid_email" } });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if already a member
    const existingMember = await pool.query(
      `SELECT wm.id FROM workspace_members wm
       JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = $1 AND LOWER(u.email) = $2 AND wm.status = 'active'
       LIMIT 1`,
      [workspaceId, normalizedEmail]
    );
    if ((existingMember.rowCount ?? 0) > 0) {
      return res.status(400).json({ success: false, details: { code: "already_a_member" } });
    }

    // Check if invite already pending
    const existingInvite = await pool.query(
      `SELECT id FROM workspace_invites
       WHERE workspace_id = $1 AND invited_email = $2 AND status = 'pending' AND expires_at > NOW()
       LIMIT 1`,
      [workspaceId, normalizedEmail]
    );
    if ((existingInvite.rowCount ?? 0) > 0) {
      return res.status(400).json({ success: false, details: { code: "invite_already_pending" } });
    }

    // Generate token and create invite (expires in 7 days)
    const crypto = await import("crypto");
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO workspace_invites (workspace_id, invited_email, invited_by, token, status, expires_at)
       VALUES ($1, $2, $3, $4, 'pending', $5)`,
      [workspaceId, normalizedEmail, userId, token, expiresAt]
    );

    const frontendBase = (process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/$/, "");
    const inviteLink = `${frontendBase}/invite?token=${encodeURIComponent(token)}`;

    const [wsNameRes, inviterRes] = await Promise.all([
      pool.query<{ name: string }>(`SELECT name FROM workspaces WHERE id = $1 LIMIT 1`, [workspaceId]),
      pool.query<{ full_name: string | null; email: string | null }>(
        `SELECT full_name, email FROM users WHERE id = $1 LIMIT 1`,
        [userId]
      ),
    ]);
    const workspaceName = wsNameRes.rows[0]?.name ?? "Workspace";
    const inviterRow = inviterRes.rows[0];
    const inviterDisplayName =
      (inviterRow?.full_name && inviterRow.full_name.trim()) || inviterRow?.email || "A teammate";

    const emailResult = await sendWorkspaceInviteEmail({
      to: normalizedEmail,
      inviteLink,
      workspaceName,
      inviterDisplayName,
    });

    res.status(201).json({
      success: true,
      inviteLink,
      invitedEmail: normalizedEmail,
      emailSent: emailResult.ok,
      ...(emailResult.ok
        ? {}
        : {
            emailSkippedReason: emailResult.reason,
            ...(emailResult.reason === "send_failed" && emailResult.detail
              ? { emailError: emailResult.detail }
              : {}),
          }),
    });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /:workspaceId/invite/:inviteId — revoke invite ───────────────────

workspacesRouter.delete("/:workspaceId/invite/:inviteId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { workspaceId, inviteId } = req.params;
    const userId = req.appUser.id;

    const member = await requireWorkspaceMember(workspaceId, userId);
    if (member.role !== "admin" && member.role !== "owner") {
      return next(new ForbiddenError("Only admins can revoke invites"));
    }

    await pool.query(
      `UPDATE workspace_invites SET status = 'revoked' WHERE id = $1 AND workspace_id = $2`,
      [inviteId, workspaceId]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── GET /:workspaceId/invite/suggestions — email autocomplete ────────────────

workspacesRouter.get("/:workspaceId/invite/suggestions", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.appUser.id;
    const q = (req.query.q as string ?? "").trim();

    await requireWorkspaceMember(workspaceId, userId);

    if (!q || q.length < 2) {
      return res.json({ suggestions: [] });
    }

    // Suggest users who are not already members
    const result = await pool.query(
      `SELECT u.email FROM users u
       WHERE LOWER(u.email) LIKE $1
       AND u.id NOT IN (
         SELECT user_id FROM workspace_members WHERE workspace_id = $2 AND status = 'active'
       )
       LIMIT 5`,
      [`${q.toLowerCase()}%`, workspaceId]
    );

    res.json({ suggestions: result.rows.map((r) => r.email) });
  } catch (err) {
    next(err);
  }
});
