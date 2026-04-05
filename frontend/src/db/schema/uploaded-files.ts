import { integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { aiRuns } from "@/db/schema/ai-runs";
import { users } from "@/db/schema/users";

export const uploadedFiles = pgTable("uploaded_files", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  aiRunId: uuid("ai_run_id").references(() => aiRuns.id, { onDelete: "cascade" }),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileType: varchar("file_type", { length: 100 }).notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: integer("file_size").notNull(),
  extractedText: text("extracted_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});
