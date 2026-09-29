-- Restore empty metadata columns when rolling back 077.
-- Previously stored client metadata is intentionally not restored.
BEGIN;

ALTER TABLE user_sessions
ADD COLUMN IF NOT EXISTS ip_address INET,
ADD COLUMN IF NOT EXISTS user_agent TEXT;

COMMIT;