import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { seedToolsTable } from "@/lib/db/seed-tools";

const dbBootstrapLogPrefix = "[db-bootstrap]";

let databaseReadyPromise: Promise<void> | null = null;

function getDbOrThrow() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return db;
}

async function createRequiredTables() {
  const database = getDbOrThrow();

  await database.execute(sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS "users" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "clerk_user_id" varchar(255) NOT NULL UNIQUE,
      "email" varchar(255) NOT NULL UNIQUE,
      "full_name" varchar(255),
      "plan" varchar(50) NOT NULL DEFAULT 'free',
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )
  `);

  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS "subscriptions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" varchar(255) NOT NULL UNIQUE,
      "plan" varchar(50) NOT NULL DEFAULT 'free',
      "status" varchar(50) NOT NULL DEFAULT 'active',
      "trial_started_at" timestamptz NOT NULL DEFAULT now(),
      "trial_ends_at" timestamptz NOT NULL,
      "plan_started_at" timestamptz,
      "plan_ends_at" timestamptz,
      "razorpay_order_id" varchar(255),
      "razorpay_payment_id" varchar(255),
      "razorpay_sub_id" varchar(255),
      "meetings_used_this_month" integer NOT NULL DEFAULT 0,
      "last_reset_date" timestamptz NOT NULL DEFAULT now(),
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )
  `);

  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS "subscription_payments" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" varchar(255) NOT NULL,
      "plan" varchar(50) NOT NULL,
      "amount" integer NOT NULL,
      "currency" varchar(10) NOT NULL DEFAULT 'INR',
      "status" varchar(50) NOT NULL DEFAULT 'created',
      "razorpay_order_id" varchar(255) NOT NULL,
      "razorpay_payment_id" varchar(255),
      "razorpay_signature" text,
      "invoice_number" varchar(255),
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )
  `);

  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS "tools" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "slug" varchar(100) NOT NULL UNIQUE,
      "name" varchar(255) NOT NULL,
      "description" text NOT NULL,
      "is_active" boolean NOT NULL DEFAULT false,
      "created_at" timestamptz NOT NULL DEFAULT now()
    )
  `);

  await database.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "tools_slug_uidx" ON "tools" ("slug")
  `);

  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS "ai_runs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "tool_id" uuid NOT NULL REFERENCES "tools"("id") ON DELETE RESTRICT,
      "title" varchar(255),
      "status" varchar(50) NOT NULL DEFAULT 'pending',
      "input_json" jsonb,
      "output_json" jsonb,
      "model" varchar(100),
      "tokens_used" integer NOT NULL DEFAULT 0,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )
  `);

  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS "meeting_sessions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "ai_run_id" uuid REFERENCES "ai_runs"("id") ON DELETE SET NULL,
      "external_calendar_event_id" varchar(255),
      "claim_token" varchar(255),
      "provider" varchar(50) NOT NULL DEFAULT 'google_meet',
      "title" varchar(255) NOT NULL,
      "meeting_link" text NOT NULL,
      "scheduled_start_time" timestamptz,
      "scheduled_end_time" timestamptz,
      "notes" text,
      "transcript" text,
      "summary" text,
      "follow_up_email" text,
      "key_points" jsonb,
      "action_items" jsonb,
      "email_sent" boolean NOT NULL DEFAULT false,
      "email_sent_at" timestamptz,
      "status" varchar(50) NOT NULL DEFAULT 'draft',
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )
  `);

  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS "action_items" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "task" text NOT NULL,
      "owner" text NOT NULL DEFAULT 'Unassigned',
      "due_date" text NOT NULL DEFAULT 'Not specified',
      "priority" varchar(20) NOT NULL DEFAULT 'Medium',
      "completed" boolean NOT NULL DEFAULT false,
      "meeting_id" uuid REFERENCES "meeting_sessions"("id") ON DELETE CASCADE,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "source" varchar(50) NOT NULL DEFAULT 'meeting',
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )
  `);

  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS "action_items_user_id_idx" ON "action_items" ("user_id")
  `);

  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS "action_items_meeting_id_idx" ON "action_items" ("meeting_id")
  `);

  await database.execute(sql`
    ALTER TABLE "meeting_sessions"
    ADD COLUMN IF NOT EXISTS "external_calendar_event_id" varchar(255)
  `);

  await database.execute(sql`
    ALTER TABLE "meeting_sessions"
    ADD COLUMN IF NOT EXISTS "claim_token" varchar(255)
  `);

  await database.execute(sql`
    ALTER TABLE "meeting_sessions"
    ADD COLUMN IF NOT EXISTS "scheduled_start_time" timestamptz
  `);

  await database.execute(sql`
    ALTER TABLE "meeting_sessions"
    ADD COLUMN IF NOT EXISTS "scheduled_end_time" timestamptz
  `);

  await database.execute(sql`
    ALTER TABLE "meeting_sessions"
    ADD COLUMN IF NOT EXISTS "follow_up_email" text
  `);

  await database.execute(sql`
    ALTER TABLE "meeting_sessions"
    ADD COLUMN IF NOT EXISTS "email_sent" boolean NOT NULL DEFAULT false
  `);

  await database.execute(sql`
    ALTER TABLE "meeting_sessions"
    ADD COLUMN IF NOT EXISTS "email_sent_at" timestamptz
  `);

  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS "user_integrations" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "provider" varchar(50) NOT NULL,
      "email" varchar(255),
      "scopes" text,
      "access_token" text,
      "refresh_token" text,
      "expiry" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      UNIQUE ("user_id", "provider")
    )
  `);

  await database.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "user_integrations_user_provider_uidx"
    ON "user_integrations" ("user_id", "provider")
  `);

  await database.execute(sql`
    ALTER TABLE "user_integrations"
    ADD COLUMN IF NOT EXISTS "email" varchar(255)
  `);

  await database.execute(sql`
    ALTER TABLE "user_integrations"
    ADD COLUMN IF NOT EXISTS "scopes" text
  `);

  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS "uploaded_files" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "ai_run_id" uuid REFERENCES "ai_runs"("id") ON DELETE CASCADE,
      "file_name" varchar(255) NOT NULL,
      "file_type" varchar(100) NOT NULL,
      "file_url" text NOT NULL,
      "file_size" integer NOT NULL,
      "extracted_text" text,
      "created_at" timestamptz NOT NULL DEFAULT now()
    )
  `);

  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS "usage_logs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "tool_id" uuid NOT NULL REFERENCES "tools"("id") ON DELETE RESTRICT,
      "ai_run_id" uuid REFERENCES "ai_runs"("id") ON DELETE SET NULL,
      "event_type" varchar(100) NOT NULL,
      "credits_used" integer NOT NULL DEFAULT 0,
      "created_at" timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function bootstrapDatabase() {
  console.info(`${dbBootstrapLogPrefix} ensuring required tables exist`);
  await createRequiredTables();
  await seedToolsTable();
  console.info(`${dbBootstrapLogPrefix} database bootstrap complete`);
}

export async function ensureDatabaseReady() {
  if (!databaseReadyPromise) {
    databaseReadyPromise = bootstrapDatabase().catch((error) => {
      databaseReadyPromise = null;
      throw error;
    });
  }

  return databaseReadyPromise;
}
