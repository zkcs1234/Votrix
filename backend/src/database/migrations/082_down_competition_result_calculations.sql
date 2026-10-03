-- Roll back migration 082: remove immutable tabulation snapshots.
-- Original judge scores and round result snapshots remain untouched.
DROP TRIGGER IF EXISTS trg_competition_result_calculations_updated_at ON competition_result_calculations;

DROP INDEX IF EXISTS idx_competition_result_calculations_event;

DROP INDEX IF EXISTS idx_competition_result_calculations_status;

DROP TABLE IF EXISTS competition_result_calculations;