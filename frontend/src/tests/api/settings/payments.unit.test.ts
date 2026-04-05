/**
 * Unit Tests: GET /api/settings/payments
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "@/app/api/settings/payments/route";

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

async function setupAuthenticatedUser() {
  const { auth } = await import("@clerk/nextjs/server");
  vi.mocked(auth).mockResolvedValue({ userId: "test-clerk-id" } as any);
}

async function setupUnauthenticatedUser() {
  const { auth } = await import("@clerk/nextjs/server");
  vi.mocked(auth).mockResolvedValue({ userId: null } as any);
}

function setupDbSelectMock(rows: object[]) {
  return import("@/lib/db/client").then(({ db }) => {
    const mockOrderBy = vi.fn().mockResolvedValue(rows);
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    vi.mocked(db!.select).mockReturnValue({ from: mockFrom } as any);
    return { mockOrderBy, mockWhere, mockFrom };
  });
}

const samplePayments = [
  {
    id: "pay-3",
    createdAt: new Date("2024-03-15T10:00:00.000Z"),
    plan: "pro",
    amount: 9900,
    currency: "INR",
    status: "paid",
    invoiceNumber: "INV-003",
  },
  {
    id: "pay-2",
    createdAt: new Date("2024-02-15T10:00:00.000Z"),
    plan: "pro",
    amount: 9900,
    currency: "INR",
    status: "paid",
    invoiceNumber: "INV-002",
  },
  {
    id: "pay-1",
    createdAt: new Date("2024-01-15T10:00:00.000Z"),
    plan: "free",
    amount: 0,
    currency: "INR",
    status: "paid",
    invoiceNumber: null,
  },
];

describe("GET /api/settings/payments - Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated requests", async () => {
    // Requirement 6.5
    await setupUnauthenticatedUser();

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it("returns 200 with payment history for authenticated user", async () => {
    // Requirements 6.1, 6.2
    await setupAuthenticatedUser();
    await setupDbSelectMock(samplePayments);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.payments)).toBe(true);
    expect(body.payments).toHaveLength(3);
  });

  it("returns payments ordered by date descending", async () => {
    // Requirement 6.3
    await setupAuthenticatedUser();
    // DB mock returns rows already sorted descending (as the real DB would)
    await setupDbSelectMock(samplePayments);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);

    const dates = body.payments.map((p: { date: string }) => new Date(p.date).getTime());
    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
    }
  });

  it("returns all required fields for each payment record", async () => {
    // Requirement 6.4
    await setupAuthenticatedUser();
    await setupDbSelectMock(samplePayments);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);

    for (const payment of body.payments) {
      expect(payment).toHaveProperty("id");
      expect(payment).toHaveProperty("date");
      expect(payment).toHaveProperty("plan");
      expect(payment).toHaveProperty("amount");
      expect(payment).toHaveProperty("currency");
      expect(payment).toHaveProperty("status");
      expect(payment).toHaveProperty("invoiceNumber");
    }
  });

  it("returns date as ISO 8601 string", async () => {
    // Requirement 6.4
    await setupAuthenticatedUser();
    await setupDbSelectMock([samplePayments[0]]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    const payment = body.payments[0];
    expect(typeof payment.date).toBe("string");
    expect(new Date(payment.date).toISOString()).toBe(payment.date);
  });

  it("returns empty array for users with no payments", async () => {
    // Requirement 6.6
    await setupAuthenticatedUser();
    await setupDbSelectMock([]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.payments).toEqual([]);
  });

  it("returns invoiceNumber as null when not present", async () => {
    // Requirement 6.4 - invoiceNumber can be null
    await setupAuthenticatedUser();
    await setupDbSelectMock([samplePayments[2]]); // has invoiceNumber: null

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.payments[0].invoiceNumber).toBeNull();
  });

  it("returns correct field values for a payment record", async () => {
    // Requirements 6.2, 6.4
    await setupAuthenticatedUser();
    await setupDbSelectMock([samplePayments[0]]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    const payment = body.payments[0];
    expect(payment.id).toBe("pay-3");
    expect(payment.plan).toBe("pro");
    expect(payment.amount).toBe(9900);
    expect(payment.currency).toBe("INR");
    expect(payment.status).toBe("paid");
    expect(payment.invoiceNumber).toBe("INV-003");
  });

  it("returns 500 when database throws an error", async () => {
    // Requirement 6.1 (error handling)
    await setupAuthenticatedUser();

    const { db } = await import("@/lib/db/client");
    vi.mocked(db!.select).mockImplementation(() => {
      throw new Error("DB connection failed");
    });

    const response = await GET();

    expect(response.status).toBe(500);
  });

  it("does not perform database operations when unauthenticated", async () => {
    // Requirement 6.5 - no DB ops for unauthenticated requests
    await setupUnauthenticatedUser();

    const { db } = await import("@/lib/db/client");

    await GET();

    expect(db!.select).not.toHaveBeenCalled();
  });
});
