import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { pool } from "../db/client";
import { BadRequestError } from "../lib/errors";
import { clerkAuth } from "../middleware/clerk-auth";

export const inviteRouter = Router();

// GET /api/invite/validate?token=  (public — no clerkAuth)
inviteRouter.get("/validate", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = (req.query.token as string) ?? "";
    if (!token) {
      return res.status(400).json({ error: "Token is required.", code: "token_not_found" });
    }

    const { rows } = await pool.query(
      `SELECT wi.id, wi.workspace_id, wi.invited_email, wi.status, wi.expires_at, wi.invited_by,
              w.name AS workspace_name,
              COALESCE(u.full_name, u.email) AS inviter_name
       FROM workspace_invites wi
       LEFT JOIN workspaces w ON w.id = wi.workspace_id
       LEFT JOIN users u ON u.id = wi.invited_by
       WHERE wi.token = $1
       LIMIT 1`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Invite not found.", code: "token_not_found" });
    }

    const invite = rows[0] as Record<string, unknown>;

    if (new Date(invite.expires_at as string) < new Date()) {
      return res.status(410).json({ error: "This invite has expired.", code: "token_expired" });
    }

    if (invite.status === "accepted") {
      return res.status(410).json({ error: "This invite has already been used.", code: "token_already_used" });
    }

    if (invite.status === "revoked") {
      return res.status(410).json({ error: "This invite has been revoked.", code: "token_revoked" });
    }

    return res.json({
      workspaceId: invite.workspace_id,
      workspaceName: invite.workspace_name ?? "Unknown Workspace",
      invitedEmail: invite.invited_email,
      inviterName: invite.inviter_name ?? "Someone",
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/invite/accept  (requires clerkAuth)
const acceptSchema = z.object({ token: z.string().min(1) });

inviteRouter.post("/accept", clerkAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = acceptSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError("Token is required.");
    }

    const { token } = parsed.data;
    const user = req.appUser;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Lock the invite row
      const { rows } = await client.query(
        `SELECT * FROM workspace_invites WHERE token = $1 LIMIT 1 FOR UPDATE`,
        [token]
      );

      if (rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Invite not found.", code: "token_not_found" });
      }

      const invite = rows[0] as Record<string, unknown>;

      if (new Date(invite.expires_at as string) < new Date()) {
        await client.query("ROLLBACK");
        return res.status(410).json({ error: "This invite has expired.", code: "token_expired" });
      }

      if (invite.status === "accepted") {
        await client.query("ROLLBACK");
        return res.status(410).json({ error: "This invite has already been used.", code: "token_already_used" });
      }

      if (invite.status === "revoked") {
        await client.query("ROLLBACK");
        return res.status(410).json({ error: "This invite has been revoked.", code: "token_revoked" });
      }

      if ((invite.invited_email as string).toLowerCase() !== user.email.toLowerCase()) {
        await client.query("ROLLBACK");
        return res.status(403).json({ error: "email_mismatch", code: "email_mismatch" });
      }

      // Insert workspace member (skip if already exists)
      await client.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role, status)
         VALUES ($1, $2, 'member', 'active')
         ON CONFLICT DO NOTHING`,
        [invite.workspace_id, user.id]
      );

      // Mark invite as accepted
      await client.query(
        `UPDATE workspace_invites SET status = 'accepted', accepted_at = NOW() WHERE id = $1`,
        [invite.id]
      );

      await client.query("COMMIT");

      return res.json({ workspaceId: invite.workspace_id });
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
