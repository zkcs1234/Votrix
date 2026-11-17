-- Down migration 142 — remove the programs table.
-- Reverses 142_programs.sql. users.program values are plain text and are not
-- touched; only the managed list of valid programs is dropped.

BEGIN;

DROP TABLE IF EXISTS programs;

COMMIT;
