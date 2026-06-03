-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type                VARCHAR(64) NOT NULL,
  title               VARCHAR(255) NOT NULL,
  message             TEXT NOT NULL,
  action_url          TEXT,
  entity              VARCHAR(255),
  entity_id           UUID,
  metadata            JSONB,
  is_read             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications (user_id);
CREATE INDEX idx_notifications_user_read ON notifications (user_id, is_read);
CREATE INDEX idx_notifications_created_at ON notifications (created_at DESC);

CREATE TRIGGER trg_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE notifications IS 'In-app notifications for admins, organizers, and voters.';
