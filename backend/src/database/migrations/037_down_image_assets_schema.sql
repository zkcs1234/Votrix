-- ---------------------------------------------------------------------------
-- VOTRIX Down Migration 037: Rollback Image Assets Schema
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS idx_event_drafts_image_asset_id;
DROP INDEX IF EXISTS idx_poll_options_image_asset_id;
DROP INDEX IF EXISTS idx_poll_questions_image_asset_id;
DROP INDEX IF EXISTS idx_contestants_image_asset_id;
DROP INDEX IF EXISTS idx_candidates_image_asset_id;
DROP INDEX IF EXISTS idx_events_image_asset_id;
DROP INDEX IF EXISTS idx_users_image_asset_id;

ALTER TABLE event_drafts DROP COLUMN IF EXISTS image_asset_id;
ALTER TABLE poll_options DROP COLUMN IF EXISTS image_asset_id;
ALTER TABLE poll_questions DROP COLUMN IF EXISTS image_asset_id;
ALTER TABLE contestants DROP COLUMN IF EXISTS image_asset_id;
ALTER TABLE candidates DROP COLUMN IF EXISTS image_asset_id;
ALTER TABLE events DROP COLUMN IF EXISTS image_asset_id;
ALTER TABLE users DROP COLUMN IF EXISTS image_asset_id;

DROP TRIGGER IF EXISTS trg_image_deletion_queue_updated_at ON image_deletion_queue;
DROP TABLE IF EXISTS image_deletion_queue;

DROP TRIGGER IF EXISTS trg_image_assets_updated_at ON image_assets;
DROP TABLE IF EXISTS image_assets;
