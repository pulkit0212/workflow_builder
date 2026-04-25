import { describe, it, expect, vi, beforeEach } from "vitest";
import { startBot, stopBot, BotClientError } from "../../lib/bot-client";

// Mock config so botBaseUrl is predictable
vi.mock("../../config", () => ({
  config: { botBaseUrl: "http://bot-service:8000" },
}));

function mockFetch(status: number, ok: boolean) {
  return vi.fn().mockResolvedValue({ ok, status });
}

describe("bot-client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("startBot", () => {
    it("POSTs to /start with meetingId and resolves on 2xx", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      await expect(startBot("meeting-123")).resolves.toBeUndefined();

      expect(fetchSpy).toHaveBeenCalledWith("http://bot-service:8000/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId: "meeting-123" }),
      });
    });

    it("throws BotClientError on non-2xx response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 503,
      } as Response);

      await expect(startBot("meeting-123")).rejects.toThrow(BotClientError);
      await expect(startBot("meeting-123")).rejects.toMatchObject({ status: 503 });
    });
  });

  describe("stopBot", () => {
    it("POSTs to /stop with meetingId and resolves on 2xx", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      await expect(stopBot("meeting-456")).resolves.toBeUndefined();

      expect(fetchSpy).toHaveBeenCalledWith("http://bot-service:8000/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId: "meeting-456" }),
      });
    });

    it("throws BotClientError on non-2xx response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      await expect(stopBot("meeting-456")).rejects.toThrow(BotClientError);
      await expect(stopBot("meeting-456")).rejects.toMatchObject({ status: 500 });
    });
  });
});
