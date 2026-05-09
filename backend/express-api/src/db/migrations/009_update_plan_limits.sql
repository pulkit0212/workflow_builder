-- Update plan limits + feature copy (idempotent).
-- Free: 7 meetings/month
-- Pro: 20 meetings/month
-- Trial: similar to Pro (20 meetings/month)
-- Elite: unlimited + workspace enabled in copy

INSERT INTO plan_catalog (plan_id, display_name, price_inr, badge, badge_tone, description, features, limits, sort_order, is_active)
VALUES
  (
    'free',
    'Free',
    0,
    NULL,
    'neutral',
    'Unlimited generation tools with seven meeting previews per month.',
    ARRAY['Email Generator (unlimited)', 'Task Generator (unlimited)', 'Document Analyzer (unlimited)', '7 meeting recordings/month (preview only)'],
    $lim${
      "meetingBot": false,
      "transcription": false,
      "summary": false,
      "actionItems": false,
      "history": false,
      "meetingsPerMonth": 7,
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
    ARRAY['Everything in Free', 'Meeting Bot (AI Notetaker)', 'Auto Transcription', 'Auto Summary', 'Action Items extraction', 'Meeting History', '20 meetings/month'],
    $lim${
      "meetingBot": true,
      "transcription": true,
      "summary": true,
      "actionItems": true,
      "history": true,
      "meetingsPerMonth": 20,
      "unlimited": false
    }$lim$::jsonb,
    20,
    true
  ),
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
      "meetingsPerMonth": 20,
      "unlimited": false
    }$lim$::jsonb,
    5,
    true
  ),
  (
    'elite',
    'Elite',
    199,
    'Best Value',
    'accent',
    'Unlimited meetings plus priority support, workspace, and future feature access.',
    ARRAY['Everything in Pro', 'Unlimited meetings', 'Priority support', 'Team workspace', 'All future features'],
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
ON CONFLICT (plan_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  price_inr = EXCLUDED.price_inr,
  badge = EXCLUDED.badge,
  badge_tone = EXCLUDED.badge_tone,
  description = EXCLUDED.description,
  features = EXCLUDED.features,
  limits = EXCLUDED.limits,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

