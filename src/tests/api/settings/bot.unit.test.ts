/**
 * Unit Tests: POST /api/settings/bot
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/settings/bot/route";

// Mock Clerk auth
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

// Mock database client
vi.mock("@/lib/db/client", () => ({
  db: {
    update: vi.fn(),
  },
}));

// Mock database bootstrap
vi.mock("@/lib/db/bootstrap", () => ({
  ensureDatabaseReady: vi.fn().mockResolvedValue(undefined),
}));

// Mock current user sync
vi.mock("@/lib/auth/current-user", () => ({
  syncCurrentUserToDatabase: vi.fn().mockResolvedValue({
    id: "test-user-id",
    clerkUserId: "test-clerk-id",
    email: "test@example.com",
    createdAt: new Date("2024-01-01"),
  }),
}));

async function setupAuthenticatedUser() {
  const { auth } = await import("@clerk/nextjs/server");
  vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);
}

async function setupUnauthenticatedUser() {
  const { auth } = await import("@clerk/nextjs/server");
  vi.mocked(auth).mockResolvedValue({ userId: null } as any);
}

function setupDbUpdateMock() {
  return import("@/lib/db/client").then(({ db }) => {
    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    vi.mocked(db!.update).mockReturnValue({ set: mockSet } as any);
    return { mockSet, mockWhere };
  });
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/settings/bot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/settings/bot - Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with valid botDisplayName and audioSource", async () => {
    // Requirements 3.1, 3.2, 3.3
    await setupAuthenticatedUser();
    await setupDbUpdateMock();

    const request = makeRequest({
      botDisplayName: "My Bot",
      audioSource: "microphone",
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("returns 200 and defaults audioSource to 'default' when not provided", async () => {
    // Requirements 3.2, 3.3
    await setupAuthenticatedUser();
    const { db } = await import("@/lib/db/client");

    let capturedSetArgs: Record<string, unknown> | undefined;
    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockImplementation((args) => {
      capturedSetArgs = args;
      return { where: mockWhere };
    });
    vi.mocked(db!.update).mockReturnValue({ set: mockSet } as any);

    const request = makeRequest({ botDisplayName: "My Bot" });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(capturedSetArgs?.audioSource).toBe("default");
  });

  it("returns 400 for empty botDisplayName", async () => {
    // Requirement 3.5
    await setupAuthenticatedUser();

    const request = makeRequest({ botDisplayName: "" });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it("returns 401 for unauthenticated requests", async () => {
    // Requirement 3.4
    await setupUnauthenticatedUser();

    const request = makeRequest({ botDisplayName: "My Bot" });
    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it("returns 500 when database throws an error", async () => {
    // Requirement 3.3 (error handling)
    await setupAuthenticatedUser();
    const { db } = await import("@/lib/db/client");

    vi.mocked(db!.update).mockImplementation(() => {
      throw new Error("DB connection failed");
    });

    const request = makeRequest({ botDisplayName: "My Bot" });
    const response = await POST(request);

    expect(response.status).toBe(500);
  });
});
