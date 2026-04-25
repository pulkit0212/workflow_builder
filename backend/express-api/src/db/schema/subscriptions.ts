import { integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull().unique(),
  plan: varchar("plan", { length: 50 }).notNull().default("free"),
  status: varchar("status", { length: 50 }).notNull().default("active"),
  trialStartedAt: timestamp("trial_started_at", { withTimezone: true }).defaultNow().notNull(),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }).notNull(),
  planStartedAt: timestamp("plan_started_at", { withTimezone: true }),
  planEndsAt: timestamp("plan_ends_at", { withTimezone: true }),
  razorpayOrderId: varchar("razorpay_order_id", { length: 255 }),
  razorpayPaymentId: varchar("razorpay_payment_id", { length: 255 }),
  razorpaySubId: varchar("razorpay_sub_id", { length: 255 }),
  meetingsUsedThisMonth: integer("meetings_used_this_month").notNull().default(0),
  lastResetDate: timestamp("last_reset_date", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const subscriptionPayments = pgTable("subscription_payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  plan: varchar("plan", { length: 50 }).notNull(),
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 10 }).notNull().default("INR"),
  status: varchar("status", { length: 50 }).notNull().default("created"),
  razorpayOrderId: varchar("razorpay_order_id", { length: 255 }).notNull(),
  razorpayPaymentId: varchar("razorpay_payment_id", { length: 255 }),
  razorpaySignature: text("razorpay_signature"),
  invoiceNumber: varchar("invoice_number", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
