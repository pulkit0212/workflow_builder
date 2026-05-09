-- Tools catalog backing /dashboard/tools (active flag + plan allow-list + ordering + UI metadata).
-- Run once against your PostgreSQL database.

-- Ensure baseline columns exist for dynamic Tools UI.
ALTER TABLE tools
  ADD COLUMN IF NOT EXISTS category VARCHAR(32),
  ADD COLUMN IF NOT EXISTS sort_order INT,
  ADD COLUMN IF NOT EXISTS allowed_plans VARCHAR(32)[] NOT NULL DEFAULT ARRAY['free', 'pro', 'elite', 'trial']::VARCHAR(32)[],
  ADD COLUMN IF NOT EXISTS badge VARCHAR(32),
  ADD COLUMN IF NOT EXISTS ui_config JSONB;

-- Catalog visibility uses `is_active` (see schema/tools.ts). No legacy `status` column.

-- Helpful index for catalog queries
CREATE INDEX IF NOT EXISTS tools_catalog_active_sort_idx
  ON tools (category, sort_order, name)
  WHERE is_active = true;

-- Seed defaults for known slugs (idempotent; doesn't overwrite custom values).
UPDATE tools
SET
  category = COALESCE(category, 'core'),
  sort_order = COALESCE(sort_order,
    CASE slug
      WHEN 'meeting-summarizer' THEN 10
      WHEN 'email-generator' THEN 20
      WHEN 'document-analyzer' THEN 30
      WHEN 'task-generator' THEN 40
      ELSE 999
    END
  ),
  badge = COALESCE(badge,
    CASE slug
      WHEN 'meeting-summarizer' THEN 'POPULAR'
      WHEN 'document-analyzer' THEN 'NEW'
      ELSE NULL
    END
  ),
  allowed_plans = COALESCE(allowed_plans, ARRAY['free','pro','elite','trial']::VARCHAR(32)[])
WHERE slug IS NOT NULL AND TRIM(slug) <> '';

