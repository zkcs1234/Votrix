# Phase 3 — Authentication

## Token strategy

| Token | Lifetime | Delivery |
|-------|----------|----------|
| **Access** | 15m (configurable) | httpOnly cookie only |
| **Refresh** | 7d (configurable) | httpOnly cookie only |

Rotate both via `POST /api/auth/refresh`.

The frontend does not read or persist the access token. Browsers send the
httpOnly access cookie automatically with API requests; clients must not expect
an access token in the login or refresh JSON response and must not add a
`Bearer` authorization header.

## Endpoints

| Method | Path | Access |
|--------|------|--------|
| POST | `/api/auth/admin/login` | Public |
| POST | `/api/auth/organizer/login` | Public |
| POST | `/api/auth/voter/login` | Public |
| GET | `/api/auth/csrf` | Issue CSRF token (cookie + body) |
| POST | `/api/auth/refresh` | Refresh cookie |
| POST | `/api/auth/logout` | Public |
| GET | `/api/auth/me` | Access token |
| POST | `/api/auth/change-password` | Access token |
| GET | `/api/admin/overview` | Admin |
| POST | `/api/admin/organizers` | Admin |
| GET | `/api/organizer/overview` | Organizer |
| GET | `/api/voter/overview` | Voter |

Protected role routes use `requirePasswordChanged` — returns `403` with `code: MUST_CHANGE_PASSWORD` until the user updates their password.

## Account rules

- **Admin:** insert manually; login with `username` + `password`.
- **Organizer:** joins by **invitation → application → approval** (see below): the admin invites an email, the invitee submits an application, the admin approves it, and `createOrganizerAccount()` creates the account (temporary password emailed, must change it on first login). There is no CSV import and no one-by-one "Add organizer" button; `POST /api/admin/organizers` still exists in the API but nothing in the UI calls it.
- **Voter:** created via CSV import (Phase 4); login with `email` + temporary password; must change password on first login.
- **Student officer:** not a role. It is a *relationship* on an ordinary student (`participant`) account (see below).

## Maintenance mode

Admin → System settings → **Maintenance mode** (`maintenance_mode`). While it is on, **only administrators can use the platform**:

- `maintenanceGuard` (`middleware/maintenance.js`, mounted after CSRF) answers every `/api` request from a non-admin with **`503 { code: "MAINTENANCE_MODE" }`**, whether or not they are signed in. It identifies the caller from the access cookie, falling back to the refresh cookie so an admin whose access token just expired can still `POST /auth/refresh`.
- Always reachable: `/health`, `/webhooks`, `GET /auth/csrf`, `POST /auth/login`, `POST /auth/logout`, and `GET /public/platform` (so the app can show the maintenance state).
- **Login:** credentials are checked first (a wrong password is still `401`); then any non-admin gets the `503` and no session is issued. `refreshSession` applies the same rule, so a non-admin cannot keep a session alive.
- **WebSockets:** `socketIdentity` refuses non-admins; the heartbeat re-runs it, so existing sockets close shortly after maintenance starts.
- **Fail-open:** if the settings cannot be read, maintenance is treated as OFF (a database blip never locks everyone out). Settings are cached ~5 s and invalidated immediately when saved through the API.
- Frontend: `MaintenanceGate` (a root route wrapper) shows a maintenance screen to non-admins on every page except `/` and `/login`; admins see a warning bar with a link to turn it off.

## Platform name and organizer limit

- The platform name is **fixed ("Votrix")** and cannot be edited: it is part of the logo artwork, emails, exported reports and help text, so a setting could only rename some of it. The System settings page shows it read-only. The server ignores any `platform_name` value left in the database and refuses new writes with `400`. `GET /api/public/platform` still returns it so the app has one source for the name.
- `max_organizers` is enforced in `createOrganizer()`, which every path to a new organizer uses (CSV import, approving an application, the API), and again when creating an invitation. Archived organizers do not count. At the limit the API returns `409 { code: "ORGANIZER_LIMIT_REACHED" }`.

## Organizer invitation flow

