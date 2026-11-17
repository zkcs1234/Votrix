# API Reference

---

## Base URL

- Development: `http://localhost:5000/api`
- Production: `https://<render-app>.onrender.com/api`

## Global Headers

- All mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`) require: `x-csrf-token: <csrf_token>`
- Authenticated requests send credentials via cookies automatically (`withCredentials: true`)
- No `Authorization` header — auth is cookie-only

## Standard Response Shape

```json
{ "success": true, "data": { ... } }
{ "success": false, "message": "Error description" }
```

---

## Rate Limits

| Limiter | Routes | Limit |
|---------|--------|-------|
| `globalLimiter` | All routes | General cap |
| `authLimiter` | Login routes | Strict |
| `passwordResetLimiter` | Forgot/reset password | Very strict |
| `refreshLimiter` | `/auth/refresh` | Strict |
| `strictLimiter` | Change password | Strict |
| `csrfLimiter` | `/auth/csrf` | Moderate |
| `publicApiLimiter` | `GET /api` | Loose |
| `uploadLimiter` | All upload endpoints | Moderate |
| `csvImportLimiter` | CSV import endpoints | Strict |
| `emailLimiter` | Invite/notify endpoints | Strict |
| `voteLimiters.ip/user` | Vote submission | Very strict |
| `scoreLimiters.ip/user` | Score submission | Very strict |
| `pollLimiters.ip/user` | Poll submission | Very strict |
| `adminActionLimiter` | Admin write actions | Moderate |
| `organizerApplyLimiter` | `POST /public/organizer-apply/:token` (unauthenticated, accepts files) | Strict, per IP (`RATE_LIMIT_ORGANIZER_APPLY_MAX`, default 10/hour) |
| `officerActionLimiter` | Assign / edit / (de)activate student officers | Moderate, per owner (`RATE_LIMIT_OFFICER_ACTION_MAX`, default 60/hour) |

---

## Auth Routes — `/api/auth/`

### `GET /api/auth/csrf`
**Auth:** None  
**Purpose:** Issue a CSRF token (double-submit cookie pattern)  
**Response:** `{ csrfToken: string }`

---

### `POST /api/auth/admin/login`
**Auth:** None  
**Body:** `{ username: string, password: string }`  
**Response:** `{ success, csrfToken, user: { id, username, role, ... } }`  
**Sets cookies:** `votrix_access`, `votrix_refresh`, `votrix_csrf`  
**Errors:** 401 invalid credentials, 403 suspended/archived

---

### `POST /api/auth/organizer/login`
**Auth:** None  
**Body:** `{ email: string, password: string }`  
**Response:** `{ success, csrfToken, user }`  
**Sets cookies:** same as above

---

### `POST /api/auth/voter/login`
**Auth:** None  
**Body:** `{ email: string, password: string }`  
**Response:** `{ success, csrfToken, user }`

---

### `POST /api/auth/forgot-password`
**Auth:** None  
**Body:** `{ email: string }`  
**Response:** `{ success, message }` (always 200 to prevent enumeration)  
**Side effect:** Sends password reset email via Resend

---

### `POST /api/auth/reset-password`
**Auth:** None  
**Body:** `{ token: string, password: string }`  
**Response:** `{ success }`  
**Errors:** 400 invalid/expired token

---

### `POST /api/auth/refresh`
**Auth:** `votrix_refresh` cookie  
**Body:** none  
**Response:** `{ success, csrfToken, user }`  
**Sets cookies:** new `votrix_access`, refreshed `votrix_csrf`

---

### `POST /api/auth/logout`
**Auth:** None (clears cookies regardless)  
**Body:** none  
**Response:** `{ success }`  
**Clears cookies:** `votrix_access`, `votrix_refresh`, `votrix_csrf`

---

### `GET /api/auth/me`
**Auth:** Required (any role)  
**Response:** `{ success, user }`. For participants, `user` also carries `officership` (see Student Officers) and `participantTypes` (`['STUDENT']` or `['JUDGE']`, active memberships only). `participantTypes` only labels the UI; no authorization decision reads it. Login, refresh and change-password responses carry the same fields.

---

### `POST /api/auth/change-password`
**Auth:** Required (any role)  
**Body:** `{ currentPassword: string, newPassword: string }`  
**Response:** `{ success }`  
**Side effect:** Increments `token_version`, clears `must_change_password`

---

## Admin Routes — `/api/admin/`

All routes require: `authenticate` + `authorize('admin')` + `requirePasswordChanged`

### `GET /api/admin/overview`
Dashboard overview stats.

### `GET /api/admin/dashboard`
Full admin dashboard data.

### `GET /api/admin/analytics`
System-wide analytics.

### `GET /api/admin/organizers`
List all organizer accounts.  
**Query params:** pagination, filters

### `POST /api/admin/organizers`
Create organizer account.  
**Body:** `{ email, organizationName, organizationType, ... }`  
**Side effect:** Sends invitation email to organizer

### `PATCH /api/admin/organizers/:organizerId/status`
Update organizer account status.  
**Body:** `{ status: 'active' | 'suspended' | 'archived' }`

### `GET /api/admin/events`
List all events across all organizations.

### `GET /api/admin/settings`
Get system settings.

### `PUT /api/admin/settings`
Update system settings.  
**Body:** `{ [key]: value }`

### `GET /api/admin/audit-logs`
List audit logs.  
**Query params:** pagination, filters, date range

---

## Organizer Routes — `/api/organizer/`

All routes require: `authenticate` + `authorize('organizer')` + `requireActiveAccount` + `requirePasswordChanged`

### `GET /api/organizer/overview`
Organizer overview stats.

### `GET /api/organizer/dashboard`
Full organizer dashboard.

### `GET /api/organizer/analytics`
Organizer event analytics.

### `POST /api/organizer/events/:eventId/voters/invite`
Invite voter to any organizer event.

### `POST /api/organizer/events/:eventId/voters/:voterId/resend-invitation`
Resend invitation email to voter.

### `POST /api/organizer/events/:eventId/notify`
Send event notification email to all voters.

---

## Platform settings — `/api/public/platform` and `/api/admin/settings`

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/public/platform` | Public (`publicApiLimiter`, `Cache-Control: no-store`). `{ success, platformName, maintenanceMode }` only; never the organizer limit. Reachable during maintenance. |
| GET | `/api/admin/settings` | Admin. `{ success, settings: [rows], effective: { maintenanceMode, maxOrganizers, emailDailyLimit, invitationExpiryDays } }`. `effective` is what is in force now, including the environment fallback for a value nobody has saved (e.g. the email limit). |
| PUT | `/api/admin/settings` | Admin. Body `{ key, value, description? }`. `maintenance_mode`: boolean. `max_organizers`: integer 1–100000. `email_daily_limit`: integer 1–10000. `invitation_expiry_days`: integer 1–30. `platform_name` is fixed and always refused with `400`. Takes effect immediately. |

