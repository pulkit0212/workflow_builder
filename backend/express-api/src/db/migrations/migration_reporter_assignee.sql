-- Migration: rename user_id → reporter_id, add assignee_id to action_items
-- Idempotent: safe to run multiple times

-- Step 1: rename user_id → reporter_id (no-op if already renamed)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'action_items' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE action_items RENAME COLUMN user_id TO reporter_id;
  END IF;
END $$;

-- Step 2: add assignee_id if not present
ALTER TABLE action_items
  ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Step 3: seed assignee_id from reporter_id for existing rows where assignee_id is null
UPDATE action_items
SET assignee_id = reporter_id
WHERE assignee_id IS NULL;
