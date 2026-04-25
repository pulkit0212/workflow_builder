import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/errors";

// pg/Drizzle error codes
const DB_MIGRATION_CODES = new Set(["42P01", "42703"]);
const DB_CONNECTION_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ECONNRESET",
  "57P03", // cannot_connect_now
  "08000", // connection_exception
  "08003", // connection_does_not_exist
  "08006", // connection_failure
]);

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // AppError subclasses — use their statusCode and message directly
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // Drizzle/pg errors carry a `code` property
  const pgCode = (err as { code?: string }).code;

  if (pgCode && DB_MIGRATION_CODES.has(pgCode)) {
    res.status(503).json({ error: "Database migration required" });
    return;
  }

  if (pgCode && DB_CONNECTION_CODES.has(pgCode)) {
    res.status(503).json({ error: "Service unavailable" });
    return;
  }

  // All other errors — log internally, never expose details
  console.error("[errorHandler] Unhandled error:", err instanceof Error ? err.stack : err);
  res.status(500).json({ error: "Internal server error" });
}
