-- Phase 1 Preferences storage migration:
-- - Keep preferences metadata in preferences_catalog
-- - Move per-user values out of user_preferences into user_settings (key/value)
-- - Rename user_preferences to user_preferences_legacy (safe, reversible)

CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key VARCHAR(128) NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, key)
);

CREATE INDEX IF NOT EXISTS user_settings_user_key_idx
  ON user_settings (user_id, key);

-- Backfill from user_preferences if it exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_preferences') THEN
    -- emailNotifications.*
    INSERT INTO user_settings (user_id, key, value)
    SELECT
      up.user_id,
      'emailNotifications.meetingSummary',
      to_jsonb(COALESCE((up.email_notifications->>'meetingSummary')::boolean, true))
    FROM user_preferences up
    ON CONFLICT (user_id, key) DO NOTHING;

    INSERT INTO user_settings (user_id, key, value)
    SELECT
      up.user_id,
      'emailNotifications.actionItems',
      to_jsonb(COALESCE((up.email_notifications->>'actionItems')::boolean, false))
    FROM user_preferences up
    ON CONFLICT (user_id, key) DO NOTHING;

    INSERT INTO user_settings (user_id, key, value)
    SELECT
      up.user_id,
      'emailNotifications.weeklyDigest',
      to_jsonb(COALESCE((up.email_notifications->>'weeklyDigest')::boolean, false))
    FROM user_preferences up
    ON CONFLICT (user_id, key) DO NOTHING;

    INSERT INTO user_settings (user_id, key, value)
    SELECT
      up.user_id,
      'emailNotifications.productUpdates',
      to_jsonb(COALESCE((up.email_notifications->>'productUpdates')::boolean, true))
    FROM user_preferences up
    ON CONFLICT (user_id, key) DO NOTHING;

    -- aiBehavior
    INSERT INTO user_settings (user_id, key, value)
    SELECT up.user_id, 'defaultEmailTone', to_jsonb(COALESCE(up.default_email_tone, 'professional'))
    FROM user_preferences up
    ON CONFLICT (user_id, key) DO NOTHING;

    INSERT INTO user_settings (user_id, key, value)
    SELECT up.user_id, 'summaryLength', to_jsonb(COALESCE(up.summary_length, 'standard'))
    FROM user_preferences up
    ON CONFLICT (user_id, key) DO NOTHING;

    INSERT INTO user_settings (user_id, key, value)
    SELECT up.user_id, 'language', to_jsonb(COALESCE(up.language, 'en'))
    FROM user_preferences up
    ON CONFLICT (user_id, key) DO NOTHING;

    INSERT INTO user_settings (user_id, key, value)
    SELECT up.user_id, 'botDisplayName', to_jsonb(COALESCE(up.bot_display_name, 'Artiva Notetaker'))
    FROM user_preferences up
    ON CONFLICT (user_id, key) DO NOTHING;

    INSERT INTO user_settings (user_id, key, value)
    SELECT up.user_id, 'audioSource', to_jsonb(COALESCE(up.audio_source, 'default'))
    FROM user_preferences up
    ON CONFLICT (user_id, key) DO NOTHING;

    -- autoShareTargets.*
    INSERT INTO user_settings (user_id, key, value)
    SELECT up.user_id, 'autoShareTargets.slack', to_jsonb(COALESCE((up.auto_share_targets->>'slack')::boolean, false))
    FROM user_preferences up
    ON CONFLICT (user_id, key) DO NOTHING;

    INSERT INTO user_settings (user_id, key, value)
    SELECT up.user_id, 'autoShareTargets.gmail', to_jsonb(COALESCE((up.auto_share_targets->>'gmail')::boolean, false))
    FROM user_preferences up
    ON CONFLICT (user_id, key) DO NOTHING;

    INSERT INTO user_settings (user_id, key, value)
    SELECT up.user_id, 'autoShareTargets.notion', to_jsonb(COALESCE((up.auto_share_targets->>'notion')::boolean, false))
    FROM user_preferences up
    ON CONFLICT (user_id, key) DO NOTHING;

    INSERT INTO user_settings (user_id, key, value)
    SELECT up.user_id, 'autoShareTargets.jira', to_jsonb(COALESCE((up.auto_share_targets->>'jira')::boolean, false))
    FROM user_preferences up
    ON CONFLICT (user_id, key) DO NOTHING;

    -- Rename old table so app won't use it anymore.
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_preferences_legacy') THEN
      EXECUTE 'ALTER TABLE user_preferences RENAME TO user_preferences_legacy';
    END IF;
  END IF;
END $$;

