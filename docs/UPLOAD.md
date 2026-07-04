# Phase 10 — Cloudinary file uploads

## Configuration

Set in `backend/.env`:

```env
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Health check: `GET /api/health` includes `cloudinary: true` when configured.

Run migration: `migrations/007_organization_logo.sql` (adds `organizations.logo`).

## Upload types

| Type | Field name | Cloudinary folder | Max size |
|------|------------|-------------------|----------|
| Organization logo | `logo` | `votrix/logos` | 5 MB |
| Event banner | `banner` | `votrix/banners` | 5 MB |
| Candidate photo | `photo` | `votrix/candidates` | 5 MB |
| Contestant photo | `photo` | `votrix/contestants` | 5 MB |

Allowed MIME types: JPEG, PNG, WebP, GIF.

Images are optimized via Cloudinary transformations (resize/crop per type).

## API endpoints

### Organization logo

| Module | Method | Path |
|--------|--------|------|
| Election | POST | `/api/organizer/election/organization/logo` |
| Pageant | POST | `/api/organizer/pageant/organization/logo` |
| Polling | POST | `/api/organizer/polling/organization/logo` |

Multipart field: `logo`

### Event banner

| Module | Method | Path |
|--------|--------|------|
| Election | POST | `/api/organizer/election/events/:eventId/banner` |
| Pageant | POST | `/api/organizer/pageant/events/:eventId/banner` |
| Polling | POST | `/api/organizer/polling/events/:eventId/banner` |

Multipart field: `banner`

### Photos

| Type | Method | Path |
|------|--------|------|
| Candidate | POST | `/api/organizer/election/events/:eventId/candidates/:candidateId/photo` |
| Contestant | POST | `/api/organizer/pageant/events/:eventId/contestants/:contestantId/photo` |

Multipart field: `photo`

### Response shape

```json
{
  "success": true,
  "url": "https://res.cloudinary.com/...",
  "event": { ... }
}
```

Logo uploads return `organization` with updated `logo` URL.

## Frontend components

- `ImageUploadField` — preview + file picker (banner, logo, photo variants)
- `OrganizationLogoUpload` — dashboard logo uploader per module
