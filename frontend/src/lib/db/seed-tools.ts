import { eq } from "drizzle-orm";
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

  for (const toolSeedRow of toolSeedRows) {
    const [existingTool] = await database.select().from(tools).where(eq(tools.slug, toolSeedRow.slug)).limit(1);

    if (existingTool) {
      await database
        .update(tools)
        .set({
          name: toolSeedRow.name,
          description: toolSeedRow.description,
          isActive: toolSeedRow.isActive
        })
        .where(eq(tools.id, existingTool.id));
      continue;
    }

    await database.insert(tools).values(toolSeedRow);
  }
}
