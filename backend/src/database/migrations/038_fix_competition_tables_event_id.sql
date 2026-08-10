-- Migration 038_fix — Fix missing event_id columns in competition tables
-- This is a companion patch to 038_competition_divisions which failed due to missing event_id columns

BEGIN;

-- Fix 1: Ensure competition_categories has event_id (required by trigger)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'competition_categories' AND column_name = 'event_id'
  ) THEN
    ALTER TABLE competition_categories ALTER COLUMN event_id SET NOT NULL;
  ELSE
    ALTER TABLE competition_categories ADD COLUMN event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_column THEN
  -- column already exists
END $$;

-- Fix 2: Ensure competition_rounds has event_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'competition_rounds' AND column_name = 'event_id'
  ) THEN
    ALTER TABLE competition_rounds ALTER COLUMN event_id SET NOT NULL;
  ELSE
    ALTER TABLE competition_rounds ADD COLUMN event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_column THEN
  -- column already exists
END $$;

-- Fix 3: Ensure competition_criteria has event_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'competition_criteria' AND column_name = 'event_id'
  ) THEN
    ALTER TABLE competition_criteria ALTER COLUMN event_id SET NOT NULL;
  ELSE
    ALTER TABLE competition_criteria ADD COLUMN event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_column THEN
  -- column already exists
END $$;

-- Fix 4: Ensure competition_scores has event_id (if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'competition_scores' AND column_name = 'event_id'
  ) THEN
    ALTER TABLE competition_scores ADD COLUMN event_id UUID REFERENCES events(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_column THEN
  -- column already exists
END $$;

-- Fix 5: Ensure competition_contestants has event_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'competition_contestants' AND column_name = 'event_id'
  ) THEN
    ALTER TABLE competition_contestants ALTER COLUMN event_id SET NOT NULL;
  ELSE
    ALTER TABLE competition_contestants ADD COLUMN event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_column THEN
  -- column already exists
END $$;

-- Add indexes if missing
CREATE INDEX IF NOT EXISTS idx_competition_categories_event_id_fix ON competition_categories(event_id);
CREATE INDEX IF NOT EXISTS idx_competition_rounds_event_id_fix ON competition_rounds(event_id);
CREATE INDEX IF NOT EXISTS idx_competition_criteria_event_id_fix ON competition_criteria(event_id);
CREATE INDEX IF NOT EXISTS idx_competition_scores_event_id_fix ON competition_scores(event_id) WHERE event_id IS NOT NULL;

COMMIT;