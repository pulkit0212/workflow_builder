-- Trial plan: same feature gates as Elite (team workspace, unlimited meetings) for DB-driven plan_catalog.
UPDATE plan_catalog
SET
  description = 'Full Elite-level access during your trial — team workspaces, unlimited meetings, every feature.',
  features = ARRAY[
    'Everything in Elite',
    'Team workspace & invites',
    'Unlimited meetings during trial',
    '30-day free trial'
  ],
  limits = COALESCE(limits, '{}'::jsonb) || jsonb_build_object(
    'meetingBot', true,
    'transcription', true,
    'summary', true,
    'actionItems', true,
    'history', true,
    'meetingsPerMonth', 999999,
    'unlimited', true,
    'teamWorkspace', true
  )
WHERE plan_id = 'trial';

-- Elite catalog rows may omit teamWorkspace in JSON; ensure it is explicit for API consumers.
UPDATE plan_catalog
SET limits = COALESCE(limits, '{}'::jsonb) || jsonb_build_object('teamWorkspace', true)
WHERE plan_id = 'elite';
