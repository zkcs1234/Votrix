-- ---------------------------------------------------------------------------
-- system_settings
-- ---------------------------------------------------------------------------
CREATE TABLE system_settings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key         VARCHAR(255) NOT NULL UNIQUE,
  setting_value       JSONB NOT NULL,
  description         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_system_settings_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users (id) ON DELETE SET NULL,
  action              VARCHAR(255) NOT NULL,
  entity              VARCHAR(255),
  entity_id           UUID,
  details             JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs (user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs (action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC);

COMMENT ON TABLE system_settings IS 'Global system settings configuration.';
COMMENT ON TABLE audit_logs IS 'Audit trail for administrative and important system actions.';