| Method | Path | Access |
|--------|------|--------|
| POST | `/api/admin/organizer-invitations` | Admin — create a single-use link for one email |
| GET | `/api/admin/organizer-invitations?status=` | Admin — `pending` / `expired` / `used` / `revoked` |
| POST | `/api/admin/organizer-invitations/:invitationId/revoke` | Admin |
| POST | `/api/admin/organizer-invitations/:invitationId/resend` | Admin — issues a fresh link, kills the old one |
| GET | `/api/admin/organizer-applications[?status=]`, `/:applicationId` | Admin (detail includes signed certificate links) |
| POST | `/api/admin/organizer-applications/:applicationId/approve` | Admin — may correct any field and the scope |
| POST | `/api/admin/organizer-applications/:applicationId/decline` | Admin — reason required, emailed to the applicant |
| GET | `/api/public/organizer-apply/:token` | Public, token-gated — bound email, organization types, taxonomy |
| POST | `/api/public/organizer-apply/:token` | Public, token-gated — `multipart/form-data` with `certificates` files; CSRF required |

- The token is 256 bits of randomness; **only its SHA-256 hash is stored**. The raw link exists only in the email and in the one response shown to the admin who created it.
- A link is single-use, expires (default 7 days, max 30), and is bound to one email the applicant cannot change. Every unusable link (unknown, used, revoked, expired) returns the same `410` and message. The default length (7 days) is the admin setting **Default invitation expiry** (System settings); an admin can still pick 1–30 days for one invitation, and a resent invitation uses the current default.
- State changes are single conditional `UPDATE`s used as claims (there are no multi-statement transactions): submitting claims the invitation; approving claims the application and then creates the organizer, reverting the claim if creation fails.
- Certificates (PDF/JPEG/PNG, up to 5 files, 8 MB each) are verified by file content, stored with Cloudinary `authenticated` delivery (not the shared image registry), and shown only to admins through signed URLs.

## Student officers

An organizer can assign students as **officers**. An officer keeps `role = participant`; the assignment lives in `organization_officers`.

- **How it works:** on the `/api/organizer/*` router, `resolveOrganizerContext` runs before `authorize(organizer)`. For a student with an **active** officership it replaces `req.user` with the owner organizer (id, role, token version) and records the real student in `req.actor` and the request context. Every existing controller, ownership check and scope filter then works unchanged, and the officer inherits the owner's scope.
- **Always read from the database, never cached:** deactivating an officer takes effect on their next request. A database error denies access.
- **Refused when:** the owner is suspended or archived; the officer's own account is not active; the officer still has a temporary password (`MUST_CHANGE_PASSWORD`).
- **Owner-only (officers get `403`):** `POST /api/organizer/organization/logo` and everything under `/api/organizer/officers`. `PUT /api/organizer/profile` is refused for everyone with `403`: an organizer's profile (organization, type, name, position) is edited only by an administrator (`PUT /api/admin/organizers/:id`); the organizer can still upload the organization logo.
- **No client input:** no header or id selects the organization; a student has at most one active officership.
- **Audit:** `audit_logs.user_id` stays the owner; `details.actingUserId` / `actingUserEmail` record the student.
- **`user.officership`** (`{ organizerId, organizationName, organizerName, position }` or `null`) is included for participants in the login, refresh, password-change and `/api/auth/me` responses. It only drives the UI; the server re-checks on every request.
- **WebSocket:** an active officer may subscribe to the owner's event rooms (general and organizer channels); the voters channel stays participant-only.

| Method | Path | Access |
|--------|------|--------|
| GET | `/api/organizer/officers?status=active\|inactive\|all` | Owner organizer |
| GET | `/api/organizer/officers/candidates?search=&limit=` | Owner organizer — eligible, in-scope, unassigned students |
| POST | `/api/organizer/officers` | Owner organizer — `{ studentId, position }` |
| PATCH | `/api/organizer/officers/:officerId` | Owner organizer — `{ position }` |
| POST | `/api/organizer/officers/:officerId/deactivate` · `/activate` | Owner organizer |
| GET | `/api/admin/organizers/:organizerId/officers` | Admin |
| POST | `/api/admin/organizers/:organizerId/officers/:officerId/deactivate` | Admin override |

## Environment

```env
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```
