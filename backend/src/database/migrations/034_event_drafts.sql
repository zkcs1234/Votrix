-- Migration 034 — Persistent organizer drafts for unfinished Create sessions.
--
-- One unfinished Create-session draft per (organizer, module).
-- Drafts are Create-only: Edit sessions must NEVER read or write this table.
-- `payload` is opaque JSON (form values, info-form schema, selections, etc.)
-- so new form fields do not require schema changes.
--
-- Voter/respondent/judge registration and invitations are NOT part of a draft:
-- they are event-scoped operations that only happen after the event is created.
--
-- Run in Supabase SQL Editor or via psql (see 001_initial_schema.sql header).

BEGIN;

CREATE TABLE IF NOT EXISTS event_drafts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  module       TEXT NOT NULL,
  step         TEXT NOT NULL DEFAULT 'details',
  title        VARCHAR(255),
  banner       TEXT,
  payload      JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT event_drafts_module_valid
    CHECK (module IN ('election', 'competition', 'polling')),
  CONSTRAINT event_drafts_one_per_module UNIQUE (organizer_id, module)
);

CREATE INDEX IF NOT EXISTS idx_event_drafts_organizer_module
  ON event_drafts (organizer_id, module);

CREATE INDEX IF NOT EXISTS idx_event_drafts_updated_at
  ON event_drafts (updated_at DESC);

-- set_updated_at() trigger function is defined in migration 001_initial_schema.sql.
CREATE TRIGGER trg_event_drafts_updated_at
  BEFORE UPDATE ON event_drafts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE event_drafts IS
  'Unfinished Create-session draft per organizer + module. Never merged with Edit sessions.';
COMMENT ON COLUMN event_drafts.payload IS
  'Opaque JSON snapshot of the Create form (values, info-form schema, selections).';

COMMIT;
