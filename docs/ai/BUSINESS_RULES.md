# Business Rules

---

## Auth Rules

1. **Admin accounts** are created manually in the database — no registration endpoint exists.
2. **Organizer accounts** are created only by admins via `POST /api/admin/organizers`.
3. **Voter accounts** are created by organizers via invitation (CSV import or individual invite).
4. All non-admin accounts receive a temporary password on creation and must change it on first login (`must_change_password = true`).
5. The `must_change_password` flag blocks all dashboard and API access until the password is changed.
6. Changing a password increments `token_version` on the user record, invalidating all existing sessions.
7. Password reset via email uses a time-limited token stored in `password_reset_tokens`; tokens are single-use.
8. Token extraction is cookie-only — no `Authorization: Bearer` header is accepted.
9. JWT access token lifetime: 15 minutes (default). Refresh token: 7 days (30 days if "remember me").
10. CSRF tokens are required on all mutating requests. A 403 CSRF failure triggers one automatic retry with a fresh token.

---

## Role Rules

| Role        | Created By                | Login Identifier | Dashboard Path |
| ----------- | ------------------------- | ---------------- | -------------- |
| `admin`     | Manual DB insert          | `username`       | `/admin`       |
| `organizer` | Admin                     | `email`          | `/organizer`   |
| `voter`     | Organizer (invite/import) | `email`          | `/voter`       |

- A user has exactly one role — no multi-role accounts. A **student officer** is not a second role: it is an assignment (`organization_officers`) on a `participant` account (see *Student Officer Rules*).
- Organizers and voters must have `account_status = 'active'` to use the system.
- Account statuses: `pending` → `active` → `suspended` / `archived`.
- **Judges are a global pool.** An admin creates a participant with the Judge type; that judge is then visible to **every** organizer, who selects the judges for their own competition event. There is no admin-side judge → organizer assignment (the old `profile_data.organizerIds` is ignored and removed by migration 141). Organizers see only a judge's name, email, title, affiliation and expertise.
- **Participant portal.** Overview, My events, History and Results are derived only from the caller's own enrollments. **My events** = active and upcoming; **History** = what the participant did (*Submitted*, *Partial*, *Missed*), participation only: never ballot selections, poll answers or any judge's scores; **Results** = only what the module's own visibility rules allow (elections by `results_visibility`; competitions only after the organizer publishes, as an official snapshot). Anonymous polls have no completion time in History because the submission is stored without a voter id. Polls have no participant results.
- **A participant is either a student or a judge, never both.** Adding the Judge type to an account with an active Student type (or the reverse) is refused by admin create and CSV import.
- Admin user areas are two pages: **Organizers** (`/admin/organizers`) and **Participants** (`/admin/participants`, Students and Judges). `/admin/users` is a legacy redirect.
- In the admin Organizers and Participants pages the **Suspend** action was removed (it duplicated Archive): accounts are **archived** and **restored**. Accounts that are already `suspended` still appear under **All** with a **Restore** action, and the API still accepts the `suspended` status. Organizer, student and judge lists share one row-action set: *Edit · Restore (not active) · Archive (not archived) · View*.
- A student has **one** participant type, `STUDENT`, which covers elections and polls. The admin UI creates, lists and changes status for a student with a single request; the old "voter + respondent" two-step is gone.
- Suspended or archived accounts receive a 403 on all authenticated requests.

---

## Permission Rules

- Route-level authorization uses `authorize(role)` middleware — wrong role returns 403.
- Organizers can only access data belonging to their own `organization_id`.
- Voters can only access events they are enrolled in (`event_voters` table).
- Judges (voter role with `is_judge = true`) can only score events they are assigned to.
- Admins have global visibility across all organizations and events.

---

## Election Rules

