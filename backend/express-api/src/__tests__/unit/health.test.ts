import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { healthRouter } from "../../routes/health";

function createTestApp() {
  const app = express();
  app.use("/health", healthRouter);
  return app;
}

describe("GET /health", () => {
  it("returns HTTP 200 with { status: 'ok' }", async () => {
    const app = createTestApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("responds within 100ms", async () => {
    const app = createTestApp();
    const start = Date.now();
    await request(app).get("/health");
    expect(Date.now() - start).toBeLessThan(100);
  });
});
