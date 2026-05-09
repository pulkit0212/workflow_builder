-- Remove legacy tables never populated by current Express routes (verified empty or expendable).
-- Preserves user_preferences_legacy (prefs migration backup).
-- Safe to re-run: IF EXISTS.

DROP TABLE IF EXISTS public.uploaded_files CASCADE;
DROP TABLE IF EXISTS public.usage_logs CASCADE;
DROP TABLE IF EXISTS public.workspace_join_requests CASCADE;
DROP TABLE IF EXISTS public.workspace_meetings CASCADE;
