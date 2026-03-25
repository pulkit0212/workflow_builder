import { boolean, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { aiRuns } from "@/db/schema/ai-runs";
import { users } from "@/db/schema/users";
import type { MeetingActionItem } from "@/features/tools/meeting-summarizer/types";

export const meetingSessions = pgTable("meeting_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  aiRunId: uuid("ai_run_id").references(() => aiRuns.id, { onDelete: "set null" }),
  externalCalendarEventId: varchar("external_calendar_event_id", { length: 255 }),
  claimToken: varchar("claim_token", { length: 255 }),
  provider: varchar("provider", { length: 50 }).notNull().default("google_meet"),
  title: varchar("title", { length: 255 }).notNull(),
  meetingLink: text("meeting_link").notNull(),
  scheduledStartTime: timestamp("scheduled_start_time", { withTimezone: true }),
  scheduledEndTime: timestamp("scheduled_end_time", { withTimezone: true }),
  joinedAt: timestamp("joined_at", { withTimezone: true }),
  notes: text("notes"),
  errorCode: varchar("error_code", { length: 100 }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  failureReason: text("failure_reason"),
  transcript: text("transcript"),
  summary: text("summary"),
  keyDecisions: jsonb("key_decisions").$type<string[] | null>(),
  risksAndBlockers: jsonb("risks_and_blockers").$type<string[] | null>(),
  keyTopics: jsonb("key_topics").$type<string[] | null>(),
  meetingSentiment: varchar("meeting_sentiment", { length: 50 }),
  followUpNeeded: boolean("follow_up_needed"),
  duration: integer("duration"),
  meetingDuration: integer("meeting_duration"),
  followUpEmail: text("follow_up_email"),
  keyPoints: jsonb("key_points").$type<string[] | null>(),
  actionItems: jsonb("action_items").$type<MeetingActionItem[] | null>(),
  recordingFilePath: text("recording_file_path"),
  recordingStartedAt: timestamp("recording_started_at", { withTimezone: true }),
  recordingEndedAt: timestamp("recording_ended_at", { withTimezone: true }),
  emailSent: boolean("email_sent").notNull().default(false),
  emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
  status: varchar("status", { length: 50 }).notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
