-- ---------------------------------------------------------------------------
-- VOTRIX Migration 037: Global Image Assets Registry & Deduplication Schema
-- ---------------------------------------------------------------------------

-- 1. Centralized Image Assets Registry
CREATE TABLE IF NOT EXISTS image_assets (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_hash            VARCHAR(64) NOT NULL,
  cloudinary_public_id TEXT NOT NULL,
  cloudinary_url       TEXT NOT NULL,
  mime_type            VARCHAR(64) NOT NULL,
  file_size            INTEGER NOT NULL,
  width                INTEGER,
  height               INTEGER,
  format               VARCHAR(32),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT image_assets_hash_unique UNIQUE (file_hash)
);

CREATE INDEX IF NOT EXISTS idx_image_assets_hash ON image_assets (file_hash);

-- Auto-update updated_at trigger
CREATE TRIGGER trg_image_assets_updated_at
  BEFORE UPDATE ON image_assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2. Retryable Cloudinary Deletion Queue
CREATE TABLE IF NOT EXISTS image_deletion_queue (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cloudinary_public_id TEXT NOT NULL,
  attempts             INTEGER NOT NULL DEFAULT 0,
  last_error           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_image_deletion_queue_attempts ON image_deletion_queue (attempts);

CREATE TRIGGER trg_image_deletion_queue_updated_at
  BEFORE UPDATE ON image_deletion_queue
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3. Add image_asset_id FK to all image-bearing tables
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS image_asset_id UUID REFERENCES image_assets(id) ON DELETE SET NULL;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS image_asset_id UUID REFERENCES image_assets(id) ON DELETE SET NULL;

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS image_asset_id UUID REFERENCES image_assets(id) ON DELETE SET NULL;

-- Note: contestants is a view; the actual table is competition_contestants
ALTER TABLE competition_contestants
  ADD COLUMN IF NOT EXISTS image_asset_id UUID REFERENCES image_assets(id) ON DELETE SET NULL;

ALTER TABLE poll_questions
  ADD COLUMN IF NOT EXISTS image_asset_id UUID REFERENCES image_assets(id) ON DELETE SET NULL;

ALTER TABLE poll_options
  ADD COLUMN IF NOT EXISTS image_asset_id UUID REFERENCES image_assets(id) ON DELETE SET NULL;

ALTER TABLE event_drafts
  ADD COLUMN IF NOT EXISTS image_asset_id UUID REFERENCES image_assets(id) ON DELETE SET NULL;

-- 4. Create indexes for fast reference counting
CREATE INDEX IF NOT EXISTS idx_users_image_asset_id ON users (image_asset_id) WHERE image_asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_image_asset_id ON events (image_asset_id) WHERE image_asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_candidates_image_asset_id ON candidates (image_asset_id) WHERE image_asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_competition_contestants_image_asset_id ON competition_contestants (image_asset_id) WHERE image_asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_poll_questions_image_asset_id ON poll_questions (image_asset_id) WHERE image_asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_poll_options_image_asset_id ON poll_options (image_asset_id) WHERE image_asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_drafts_image_asset_id ON event_drafts (image_asset_id) WHERE image_asset_id IS NOT NULL;

-- Comments
COMMENT ON TABLE image_assets IS 'Centralized registry of uploaded images deduplicated by SHA-256 binary hash.';
COMMENT ON TABLE image_deletion_queue IS 'Queue for asynchronous retried Cloudinary deletions.';
