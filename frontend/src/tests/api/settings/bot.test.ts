/**
 * Bot Settings API Tests
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 * 
 * Tests for POST /api/settings/bot endpoint
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

describe("POST /api/settings/bot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Authentication", () => {
    it("should return 401 when user is not authenticated", async () => {
      // **Validates: Requirement 3.4**
      // IF the user is not authenticated, THEN THE Settings_API SHALL return status 401
      
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: null } as any);

      const request = new Request("http://localhost/api/settings/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botDisplayName: "Test Bot",
          audioSource: "default"
        })
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
      
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.message).toBe("Unauthorized.");
    });
  });

  describe("Validation", () => {
    it("should reject empty botDisplayName", async () => {
      // **Validates: Requirement 3.5**
      // THE Settings_API SHALL validate that botDisplayName is not empty before saving
      
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);

      const request = new Request("http://localhost/api/settings/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botDisplayName: "",
          audioSource: "default"
        })
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.message).toContain("Bot display name cannot be empty");
    });

    it("should reject null botDisplayName", async () => {
      // **Validates: Requirement 3.5**
      
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);

      const request = new Request("http://localhost/api/settings/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botDisplayName: null,
          audioSource: "default"
        })
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it("should accept valid bot settings with audioSource", async () => {
      // **Validates: Requirements 3.1, 3.2**
      // WHEN a POST request is received with botDisplayName and audioSource,
      // THE Settings_API SHALL save these to the user_preferences table
      
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);

      const { db } = await import("@/lib/db/client");
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });
      vi.mocked(db.update).mockImplementation(mockUpdate as any);

      const request = new Request("http://localhost/api/settings/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botDisplayName: "My Custom Bot",
          audioSource: "pulse"
        })
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it("should accept valid bot settings without audioSource", async () => {
      // **Validates: Requirements 3.1, 3.2**
      // audioSource is optional and should default to "default"
      
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);

      const { db } = await import("@/lib/db/client");
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });
      vi.mocked(db.update).mockImplementation(mockUpdate as any);

      const request = new Request("http://localhost/api/settings/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botDisplayName: "My Custom Bot"
        })
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  describe("Success Response", () => {
    it("should return success response with status 200", async () => {
      // **Validates: Requirement 3.3**
      // WHEN bot settings are successfully saved,
      // THE Settings_API SHALL return a success response with status 200
      
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);

      const { db } = await import("@/lib/db/client");
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });
      vi.mocked(db.update).mockImplementation(mockUpdate as any);

      const request = new Request("http://localhost/api/settings/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botDisplayName: "Test Bot",
          audioSource: "default"
        })
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty("success", true);
    });
  });
});
