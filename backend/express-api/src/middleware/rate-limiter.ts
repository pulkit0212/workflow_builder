import rateLimit from "express-rate-limit";

/**
 * One shared limiter instance is mounted on every authenticated route in app.ts,
 * so this budget applies to all /api/* traffic combined per user (clerkUserId).
 * Keep it high enough for SPA bursts (many parallel calls on dashboard load).
 */
export const rateLimiter = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 2000,
  keyGenerator: (req) => req.clerkUserId ?? req.ip ?? "unknown",
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many requests" });
  },
  standardHeaders: true,
  legacyHeaders: false,
});
