import { boolean, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { meetingSessions } from "@/db/schema/meeting-sessions";
import { users } from "@/db/schema/users";

export const actionItems = pgTable("action_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  task: text("task").notNull(),
  owner: text("owner").notNull().default("Unassigned"),
  dueDate: text("due_date").notNull().default("Not specified"),
  priority: varchar("priority", { length: 20 }).notNull().default("Medium"),
  completed: boolean("completed").notNull().default(false),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  meetingId: uuid("meeting_id").references(() => meetingSessions.id, { onDelete: "cascade" }),
  meetingTitle: text("meeting_title"),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  source: varchar("source", { length: 50 }).notNull().default("meeting"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
