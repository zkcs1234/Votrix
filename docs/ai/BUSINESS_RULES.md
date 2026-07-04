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

| Role | Created By | Login Identifier | Dashboard Path |
|------|-----------|-----------------|----------------|
| `admin` | Manual DB insert | `username` | `/admin` |
| `organizer` | Admin | `email` | `/organizer` |
| `voter` | Organizer (invite/import) | `email` | `/voter` |

- A user has exactly one role — no multi-role accounts.
- Organizers and voters must have `account_status = 'active'` to use the system.
- Account statuses: `pending` → `active` → `suspended` / `archived`.
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

1. Each organizer has exactly one organization (1:1 relationship enforced at creation).
2. Organization type (`election`, `pageant`, `polling`) determines which module the organizer uses.
3. Organization status (`draft`, `active`, `inactive`, `archived`) is managed by the admin.
4. An organizer can have multiple events under their organization.

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
