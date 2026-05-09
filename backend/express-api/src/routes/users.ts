import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../db/client";

export const usersRouter = Router();

// GET /api/users/search?q=
usersRouter.get("/search", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = ((req.query.q as string) ?? "").trim();

    // Return 400 when q is absent or empty
    if (!q || q.length === 0) {
      return res.status(400).json({ error: "q parameter is required and must be at least 1 character" });
    }

    const workspaceId = req.headers["x-workspace-id"] as string | undefined;
    const searchTerm = `%${q}%`;

    let queryText: string;
    let queryParams: unknown[];

    if (workspaceId) {
      // Restrict to active members of the given workspace
      queryText = `
        SELECT u.id,
               u.full_name,
               u.email
        FROM users u
        JOIN workspace_members wm ON wm.user_id = u.id
          AND wm.workspace_id = $3
          AND wm.status = 'active'
        WHERE (u.full_name ILIKE $1 OR u.email ILIKE $1)
          AND u.id != $2
        LIMIT 20`;
      queryParams = [searchTerm, req.appUser.id, workspaceId];
    } else {
      queryText = `
        SELECT id,
               full_name,
               email
        FROM users
        WHERE (full_name ILIKE $1 OR email ILIKE $1)
          AND id != $2
        LIMIT 20`;
      queryParams = [searchTerm, req.appUser.id];
    }

    const { rows } = await pool.query(queryText, queryParams);

    return res.json({ users: rows });
  } catch (err) {
    next(err);
  }
});
