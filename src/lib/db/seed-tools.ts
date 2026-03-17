import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tools } from "@/db/schema";
import { allTools } from "@/lib/ai/tool-registry";

export const toolSeedRows = allTools.map((tool) => ({
  slug: tool.slug,
  name: tool.name,
  description: tool.description,
  isActive: tool.status === "available"
}));

function getDbOrThrow() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return db;
}

export async function seedToolsTable() {
  const database = getDbOrThrow();

  await database
    .insert(tools)
    .values(toolSeedRows)
    .onConflictDoUpdate({
      target: tools.slug,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        isActive: sql`excluded.is_active`
      }
    });
}
