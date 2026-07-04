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
**Response:** `{ success, user }`

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

### `GET /api/voter/overview`
Unified voter overview: assigned events across all modules.

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
