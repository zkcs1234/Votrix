-- Migration 030 — Add Participant Information Form Configuration to Events
--
-- Adds a JSONB column to events for storing configurable form fields
-- that organizers can use to collect participant information.

BEGIN;

-- Add column for participant information form fields configuration
ALTER TABLE events
ADD COLUMN IF NOT EXISTS participant_info_fields JSONB NOT NULL DEFAULT '[]';

-- Comment describing the column format
COMMENT ON COLUMN events.participant_info_fields IS
'Array of field definitions for participant information form. Format: [{"key": "program", "label": "Program", "type": "select", "required": true, "options": [{"value": "BSIT", "label": "BSIT"}]}]';

COMMIT;
