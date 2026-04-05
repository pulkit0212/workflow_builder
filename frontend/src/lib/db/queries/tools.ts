import { eq } from "drizzle-orm";
import { tools } from "@/db/schema";
import { db } from "@/lib/db/client";
import { type ToolDefinition } from "@/lib/ai/tool-registry";

const toolsLogPrefix = "[db-tools]";

function getDbOrThrow() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return db;
}

export async function ensureToolRecord(tool: ToolDefinition) {
  const database = getDbOrThrow();
  console.info(`${toolsLogPrefix} ensuring tool record`, {
    slug: tool.slug
  });

  const [record] = await database
    .insert(tools)
    .values({
      slug: tool.slug,
      name: tool.name,
      description: tool.description,
      isActive: tool.status === "available"
    })
    .onConflictDoUpdate({
      target: tools.slug,
      set: {
        name: tool.name,
        description: tool.description,
        isActive: tool.status === "available"
      }
    })
    .returning();

  if (record) {
    console.info(`${toolsLogPrefix} tool record ready`, {
      slug: tool.slug,
      toolId: record.id
    });
    return record;
  }

  const [selected] = await database.select().from(tools).where(eq(tools.slug, tool.slug)).limit(1);

  if (!selected) {
    console.error(`${toolsLogPrefix} failed to resolve tool record after upsert`, {
      slug: tool.slug
    });
    throw new Error(`Failed to resolve tool record for ${tool.slug}.`);
  }

  console.info(`${toolsLogPrefix} resolved tool record after lookup`, {
    slug: tool.slug,
    toolId: selected.id
  });

  return selected;
}
