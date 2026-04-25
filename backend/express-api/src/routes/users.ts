import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../db/client";

export const usersRouter = Router();

// GET /api/users/search?q=
usersRouter.get("/search", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = ((req.query.q as string) ?? "").trim();
    if (q.length < 2) {
      return res.json({ success: true, users: [] });
    }

    const currentUserId = req.appUser.id;
    const searchTerm = `%${q}%`;

    const { rows } = await pool.query(
      `SELECT id,
              COALESCE(full_name, email) AS name,
              email
       FROM users
       WHERE (full_name ILIKE $1 OR email ILIKE $1)
         AND id != $2
       LIMIT 8`,
      [searchTerm, currentUserId]
    );

    return res.json({ success: true, users: rows });
  } catch (err) {
    next(err);
  }
});
