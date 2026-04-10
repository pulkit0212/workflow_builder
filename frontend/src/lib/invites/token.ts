import crypto from "node:crypto";

/** Generates a cryptographically secure 64-char hex invite token (32 bytes entropy). */
export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Returns a Date exactly 7 days after the given createdAt. */
export function getInviteExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
}
