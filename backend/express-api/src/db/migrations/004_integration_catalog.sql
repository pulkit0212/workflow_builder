-- Catalog of integrations shown on /dashboard/integrations (active flag + plan allow-list).
-- Run once against your PostgreSQL database.

CREATE TABLE IF NOT EXISTS integration_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(64) NOT NULL UNIQUE,
  category VARCHAR(32) NOT NULL CHECK (category IN ('calendar', 'productivity', 'promo')),
  integration_type VARCHAR(64),
  display_name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon VARCHAR(64) NOT NULL DEFAULT 'extension',
  color_hex VARCHAR(32) NOT NULL DEFAULT '#6C3FF5',
  bg_hex VARCHAR(32) NOT NULL DEFAULT '#F1F3F4',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  allowed_plans VARCHAR(32)[] NOT NULL DEFAULT ARRAY['free', 'pro', 'elite', 'trial']::VARCHAR(32)[],
  ui_config JSONB
);

CREATE INDEX IF NOT EXISTS integration_catalog_category_sort_idx
  ON integration_catalog (category, sort_order);

-- Idempotent seed: insert only missing slugs
INSERT INTO integration_catalog (slug, category, integration_type, display_name, description, icon, color_hex, bg_hex, sort_order, is_active, allowed_plans, ui_config)
VALUES
  ('google_calendar', 'calendar', 'google', 'Google Calendar', 'Sync all your scheduled meetings and events automatically.', 'calendar_month', '#4285F4', '#E8F0FE', 10, true,
   ARRAY['free','pro','elite','trial']::VARCHAR(32)[], NULL),
  ('microsoft_teams_calendar', 'calendar', 'microsoft_teams', 'Microsoft Teams', 'Connect your enterprise calendar and video conferencing.', 'groups', '#6264A7', '#EDE9FE', 20, true,
   ARRAY['free','pro','elite','trial']::VARCHAR(32)[], NULL),
  ('microsoft_outlook_calendar', 'calendar', 'microsoft_outlook', 'Outlook', 'Manage professional schedules via Exchange servers.', 'inbox', '#0078D4', '#E3F2FD', 30, true,
   ARRAY['free','pro','elite','trial']::VARCHAR(32)[], NULL),
  ('slack', 'productivity', 'slack', 'Slack', 'Push meeting summaries and action items to channels.', 'chat', '#E01E5A', '#FFF0F3', 10, true,
   ARRAY['free','pro','elite','trial']::VARCHAR(32)[],
   $cfg${"fields":[{"key":"webhookUrl","label":"Webhook URL","placeholder":"https://hooks.slack.com/services/...","type":"text","required":true,"help":"Create at api.slack.com/apps → Incoming Webhooks"}],"setupSteps":["Go to api.slack.com/apps","Create a new app → From scratch","Add feature: Incoming Webhooks","Add new webhook to workspace","Select your channel","Copy webhook URL and paste above"]}$cfg$::jsonb),
  ('gmail', 'productivity', 'gmail', 'Gmail', 'Automated follow-up emails for all participants.', 'mail', '#EA4335', '#FEF2F2', 20, true,
   ARRAY['free','pro','elite','trial']::VARCHAR(32)[],
   $cfg${"fields":[{"key":"recipients","label":"Recipients","placeholder":"john@company.com, sarah@company.com","type":"text","required":true,"help":"Comma-separated email addresses"}],"setupSteps":["Enter recipient email addresses above","Uses your connected Google account","Emails are sent automatically after each meeting"]}$cfg$::jsonb),
  ('notion', 'productivity', 'notion', 'Notion', 'Export meeting transcripts to shared team wikis.', 'article', '#000000', '#F8F8F8', 30, true,
   ARRAY['free','pro','elite','trial']::VARCHAR(32)[],
   $cfg${"fields":[{"key":"webhookUrl","label":"Webhook URL","placeholder":"https://hook.eu1.make.com/...","type":"text","required":true,"help":"Create a webhook in Make.com or Zapier that creates a Notion page"}],"setupSteps":["Go to make.com and create a free account","Create a new Scenario","Add trigger: Webhooks → Custom webhook → Copy the URL","Add action: Notion → Create a Database Item","Paste the webhook URL above and save"]}$cfg$::jsonb),
  ('jira', 'productivity', 'jira', 'Jira', 'Convert meeting decisions directly into Jira issues.', 'bug_report', '#0052CC', '#EFF6FF', 40, true,
   ARRAY['free','pro','elite','trial']::VARCHAR(32)[],
   $cfg${"fields":[{"key":"webhookUrl","label":"Webhook URL","placeholder":"https://hook.eu1.make.com/...","type":"text","required":true,"help":"Create a webhook in Make.com or Zapier that creates Jira issues"}],"setupSteps":["Go to make.com and create a free account","Create a new Scenario","Add trigger: Webhooks → Custom webhook → Copy the URL","Add action: Jira → Create an Issue","Paste the webhook URL above and save"]}$cfg$::jsonb),
  ('custom_webhooks', 'promo', NULL, 'Custom Webhooks', 'Build your own integrations by connecting Artivaa AI to your internal server endpoints.', 'webhook', '#FFFFFF', '#6C3FF5', 10, true,
   ARRAY['free','pro','elite','trial']::VARCHAR(32)[],
   $cfg${"bannerStyle":"purple","buttons":[{"label":"Create Webhook","variant":"solid","href":null},{"label":"Developer Docs","variant":"outline","href":null}]}$cfg$::jsonb),
  ('zapier', 'promo', NULL, 'Zapier Automations', 'Connect to over 5,000+ apps without writing a single line of code.', 'bolt', '#137333', '#FFFFFF', 20, true,
   ARRAY['free','pro','elite','trial']::VARCHAR(32)[],
   $cfg${"bannerStyle":"white","buttons":[{"label":"Open Zapier Store","variant":"green","href":"https://zapier.com/apps"}]}$cfg$::jsonb)
ON CONFLICT (slug) DO NOTHING;
