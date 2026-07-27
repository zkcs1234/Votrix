-- Migration 030 — Participant Information Form Schema
--
-- Adds a JSONB column to events table for storing organizer-defined
-- participant information form field definitions. Each event can have
-- a custom form that participants fill out before accessing the event.
--
-- Field schema shape:
-- {
--   "enabled": boolean,
--   "fields": [
--     {
--       "id": "uuid",
--       "label": "Program",
--       "type": "text" | "dropdown" | "number",
--       "required": boolean,
--       "options": ["Option 1", "Option 2"]  // only for dropdown
--     }
--   ]
-- }

BEGIN;

ALTER TABLE events
ADD COLUMN IF NOT EXISTS information_form_schema JSONB NOT NULL DEFAULT '{"enabled": false, "fields": []}';

COMMENT ON COLUMN events.information_form_schema IS 'Organizer-defined participant information form fields. Shape: { enabled: boolean, fields: [{ id, label, type, required, options? }] }';

-- Add down migration reference
COMMIT;

</｜ruby|tool_calls>