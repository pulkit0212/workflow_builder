-- Fix inconsistent rows from older approve flow: workspace_id was set but
-- workspace_move_status stayed 'pending', so the UI showed "Pending approval" forever.
-- Legitimate pending requests keep workspace_id NULL until approval.
UPDATE meeting_sessions
SET
  workspace_move_status = 'approved',
  updated_at = NOW()
WHERE workspace_id IS NOT NULL
  AND workspace_move_status = 'pending';
