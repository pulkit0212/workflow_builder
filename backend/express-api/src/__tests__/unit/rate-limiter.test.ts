import { describe, it, expect } from "vitest";
import express, { Request, Response } from "express";
import request from "supertest";
import { rateLimiter } from "../../middleware/rate-limiter";

function createTestApp(clerkUserId?: string) {
  const app = express();

  // Simulate clerkAuth attaching clerkUserId
  app.use((req: Request, _res: Response, next) => {
    if (clerkUserId) {
      (req as Request & { clerkUserId: string }).clerkUserId = clerkUserId;
    }
    next();
  });

  app.use(rateLimiter);
  app.get("/test", (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe("rateLimiter middleware", () => {
  it("allows requests under the limit", async () => {
    const app = createTestApp("user_abc");
    const res = await request(app).get("/test");
    expect(res.status).toBe(200);
  });

  it("returns 429 after 100 requests in a minute", async () => {
    const app = createTestApp("user_limit_test");

    // Send 100 requests (all should pass)
    for (let i = 0; i < 100; i++) {
      const res = await request(app).get("/test");
      expect(res.status).toBe(200);
    }

    // 101st request should be rate limited
    const res = await request(app).get("/test");
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: "Too many requests" });
  });

  it("returns JSON error body on 429", async () => {
    const app = createTestApp("user_json_test");

    for (let i = 0; i < 100; i++) {
      await request(app).get("/test");
    }

    const res = await request(app).get("/test");
    expect(res.status).toBe(429);
    expect(res.body).toHaveProperty("error", "Too many requests");
  });
});
