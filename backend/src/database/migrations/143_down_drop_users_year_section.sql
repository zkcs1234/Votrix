-- Down migration 143 — re-add users.year_section (EMPTY).
-- Reverses the structure of 143_drop_users_year_section.sql only. The old values
-- are not restored; if you kept users_year_section_backup you can copy them back:
--   UPDATE users u SET year_section = b.year_section
--   FROM users_year_section_backup b WHERE b.id = u.id;

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS year_section VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_users_profile_type_year_section
  ON users (profile_type, year_section);

COMMIT;
