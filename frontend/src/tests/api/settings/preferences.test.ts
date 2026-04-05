/**
 * Preferences API Tests
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8**
 * 
 * Tests for GET/POST /api/settings/preferences endpoints
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "@/app/api/settings/preferences/route";
import * as fc from "fast-check";

// Mock Clerk auth
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

// Mock database client (POST runs inside transaction; callback receives same object for tx.*)
vi.mock("@/lib/db/client", () => {
  const db = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    execute: vi.fn().mockResolvedValue(undefined),
    transaction: vi.fn(),
  };
  db.transaction.mockImplementation(
    async (cb: (tx: typeof db) => Promise<unknown>) => cb(db)
  );
  return { db };
});

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

describe("GET /api/settings/preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Authentication", () => {
    it("should return 401 when user is not authenticated", async () => {
      // **Validates: Requirement 2.7**
      // IF the user is not authenticated, THEN THE Preferences_API SHALL return status 401
      
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: null } as any);

      const response = await GET();
      expect(response.status).toBe(401);
      
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.message).toBe("Unauthorized.");
    });
  });

  describe("Preferences Retrieval", () => {
    it("should return existing preferences", async () => {
      // **Validates: Requirements 2.1, 2.2**
      // WHEN a GET request is received, THE Preferences_API SHALL return the user's preferences
      
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);

      const mockPreferences = {
        id: "pref-id",
        userId: "test-user-id",
        emailNotifications: {
          meetingSummary: true,
          actionItems: false,
          weeklyDigest: false,
          productUpdates: true,
        },
        defaultEmailTone: "professional",
        summaryLength: "standard",
        language: "en",
        botDisplayName: "Artiva Notetaker",
        audioSource: "default",
      };

      const { db } = await import("@/lib/db/client");
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockPreferences]),
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect as any);

      const response = await GET();
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.preferences).toBeDefined();
      expect(data.preferences.emailNotifications).toBeDefined();
    });

    it("should return 500 when database select throws", async () => {
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);

      const { db } = await import("@/lib/db/client");
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(new Error("connection refused"))
          })
        })
      });
      vi.mocked(db.select).mockImplementation(mockSelect as any);

      const response = await GET();
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it("should create default preferences if none exist", async () => {
      // **Validates: Requirement 2.3**
      // IF no preferences exist for the user,
      // THEN THE Preferences_API SHALL create default preferences and return them
      
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);

      const { db } = await import("@/lib/db/client");
      
      // Mock select to return empty array (no existing preferences)
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect as any);

      // Mock insert to return new preferences
      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: "new-pref-id",
            userId: "test-user-id",
            emailNotifications: {
              meetingSummary: true,
              actionItems: false,
              weeklyDigest: false,
              productUpdates: true,
            },
            defaultEmailTone: "professional",
            summaryLength: "standard",
            language: "en",
            botDisplayName: "Artiva Notetaker",
            audioSource: "default",
          }]),
        }),
      });
      vi.mocked(db.insert).mockImplementation(mockInsert as any);

      const response = await GET();
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.preferences).toBeDefined();
      expect(data.preferences.botDisplayName).toBe("Artiva Notetaker");
    });
  });
});

describe("POST /api/settings/preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Authentication", () => {
    it("should return 401 when user is not authenticated", async () => {
      // **Validates: Requirement 2.7**
      
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: null } as any);

      const request = new Request("http://localhost/api/settings/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultEmailTone: "friendly" }),
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
      
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.message).toBe("Unauthorized.");
    });
  });

  describe("Validation", () => {
    it("should reject invalid email tone", async () => {
      // **Validates: Requirement 2.8**
      // IF the request data is invalid, THEN THE Preferences_API SHALL return status 400
      
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);

      const request = new Request("http://localhost/api/settings/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultEmailTone: "invalid-tone" }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.message).toContain("Invalid request data");
    });

    it("should accept valid preferences", async () => {
      // **Validates: Requirements 2.4, 2.5**
      // WHEN a POST request is received with valid preference data,
      // THE Preferences_API SHALL upsert the preferences to the database
      
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);

      const { db } = await import("@/lib/db/client");
      
      // Mock existing preferences
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{
              id: "pref-id",
              userId: "test-user-id",
              emailNotifications: {
                meetingSummary: true,
                actionItems: false,
                weeklyDigest: false,
                productUpdates: true,
              },
              defaultEmailTone: "professional",
              summaryLength: "standard",
              language: "en",
              botDisplayName: "Artiva Notetaker",
              audioSource: "default",
            }]),
          }),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelect as any);

      // Mock update
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              id: "pref-id",
              userId: "test-user-id",
              emailNotifications: {
                meetingSummary: true,
                actionItems: false,
                weeklyDigest: false,
                productUpdates: true,
              },
              defaultEmailTone: "friendly",
              summaryLength: "standard",
              language: "en",
              botDisplayName: "Artiva Notetaker",
              audioSource: "default",
            }]),
          }),
        }),
      });
      vi.mocked(db.update).mockImplementation(mockUpdate as any);

      const request = new Request("http://localhost/api/settings/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultEmailTone: "friendly" }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.preferences).toBeDefined();
    });

    it("should apply partial update when only language is provided", async () => {
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);

      const { db } = await import("@/lib/db/client");

      const existing = {
        id: "pref-id",
        userId: "test-user-id",
        emailNotifications: {
          meetingSummary: true,
          actionItems: false,
          weeklyDigest: false,
          productUpdates: true
        },
        defaultEmailTone: "professional",
        summaryLength: "standard",
        language: "en",
        botDisplayName: "Artiva Notetaker",
        audioSource: "default"
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([existing])
          })
        })
      } as any);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ ...existing, language: "hi" }])
          })
        })
      } as any);

      const request = new Request("http://localhost/api/settings/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: "hi" })
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.preferences.language).toBe("hi");
    });

    it("should return 500 when database update throws", async () => {
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);

      const { db } = await import("@/lib/db/client");

      const existing = {
        id: "pref-id",
        userId: "test-user-id",
        emailNotifications: {
          meetingSummary: true,
          actionItems: false,
          weeklyDigest: false,
          productUpdates: true
        },
        defaultEmailTone: "professional",
        summaryLength: "standard",
        language: "en",
        botDisplayName: "Artiva Notetaker",
        audioSource: "default"
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([existing])
          })
        })
      } as any);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue(new Error("db write failed"))
          })
        })
      } as any);

      const request = new Request("http://localhost/api/settings/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: "hi" })
      });

      const response = await POST(request);
      expect(response.status).toBe(500);
    });
  });

  describe("Property 4: upsert uses update when row exists", () => {
    it("does not call insert on second POST when preferences already exist", async () => {
      const { auth } = await import("@clerk/nextjs/server");
      vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);

      const { db } = await import("@/lib/db/client");

      const row = {
        id: "pref-id",
        userId: "test-user-id",
        emailNotifications: {
          meetingSummary: true,
          actionItems: false,
          weeklyDigest: false,
          productUpdates: true
        },
        defaultEmailTone: "professional",
        summaryLength: "standard",
        language: "en",
        botDisplayName: "Artiva Notetaker",
        audioSource: "default"
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([row])
          })
        })
      } as any);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([row])
          })
        })
      } as any);

      await POST(
        new Request("http://localhost/api/settings/preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ language: "hi" })
        })
      );
      await POST(
        new Request("http://localhost/api/settings/preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ defaultEmailTone: "friendly" })
        })
      );

      expect(vi.mocked(db.insert)).not.toHaveBeenCalled();
      expect(vi.mocked(db.update).mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});

/**
 * Property 1: Preferences persistence round-trip — POST then GET must agree (fast-check).
 */
