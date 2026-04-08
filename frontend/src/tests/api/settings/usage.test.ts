/**
 * Usage Statistics API Tests
 * 
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7**
 * 
 * Tests for GET /api/settings/usage endpoint
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/settings/usage/route";

// Mock Clerk auth
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

// Mock database client
vi.mock("@/lib/db/client", () => ({
  db: {
    select: vi.fn(),
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

// Mock subscription service
vi.mock("@/lib/subscription.server", () => ({
  getUserSubscription: vi.fn().mockResolvedValue({
    plan: "free",
  }),
}));

// Mock subscription limits
vi.mock("@/lib/subscription", () => ({
  getPlanLimits: vi.fn().mockReturnValue({
    meetingBot: true,
    transcription: true,
    summary: true,
    actionItems: true,
    history: false,
    meetingsPerMonth: 5,
    unlimited: false,
  }),
}));

// Mock workspace resolver
vi.mock("@/lib/workspaces/server", () => ({
  resolveWorkspaceIdForRequest: vi.fn().mockResolvedValue(null),
}));

describe("GET /api/settings/usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Authentication", () => {
    it("should return 401 when user is not authenticated", async () => {
      // **Validates: Requirement 4.7**
      // IF the user is not authenticated, THEN THE Settings_API SHALL return status 401
      
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: null } as any);

      const mockReq = new Request("http://localhost/api/settings/usage");
      const response = await GET(mockReq);
      expect(response.status).toBe(401);
      
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.message).toBe("Unauthorized.");
    });
  });

  describe("Response Structure", () => {
    it("should return usage statistics with all required fields", async () => {
      // **Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6**
      // WHEN a GET request is received, THE Settings_API SHALL return:
      // - meetings count (this month and all time)
      // - transcripts generated count
      // - action items count
      // - storage usage statistics
      // - plan limits from the subscription
      // - memberSince date
      
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);

      const { db } = await import("@/lib/db/client");
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 5 }]),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect as any);

      const mockReq = new Request("http://localhost/api/settings/usage");
      const response = await GET(mockReq);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty("success", true);
      expect(data).toHaveProperty("meetingsThisMonth");
      expect(data).toHaveProperty("meetingsAllTime");
      expect(data).toHaveProperty("transcriptsGenerated");
      expect(data).toHaveProperty("actionItemsCreated");
      expect(data).toHaveProperty("documentsAnalyzed");
      expect(data).toHaveProperty("memberSince");
      expect(data).toHaveProperty("limits");
      
      // Verify limits structure
      expect(data.limits).toHaveProperty("meetingBot");
      expect(data.limits).toHaveProperty("transcription");
      expect(data.limits).toHaveProperty("summary");
      expect(data.limits).toHaveProperty("actionItems");
      expect(data.limits).toHaveProperty("history");
      expect(data.limits).toHaveProperty("meetingsPerMonth");
      expect(data.limits).toHaveProperty("unlimited");
    });

    it("should return non-negative statistics", async () => {
      // **Validates: Property 7 - Usage Statistics Non-Negative Invariant**
      // All usage statistics should be >= 0
      
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);

      const { db } = await import("@/lib/db/client");
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 3 }]),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect as any);

      const mockReq = new Request("http://localhost/api/settings/usage");
      const response = await GET(mockReq);
      const data = await response.json();
      
      expect(data.meetingsThisMonth).toBeGreaterThanOrEqual(0);
      expect(data.meetingsAllTime).toBeGreaterThanOrEqual(0);
      expect(data.transcriptsGenerated).toBeGreaterThanOrEqual(0);
      expect(data.actionItemsCreated).toBeGreaterThanOrEqual(0);
      expect(data.documentsAnalyzed).toBeGreaterThanOrEqual(0);
    });

    it("should have meetingsThisMonth <= meetingsAllTime", async () => {
      // **Validates: Property 7 - Usage Statistics Non-Negative Invariant**
      // Logical consistency: this month's meetings cannot exceed all-time meetings
      
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);

      const { db } = await import("@/lib/db/client");
      let callCount = 0;
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            // First call: meetingsThisMonth = 3
            // Second call: meetingsAllTime = 10
            return Promise.resolve([{ value: callCount === 1 ? 3 : 10 }]);
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect as any);

      const mockReq = new Request("http://localhost/api/settings/usage");
      const response = await GET(mockReq);
      const data = await response.json();
      
      expect(data.meetingsThisMonth).toBeLessThanOrEqual(data.meetingsAllTime);
    });

    it("should return memberSince as ISO 8601 date string", async () => {
      // **Validates: Requirement 4.6**
      // memberSince should be a valid ISO 8601 date
      
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);

      const { db } = await import("@/lib/db/client");
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 0 }]),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect as any);

      const mockReq = new Request("http://localhost/api/settings/usage");
      const response = await GET(mockReq);
      const data = await response.json();
      
      expect(typeof data.memberSince).toBe("string");
      expect(() => new Date(data.memberSince)).not.toThrow();
      expect(new Date(data.memberSince).toISOString()).toBe(data.memberSince);
    });
  });

  describe("Meetings Count", () => {
    it("should count meetings for this month correctly", async () => {
      // **Validates: Requirement 4.2**
      // WHEN a GET request is received,
      // THE Settings_API SHALL return meetings count (this month and all time)
      
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);

      const { db } = await import("@/lib/db/client");
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 7 }]),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect as any);

      const mockReq = new Request("http://localhost/api/settings/usage");
      const response = await GET(mockReq);
      const data = await response.json();
      
      expect(typeof data.meetingsThisMonth).toBe("number");
      expect(Number.isInteger(data.meetingsThisMonth)).toBe(true);
    });

    it("should count all-time meetings correctly", async () => {
      // **Validates: Requirement 4.2**
      
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);

      const { db } = await import("@/lib/db/client");
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 15 }]),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect as any);

      const mockReq = new Request("http://localhost/api/settings/usage");
      const response = await GET(mockReq);
      const data = await response.json();
      
      expect(typeof data.meetingsAllTime).toBe("number");
      expect(Number.isInteger(data.meetingsAllTime)).toBe(true);
    });
  });

  describe("Transcripts Count", () => {
    it("should count transcripts generated", async () => {
      // **Validates: Requirement 4.3**
      // WHEN a GET request is received,
      // THE Settings_API SHALL return transcripts generated count
      
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);

      const { db } = await import("@/lib/db/client");
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 8 }]),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect as any);

      const mockReq = new Request("http://localhost/api/settings/usage");
      const response = await GET(mockReq);
      const data = await response.json();
      
      expect(typeof data.transcriptsGenerated).toBe("number");
      expect(Number.isInteger(data.transcriptsGenerated)).toBe(true);
    });
  });

  describe("Action Items Count", () => {
    it("should count action items created", async () => {
      // **Validates: Requirement 4.4**
      // WHEN a GET request is received,
      // THE Settings_API SHALL return action items created count
      
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);

      const { db } = await import("@/lib/db/client");
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 12 }]),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect as any);

      const mockReq = new Request("http://localhost/api/settings/usage");
      const response = await GET(mockReq);
      const data = await response.json();
      
      expect(typeof data.actionItemsCreated).toBe("number");
      expect(Number.isInteger(data.actionItemsCreated)).toBe(true);
    });
  });

  describe("Documents Analyzed Count", () => {
    it("should count documents analyzed", async () => {
      // **Validates: Requirement 4.5**
      // WHEN a GET request is received,
      // THE Settings_API SHALL return storage usage statistics (documents analyzed)
      
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);

      const { db } = await import("@/lib/db/client");
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 4 }]),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect as any);

      const mockReq = new Request("http://localhost/api/settings/usage");
      const response = await GET(mockReq);
      const data = await response.json();
      
      expect(typeof data.documentsAnalyzed).toBe("number");
      expect(Number.isInteger(data.documentsAnalyzed)).toBe(true);
    });
  });

  describe("Subscription Limits", () => {
    it("should return plan limits from subscription", async () => {
      // **Validates: Requirement 4.6**
      // WHEN a GET request is received,
      // THE Settings_API SHALL return plan limits from the subscription
      
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);

      const { db } = await import("@/lib/db/client");
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 0 }]),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect as any);

      const mockReq = new Request("http://localhost/api/settings/usage");
      const response = await GET(mockReq);
      const data = await response.json();
      
      expect(data.limits).toBeDefined();
      expect(typeof data.limits.meetingBot).toBe("boolean");
      expect(typeof data.limits.transcription).toBe("boolean");
      expect(typeof data.limits.summary).toBe("boolean");
      expect(typeof data.limits.actionItems).toBe("boolean");
      expect(typeof data.limits.history).toBe("boolean");
      expect(typeof data.limits.meetingsPerMonth).toBe("number");
      expect(typeof data.limits.unlimited).toBe("boolean");
    });
  });

  describe("Error Handling", () => {
    it("should return 500 on database error", async () => {
      // **Validates: Requirement 4.7**
      // Error handling with appropriate status codes
      
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);

      const { db } = await import("@/lib/db/client");
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(new Error("Database error")),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect as any);

      const mockReq = new Request("http://localhost/api/settings/usage");
      const response = await GET(mockReq);
      expect(response.status).toBe(500);
      
      const data = await response.json();
      expect(data.success).toBe(false);
    });
  });
});
