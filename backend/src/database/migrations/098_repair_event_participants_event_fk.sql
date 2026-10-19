-- Migration 098 — Restore the canonical event participant relationship.
--
-- Migration 029 used CREATE TABLE IF NOT EXISTS, so an already-existing
-- event_participants table could survive without the event_id foreign key.
-- PostgREST cannot resolve `events` embeds without this relationship.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.event_participants ep
    LEFT JOIN public.events e ON e.id = ep.event_id
    WHERE e.id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot add event_participants.event_id foreign key: orphan participant rows exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute source_column
      ON source_column.attrelid = c.conrelid
     AND source_column.attnum = c.conkey[1]
    JOIN pg_attribute target_column
      ON target_column.attrelid = c.confrelid
     AND target_column.attnum = c.confkey[1]
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.event_participants'::regclass
      AND c.confrelid = 'public.events'::regclass
      AND c.conkey = ARRAY[source_column.attnum]::smallint[]
      AND c.confkey = ARRAY[target_column.attnum]::smallint[]
      AND source_column.attname = 'event_id'
      AND target_column.attname = 'id'
  ) THEN
    ALTER TABLE public.event_participants
      ADD CONSTRAINT event_participants_event_id_events_fkey
      FOREIGN KEY (event_id)
      REFERENCES public.events(id)
      ON DELETE CASCADE;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
