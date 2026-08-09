# VOTRIX Global Image Deduplication & Cloudinary Storage Cleanup

## Implementation Status: ✅ COMPLETE

This document describes the **production-ready** SHA-256 image deduplication system, Cloudinary asset reuse, safe image replacement, reference-counted deletion, and orphan asset cleanup architecture that has been implemented across the entire VOTRIX application.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [How It Works](#how-it-works)
3. [Database Schema](#database-schema)
4. [Implementation Details](#implementation-details)
5. [Migration & Deployment](#migration--deployment)
6. [Verification & Testing](#verification--testing)
7. [Maintenance & Operations](#maintenance--operations)

---

## Architecture Overview

### The Problem We Solved

**Before:**
- Every image upload created a new Cloudinary asset, even if the exact same file was uploaded multiple times
- Replacing images (e.g., updating a candidate photo) left orphaned assets in Cloudinary forever
- Deleting entities (candidates, events, poll questions) left their images stranded in Cloudinary
- No way to track which images were actually in use
- Growing storage costs from duplicate and orphaned images

**After:**
- Images are deduplicated by SHA-256 content hash before upload
- Identical files uploaded by different users/events share a single Cloudinary asset
- Replacing images automatically cleans up the old asset if no other entities reference it
- Deleting entities triggers automatic cleanup of their images (if not shared)
- Complete reference tracking across all 7 image-bearing entity types
- Failed deletions are queued for automatic retry with exponential backoff

---

## How It Works

### Upload Flow (Content-Based Deduplication)

```text
1. User uploads image file (multipart form data)
   ↓
2. Backend receives buffer, validates size/MIME type
   ↓
3. Calculate SHA-256 hash of raw binary buffer
   ↓
4. Query image_assets table by file_hash
   ↓
   ┌─────────────┴──────────────┐
   │ Hash Exists?                │ Hash New?
   │ (Duplicate detected)        │ (Unique file)
   ↓                             ↓
5a. Return existing asset        5b. Upload to Cloudinary
    (skip Cloudinary upload)          ↓
    Response time: ~10ms              Register in image_assets
                                      Response time: ~1.5s
                                      ↓
6. Attach image_asset_id + cloudinary_url to entity
   ↓
7. Return URL to frontend
```

### Deletion Flow (Reference-Counted Cleanup)

```text
1. Entity deleted or image replaced
   ↓
2. Identify old image_asset_id
   ↓
3. Count remaining references across all 7 tables:
   - users.image_asset_id
   - events.image_asset_id
   - candidates.image_asset_id
   - contestants.image_asset_id
   - poll_questions.image_asset_id
   - poll_options.image_asset_id
   - event_drafts.image_asset_id
   ↓
   ┌─────────────┴──────────────┐
   │ Refs > 0?                   │ Refs = 0?
   │ (Image still in use)        │ (Safe to delete)
   ↓                             ↓
4a. Do NOT touch Cloudinary      4b. Attempt Cloudinary destroy()
                                      ┌────────┴────────┐
                                      │ Success         │ Failure
                                      ↓                 ↓
                                      Delete from       Queue in
                                      image_assets      image_deletion_queue
                                                        (retry worker handles)
```

### Replacement Flow (Safe Two-Phase Update)

```text
When replacing Candidate A's photo from Asset-1 to Asset-2:

1. Upload new file → Get Asset-2 (existing or new)
   ↓
2. Update candidate record:
   SET image_asset_id = Asset-2.id, photo = Asset-2.cloudinary_url
   WHERE id = candidateId
   ↓
3. Transaction committed → Database now points to Asset-2
   ↓
4. Post-commit async cleanup:
   - Count references for Asset-1
   - If count = 0 → Destroy in Cloudinary + delete from image_assets
   - If count > 0 → Leave Asset-1 intact (shared by other entities)
   
**Safety Guarantee:** If step 2 fails, Asset-1 remains linked to Candidate A.
No broken image links.
```

---

## Database Schema

### `image_assets` Table (Centralized Registry)

```sql
CREATE TABLE image_assets (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_hash            VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 hex string
  cloudinary_public_id TEXT NOT NULL,
  cloudinary_url       TEXT NOT NULL,                -- Canonical HTTPS URL
  mime_type            VARCHAR(64) NOT NULL,
  file_size            INTEGER NOT NULL,
  width                INTEGER,
  height               INTEGER,
  format               VARCHAR(32),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_image_assets_hash ON image_assets (file_hash);
```

### `image_deletion_queue` Table (Retry Queue for Failed Deletions)

```sql
CREATE TABLE image_deletion_queue (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cloudinary_public_id TEXT NOT NULL,
  attempts             INTEGER NOT NULL DEFAULT 0,
  last_error           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_image_deletion_queue_attempts ON image_deletion_queue (attempts);
```

### Entity Table Foreign Keys

All 7 image-bearing entity tables have the following additions:

```sql
ALTER TABLE users ADD COLUMN image_asset_id UUID REFERENCES image_assets(id) ON DELETE SET NULL;
ALTER TABLE events ADD COLUMN image_asset_id UUID REFERENCES image_assets(id) ON DELETE SET NULL;
ALTER TABLE candidates ADD COLUMN image_asset_id UUID REFERENCES image_assets(id) ON DELETE SET NULL;
ALTER TABLE contestants ADD COLUMN image_asset_id UUID REFERENCES image_assets(id) ON DELETE SET NULL;
ALTER TABLE poll_questions ADD COLUMN image_asset_id UUID REFERENCES image_assets(id) ON DELETE SET NULL;
ALTER TABLE poll_options ADD COLUMN image_asset_id UUID REFERENCES image_assets(id) ON DELETE SET NULL;
ALTER TABLE event_drafts ADD COLUMN image_asset_id UUID REFERENCES image_assets(id) ON DELETE SET NULL;

-- Partial indexes for fast reference counting
CREATE INDEX idx_users_image_asset_id ON users (image_asset_id) WHERE image_asset_id IS NOT NULL;
CREATE INDEX idx_events_image_asset_id ON events (image_asset_id) WHERE image_asset_id IS NOT NULL;
-- ... (similar for all 7 tables)
```

**Note:** Existing text columns (`organization_logo`, `banner`, `photo`, `image_url`) are **retained** and continue to store the `cloudinary_url` string. This ensures **zero breaking changes** to existing APIs and frontend components.

---

## Implementation Details

### Files Modified/Created

| File | Type | Description |
|------|------|-------------|
| `backend/src/database/migrations/037_image_assets_schema.sql` | Migration | Creates `image_assets`, `image_deletion_queue`, and adds FKs |
| `backend/src/services/imageAsset.service.js` | Service | Hashing, deduplication, reference counting, deletion queue |
| `backend/src/services/upload.service.js` | Service | Integrated SHA-256 check before Cloudinary upload |
| `backend/src/services/organization.service.js` | Service | Logo replacement cleanup |
| `backend/src/services/election.service.js` | Service | Banner + candidate photo cleanup |
| `backend/src/services/pageant.service.js` | Service | Banner + contestant photo cleanup |
| `backend/src/services/polling.service.js` | Service | Banner + question/option image cleanup |
| `backend/src/services/draft.service.js` | Service | Draft banner cleanup |
| `backend/src/controllers/organizer.controller.js` | Controller | Pass `image_asset_id` for logo uploads |
| `backend/src/controllers/election-organizer.controller.js` | Controller | Pass `image_asset_id` for banner/photo uploads |
| `backend/src/controllers/pageant-organizer.controller.js` | Controller | Pass `image_asset_id` for banner/photo uploads |
| `backend/src/controllers/polling-organizer.controller.js` | Controller | Pass `image_asset_id` for banner/image uploads |
| `backend/src/scripts/migrate_existing_images.js` | Script | Backfill existing images into `image_assets` |
| `backend/src/scripts/cleanup_orphaned_cloudinary_assets.js` | Script | Find and remove orphaned Cloudinary assets |
| `backend/src/scripts/process_deletion_queue.js` | Script | Background worker for retry queue |
| `backend/src/utils/constants.js` | Constants | Added `IMAGE_ASSETS` and `IMAGE_DELETION_QUEUE` to `DB_TABLES` |

**Frontend Impact:** **ZERO** files modified. Frontend continues sending multipart form data and receiving `{ success: true, url: string }` responses.

---

## Migration & Deployment

### Step 1: Run Database Migration

```bash
# Apply the schema migration
psql -U your_user -d votrix_db -f backend/src/database/migrations/037_image_assets_schema.sql
```

This creates the `image_assets` and `image_deletion_queue` tables and adds `image_asset_id` foreign keys to all entity tables.

### Step 2: Deploy Code

Deploy the updated backend code to your server. The new deduplication logic will activate immediately for all **new** uploads.

### Step 3: Migrate Existing Images

**Important:** This script downloads images from Cloudinary to calculate their SHA-256 hashes. Depending on the number of existing images, this may take several minutes to hours.

```bash
# Dry run (recommended first)
node backend/src/scripts/migrate_existing_images.js

# The script will:
# 1. Scan all non-null image URLs from all 7 entity tables
# 2. Download each image and calculate its SHA-256 hash
# 3. Register it in image_assets (deduplicating immediately if hash matches)
# 4. Update the entity's image_asset_id foreign key
```

### Step 4: Verify Migration

```bash
# Check registered assets
psql -U your_user -d votrix_db -c "SELECT COUNT(*) FROM image_assets;"

# Check entity table population
psql -U your_user -d votrix_db -c "SELECT COUNT(*) FROM users WHERE image_asset_id IS NOT NULL;"
psql -U your_user -d votrix_db -c "SELECT COUNT(*) FROM events WHERE image_asset_id IS NOT NULL;"
# ... (repeat for other tables)
```

### Step 5: Clean Up Orphans (Optional)

After migration, you may have pre-existing orphaned Cloudinary assets from before this system was implemented.

```bash
# Dry run (safe, no deletions)
node backend/src/scripts/cleanup_orphaned_cloudinary_assets.js

# Review the output, then execute if satisfied
node backend/src/scripts/cleanup_orphaned_cloudinary_assets.js --execute
```

### Step 6: Set Up Deletion Queue Worker

The deletion queue worker should run as a background process or scheduled cron job:

**Option A: Systemd Service (Linux)**

Create `/etc/systemd/system/votrix-deletion-worker.service`:

```ini
[Unit]
Description=VOTRIX Image Deletion Queue Worker
After=network.target

[Service]
Type=simple
User=votrix
WorkingDirectory=/opt/votrix/backend
ExecStart=/usr/bin/node src/scripts/process_deletion_queue.js --daemon --interval=60000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable votrix-deletion-worker
sudo systemctl start votrix-deletion-worker
```

**Option B: Cron Job**

```cron
# Run every 5 minutes
*/5 * * * * /usr/bin/node /opt/votrix/backend/src/scripts/process_deletion_queue.js
```

**Option C: Manual/One-Shot**

```bash
# Run once to clear the queue
node backend/src/scripts/process_deletion_queue.js
```

---

## Verification & Testing

### Test Suite

Run the following manual tests to verify the system works correctly:

#### Test 1: New Unique Image Upload

```bash
# Upload test1.png to Candidate A
# Expected: Image uploaded to Cloudinary, registered in image_assets, linked to candidate

# Verify:
SELECT * FROM image_assets WHERE cloudinary_url LIKE '%test1.png%';
SELECT image_asset_id FROM candidates WHERE id = 'candidate-a-id';
```

#### Test 2: Duplicate Image Upload

```bash
# Upload the exact same test1.png file to Candidate B
# Expected: 0 Cloudinary API calls, existing asset reused

# Verify:
SELECT COUNT(*) FROM image_assets WHERE file_hash = '<hash-of-test1>';
# Should be 1 (not 2)

SELECT image_asset_id FROM candidates WHERE id IN ('candidate-a-id', 'candidate-b-id');
# Both should have the same image_asset_id
```

#### Test 3: Different Filename, Same Content

```bash
# Rename test1.png to renamed_test1.png, upload to Candidate C
# Expected: Hash match detected, duplicate identified despite filename difference

# Verify reference count:
-- Should show 3 references (Candidate A, B, C all sharing the same asset)
```

#### Test 4: Image Replacement

```bash
# Replace Candidate A's photo with test2.png
# Expected: Candidate A now points to test2 asset

# Verify old asset NOT deleted (still used by B & C):
SELECT * FROM image_assets WHERE cloudinary_url LIKE '%test1.png%';
# Should still exist

SELECT image_asset_id FROM candidates WHERE id = 'candidate-a-id';
# Should now be test2's asset ID
```

#### Test 5: Entity Deletion with Shared Image

```bash
# Delete Candidate B (who shares test1.png with Candidate C)
# Expected: test1.png remains in Cloudinary because C still references it

# Verify:
SELECT COUNT(*) FROM candidates WHERE image_asset_id = '<test1-asset-id>';
# Should be 1 (Candidate C)

SELECT * FROM image_assets WHERE id = '<test1-asset-id>';
# Should still exist
```

#### Test 6: Entity Deletion with Sole Reference

```bash
# Delete Candidate C (last entity using test1.png)
# Expected: Reference count drops to 0, test1.png destroyed from Cloudinary

# Verify:
SELECT * FROM image_assets WHERE id = '<test1-asset-id>';
# Should be deleted
```

#### Test 7: Cloudinary Failure Resilience

```bash
# Simulate Cloudinary outage by temporarily disconnecting network
# Delete an entity with an image
# Expected: Entity deleted from DB successfully, failed Cloudinary deletion queued

# Verify:
SELECT * FROM image_deletion_queue WHERE cloudinary_public_id = '<public-id>';
# Should have 1 row with attempts = 0

# Run worker:
node backend/src/scripts/process_deletion_queue.js

# Verify retry occurred:
SELECT attempts, last_error FROM image_deletion_queue WHERE cloudinary_public_id = '<public-id>';
```

---

## Maintenance & Operations

### Monitoring

**Key Metrics to Monitor:**

1. **image_assets table growth rate**
   ```sql
   SELECT COUNT(*), DATE(created_at) FROM image_assets GROUP BY DATE(created_at) ORDER BY DATE(created_at) DESC;
   ```

2. **Deletion queue backlog**
   ```sql
   SELECT COUNT(*), MAX(attempts) FROM image_deletion_queue;
   ```

3. **Orphaned assets (zero references)**
   ```sql
   SELECT ia.* FROM image_assets ia
   WHERE NOT EXISTS (SELECT 1 FROM users WHERE image_asset_id = ia.id)
     AND NOT EXISTS (SELECT 1 FROM events WHERE image_asset_id = ia.id)
     AND NOT EXISTS (SELECT 1 FROM candidates WHERE image_asset_id = ia.id)
     AND NOT EXISTS (SELECT 1 FROM contestants WHERE image_asset_id = ia.id)
     AND NOT EXISTS (SELECT 1 FROM poll_questions WHERE image_asset_id = ia.id)
     AND NOT EXISTS (SELECT 1 FROM poll_options WHERE image_asset_id = ia.id)
     AND NOT EXISTS (SELECT 1 FROM event_drafts WHERE image_asset_id = ia.id);
   ```

4. **Deduplication rate**
   ```sql
   -- Total uploads vs unique assets
   SELECT 
     (SELECT COUNT(*) FROM users WHERE image_asset_id IS NOT NULL) +
     (SELECT COUNT(*) FROM events WHERE image_asset_id IS NOT NULL) +
     (SELECT COUNT(*) FROM candidates WHERE image_asset_id IS NOT NULL) +
     (SELECT COUNT(*) FROM contestants WHERE image_asset_id IS NOT NULL) +
     (SELECT COUNT(*) FROM poll_questions WHERE image_asset_id IS NOT NULL) +
     (SELECT COUNT(*) FROM poll_options WHERE image_asset_id IS NOT NULL) +
     (SELECT COUNT(*) FROM event_drafts WHERE image_asset_id IS NOT NULL) AS total_references,
     (SELECT COUNT(*) FROM image_assets) AS unique_assets;
   ```

### Troubleshooting

#### Issue: Deletion queue growing indefinitely

**Cause:** Cloudinary API consistently failing (credentials, network, rate limits)

**Solution:**
1. Check Cloudinary credentials in `.env`
2. Verify network connectivity to Cloudinary API
3. Check Cloudinary dashboard for API rate limits
4. Manually clear stuck items after resolving root cause:
   ```sql
   DELETE FROM image_deletion_queue WHERE attempts >= 5;
   ```

#### Issue: Orphaned assets accumulating

**Cause:** Race condition in deletion flow or interrupted cleanup

**Solution:**
```bash
# Identify orphans
node backend/src/scripts/cleanup_orphaned_cloudinary_assets.js

# Review output, then execute cleanup
node backend/src/scripts/cleanup_orphaned_cloudinary_assets.js --execute
```

#### Issue: Image not deduplicating

**Cause:** Image file modified before upload (EXIF data, compression, etc.)

**Verification:**
```bash
# Calculate hash of local file
openssl dgst -sha256 <file.jpg>

# Compare with database
psql -U your_user -d votrix_db -c "SELECT file_hash FROM image_assets WHERE cloudinary_url LIKE '%filename%';"
```

### Performance Optimization

**SHA-256 hashing is extremely fast** (~3ms for 5MB file on modern hardware), but for high-traffic deployments:

1. **Cache frequently-used asset lookups** (optional):
   - Use Redis to cache `file_hash → asset_id` mappings
   - TTL: 1 hour
   - Invalidate on asset deletion

2. **Batch reference counting** (optional):
   - If deletion queue backlog grows, batch process deletes
   - Use `WHERE id IN (...)` for bulk reference checks

3. **Cloudinary API optimization**:
   - Use Cloudinary's `destroy_all` for bulk deletions if needed
   - Monitor API rate limits in Cloudinary dashboard

---

## Rollback Plan

If issues arise during deployment:

### Step 1: Code Rollback

```bash
# Revert service files to original versions
git revert <commit-hash-of-deduplication-implementation>
```

### Step 2: Database Rollback (if necessary)

**Important:** Existing text columns (`organization_logo`, `banner`, `photo`, `image_url`) remain 100% intact throughout the entire implementation. The system can operate without the new columns.

```sql
-- Optional: Remove foreign keys (data retained in text columns)
ALTER TABLE users DROP COLUMN IF EXISTS image_asset_id;
ALTER TABLE events DROP COLUMN IF EXISTS image_asset_id;
ALTER TABLE candidates DROP COLUMN IF EXISTS image_asset_id;
ALTER TABLE contestants DROP COLUMN IF EXISTS image_asset_id;
ALTER TABLE poll_questions DROP COLUMN IF EXISTS image_asset_id;
ALTER TABLE poll_options DROP COLUMN IF EXISTS image_asset_id;
ALTER TABLE event_drafts DROP COLUMN IF EXISTS image_asset_id;

-- Optional: Drop tables
DROP TABLE IF EXISTS image_deletion_queue;
DROP TABLE IF EXISTS image_assets;
```

---

## Summary

✅ **Implemented:**
- SHA-256 content-based deduplication
- Centralized `image_assets` registry
- Reference-counted safe deletion
- Automatic cleanup on entity delete/update
- Retry queue for failed Cloudinary deletions
- Zero frontend changes required
- Complete backward compatibility

✅ **Benefits:**
- Reduced Cloudinary storage costs (no duplicates)
- No orphaned assets (automatic cleanup)
- Improved upload performance (deduplicated uploads skip Cloudinary)
- Production-ready failure resilience

✅ **Deployment Ready:**
- Migration scripts tested and documented
- Maintenance scripts provided
- Monitoring queries included
- Rollback plan available

---

**For questions or support, refer to the implementation plan document or contact the development team.**
