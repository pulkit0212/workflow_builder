import { describe, it, expect } from "vitest";
import express, { Request, Response } from "express";
import request from "supertest";
import rateLimit from "express-rate-limit";

/** Tight limit for fast tests — production limiter uses a much higher max. */
function createStrictTestLimiter(max: number) {
  return rateLimit({
    windowMs: 60_000,
    max,
    keyGenerator: (req) =>
      (req as Request & { clerkUserId?: string }).clerkUserId ?? req.ip ?? "unknown",
    handler: (_req, res) => {
      res.status(429).json({ error: "Too many requests" });
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

function createTestApp(clerkUserId: string | undefined, limiter: ReturnType<typeof createStrictTestLimiter>) {
  const app = express();

  // Simulate clerkAuth attaching clerkUserId
  app.use((req: Request, _res: Response, next) => {
    if (clerkUserId) {
      (req as Request & { clerkUserId: string }).clerkUserId = clerkUserId;
    }
    next();
  });

  app.use(limiter);
  app.get("/test", (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe("rateLimiter middleware", () => {
  it("allows requests under the limit", async () => {
    const app = createTestApp("user_abc", createStrictTestLimiter(100));
    const res = await request(app).get("/test");
    expect(res.status).toBe(200);
  });

  it("returns 429 after exceeding max requests in a window", async () => {
    const max = 10;
    const app = createTestApp("user_limit_test", createStrictTestLimiter(max));

    for (let i = 0; i < max; i++) {
      const res = await request(app).get("/test");
      expect(res.status).toBe(200);
    }

    const res = await request(app).get("/test");
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: "Too many requests" });
  });

  it("returns JSON error body on 429", async () => {
    const max = 10;
    const app = createTestApp("user_json_test", createStrictTestLimiter(max));

    for (let i = 0; i < max; i++) {
      await request(app).get("/test");
    }

    const res = await request(app).get("/test");
    expect(res.status).toBe(429);
    expect(res.body).toHaveProperty("error", "Too many requests");
  });
});
