DO $$
BEGIN
  CREATE TYPE workspace_member_status AS ENUM ('active', 'pending', 'removed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE workspace_join_request_status AS ENUM ('pending', 'accepted', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE workspace_members
ADD COLUMN IF NOT EXISTS status workspace_member_status NOT NULL DEFAULT 'active';

CREATE TABLE IF NOT EXISTS workspace_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  status workspace_join_request_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_join_requests_workspace_user_status_key
  ON workspace_join_requests(workspace_id, user_id, status);

CREATE INDEX IF NOT EXISTS workspace_members_workspace_id_status_idx
  ON workspace_members(workspace_id, status);

CREATE INDEX IF NOT EXISTS workspace_join_requests_workspace_id_status_idx
  ON workspace_join_requests(workspace_id, status);

CREATE INDEX IF NOT EXISTS workspace_join_requests_user_id_idx
  ON workspace_join_requests(user_id);
