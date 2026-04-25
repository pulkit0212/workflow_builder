import { pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./users";

export const userIntegrations = pgTable(
  "user_integrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 50 }).notNull(),
    email: varchar("email", { length: 255 }),
    scopes: text("scopes"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    expiry: timestamp("expiry", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userProviderUniqueIdx: uniqueIndex("user_integrations_user_provider_uidx").on(table.userId, table.provider),
  })
);
