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
