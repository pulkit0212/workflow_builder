/**
 * Integration Test: POST /api/meetings/share-calendar
 *
 * **Validates: Requirements 2.2**
 *
 * Verifies that the Next.js proxy route returns Content-Type: application/json
 * (not an HTML 404 page) when the backend fetch is mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/meetings/share-calendar/route";
import { NextRequest } from "next/server";

describe("POST /api/meetings/share-calendar", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns Content-Type: application/json on success", async () => {
    // **Validates: Requirements 2.2**
    // The route must proxy to the Express backend and return JSON, not HTML.
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const req = new NextRequest("http://localhost:3000/api/meetings/share-calendar", {
      method: "POST",
      body: JSON.stringify({ meetingId: "test-meeting-id", workspaceId: "ws-1" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);

    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("forwards the request body to the Express backend", async () => {
    // **Validates: Requirements 2.2**
    const mockFetch = vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const payload = { meetingId: "abc", workspaceId: "ws-2" };
    const req = new NextRequest("http://localhost:3000/api/meetings/share-calendar", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });

    await POST(req);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("/api/meetings/share-calendar");
    expect(JSON.parse(init?.body as string)).toEqual(payload);
  });

  it("forwards Authorization header to the Express backend", async () => {
    // **Validates: Requirements 2.2**
    const mockFetch = vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const req = new NextRequest("http://localhost:3000/api/meetings/share-calendar", {
      method: "POST",
      body: JSON.stringify({}),
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-token",
      },
    });

    await POST(req);

    const [, init] = mockFetch.mock.calls[0];
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe("Bearer test-token");
  });

  it("returns 500 JSON on fetch failure", async () => {
    // **Validates: Requirements 2.2** — graceful error handling
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));

    const req = new NextRequest("http://localhost:3000/api/meetings/share-calendar", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);

    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("proxies the backend status code to the client", async () => {
    // **Validates: Requirements 2.2**
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    );

    const req = new NextRequest("http://localhost:3000/api/meetings/share-calendar", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });
});