New error codes: **`503 MAINTENANCE_MODE`** (any non-admin request, and non-admin sign-in, while maintenance mode is on) and **`409 ORGANIZER_LIMIT_REACHED`** (`details: { limit, current }`) when creating or inviting an organizer at the limit.

---

## Organizer Invitations & Applications — `/api/admin/…` and `/api/public/…`

Admin (all require an admin session; writes use `adminActionLimiter`, sends also `emailLimiter`):

| Method | Path | Body / query | Response |
|--------|------|--------------|----------|
| GET | `/api/admin/organizer-invitations` | `?status=pending\|expired\|used\|revoked&limit&offset` | `{ invitations, total }` (never includes the token or its hash) |
| POST | `/api/admin/organizer-invitations` | `{ email, expiresInDays?, note? }` | `201 { invitation, email, applyUrl }` — `applyUrl` is returned **once** so it can be shared by hand if the email failed |
| POST | `/api/admin/organizer-invitations/:invitationId/revoke` | — | `{ invitation }`; `409` if not pending |
| POST | `/api/admin/organizer-invitations/:invitationId/resend` | — | `201` as create; `409` if already used |
| GET | `/api/admin/organizer-applications` | `?status=pending\|approved\|declined&limit&offset` | `{ applications, total }` |
| GET | `/api/admin/organizer-applications/:applicationId` | — | `{ application }` with `certificates: [{ name, mime, size, url }]` (signed, admin only) |
| POST | `/api/admin/organizer-applications/:applicationId/approve` | optional corrections: `organizerName, position, organizationName, organizationType, scopeType, programs, sections` | `{ application, user, email }`; `409` if already reviewed |
| POST | `/api/admin/organizer-applications/:applicationId/decline` | `{ reason }` (required, ≤ 1000) | `{ application, email }` |

