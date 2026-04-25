import rateLimit from "express-rate-limit";

export const rateLimiter = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 100,
  keyGenerator: (req) => req.clerkUserId ?? req.ip ?? "unknown",
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many requests" });
  },
  standardHeaders: true,
  legacyHeaders: false,
});
