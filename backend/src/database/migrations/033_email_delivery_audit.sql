BEGIN;

CREATE TABLE IF NOT EXISTS email_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow VARCHAR(80) NOT NULL,
  recipient VARCHAR(320) NOT NULL,
  subject TEXT,
  event_id UUID,
  user_id UUID,
  template_name VARCHAR(120),
  dedupe_key TEXT,
  provider_status VARCHAR(32) NOT NULL DEFAULT 'queued',
  provider_message_id TEXT,
  provider_error TEXT,
  retryable BOOLEAN NOT NULL DEFAULT FALSE,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_workflow_created
  ON email_delivery_logs (workflow, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_event
  ON email_delivery_logs (event_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_user
  ON email_delivery_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_dedupe
  ON email_delivery_logs (dedupe_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_status
  ON email_delivery_logs (provider_status, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_email_delivery_logs_updated_at
  BEFORE UPDATE ON email_delivery_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
