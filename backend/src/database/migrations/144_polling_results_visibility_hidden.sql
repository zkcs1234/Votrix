-- Migration 144 — Poll results visibility defaults to hidden
--
-- Polls now have their own student-facing results setting (events.results_visibility,
-- the same real_time | hidden | public column elections use). The column default is
-- 'public', which every existing poll picked up without its organizer choosing it.
-- Set existing polls to 'hidden' so no poll starts showing results to students
-- until its organizer opts in on the poll's Settings step.
--
-- Only polling events are touched; elections keep their saved value.
-- Idempotent and safe to re-run, but re-running resets any poll an organizer has
-- since changed — run it once, before organizers start choosing a setting.

BEGIN;

UPDATE events
SET results_visibility = 'hidden'
WHERE event_type = 'polling'
  AND results_visibility = 'public';

COMMIT;
