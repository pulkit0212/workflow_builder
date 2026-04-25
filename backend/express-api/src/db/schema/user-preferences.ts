import { boolean, jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./users";

export const userPreferences = pgTable("user_preferences", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  emailNotifications: jsonb("email_notifications")
    .$type<{ meetingSummary: boolean; actionItems: boolean; weeklyDigest: boolean; productUpdates: boolean }>()
    .notNull()
    .default({ meetingSummary: true, actionItems: false, weeklyDigest: false, productUpdates: true }),
  defaultEmailTone: varchar("default_email_tone", { length: 50 }).notNull().default("professional"),
  summaryLength: varchar("summary_length", { length: 50 }).notNull().default("standard"),
  language: varchar("language", { length: 10 }).notNull().default("en"),
  botDisplayName: varchar("bot_display_name", { length: 255 }).notNull().default("Artiva Notetaker"),
  audioSource: varchar("audio_source", { length: 255 }).notNull().default("default"),
  autoShareTargets: jsonb("auto_share_targets")
    .$type<{ slack: boolean; gmail: boolean; notion: boolean; jira: boolean }>()
    .notNull()
    .default({ slack: false, gmail: false, notion: false, jira: false }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type UserPreferences = typeof userPreferences.$inferSelect;
export type NewUserPreferences = typeof userPreferences.$inferInsert;
