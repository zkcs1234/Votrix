-- Down migration 065 — Relax participant_id back to nullable.
-- The columns, FKs (062), and auto-fill triggers (064) remain in place.

BEGIN;

ALTER TABLE election_votes                    ALTER COLUMN participant_id DROP NOT NULL;
ALTER TABLE poll_submissions                  ALTER COLUMN participant_id DROP NOT NULL;
ALTER TABLE competition_scores                ALTER COLUMN participant_id DROP NOT NULL;
ALTER TABLE competition_session_judge_scores  ALTER COLUMN participant_id DROP NOT NULL;

COMMIT;