1. Voting is only allowed when `events.voting_enabled = true`.
2. A voter can only vote once per event — `event_voters.has_voted` flag is checked atomically before inserting votes.
3. A voter must be enrolled in the event (`event_voters` row exists) to vote.
4. Each vote is one row in `election_votes` per `(event_id, voter_id, position_id, candidate_id)` — the unique constraint prevents double-voting at DB level.
5. Position vote range: voter must select between `min_vote` and `max_vote` candidates per position.
6. If `allow_skip = true`, a voter may skip a position entirely.
7. Results visibility is controlled by `events.results_visibility`:
   - `real_time` — results visible to voters as votes are cast
   - `hidden` — results never shown to voters
   - `public` — results visible after voting closes (default)
8. CSV voter import: creates voter accounts with temporary passwords, sends invitation emails.
9. Invite existing voter: enrolls an already-registered voter without creating a new account or re-issuing credentials.

---

## Competition / Scoring Rules

1. Scoring is only allowed when `events.scoring_enabled = true`.
2. A judge can only score contestants they are assigned to (based on `competition_judge_assignments` scope).
3. Score must be within `criteria.min_score` and `criteria.max_score`.
4. Scoring formula is determined by `events.scoring_config`:
   - `scoreType`: `range_1_100` (default)
   - `calculationMethod`: `weighted_average` (default)
   - `decimalPlaces`: 2 (default)
   - `dropHighest` / `dropLowest`: number of judge scores to discard before averaging
5. Category weights must total 100% at scoring time.
6. Round weights must total 100% at scoring time.
7. Legacy judges use `event_voters.is_judge = true`; Phase 4+ judges use `competition_judges` table.
8. Once a judge submits scores (`has_submitted = true` / `has_scored = true`), re-submission may be blocked (verify in `scoring-engine.js`).
9. Contestant numbers must be unique per event and positive integers.

---

## Polling Rules

1. Polling is only allowed when `events.polling_enabled = true`.
2. If `poll_anonymous = false`, answers are linked to the voter's ID.
3. If `poll_anonymous = true`, the voter can still only submit once unless `poll_allow_multiple_submissions = true`.
4. If `poll_expires_at` is set, submissions after that timestamp are rejected.
5. Required questions (`poll_questions.required = true`) must be answered.
6. Answer format is validated against the question type's `answer_format` schema from the type registry.
7. Custom question types are scoped per organization; global custom types have `organization_id = NULL`.
8. The effective type registry resolves by: per-org override > system built-in (via `v_poll_question_types` view).
9. `single_choice` / `multiple_choice`: one option selected.
10. `checkbox`: any number of options selected.
11. `yes_no`: Yes/No options are auto-created; voter picks one.
12. `rating`: numeric value between `min` and `max` (default 1–5).
13. `likert_scale`: ordered choice from configurable scale (default 5-point).
14. `open_text`: free-form text up to `maxLength` characters (default 4000).
15. `ranking`: voter orders all items; ties allowed by default.

---

## Event Lifecycle (Status Transitions)

```
draft → scheduled → active → completed
               ↓              ↓
           cancelled      cancelled
```

- `draft`: Event is being set up. Voting/scoring/polling not possible.
- `scheduled`: Event is set up and dated but not yet open.
- `active`: Event is running. Participation is allowed (subject to per-module enable flags).
- `completed`: Event has ended. Results are available.
- `cancelled`: Event was cancelled at any stage.

> Status transitions are managed by the organizer. There is no automatic status promotion based on dates — the organizer manually changes status.

---

## Organization Rules

1. Each organizer has exactly one organization (1:1 relationship enforced at creation via `getOrCreateOrganization()`).
2. Organization type is deprecated — the `organizations.organization_type` column is kept for backward compatibility only. The organization acts as a generic container; events carry their own `event_type`.
3. Organization brand logo is stored on the `users` table (`organization_logo` column) — not on the `organizations` table. Uploaded via a single centralized endpoint: `POST /api/organizer/organization/logo`.
4. Organization status (`draft`, `active`, `inactive`, `archived`) is managed by the admin.
5. An organizer can have multiple events under their single organization, across all event types (election, competition_scoring, polling).

---

## Platform Settings Rules

The settings on Admin → System settings are enforced by the server (`services/platform-settings.service.js`), not just stored:

