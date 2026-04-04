import { jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./users";

export const userPreferences = pgTable("user_preferences", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),

  // Email notification preferences (JSONB)
  emailNotifications: jsonb("email_notifications")
    .$type<{
      meetingSummary: boolean;
      actionItems: boolean;
      weeklyDigest: boolean;
      productUpdates: boolean;
    }>()
    .notNull()
    .default({
      meetingSummary: true,
      actionItems: false,
      weeklyDigest: false,
      productUpdates: true
    }),

  // AI behavior preferences
  defaultEmailTone: varchar("default_email_tone", { length: 50 })
    .notNull()
    .default("professional"),

  summaryLength: varchar("summary_length", { length: 50 })
    .notNull()
    .default("standard"),

  language: varchar("language", { length: 10 })
    .notNull()
    .default("en"),

  // Bot settings
  botDisplayName: varchar("bot_display_name", { length: 255 })
    .notNull()
    .default("Artiva Notetaker"),

  audioSource: varchar("audio_source", { length: 255 })
    .notNull()
    .default("default"),

  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
});

export type UserPreferences = typeof userPreferences.$inferSelect;
export type NewUserPreferences = typeof userPreferences.$inferInsert;
