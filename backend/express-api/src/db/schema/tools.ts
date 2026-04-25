import { boolean, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const tools = pgTable("tools", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
