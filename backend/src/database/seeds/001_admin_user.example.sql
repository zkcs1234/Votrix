-- Example: manually insert the first admin (NOT via frontend registration).
-- 1. Generate a bcrypt hash:  npm run db:hash-password -- "YourSecurePassword"
-- 2. Replace <BCRYPT_HASH> below, then run in Supabase SQL Editor.

INSERT INTO users (
  username,
  email,
  password,
  role,
  must_change_password
) VALUES (
  'admin',
  NULL,
  '<BCRYPT_HASH>',
  'admin',
  TRUE
);
