-- ---------------------------------------------------------------------------
-- user account status
-- ---------------------------------------------------------------------------
CREATE TYPE user_account_status AS ENUM ('pending', 'active', 'suspended', 'archived');

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_status user_account_status NOT NULL DEFAULT 'active';

UPDATE users
SET account_status = 'active'
WHERE account_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_account_status ON users (account_status);

COMMENT ON COLUMN users.account_status IS 'Administrative account status for access approval and suspension.';
