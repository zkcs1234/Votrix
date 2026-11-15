-- Migration 135: Add STUDENT participant type
--
-- Adds a unified STUDENT type that can participate in both
-- elections and polling events. This replaces the need for students
-- to have separate ELECTION_VOTER and POLLING_RESPONDENT types.
--
-- Note: PostgreSQL requires enum values to be added in their own
-- transaction before they can be used. This migration only adds
-- the enum value. Migration 136 will use it.

ALTER TYPE participant_type ADD VALUE IF NOT EXISTS 'STUDENT';

-- Verification
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'participant_type'
    AND e.enumlabel = 'STUDENT'
  ) THEN
    RAISE NOTICE '✓ STUDENT participant type added successfully';
  ELSE
    RAISE EXCEPTION 'Failed to add STUDENT participant type';
  END IF;
END $$;