describe("Property 1: Preferences persistence round-trip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns the same preferences as POST for random valid combinations", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("professional", "friendly", "formal", "concise"),
        fc.constantFrom("en", "hi"),
        async (tone, lang) => {
          vi.clearAllMocks();
          const { auth } = await import("@clerk/nextjs/server");
          vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);

          const { db } = await import("@/lib/db/client");

          const rowRef: { current: Record<string, unknown> | null } = {
            current: {
              id: "pref-id",
              userId: "test-user-id",
              emailNotifications: {
                meetingSummary: true,
                actionItems: false,
                weeklyDigest: false,
                productUpdates: true
              },
              defaultEmailTone: "professional",
              summaryLength: "standard",
              language: "en",
              botDisplayName: "Artiva Notetaker",
              audioSource: "default"
            }
          };

          vi.mocked(db.execute).mockResolvedValue(undefined as never);
          vi.mocked(db.transaction).mockImplementation(
            async (cb: (tx: typeof db) => Promise<unknown>) => cb(db)
          );

          vi.mocked(db.select).mockImplementation(() => ({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockImplementation(async () =>
                  rowRef.current ? [rowRef.current] : []
                )
              })
            })
          }));

          vi.mocked(db.update).mockImplementation(() => ({
            set: vi.fn().mockImplementation((patch: Record<string, unknown>) => ({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockImplementation(async () => {
                  const merged = {
                    ...rowRef.current!,
                    ...patch,
                    emailNotifications:
                      patch.emailNotifications ?? rowRef.current!.emailNotifications
                  };
                  rowRef.current = merged;
                  return [merged];
                })
              })
            }))
          }));

          const request = new Request("http://localhost/api/settings/preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              defaultEmailTone: tone,
              language: lang
            })
          });

          const postRes = await POST(request);
          expect(postRes.status).toBe(200);

          const getRes = await GET();
          expect(getRes.status).toBe(200);
          const data = (await getRes.json()) as {
            preferences: { defaultEmailTone: string; language: string };
          };
          expect(data.preferences.defaultEmailTone).toBe(tone);
          expect(data.preferences.language).toBe(lang);
        }
      ),
      { numRuns: 16 }
    );
  });
});

describe("GET-after-POST persistence (create path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns preferences after POST inserts a new row", async () => {
    const { auth } = await import("@clerk/nextjs/server");
    vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);

    const { db } = await import("@/lib/db/client");
    const rowRef: { current: Record<string, unknown> | null } = { current: null };

    vi.mocked(db.execute).mockResolvedValue(undefined as never);
    vi.mocked(db.transaction).mockImplementation(
      async (cb: (tx: typeof db) => Promise<unknown>) => cb(db)
    );

    vi.mocked(db.select).mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(async () =>
            rowRef.current ? [rowRef.current] : []
          )
        })
      })
    }));

    vi.mocked(db.insert).mockImplementation(() => ({
      values: vi.fn().mockImplementation((vals: Record<string, unknown>) => ({
        returning: vi.fn().mockImplementation(async () => {
          rowRef.current = {
            id: "new-pref-id",
            ...vals
          };
          return [rowRef.current];
        })
      }))
    }));

    vi.mocked(db.update).mockImplementation(() => ({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([])
        })
      })
    }));

    const postRes = await POST(
      new Request("http://localhost/api/settings/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultEmailTone: "concise",
          language: "hi"
        })
      })
    );
    expect(postRes.status).toBe(200);

    const getRes = await GET();
    expect(getRes.status).toBe(200);
    const data = (await getRes.json()) as {
      preferences: { defaultEmailTone: string; language: string };
    };
    expect(data.preferences.defaultEmailTone).toBe("concise");
    expect(data.preferences.language).toBe("hi");
  });
});
