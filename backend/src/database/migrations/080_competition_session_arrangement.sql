-- Persist the organizer's published ordering mode alongside contestant_order.
ALTER TABLE competition_sessions
  ADD COLUMN IF NOT EXISTS arrangement JSONB NOT NULL DEFAULT '{"mode":"default","primaryDivisionId":null,"secondaryDivisionId":null}'::jsonb;

COMMENT ON COLUMN competition_sessions.arrangement IS 'Published live ordering configuration. contestant_order remains the authoritative ordered contestant ID list.';