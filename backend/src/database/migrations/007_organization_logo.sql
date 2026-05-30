-- Phase 10 — Organization logos for Cloudinary uploads

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS logo TEXT;

COMMENT ON COLUMN organizations.logo IS 'Cloudinary URL for organization branding logo.';
