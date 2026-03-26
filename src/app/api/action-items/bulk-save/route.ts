import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { syncCurrentUserToDatabase } from "@/lib/auth/current-user";
import { isMissingDatabaseRelationError } from "@/lib/db/errors";
import { db } from "@/lib/db/client";
import { actionItems } from "@/db/schema";

export const runtime = "nodejs";

const bulkSaveActionItemsSchema = z.object({
  source: z.string().trim().min(1).default("document-analyzer"),
  items: z.array(
    z.object({
      task: z.string().trim().min(1),
      owner: z.string().trim().optional().default("Unassigned"),
      dueDate: z.string().trim().optional().default("Not specified"),
      priority: z.enum(["High", "Medium", "Low"]).default("Medium"),
      completed: z.boolean().optional().default(false)
    })
  )
});

function getDbOrThrow() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return db;
}

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be valid JSON.", 400);
  }

  const parsed = bulkSaveActionItemsSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("Invalid action items payload.", 400, parsed.error.flatten());
  }

  if (parsed.data.items.length === 0) {
    return apiError("No action items to save.", 400);
  }

  try {
    await ensureDatabaseReady();
    const user = await syncCurrentUserToDatabase(userId);
    const database = getDbOrThrow();
    const source = parsed.data.source.includes("document") ? "document" : parsed.data.source;
    const now = new Date();

    await database.insert(actionItems).values(
      parsed.data.items.map((item) => ({
        task: item.task,
        owner: item.owner || "Unassigned",
        dueDate: item.dueDate || "Not specified",
        priority: item.priority,
        completed: item.completed ?? false,
        meetingId: null,
        userId: user.id,
        source,
        updatedAt: now
      }))
    );

    return apiSuccess({
      success: true,
      count: parsed.data.items.length
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return apiError(
        "Your database tables are not set up yet. Run your database migrations, then try again.",
        503
      );
    }

    return apiError(error instanceof Error ? error.message : "Failed to save action items.", 500);
  }
}
