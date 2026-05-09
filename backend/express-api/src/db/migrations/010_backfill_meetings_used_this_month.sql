-- Backfill subscriptions.meetings_used_this_month based on meeting_sessions created in current month.
-- Use when the counter was not being incremented historically.
--
-- Notes:
-- - subscriptions.user_id is the Clerk user id in this codebase.
-- - meeting_sessions.user_id is the app user UUID (users.id).
-- - We join users.clerk_user_id to subscriptions.user_id.

WITH month_start AS (
  SELECT date_trunc('month', NOW()) AS value
),
counts AS (
  SELECT
    u.clerk_user_id AS clerk_user_id,
    COUNT(*)::int AS meeting_count
  FROM meeting_sessions ms
  JOIN users u ON u.id = ms.user_id
  JOIN month_start m ON ms.created_at >= m.value
  GROUP BY u.clerk_user_id
)
UPDATE subscriptions s
SET
  meetings_used_this_month = COALESCE(c.meeting_count, 0),
  updated_at = NOW()
FROM counts c
WHERE s.user_id = c.clerk_user_id;

-- If some subscriptions have zero meetings this month, you can optionally normalize them too:
-- UPDATE subscriptions
-- SET meetings_used_this_month = 0, updated_at = NOW()
-- WHERE meetings_used_this_month IS NULL;

