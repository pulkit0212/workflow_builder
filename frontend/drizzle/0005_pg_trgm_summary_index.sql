CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meeting_sessions_summary_trgm ON meeting_sessions USING GIN (summary gin_trgm_ops);
