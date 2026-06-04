-- Phase 3 — Election Management Enhancement
--
-- Adds the fields required by the spec:
--   positions:
--     description        TEXT
--     number_of_winners  INTEGER  (default 1)
--     display_order      INTEGER  (default 0; ascending sort)
--     (existing) min_vote / max_vote serve as the "Vote Limits"
--
--   candidates:
--     biography          TEXT      (long-form "Biography")
--     platform           TEXT      ("Platform")
--     -- existing `partylist` is reused for "Party"; we keep the column name
--     -- so existing voter ballot/voting logic continues to work unchanged.
--
--   events:
--     results_visibility election_results_visibility
--       'real_time' — results stream as votes are cast
--       'hidden'    — results never shown to voters
--       'public'    — results visible after voting closes (default)
--
-- Existing voting logic (election_votes inserts, position vote-range checks)
-- is NOT touched.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Election results-visibility enum
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'election_results_visibility') THEN
    CREATE TYPE election_results_visibility AS ENUM ('real_time', 'hidden', 'public');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. positions — Position Builder fields
-- ---------------------------------------------------------------------------
ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS description       TEXT,
  ADD COLUMN IF NOT EXISTS number_of_winners INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS display_order     INTEGER NOT NULL DEFAULT 0;

-- Backfill display_order using creation order so existing data preserves the
-- ordering organizers/voters see today.
WITH ordered AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY created_at, id) - 1 AS rn
    FROM positions
)
UPDATE positions p
   SET display_order = o.rn
  FROM ordered o
 WHERE o.id = p.id
   AND p.display_order = 0;

ALTER TABLE positions
  DROP CONSTRAINT IF EXISTS positions_number_of_winners_positive;

ALTER TABLE positions
  ADD CONSTRAINT positions_number_of_winners_positive
    CHECK (number_of_winners >= 1);

CREATE INDEX IF NOT EXISTS idx_positions_event_id_display_order
  ON positions (event_id, display_order);

COMMENT ON COLUMN positions.description       IS 'Position Builder: optional description shown on the ballot.';
COMMENT ON COLUMN positions.number_of_winners IS 'Position Builder: how many seats this position elects.';
COMMENT ON COLUMN positions.display_order     IS 'Position Builder: ascending sort order on the ballot.';

-- ---------------------------------------------------------------------------
-- 3. candidates — Candidate Management fields
-- ---------------------------------------------------------------------------
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS biography TEXT,
  ADD COLUMN IF NOT EXISTS platform  TEXT;

COMMENT ON COLUMN candidates.biography IS
  'Candidate Management: long-form biography.';

COMMENT ON COLUMN candidates.platform IS
  'Candidate Management: candidate platform / campaign statement.';

COMMENT ON COLUMN candidates.partylist IS
  'Candidate Management: party (kept as `partylist` for backward compatibility).';

-- ---------------------------------------------------------------------------
-- 4. events — Election Settings (results visibility)
-- ---------------------------------------------------------------------------
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS results_visibility election_results_visibility
    NOT NULL DEFAULT 'public';

COMMENT ON COLUMN events.results_visibility IS
  'Election Settings: real_time | hidden | public. Ignored by non-election events.';

CREATE INDEX IF NOT EXISTS idx_events_results_visibility
  ON events (results_visibility);

COMMIT;
