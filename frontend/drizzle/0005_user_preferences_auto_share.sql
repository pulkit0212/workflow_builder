-- Add auto_share_targets column to user_preferences
ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "auto_share_targets" jsonb NOT NULL DEFAULT '{"slack":false,"gmail":false,"notion":false,"jira":false}'::jsonb;
