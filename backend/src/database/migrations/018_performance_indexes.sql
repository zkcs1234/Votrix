-- Phase 2: Performance indexes (corrected)
--
-- Notes:
--   • `criteria` and `contestants` are backward-compat VIEWS (migration 011).
--     Indexes must target the real tables: competition_criteria and competition_contestants.
--   • Several indexes from this list are already covered by migration 019:
--       idx_events_org_id        → covered by idx_events_org_type_status
--       idx_events_status        → covered by idx_events_org_type_status
--       idx_event_voters_composite → covered by idx_event_voters_event_voted
--       idx_poll_questions_event_id → covered by idx_poll_questions_event_order
--       idx_contestants_event_id → covered by idx_competition_contestants_event_number
--       idx_criteria_event_id    → covered by idx_competition_criteria_event_id (migration 011)
--   • Only the two genuinely missing indexes are created here.

-- positions: event filtering (listPositions, getVoterBallot, submitBallot)
CREATE INDEX IF NOT EXISTS idx_positions_event_id ON positions(event_id);

-- candidates: position filtering (listCandidates, getVoterBallot)
CREATE INDEX IF NOT EXISTS idx_candidates_position_id ON candidates(position_id);
