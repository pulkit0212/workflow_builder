import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("loads config with all env vars set", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    process.env.PORT = "4000";
    process.env.ALLOWED_ORIGINS = "http://localhost:3000,https://example.com";
    process.env.CLERK_SECRET_KEY = "sk_test_abc";
    process.env.CLERK_WEBHOOK_SECRET = "whsec_xyz";
    process.env.RECORDINGS_DIR = "/tmp/recordings";
    process.env.BOT_BASE_URL = "http://localhost:8000";

    const { config } = await import("../../config");

    expect(config.port).toBe(4000);
    expect(config.databaseUrl).toBe("postgresql://user:pass@localhost:5432/db");
    expect(config.allowedOrigins).toEqual(["http://localhost:3000", "https://example.com"]);
    expect(config.clerkSecretKey).toBe("sk_test_abc");
    expect(config.clerkWebhookSecret).toBe("whsec_xyz");
    expect(config.recordingsDir).toBe("/tmp/recordings");
    expect(config.botBaseUrl).toBe("http://localhost:8000");
  });

  it("defaults PORT to 3001 when not set", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    delete process.env.PORT;

    const { config } = await import("../../config");
    expect(config.port).toBe(3001);
  });

  it("defaults ALLOWED_ORIGINS to empty array when not set", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    delete process.env.ALLOWED_ORIGINS;

    const { config } = await import("../../config");
    expect(config.allowedOrigins).toEqual([]);
  });

  it("defaults RECORDINGS_DIR to ./private/recordings when not set", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    delete process.env.RECORDINGS_DIR;

    const { config } = await import("../../config");
    expect(config.recordingsDir).toBe("./private/recordings");
  });

  it("calls process.exit(1) when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await import("../../config");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("DATABASE_URL")
    );

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it("splits ALLOWED_ORIGINS on commas and trims whitespace", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    process.env.ALLOWED_ORIGINS = " http://a.com , http://b.com ";

    const { config } = await import("../../config");
    expect(config.allowedOrigins).toEqual(["http://a.com", "http://b.com"]);
  });
});
