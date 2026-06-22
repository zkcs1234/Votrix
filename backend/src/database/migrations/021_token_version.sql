-- Session invalidation: increment token_version on logout / password change
-- to revoke outstanding JWTs without a separate session store.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN users.token_version IS
  'Incremented on logout and password change; must match JWT tokenVersion claim.';
