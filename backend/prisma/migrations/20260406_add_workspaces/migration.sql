CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE workspace_role AS ENUM ('owner', 'admin', 'member', 'viewer');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS workspace (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role workspace_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workspace_members_workspace_id_user_id_key UNIQUE (workspace_id, user_id)
);

ALTER TABLE meeting
ADD COLUMN IF NOT EXISTS workspace_id UUID NULL;

CREATE INDEX IF NOT EXISTS workspace_owner_id_idx
  ON workspace(owner_id);

CREATE INDEX IF NOT EXISTS workspace_members_user_id_idx
  ON workspace_members(user_id);

CREATE INDEX IF NOT EXISTS meeting_workspace_id_idx
  ON meeting(workspace_id);

DO $$
BEGIN
  ALTER TABLE meeting
    ADD CONSTRAINT meeting_workspace_id_fkey
    FOREIGN KEY (workspace_id)
    REFERENCES workspace(id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
