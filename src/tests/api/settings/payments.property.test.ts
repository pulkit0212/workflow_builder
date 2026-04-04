/**
 * Property-Based Tests: Payment History Ordering and Structure
 *
 * **Property 8: Payment History Ordering and Structure**
 * **Validates: Requirements 6.3, 6.4**
 *
 * Tests that:
 * - Payments are ordered by date in descending order
 * - Each payment record contains all required fields: id, date, plan, amount, currency, status, invoiceNumber
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fc from "fast-check";
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

/** Build a mock db chain that returns the given rows */
function setupDbSelectMock(rows: object[]) {
  return import("@/lib/db/client").then(({ db }) => {
    const mockOrderBy = vi.fn().mockResolvedValue(rows);
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    vi.mocked(db!.select).mockReturnValue({ from: mockFrom } as any);
    return { mockOrderBy, mockWhere, mockFrom };
  });
}

/** Arbitrary for a single payment DB row — only valid (non-NaN) dates */
const paymentRowArb = fc.record({
  id: fc.uuid(),
  createdAt: fc
    .date({ min: new Date("2020-01-01T00:00:00.000Z"), max: new Date("2025-12-31T23:59:59.999Z") })
    .filter((d) => !isNaN(d.getTime())),
  plan: fc.constantFrom("free", "pro", "elite", "trial"),
  amount: fc.nat({ max: 100000 }),
  currency: fc.constantFrom("INR", "USD", "EUR"),
  status: fc.constantFrom("paid", "pending", "failed", "refunded"),
  invoiceNumber: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
});

describe("Property 8: Payment History Ordering and Structure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("payments are ordered by date descending for any set of payment records", async () => {
    /**
     * **Validates: Requirements 6.3**
     * Property: For all adjacent payment records (r1, r2) in the response,
     * r1.date >= r2.date (descending order).
     */
    await fc.assert(
      fc.asyncProperty(
        // Generate 0–10 payment rows
        fc.array(paymentRowArb, { minLength: 0, maxLength: 10 }),
        async (rows) => {
          vi.clearAllMocks();
          await setupAuthenticatedUser();

          // Sort rows descending by createdAt to simulate DB ORDER BY createdAt DESC
          const sortedRows = [...rows].sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
          );

          await setupDbSelectMock(sortedRows);

          const response = await GET();
          const body = await response.json();

          expect(response.status).toBe(200);
          expect(body.success).toBe(true);

          const payments: { date: string }[] = body.payments;

          // Verify descending order for all adjacent pairs
          for (let i = 0; i < payments.length - 1; i++) {
            const d1 = new Date(payments[i].date).getTime();
            const d2 = new Date(payments[i + 1].date).getTime();
            expect(d1).toBeGreaterThanOrEqual(d2);
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  it("every payment record contains all required fields", async () => {
    /**
     * **Validates: Requirements 6.4**
     * Property: For any set of payment records returned by the API,
     * each record MUST contain: id, date, plan, amount, currency, status, invoiceNumber.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.array(paymentRowArb, { minLength: 1, maxLength: 10 }),
        async (rows) => {
          vi.clearAllMocks();
          await setupAuthenticatedUser();

          await setupDbSelectMock(rows);

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
        }
      ),
      { numRuns: 30 }
    );
  });

  it("date field is a valid ISO 8601 string for any payment record", async () => {
    /**
     * **Validates: Requirements 6.4**
     * Property: The date field in each payment record MUST be a valid ISO 8601 string.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.array(paymentRowArb, { minLength: 1, maxLength: 10 }),
        async (rows) => {
          vi.clearAllMocks();
          await setupAuthenticatedUser();

          await setupDbSelectMock(rows);

          const response = await GET();
          const body = await response.json();

          expect(response.status).toBe(200);

          for (const payment of body.payments) {
            expect(typeof payment.date).toBe("string");
            const parsed = new Date(payment.date);
            expect(isNaN(parsed.getTime())).toBe(false);
            expect(parsed.toISOString()).toBe(payment.date);
          }
        }
      ),
      { numRuns: 30 }
    );
  });
});
