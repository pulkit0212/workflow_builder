import { verifyToken } from "@clerk/backend";
import { Request, Response, NextFunction } from "express";
import { config } from "../config";
import { db } from "../db/client";
import { syncUser, AppUser } from "../lib/user-sync-cache";

// Augment Express Request to include Clerk auth fields
declare global {
  namespace Express {
    interface Request {
      clerkUserId: string;
      appUser: AppUser;
    }
  }
}

export async function clerkAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  try {
    const payload = await verifyToken(token, { secretKey: config.clerkSecretKey });
    const clerkUserId = payload.sub;

    req.clerkUserId = clerkUserId;

    const appUser = await syncUser(clerkUserId, db);
    req.appUser = appUser;

    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}
