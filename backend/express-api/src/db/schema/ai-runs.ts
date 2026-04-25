import { integer, jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { tools } from "./tools";
import { users } from "./users";

export const aiRuns = pgTable("ai_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  toolId: uuid("tool_id").notNull().references(() => tools.id, { onDelete: "restrict" }),
  title: varchar("title", { length: 255 }),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  inputJson: jsonb("input_json").$type<Record<string, unknown> | null>(),
  outputJson: jsonb("output_json").$type<Record<string, unknown> | null>(),
  model: varchar("model", { length: 100 }),
  tokensUsed: integer("tokens_used").default(0).notNull(),
  inputHash: varchar("input_hash", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
