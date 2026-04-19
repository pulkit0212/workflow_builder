import { integer, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { tools } from "@/db/schema/tools";
import { users } from "@/db/schema/users";

export const aiRuns = pgTable("ai_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  toolId: uuid("tool_id")
    .notNull()
    .references(() => tools.id, { onDelete: "restrict" }),
  title: varchar("title", { length: 255 }),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  inputJson: jsonb("input_json").$type<Record<string, unknown> | null>(),
  outputJson: jsonb("output_json").$type<Record<string, unknown> | null>(),
  model: varchar("model", { length: 100 }),
  tokensUsed: integer("tokens_used").default(0).notNull(),
  /** SHA-256 hex of (userId + toolId + stable JSON of inputJson). Used to upsert instead of inserting duplicate failed runs. */
  inputHash: varchar("input_hash", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
