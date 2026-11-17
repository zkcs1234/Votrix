-- Migration 142 — Programs table
--
-- Students pick a Program when they are added. The list of valid programs used
-- to live in the managed "participant taxonomy" system setting (together with
-- Year & Section). Year & Section is no longer collected for students and the
-- taxonomy is no longer managed from the admin UI, so the Program list now lives
-- in its own table that the admin Add/Edit Student forms and the CSV import
-- validate against.
--
-- To add or retire a program later, insert a row or set is_active = false:
--   INSERT INTO programs (name, sort_order) VALUES ('BSIT', 90);
--   UPDATE programs SET is_active = false WHERE name = 'BSF';
--
-- users.program stays a plain text column (existing students keep their value),
-- so deactivating a program never breaks existing student rows.
--
-- Idempotent (IF NOT EXISTS / ON CONFLICT), safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS programs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Program names are unique ignoring case ("bscs" and "BSCS" are the same program).
CREATE UNIQUE INDEX IF NOT EXISTS uq_programs_name_lower ON programs (lower(name));

COMMENT ON TABLE programs IS 'Valid student programs (e.g. BSCS). Admin Add/Edit Student and CSV import validate users.program against the active rows.';

INSERT INTO programs (name, sort_order) VALUES
  ('BEED',            10),
  ('BINDTECH-Elect',  20),
  ('BINDTECH-FPST',   30),
  ('BSCS',            40),
  ('BSED-English',    50),
  ('BSED-Math',       60),
  ('BSF',             70),
  ('BSM',             80)
ON CONFLICT (lower(name)) DO NOTHING;

-- Deny-all for Supabase's public API roles (see 138). The backend reads this
-- table with its service credentials; it is never exposed through the public API.
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;

COMMIT;
