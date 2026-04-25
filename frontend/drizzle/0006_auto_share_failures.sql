-- Migration: Add auto_share_failures JSONB column to meeting_sessions
-- This column stores per-integration auto-share failure details so they can
-- be surfaced to the user via the status polling endpoint.

ALTER TABLE meeting_sessions
  ADD COLUMN IF NOT EXISTS auto_share_failures JSONB DEFAULT NULL;
