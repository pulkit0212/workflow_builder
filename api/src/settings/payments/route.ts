import { auth } from "@clerk/nextjs/server";
import { desc, eq } from "drizzle-orm";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { subscriptionPayments } from "@/db/schema";

export const runtime = "nodejs";

function getDbOrThrow() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return db;
}

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const database = getDbOrThrow();

    const payments = await database
      .select()
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.userId, user.clerkUserId))
      .orderBy(desc(subscriptionPayments.createdAt));

    return apiSuccess({
      success: true,
      payments: payments.map((payment) => ({
        id: payment.id,
        date: payment.createdAt.toISOString(),
        plan: payment.plan,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        invoiceNumber: payment.invoiceNumber
      }))
    });
  } catch (error) {
    console.error("Failed to fetch payment history:", error);
    return apiError(
      error instanceof Error ? error.message : "Failed to fetch payment history.",
      500
    );
  }
}
