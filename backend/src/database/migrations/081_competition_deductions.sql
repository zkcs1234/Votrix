-- Additive deductions layer. Judge score records remain unchanged.
CREATE TABLE IF NOT EXISTS competition_deductions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    event_id UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    session_id UUID REFERENCES competition_sessions (id) ON DELETE SET NULL,
    round_id UUID REFERENCES competition_rounds (id) ON DELETE SET NULL,
    contestant_id UUID NOT NULL REFERENCES competition_contestants (id) ON DELETE CASCADE,
    applied_by_user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    authority_type VARCHAR(16) NOT NULL DEFAULT 'organizer',
    amount NUMERIC(10, 4) NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (
        status IN ('active', 'voided')
    ),
    voided_at TIMESTAMPTZ,
    voided_by_user_id UUID REFERENCES users (id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competition_deductions_event ON competition_deductions (event_id, status);

CREATE INDEX IF NOT EXISTS idx_competition_deductions_contestant ON competition_deductions (contestant_id, status);

CREATE TRIGGER trg_competition_deductions_updated_at
  BEFORE UPDATE ON competition_deductions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();