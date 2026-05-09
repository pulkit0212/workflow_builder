-- Ensures auto-share runs once when clients poll GET /meetings/:id/status after the bot
-- writes status=completed directly to PostgreSQL (no Express PATCH).
ALTER TABLE meeting_sessions
  ADD COLUMN IF NOT EXISTS auto_share_done BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS meeting_sessions_auto_share_done_idx
  ON meeting_sessions (status, auto_share_done)
  WHERE status = 'completed' AND auto_share_done IS NOT TRUE;