Public (no session; the token in the URL is the credential; the `POST` needs the CSRF header/cookie):

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/public/organizer-apply/:token` | `{ email, note, expiresAt, organizationTypes, taxonomy }`. Any unusable link → `410` with one generic message |
| POST | `/api/public/organizer-apply/:token` | `multipart/form-data`: `organizerName, position, organizationName, organizationType` (`Co-curricular`\|`Extra-curricular`), `scopeType` (`all`\|`scoped`), `programs`, `sections` (JSON array strings), and 1–5 `certificates` files (PDF/JPEG/PNG, ≤ 8 MB). `201 { applicationId }`; `400 { details: { errors } }`; `410` if the link is gone. The email is bound to the invitation and ignored if supplied |

---

## Student Officers — `/api/organizer/officers/` (owner only) and `/api/admin/organizers/:organizerId/officers`

Student officers use the rest of `/api/organizer/*` as the owner organizer (see `docs/AUTH.md`). These endpoints are owner-only; an officer gets `403 Only the organizer account can do this`.

| Method | Path | Body / query | Response |
|--------|------|--------------|----------|
| GET | `/api/organizer/officers` | `?status=active\|inactive\|all` | `{ officers: [{ id, studentId, position, status, assignedAt, deactivatedAt, student }] }` |
| GET | `/api/organizer/officers/candidates` | `?search&limit` (≤ 50) | `{ candidates: [{ id, email, firstName, lastName, schoolId, program, yearSection }] }` — eligible, in the owner's scope, not already an active officer |
| POST | `/api/organizer/officers` | `{ studentId, position }` | `201 { officer, email }` — `404` not an eligible student, `403` outside scope, `409` already an officer |
| PATCH | `/api/organizer/officers/:officerId` | `{ position }` | `{ officer }` |
| POST | `/api/organizer/officers/:officerId/deactivate` | — | `{ officer }`; access ends on the officer's next request |
| POST | `/api/organizer/officers/:officerId/activate` | — | `{ officer, email }`; re-checks eligibility, scope and uniqueness |
| GET | `/api/admin/organizers/:organizerId/officers` | — | `{ officers }` |
| POST | `/api/admin/organizers/:organizerId/officers/:officerId/deactivate` | — | `{ officer }` (audited as an admin override) |

`GET /api/auth/me`, login, refresh and the password-change responses include `user.officership` for participant accounts: `{ organizerId, organizationName, organizerName, position }` or `null`.

---

## Election (Organizer) — `/api/organizer/election/`

### `GET /api/organizer/election/dashboard`
Election module dashboard.

### `POST /api/organizer/election/organization/logo`
Upload organization logo.  
**Content-Type:** `multipart/form-data`, field: `logo`

### `GET /api/organizer/election/events`
List all election events for the organizer's organization.

### `POST /api/organizer/election/events`
Create a new election event.  
**Body:** `{ title, description, start_date, end_date }`

### `GET /api/organizer/election/events/:eventId`
Get event details.

### `PATCH /api/organizer/election/events/:eventId`
Update event details.

### `PATCH /api/organizer/election/events/:eventId/voting`
Enable or disable voting.  
**Body:** `{ voting_enabled: boolean }`

### `POST /api/organizer/election/events/:eventId/banner`
Upload event banner.  
**Content-Type:** `multipart/form-data`, field: `banner`

### `GET /api/organizer/election/events/:eventId/positions`
List positions for the event.

### `POST /api/organizer/election/events/:eventId/positions`
Create a position.

### `PATCH /api/organizer/election/events/:eventId/positions/:positionId`
Update a position.

### `DELETE /api/organizer/election/events/:eventId/positions/:positionId`
Delete a position (cascades to candidates and votes).

### `GET /api/organizer/election/events/:eventId/candidates`
List all candidates for the event.

### `POST /api/organizer/election/events/:eventId/positions/:positionId/candidates`
Create a candidate under a position.

### `PATCH /api/organizer/election/events/:eventId/candidates/:candidateId`
Update a candidate.

### `DELETE /api/organizer/election/events/:eventId/candidates/:candidateId`
Delete a candidate.

### `POST /api/organizer/election/events/:eventId/candidates/:candidateId/photo`
Upload candidate photo.  
**Content-Type:** `multipart/form-data`, field: `photo`

### `GET /api/organizer/election/events/:eventId/voters`
List voters enrolled in the event.

### `POST /api/organizer/election/events/:eventId/voters/invite`
Invite new voter (creates account + sends email).  
**Body:** `{ email, firstName, lastName }`

### `POST /api/organizer/election/events/:eventId/voters/invite-existing`
Invite already-registered voter (no new account).  
**Body:** `{ email }` or `{ voterId }`

### `POST /api/organizer/election/events/:eventId/voters/import`
Bulk import voters from CSV.  
**Content-Type:** `multipart/form-data`, field: `file`

### `GET /api/organizer/election/events/:eventId/analytics`
Election analytics — turnout, vote counts per candidate.

---

## Election (Voter) — `/api/voter/election/`

Requires voter role + active account + password changed.

### `GET /api/voter/election/events`
List election events assigned to the voter.

### `GET /api/voter/election/events/:eventId/ballot`
Get ballot for the event (positions + candidates).

### `GET /api/voter/election/events/:eventId/results`
Get election results (respects `results_visibility` setting).

### `POST /api/voter/election/events/:eventId/vote`
Submit ballot.  
**Body:** `{ votes: [{ positionId, candidateId }] }`  
**Rate limited:** per-IP and per-user  
**Errors:** 409 already voted, 400 voting not enabled, 403 not assigned to event

---

## Pageant/Competition (Organizer) — `/api/organizer/pageant/` or `/competition/`

Both path prefixes map to the same routes.

### Dashboard, Events, Banner, Organization Logo
Same shape as election organizer routes.

### `PATCH /api/organizer/pageant/events/:eventId/scoring`
Enable or disable scoring.  
**Body:** `{ scoring_enabled: boolean }`

### `GET/POST/PATCH/DELETE /api/organizer/pageant/events/:eventId/contestants`
CRUD for contestants.

### `POST /api/organizer/pageant/events/:eventId/contestants/:contestantId/photo`
Upload contestant photo.

### `GET/POST/PATCH/DELETE /api/organizer/pageant/events/:eventId/criteria`
CRUD for scoring criteria.

### `GET /api/organizer/pageant/events/:eventId/judges`
List judges for the event.

### `POST /api/organizer/pageant/events/:eventId/judges/invite`
Invite a judge (voter role, is_judge flag set).

### `POST /api/organizer/pageant/events/:eventId/judges/import`
Bulk import judges from CSV.

### `GET /api/organizer/pageant/events/:eventId/rankings`
Get live rankings.

### `GET /api/organizer/pageant/events/:eventId/analytics`
Competition analytics.

### Competition Sub-Routes (Phase 4–6)
Under `/api/organizer/pageant/events/:eventId/` or `/competition/events/:eventId/`:

- `GET/POST/PATCH/DELETE /categories`
- `GET/POST/PATCH/DELETE /rounds`
- `POST/DELETE /rounds/:roundId/contestants/:contestantId`
- `POST/DELETE /rounds/:roundId/criteria/:criteriaId`
- `GET/PATCH /scoring-config`
- `GET /foundation`
- `GET/POST /judges-v2`
- `PATCH/DELETE /judges-v2/:judgeId`
- `GET/POST /judges-v2/:judgeId/assignments`
- `DELETE /judges-v2/:judgeId/assignments/:assignmentId`

---

## Pageant (Judge/Voter) — `/api/voter/pageant/` or `/competition/`

### `GET /api/voter/pageant/events`
List competition events where voter is a judge.

### `GET /api/voter/pageant/events/:eventId/score`
Get scoring sheet (contestants + criteria + existing scores).

### `POST /api/voter/pageant/events/:eventId/score`
Submit scores.  
**Body:** `{ scores: [{ contestantId, criteriaId, score }] }`  
**Rate limited:** per-IP and per-user

---

## Polling (Organizer) — `/api/organizer/polling/`

### `GET /api/organizer/polling/dashboard`
Polling module dashboard.

### `POST /api/organizer/polling/organization/logo`
Upload organization logo.

### `GET/POST /api/organizer/polling/events`
List / create polling events.

### `PATCH /api/organizer/polling/events/:eventId`
Update polling event.

### `GET /api/organizer/polling/events/:eventId/settings`
Get polling settings (anonymous, multiple submissions, expiry).

### `PATCH /api/organizer/polling/events/:eventId/open`
Open or close the poll.  
**Body:** `{ polling_enabled: boolean }`

### `POST /api/organizer/polling/events/:eventId/banner`
Upload event banner.

### `GET/POST/PATCH/DELETE /api/organizer/polling/events/:eventId/questions`
CRUD for poll questions.

### `GET /api/organizer/polling/events/:eventId/analytics`
Poll analytics — response counts, percentages, charts.

### `GET /api/organizer/polling/question-types`
List all available question types (system + org custom).

### `GET /api/organizer/polling/question-types/custom`
List org-specific custom question types.

### `POST /api/organizer/polling/question-types/custom`
Create a custom question type.

### `PATCH/DELETE /api/organizer/polling/question-types/custom/:typeId`
Update or delete a custom question type.

### `POST /api/organizer/polling/events/:eventId/respondents/invite`
Invite new respondent.

### `POST /api/organizer/polling/events/:eventId/respondents/invite-existing`
Invite already-registered respondent.

### `POST /api/organizer/polling/events/:eventId/respondents/import`
Bulk import respondents from CSV.

---

## Polling (Voter/Respondent) — `/api/voter/polling/`

### `GET /api/voter/polling/events`
List polls assigned to the voter.

### `GET /api/voter/polling/events/:eventId`
Get poll details (questions + options).

### `POST /api/voter/polling/events/:eventId/submit`
Submit poll answers.  
**Body:** `{ answers: [{ questionId, answer }] }`  
**Rate limited:** per-IP and per-user

---

## Voter Routes — `/api/voter/`

Every `/api/voter/*` route is also served under `/api/participant/*` (same router). All of them require a signed-in participant (`authorize(participant)`); an admin or organizer gets 403. Each endpoint reads **only the caller's own enrollments**: no user id is accepted from the client.

### `GET /api/voter/overview`
Unified voter overview: assigned events across all modules. Election result bodies are **not** embedded any more; pass `?include=results` to get the old behaviour.

### `GET /api/participant/events`
My events: active and upcoming events only (completed events and events that closed without the participant are left to History). Query: `bucket` (`active` | `assigned`), `type` (`election` | `poll` | `competition`), `search`, `page`, `limit` (1-50, default 20). Response: `{ events, total, page, limit, counts: { active, assigned } }`. Active first, then by start date.

### `GET /api/participant/history`
The participant's own participation record. Query: `type`, `outcome` (`done` | `missed`), `range` (`last12` default | `year` | `all`), `search`, `page`, `limit`. Response: `{ items, total, page, limit, summary }`.
- `outcome` per row: `Submitted`, `Partial` (election with some ballot sections submitted before it closed) or `Missed` (enrolled, event closed, nothing submitted). Events still in progress are not returned.
- `completedAt` comes from the per-module submission tables (`election_ballot_submissions.submitted_at`, `poll_submissions.completed_at`, `competition_round_submissions.submitted_at`). It is `null` for **anonymous polls** (their submission is stored without a voter id) and for native competitions; `sortDate` then falls back to the event end date.
- `receipt` is `{ kind: 'sections' | 'poll' | 'rounds', ... }`. It never contains ballot selections, poll answers or any judge's scores.
- `summary` covers the chosen `range` only (not `type`, `outcome` or `search`).

### `GET /api/participant/results`
Results the participant may see, as a list. Query: `type` (`election` | `competition`), `page`, `limit`. Items:
- `kind: 'election'` with `state` `final` | `live` | `pending` (pending carries `availableAfter`). Hidden elections are never listed. The body is fetched on demand from `GET /api/participant/election/events/:eventId/results` (existing endpoint; applies the per-position eligibility rules).
- `kind: 'competition'` (judges): the official published standings snapshot (`standings: [{ rank, entryNumber, name, score, manual }]`, `publishedAt`, `method`). Unpublished and withdrawn publications are not listed. Other judges' scores are never included.
- Polls are not listed (no results visibility setting exists for polls).

### `GET /api/voter/login-redirect`
Determine correct post-login redirect based on voter's assigned events.

---

## Notifications — `/api/notifications/`

Requires: `authenticate` + any role + `requireActiveAccount` + `requirePasswordChanged`

### `GET /api/notifications/`
List notifications for the authenticated user.  
**Query params:** `page`, `limit`

### `GET /api/notifications/unread-count`
Get count of unread notifications.  
**Response:** `{ count: number }`

### `PATCH /api/notifications/:notificationId/read`
Mark a single notification as read.

### `PATCH /api/notifications/read-all`
Mark all notifications as read.

---

## Health — `/api/health/`

### `GET /api/health/`
Health check.  
**Response:** `{ status: 'ok', timestamp, db: { connected, message } }`

---

## Root

### `GET /api`
**Response:** `{ success: true, message: 'VOTRIX API', version: '1.0.0', phase: 12 }`

---

**Last Updated:** 2026-07-04
**Documentation Version:** 1.0.0
**Related Files:** `backend/src/routes/`, `backend/src/controllers/`
**Related Documentation:** `docs/ai/BUSINESS_RULES.md`, `docs/ai/FEATURES.md`
