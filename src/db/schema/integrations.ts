import { boolean, jsonb, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "@/db/schema/users";

export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 50 }).notNull(),
    enabled: boolean("enabled").notNull().default(false),
    config: jsonb("config").$type<Record<string, unknown> | null>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    userTypeUniqueIdx: uniqueIndex("integrations_user_type_uidx").on(table.userId, table.type)
  })
);
