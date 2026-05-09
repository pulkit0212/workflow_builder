-- Read-only audit: row counts for tables removed by migration 015_drop_legacy_unused_tables.sql
-- (run a backup + audit before migrate:sql if you still use old data).
-- Run from backend/express-api:
--   psql "$DATABASE_URL" -f scripts/sql/audit-unused-tables.sql

DO $$
DECLARE n bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'uploaded_files') THEN
    EXECUTE 'SELECT COUNT(*) FROM public.uploaded_files' INTO n;
    RAISE NOTICE 'uploaded_files: % rows (no INSERT in app — only usage DELETE/COUNT)', n;
  ELSE
    RAISE NOTICE 'uploaded_files: table missing';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'usage_logs') THEN
    EXECUTE 'SELECT COUNT(*) FROM public.usage_logs' INTO n;
    RAISE NOTICE 'usage_logs: % rows (no INSERT in app — only usage DELETE)', n;
  ELSE
    RAISE NOTICE 'usage_logs: table missing';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspace_join_requests') THEN
    EXECUTE 'SELECT COUNT(*) FROM public.workspace_join_requests' INTO n;
    RAISE NOTICE 'workspace_join_requests: % rows (not referenced in Express routes — invites use workspace_invites)', n;
  ELSE
    RAISE NOTICE 'workspace_join_requests: table missing';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspace_meetings') THEN
    EXECUTE 'SELECT COUNT(*) FROM public.workspace_meetings' INTO n;
    RAISE NOTICE 'workspace_meetings: % rows (not referenced in Express — meetings use meeting_sessions.workspace_id)', n;
  ELSE
    RAISE NOTICE 'workspace_meetings: table missing';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_preferences_legacy') THEN
    EXECUTE 'SELECT COUNT(*) FROM public.user_preferences_legacy' INTO n;
    RAISE NOTICE 'user_preferences_legacy: % rows (migration 007 backup — do NOT drop unless you intend to)', n;
  ELSE
    RAISE NOTICE 'user_preferences_legacy: table missing';
  END IF;
END $$;
