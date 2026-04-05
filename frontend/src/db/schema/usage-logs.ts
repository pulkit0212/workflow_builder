import { integer, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { aiRuns } from "@/db/schema/ai-runs";
import { tools } from "@/db/schema/tools";
import { users } from "@/db/schema/users";

export const usageLogs = pgTable("usage_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  toolId: uuid("tool_id")
    .notNull()
    .references(() => tools.id, { onDelete: "restrict" }),
  aiRunId: uuid("ai_run_id").references(() => aiRuns.id, { onDelete: "set null" }),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  creditsUsed: integer("credits_used").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});