1. **Platform name** is **fixed** (`Votrix`) and not editable. It is baked into emails, exported reports, help text and the logo artwork, so a setting could only ever rename part of it. The settings page shows it read-only, the server ignores any stored `platform_name`, and writes to it are refused (`400`).
2. **Maintenance mode** (boolean, default off): while on, only administrators can use the platform. Everyone else is refused with `503 MAINTENANCE_MODE` and sees a maintenance screen; non-admins cannot sign in and existing sessions stop working on their next request. Turning it on asks for confirmation. A settings read error never turns it on.
3. **Maximum organizers allowed** (whole number 1–100000, default 100): the most organizer accounts that may exist. Archived accounts do not count; suspended ones do. Inviting, approving or adding an organizer beyond it is refused with `409 ORGANIZER_LIMIT_REACHED`, and raising the limit takes effect immediately.
4. **Daily email sending limit** (`email_daily_limit`, whole number 1–10000): the most emails the platform sends per day (counted from `email_delivery_logs`). Once reached, `emailGuard` skips further sends and logs them as `skipped_quota`. While no admin value is saved, the limit falls back to the `RESEND_DAILY_LIMIT` environment value, then to 50. The admin value wins over the environment value. The monthly cap (`RESEND_MONTHLY_LIMIT`), bulk batch size and duplicate window stay environment settings. A new value applies to the very next email.
5. **Default invitation expiry** (`invitation_expiry_days`, whole number 1–30, default 7): how long a new organizer invitation stays valid when the admin does not choose a length. An expiry typed for one invitation still wins (max 30). A resent invitation gets the current default. The invite dialog preselects it.
6. Values are validated strictly on save (`400` for any attempt to set the name, a non-boolean maintenance value, or a non-integer/out-of-range number). The page validates before saving anything, and only writes the email limit and expiry when they changed (so an unsaved server default is never pinned by accident). It edits **only** these settings: the old raw "custom typed values" editor was removed because it exposed keys owned by other pages (for example the archival policy) as editable JSON.
7. The **participant taxonomy** (valid Programs and Year & Sections) is stored and used to validate students and organizer scopes. **There is currently no editor for it in the admin UI** (it was removed from System settings, and the User Management "Programs & Sections" tab was removed again at the admin's request). The data and `GET/PUT /api/admin/settings/taxonomy` remain; the Add Student button stays disabled while no programs/sections are saved. `ParticipantTaxonomyPanel.jsx` is unused and can be re-mounted anywhere to restore the editor.

---

## Organizer Application Rules

1. In the admin UI an organizer is created by **invitation → application → approval**, or in bulk by **CSV import** (the one-by-one "Add organizer" form was removed). Both end in `createOrganizerAccount()`, so the account, temporary password, scope and forced password change are identical. The `POST /api/admin/organizers` endpoint remains but is unused by the UI.
2. An invitation is bound to one email, is single-use, expires (default 7 days, max 30) and is stored only as a SHA-256 hash. A new invitation for an email revokes any still-pending one. An email that already has an account cannot be invited.
3. The admin enters only the email, expiry and an optional note. The applicant supplies organizer name, position, organization name, organization type (**Co-curricular** or **Extra-curricular**), the access scope they request, and 1–5 certificates (PDF/JPEG/PNG, ≤ 8 MB each).
4. Nothing is created in `users` until an admin approves. The admin may correct any field and the scope before approving (organization type may then be any non-empty text, as with direct add).
5. Requested scope uses the same `{ scopeType, programs, sections }` shape and the same taxonomy validation as `users.scope`.
6. Declining requires a reason, which is emailed to the applicant. An application can be reviewed once; concurrent reviews cannot both succeed.
7. Certificates are personal documents: private (signed URLs, admin only), never in the shared image registry, and not deduplicated across applicants.

---

## Student Officer Rules

1. An organizer (the *owner*) can assign a student as an **officer** with a free-text position. The student keeps their `participant` role and all student behavior (voting, polling) unchanged.
2. Eligible: an active `STUDENT` participant type on an active participant account, **inside the owner's access scope**, with no active officership anywhere (one active officership per student, enforced by a partial unique index). Scope is re-checked on assignment and on reactivation.
3. An officer works in the existing organizer workspace **as the owner**: they see and change the owner's events in all modules, bounded by the owner's scope.
4. Owner-only: editing the organization profile or logo, and managing officers. An officer can never appoint or remove officers.
5. Officership is read from the database on every request. Deactivating (by the owner or an admin) ends access immediately; the student stays a student and can be reactivated.
6. Access stops while the owner organizer is suspended/archived, or while the officer's own account is not active.
7. Everything an officer does is recorded under the owner with the real student in `details.actingUserId` / `actingUserEmail`.
8. Route-specific rate limits (email, upload, officer changes) are keyed by the owner, so they are shared per organization; the global limiter still keys by the person.
9. The student is emailed when assigned or reactivated; a failed email never fails the assignment and is reported to the organizer.

---

## Voter Invitation Rules

1. **New voter invite:** creates a `users` row (role=voter) + `event_voters` row + `invitations` row with temp password + sends email.
2. **Existing voter invite:** finds existing user by email + creates `event_voters` row + sends event notification email (no new password).
3. **CSV import:** batch-creates voter accounts and sends invitations.
4. Duplicate enrollment (same voter, same event) is prevented by the `UNIQUE (event_id, voter_id)` constraint on `event_voters`.
5. Resend invitation: re-sends the email using the stored `invitations.temp_password` (or generates a new one if expired).

---

## Validation Rules

- All input is validated at the route/controller level using validator files in `backend/src/validators/`.
- Input is sanitized before use (see `backend/src/utils/sanitize.js`).
- File uploads accept images only (enforced by `multer` mime-type filter).
- CSV files are parsed with `csv-parser` and validated row by row.
- Voter email must be unique across all users.
- Event `end_date` must be ≥ `start_date` (DB constraint).
- Position vote range: `min_vote >= 0`, `max_vote >= min_vote` (DB constraint).

---

## Soft Delete Logic

- No soft deletes are implemented. All deletes are hard (cascading via `ON DELETE CASCADE`).
- Deleting a position cascades to candidates and votes.
- Deleting an event cascades to all related data (voters, votes, positions, candidates, etc.).

---

## Audit Logging

- The `audit_logs` table records admin and organizer actions.
- `user_id` references the actor; set to NULL if user is deleted.
- `action`: string describing the action (e.g., `create_organizer`, `update_event`).
- `entity` / `entity_id`: the type and ID of the affected record.
- `details`: JSONB payload for before/after or context data.
- When a student officer acts as the owner organizer, `user_id` is the **owner** and `details.actingUserId` / `actingUserEmail` identify the student (added automatically by `recordAudit` from the request context). The admin audit and organizer-activity screens show this as "by … (officer)".

---

## Security Rules

1. Passwords stored as bcrypt hashes — never plaintext.
2. JWT secrets must be different for access and refresh tokens in production.
3. CSRF secret must be ≥ 32 characters in production.
4. `FRONTEND_URL` must use `https://` in production.
5. `COOKIE_SAME_SITE=none` required in production for cross-origin Vercel ↔ Render setup.
6. `SameSite=None` mandates `Secure=true` — enforced regardless of environment if `sameSite === 'none'`.
7. Rate limiting applied globally and per-route to prevent brute force and spam.
8. Voting/scoring/polling endpoints have strict dual rate limiters (IP + user).
9. Upload size limited to 1MB JSON body; file uploads handled separately by multer.
10. In production, `assertProductionSecurity()` throws on startup if any security requirement is not met.

---

**Last Updated:** 2026-07-04
**Documentation Version:** 1.0.0
**Related Files:** `backend/src/middleware/auth.js`, `backend/src/services/election.service.js`, `backend/src/services/pageant.service.js`, `backend/src/services/polling.service.js`, `backend/src/config/security.js`
**Related Documentation:** `docs/ai/DATABASE.md`, `docs/ai/API.md`, `docs/ai/SYSTEM_ARCHITECTURE.md`
