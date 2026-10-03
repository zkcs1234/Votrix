-- Roll back migration 081: remove the separate deductions layer.
-- Judge score records and result snapshots are not modified.
DROP TRIGGER IF EXISTS trg_competition_deductions_updated_at ON competition_deductions;

DROP INDEX IF EXISTS idx_competition_deductions_event;

DROP INDEX IF EXISTS idx_competition_deductions_contestant;

DROP TABLE IF EXISTS competition_deductions;