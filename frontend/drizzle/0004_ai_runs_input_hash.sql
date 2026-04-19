-- Add input_hash column to ai_runs for deduplication of retried runs
ALTER TABLE "ai_runs" ADD COLUMN IF NOT EXISTS "input_hash" varchar(64);--> statement-breakpoint

-- Index for fast upsert lookups (userId + toolId + inputHash)
CREATE INDEX IF NOT EXISTS "ai_runs_user_tool_hash_idx"
  ON "ai_runs" ("user_id", "tool_id", "input_hash")
  WHERE "input_hash" IS NOT NULL;
