-- Immutable calculation snapshots for calculate -> review -> finalize -> publish.
CREATE TABLE IF NOT EXISTS competition_result_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  session_id UUID REFERENCES competition_sessions(id) ON DELETE SET NULL,
  round_id UUID REFERENCES competition_rounds(id) ON DELETE SET NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'calculated'
    CHECK (status IN ('calculated', 'finalized', 'published', 'superseded')),
  configuration_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  finalized_at TIMESTAMPTZ,
  published_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competition_result_calculations_event ON competition_result_calculations (event_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_competition_result_calculations_status ON competition_result_calculations (event_id, status);

CREATE TRIGGER trg_competition_result_calculations_updated_at
  BEFORE UPDATE ON competition_result_calculations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();