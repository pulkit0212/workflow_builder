import { Router, Request, Response, NextFunction } from "express";
import fs from "node:fs";
import path from "node:path";

export const botRouter = Router();

// GET /api/bot/profile-status
botRouter.get("/profile-status", (_req: Request, res: Response, next: NextFunction) => {
  try {
    const profilePath = path.join(process.cwd(), "tmp", "bot-profile");

    if (!fs.existsSync(profilePath)) {
      return res.json({ configured: false });
    }

    const entries = fs.readdirSync(profilePath).filter((e) => e !== ".DS_Store");
    return res.json({ configured: entries.length > 0 });
  } catch {
    return res.json({ configured: false });
  }
});
