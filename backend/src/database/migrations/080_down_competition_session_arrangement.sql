-- Roll back migration 080: remove the published arrangement metadata.
-- contestant_order and all existing session scores remain untouched.
ALTER TABLE competition_sessions DROP COLUMN IF EXISTS arrangement;