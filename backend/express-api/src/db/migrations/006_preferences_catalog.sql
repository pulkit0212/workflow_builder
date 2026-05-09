-- Preferences catalog (admin-managed defaults + labels + options).
-- Phase 1 for dynamic Settings → Preferences.

CREATE TABLE IF NOT EXISTS preferences_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- dotted keys like: emailNotifications.meetingSummary, defaultEmailTone, autoShareTargets.slack
  key VARCHAR(128) NOT NULL UNIQUE,
  group_key VARCHAR(64) NOT NULL, -- emailNotifications | aiBehavior | autoShareTargets
  label VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  field_type VARCHAR(32) NOT NULL CHECK (field_type IN ('boolean','enum','string')),
  enum_options JSONB, -- ["professional","friendly",...]
  default_value JSONB NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  allowed_plans VARCHAR(32)[] NOT NULL DEFAULT ARRAY['free','pro','elite','trial']::VARCHAR(32)[],
  ui_config JSONB
);

CREATE INDEX IF NOT EXISTS preferences_catalog_group_sort_idx
  ON preferences_catalog (group_key, sort_order);

-- Seed defaults (idempotent by key).
INSERT INTO preferences_catalog (key, group_key, label, description, field_type, enum_options, default_value, sort_order, is_active, allowed_plans)
VALUES
  ('emailNotifications.meetingSummary', 'emailNotifications', 'Meeting Summary', 'Receive an email when your meeting summary is ready.', 'boolean', NULL, 'true'::jsonb, 10, true,
    ARRAY['free','pro','elite','trial']::VARCHAR(32)[]),
  ('emailNotifications.actionItems', 'emailNotifications', 'Action Items', 'Get emailed your action items after each meeting.', 'boolean', NULL, 'false'::jsonb, 20, true,
    ARRAY['free','pro','elite','trial']::VARCHAR(32)[]),
  ('emailNotifications.weeklyDigest', 'emailNotifications', 'Weekly Digest', 'A weekly roundup of all your meetings and insights.', 'boolean', NULL, 'false'::jsonb, 30, true,
    ARRAY['free','pro','elite','trial']::VARCHAR(32)[]),
  ('emailNotifications.productUpdates', 'emailNotifications', 'Product Updates', 'New features, improvements, and announcements.', 'boolean', NULL, 'true'::jsonb, 40, true,
    ARRAY['free','pro','elite','trial']::VARCHAR(32)[]),

  ('defaultEmailTone', 'aiBehavior', 'Preferred Email Tone', 'Used by email generator and follow-ups.', 'enum',
    '["professional","friendly","concise","formal"]'::jsonb, '"professional"'::jsonb, 10, true,
    ARRAY['free','pro','elite','trial']::VARCHAR(32)[]),
  ('summaryLength', 'aiBehavior', 'Summary Length', 'Controls how detailed AI summaries should be.', 'enum',
    '["brief","standard","detailed"]'::jsonb, '"standard"'::jsonb, 20, true,
    ARRAY['free','pro','elite','trial']::VARCHAR(32)[]),
  ('language', 'aiBehavior', 'Primary Language', 'Preferred UI and AI language.', 'enum',
    '["en","hi"]'::jsonb, '"en"'::jsonb, 30, true,
    ARRAY['free','pro','elite','trial']::VARCHAR(32)[]),
  ('botDisplayName', 'aiBehavior', 'Notetaker Display Name', 'How your notetaker appears in meetings.', 'string',
    NULL, '"Artiva Notetaker"'::jsonb, 40, true,
    ARRAY['free','pro','elite','trial']::VARCHAR(32)[]),

  ('autoShareTargets.slack', 'autoShareTargets', 'Slack', 'Post summary and action items to your channel.', 'boolean',
    NULL, 'false'::jsonb, 10, true, ARRAY['free','pro','elite','trial']::VARCHAR(32)[]),
  ('autoShareTargets.gmail', 'autoShareTargets', 'Gmail', 'Email to recipients automatically after meetings.', 'boolean',
    NULL, 'false'::jsonb, 20, true, ARRAY['free','pro','elite','trial']::VARCHAR(32)[]),
  ('autoShareTargets.notion', 'autoShareTargets', 'Notion', 'Create a Notion page automatically.', 'boolean',
    NULL, 'false'::jsonb, 30, true, ARRAY['free','pro','elite','trial']::VARCHAR(32)[]),
  ('autoShareTargets.jira', 'autoShareTargets', 'Jira', 'Create Jira tickets from action items.', 'boolean',
    NULL, 'false'::jsonb, 40, true, ARRAY['free','pro','elite','trial']::VARCHAR(32)[])
ON CONFLICT (key) DO NOTHING;

