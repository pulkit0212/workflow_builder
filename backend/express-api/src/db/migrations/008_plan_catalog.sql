-- Plan catalog backing /dashboard/billing (DB-driven plans + limits + UI copy).
-- Run once against your PostgreSQL database.

CREATE TABLE IF NOT EXISTS plan_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id VARCHAR(32) NOT NULL UNIQUE CHECK (plan_id IN ('trial','free','pro','elite')),
  display_name VARCHAR(64) NOT NULL,
  price_inr INT NOT NULL DEFAULT 0,
  badge VARCHAR(64),
  badge_tone VARCHAR(16) NOT NULL DEFAULT 'neutral' CHECK (badge_tone IN ('neutral','accent','pending','dark')),
  description TEXT NOT NULL DEFAULT '',
  features TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  limits JSONB NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  ui_config JSONB
);

CREATE INDEX IF NOT EXISTS plan_catalog_sort_idx
  ON plan_catalog (sort_order);

-- Seed plans (idempotent).
INSERT INTO plan_catalog (plan_id, display_name, price_inr, badge, badge_tone, description, features, limits, sort_order, is_active)
VALUES
  (
    'trial',
    'Trial',
    0,
    '30 Days',
    'pending',
    'Full Pro access for 30 days after signup.',
    ARRAY['Everything in Pro', '30-day free trial', 'Full feature access'],
    $lim${
      "meetingBot": true,
      "transcription": true,
      "summary": true,
      "actionItems": true,
      "history": true,
      "meetingsPerMonth": 10,
      "unlimited": false
    }$lim$::jsonb,
    5,
    true
  ),
  (
    'free',
    'Free',
    0,
    NULL,
    'neutral',
    'Unlimited generation tools with three meeting previews per month.',
    ARRAY['Email Generator (unlimited)', 'Task Generator (unlimited)', 'Document Analyzer (unlimited)', '3 meeting recordings/month (preview only)'],
    $lim${
      "meetingBot": false,
      "transcription": false,
      "summary": false,
      "actionItems": false,
      "history": false,
      "meetingsPerMonth": 3,
      "unlimited": false
    }$lim$::jsonb,
    10,
    true
  ),
  (
    'pro',
    'Pro',
    99,
    'Most Popular',
    'pending',
    'Meeting bot, transcription, summaries, and history for active individual users.',
    ARRAY['Everything in Free', 'Meeting Bot (AI Notetaker)', 'Auto Transcription', 'Auto Summary', 'Action Items extraction', 'Meeting History', '10 meetings/month'],
    $lim${
      "meetingBot": true,
      "transcription": true,
      "summary": true,
      "actionItems": true,
      "history": true,
      "meetingsPerMonth": 10,
      "unlimited": false
    }$lim$::jsonb,
    20,
    true
  ),
  (
    'elite',
    'Elite',
    199,
    'Best Value',
    'accent',
    'Unlimited meetings plus priority support and future feature access.',
    ARRAY['Everything in Pro', 'Unlimited meetings', 'Priority support', 'Slack/Email export (coming soon)', 'Team workspace (coming soon)', 'All future features'],
    $lim${
      "meetingBot": true,
      "transcription": true,
      "summary": true,
      "actionItems": true,
      "history": true,
      "meetingsPerMonth": 999999,
      "unlimited": true
    }$lim$::jsonb,
    30,
    true
  )
ON CONFLICT (plan_id) DO NOTHING;

