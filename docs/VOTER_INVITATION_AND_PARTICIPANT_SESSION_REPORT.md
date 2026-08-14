# Voter Invitation and Participant System — Session Report

**Session date:** August 14, 2026  
**Scope:** Election voters, competition judges, polling respondents, invitation links, voter login redirects, voter dashboard assignments, participation submission, reports, WebSockets, and database migration safety.

## 1. Executive summary

Before this session, Votrix was partway through replacing the legacy `event_voters` enrollment model with the canonical `event_participants` model. Registration and dashboard code had already moved in several places, but some runtime paths still used the legacy compatibility view. Invitation links also lost their intended destination during login and mandatory password change.

This caused several user-visible problems:

- Newly invited voters could land on `/voter` instead of the event they were invited to.
- Polling invitation emails used the election voter URL.
- Polling submission attempted to update a read-only compatibility view.
- Reports and WebSocket room assignment still depended on legacy enrollment paths.
- Existing database records could be split between `event_voters`, `event_participants`, `invitations`, and `competition_judges`.
- A competition judge could appear in the organizer list but have no event on the voter dashboard.

After this session:

- `event_participants` is the only enrollment source used by application runtime code.
- Invitation destinations survive login and password change.
- Each module generates its correct participant URL.
- Poll completion is stored in `event_participants.has_responded`.
- Migration `040` repairs enrollment records from all known legacy sources.
- A non-destructive down migration can reverse the schema additions without deleting repaired enrollment data.

## 2. Participant model now used by Votrix

All participant accounts still have the global user role:

```text
users.role = voter
```

Their event-specific role comes from `event_participants.participant_type`:

| Module | Participant type | Completion column |
|---|---|---|
| Election | `ELECTION_VOTER` | `has_voted` |
| Competition | `COMPETITION_JUDGE` | `has_scored` |
| Polling | `POLLING_RESPONDENT` | `has_responded` |

The canonical uniqueness rule is:

```text
One event_participants row per event_id + user_id
```

### Database objects

| Object | Current purpose |
|---|---|
| `event_participants` | Canonical participant enrollment and completion state |
| `event_voters` | Legacy physical table retained for migration reconciliation only |
| `v_event_voters` | Read-only backward-compatibility view |
| `invitations` | Invitation delivery/account tracking, not the primary enrollment source |
| `competition_judges` | First-class competition judge details and assignment support |

Application services must read and write `event_participants`. They must not write `event_voters` or `v_event_voters`.

## 3. System behavior before this session

### 3.1 Invitation destination was lost

`ProtectedRoute` saved the page that an unauthenticated voter originally requested:

```text
/voter/...event URL → /login with location.state.from
```

However, login ignored `location.state.from`. It asked the backend for the first active/assigned event or fell back to `/voter`.

For a new voter, the problem was stronger:

```text
Invitation event link
→ Login
→ /change-password
→ /voter
```

Both password change and password skip used the generic role dashboard path, so the invited event destination was lost.

### 3.2 Polling links used the election route

The generic voter email helper generated:

```text
/voter/events/:eventId
```

That is the election route. Polling requires:

```text
/voter/polling/events/:eventId
```

Competition already had its own scoring URL.

### 3.3 Runtime enrollment was split

Some paths correctly used `event_participants`, while other paths used `DB_TABLES.EVENT_VOTERS`, which pointed to `v_event_voters`.

The compatibility view contains computed columns. It is suitable only for old read compatibility and cannot safely handle completion updates.

Affected legacy paths included:

- Polling access and submission state.
- Polling organizer statistics.
- Cross-module reports.
- Voter WebSocket room assignment.

### 3.4 Competition could have two different assignment states

Competition judge management supports `competition_judges`, but the voter dashboard reads `event_participants`.

A judge existing only in `competition_judges` could therefore:

- Appear in the organizer judge list.
- Receive an invitation.
- Still see zero assigned voter events.

## 4. System behavior after this session

## 4.1 Invitation and login redirect flow

The current flow is:

```text
Invitation link
→ ProtectedRoute stores the requested voter URL
→ Login validates and preserves that URL
→ Optional password change/skip preserves the same URL
→ Voter opens the exact invited event
```

Only these internal destinations are accepted:

```text
/voter/events/:eventId
/voter/polling/events/:eventId
/voter/competition/events/:eventId/score
```

External URLs and unrelated internal paths are rejected. This prevents the preserved destination from becoming an open-redirect vulnerability.

If there is no preserved invitation destination, Votrix calls:

```text
GET /api/voter/login-redirect
```

The backend chooses:

1. First active event.
2. Otherwise first assigned event.
3. Otherwise `/voter` dashboard.

### Files responsible

- `frontend/src/routes/ProtectedRoute.jsx`
- `frontend/src/hooks/useLogin.js`
- `frontend/src/pages/auth/ChangePasswordPage.jsx`
- `frontend/src/utils/auth.js`

## 4.2 Module-aware participant links

Votrix now maps event types to participant routes centrally:

| Event type | Participant route |
|---|---|
| `election` | `/voter/events/:eventId` |
| `polling` | `/voter/polling/events/:eventId` |
| `pageant` | `/voter/competition/events/:eventId/score` |
| `competition_scoring` | `/voter/competition/events/:eventId/score` |

This mapping is used for invitations and event notification emails.

### Files responsible

- `backend/src/utils/urls.js`
- `backend/src/services/mailer.service.js`
- `backend/src/services/invitation.service.js`
- `backend/src/services/polling.service.js`
- `backend/src/services/event.service.js`

## 4.3 Registration behavior by module

### Election

Registration creates or reuses a voter account, then registers:

```text
participant_type = ELECTION_VOTER
```

The voter dashboard reads that participant row and links to the election voter page.

### Competition

Registration creates or reuses a voter account, then maintains both:

```text
event_participants: COMPETITION_JUDGE
competition_judges: first-class judge record
```

The participant row controls voter-dashboard visibility and event access. The competition judge row stores competition-specific judge details.

### Polling

Registration creates or reuses a voter account, then registers:

```text
participant_type = POLLING_RESPONDENT
```

Poll completion is now written to:

```text
event_participants.has_responded
```

It no longer attempts to update `v_event_voters.has_voted`.

## 4.4 Dashboard assignment behavior

The voter dashboard loads all three participant types from `event_participants` and classifies each event into one bucket:

| Bucket | Meaning |
|---|---|
| `assigned` | Enrolled, but participation is not currently open |
| `active` | Voting, scoring, or polling is currently available |
| `completed` | The participant has completed the required action |

Important: `Assigned = 0` does not always mean enrollment is missing. An open event appears under `Active`, not `Assigned`.

A healthy single active-event result can be:

```json
{
  "total": 1,
  "assigned": 0,
  "active": 1,
  "completed": 0
}
```

The actual failure condition is when `total`, `assigned`, `active`, and `completed` are all zero for a user who should have an enrollment row.

## 4.5 Poll submission behavior

For a poll that does not allow multiple submissions, Votrix atomically changes:

```text
has_responded: false → true
```

The update is restricted by:

```text
event_id
user_id
participant_type = POLLING_RESPONDENT
has_responded = false
```

If submission or answer storage fails, Votrix rolls `has_responded` back to `false`.

For polls allowing multiple submissions, each submission is stored while the participant remains marked as having responded.

## 4.6 Reports and WebSockets

Reports now count participants using explicit participant types and completion columns.

WebSocket voter room setup now loads assignments from:

```text
event_participants.user_id
```

A participant enrolled only in the canonical table can therefore receive live event updates.

## 5. Database migration 040

### Forward migration

File:

```text
backend/src/database/migrations/040_reconcile_event_participants.sql
```

It performs the following work in one PostgreSQL transaction:

1. Ensures `event_participants.voting_nonce` exists.
2. Reconciles legacy `event_voters` records.
3. Reconciles invitation-only records.
4. Reconciles judges existing only in `competition_judges`.
5. Preserves completion flags, names, metadata, and nonce values.
6. Derives participant roles from the event type.
7. Adds participant lookup and completion indexes.
8. Recreates `v_event_voters` as a read-only compatibility view.
9. Aborts if any known legacy enrollment remains unreconciled.

Because the migration uses `BEGIN` and `COMMIT`, any assertion failure rolls back the entire migration automatically.

### Required deployment order

```text
1. Back up the production database.
2. Confirm migrations 029 and 033 were applied.
3. Apply 040_reconcile_event_participants.sql in Supabase SQL Editor.
4. Deploy/restart the updated backend.
5. Deploy the updated frontend.
6. Run the manual verification checklist below.
```

The migration file exists in the repository but was not executed against the live Supabase database during this coding session.

## 6. Safe rollback behavior

Rollback file:

```text
backend/src/database/migrations/040_down_reconcile_event_participants.sql
```

This is intentionally a non-destructive rollback. It:

- Verifies `event_participants` exists.
- Removes only indexes introduced by migration `040`.
- Restores the compatibility-view definition from migration `033`.
- Preserves all participant rows and completion data.

It does not delete reconciled participants because doing so could remove:

- Valid voter enrollment.
- Judge assignment.
- Poll respondent enrollment.
- Completion activity created after deployment.

If the forward migration fails during execution, PostgreSQL automatically rolls it back, so the down migration is not needed for that case.

## 7. Invitation response defects also corrected

Some invitation handlers declared `tempPassword` but returned an undefined variable named `temporaryPassword`.

This could report an API failure after the email operation had already occurred. Individual and bulk voter/judge invitation responses now return:

```text
temporaryPassword: tempPassword
```

## 8. Files changed during this session

### Frontend

| File | Change |
|---|---|
| `frontend/src/routes/ProtectedRoute.jsx` | Preserve requested event through password-change redirect |
| `frontend/src/hooks/useLogin.js` | Prefer safe original voter destination; server redirect is fallback |
| `frontend/src/pages/auth/ChangePasswordPage.jsx` | Continue to exact event after changing or skipping password |
| `frontend/src/utils/auth.js` | Validate safe voter event destinations |

### Backend runtime

| File | Change |
|---|---|
| `backend/src/utils/urls.js` | Central event-type-to-participant-route mapping |
| `backend/src/services/mailer.service.js` | Module-aware invitation and notification links |
| `backend/src/services/event.service.js` | Pass event type into notification email generation |
| `backend/src/services/invitation.service.js` | Module-aware links and corrected password response variables |
| `backend/src/services/pageant.service.js` | Corrected individual and bulk password response variables |
| `backend/src/services/polling.service.js` | Canonical enrollment, `has_responded`, rollback, counts, and polling links |
| `backend/src/services/reports.service.js` | Participant-type-specific canonical report counts |
| `backend/src/websocket/ws-server.js` | Canonical event room assignments |
| `backend/src/utils/constants.js` | Removed obsolete `EVENT_VOTERS` runtime constant |

### Database and documentation

| File | Change |
|---|---|
| `backend/src/database/migrations/040_reconcile_event_participants.sql` | Forward reconciliation migration |
| `backend/src/database/migrations/040_down_reconcile_event_participants.sql` | Non-destructive rollback migration |
| `backend/src/database/README.md` | Current migration and rollback instructions |
| `docs/VOTER_INVITATION_AND_PARTICIPANT_SESSION_REPORT.md` | This report |

### Tests

| File | Change |
|---|---|
| `backend/__tests__/services/enrollment-regression.test.js` | Canonical enrollment regression coverage |
| `backend/__tests__/utils/urls.test.js` | Module participant URL coverage |

## 9. Verification completed during this session

### Passed

- Focused backend regression tests: 12/12.
- Backend changed-file syntax checks.
- ESLint for all changed frontend files.
- Frontend production build.
- Project diagnostics: no errors or warnings.
- `git diff --check`.
- Runtime source search for `event_voters`, `v_event_voters`, and `EVENT_VOTERS`: no active application references.

### Broader repository checks

Full backend test suite result:

```text
240 passed / 241 total
```

The one failure is an existing validator expectation that says invitation passwords must be supplied. Current registration behavior intentionally permits automatic temporary-password generation. It is unrelated to the participant/redirect changes.

Full frontend lint remains blocked by unrelated existing issues in:

- `frontend/src/components/voter/ParticipantInformationGate.jsx`
- `frontend/src/pages/organizer/competition/CompetitionWorkspacePage.jsx`
- `frontend/src/pages/organizer/polling/PollingBuilderPage.jsx`

The frontend production build and changed-file lint both pass.

## 10. Manual production verification checklist

After applying migration `040` and deploying both applications, test all of the following.

### Election

- [ ] Register a new election voter.
- [ ] Register an existing voter.
- [ ] Send an invitation.
- [ ] Open the invitation while logged out.
- [ ] Sign in with a temporary password.
- [ ] Change or skip password change.
- [ ] Confirm redirect to `/voter/events/:eventId`.
- [ ] Confirm the election appears in total/assigned/active/completed counts.
- [ ] Submit a ballot and confirm `has_voted = true`.

### Competition

- [ ] Register a new judge.
- [ ] Register an existing voter as a judge.
- [ ] Confirm both `event_participants` and `competition_judges` records exist.
- [ ] Open the invitation while logged out.
- [ ] Confirm redirect to `/voter/competition/events/:eventId/score`.
- [ ] Submit scores and confirm `has_scored = true`.

### Polling

- [ ] Register a new respondent.
- [ ] Register an existing respondent.
- [ ] Confirm the email uses `/voter/polling/events/:eventId`.
- [ ] Open the invitation while logged out.
- [ ] Confirm redirect to the exact poll after password change.
- [ ] Submit a response and confirm `has_responded = true`.
- [ ] Confirm single-submission polls reject a second submission.
- [ ] Confirm multiple-submission polls accept another submission.

### Dashboard and live behavior

- [ ] Confirm every enrolled event appears in exactly one dashboard bucket.
- [ ] Confirm total equals assigned + active + completed.
- [ ] Toggle voting/scoring/polling and confirm live dashboard updates.
- [ ] Confirm organizer reports count the correct participant types.

## 11. Operational notes

- Restart/redeploy the backend after code deployment; otherwise an old backend process can continue running stale queries.
- Deploy the frontend after the backend so module-aware links and redirect behavior are available together.
- Keep `v_event_voters` only for backward compatibility. New code must not depend on it.
- Do not use `040_down` to try to erase repaired enrollment data. Its purpose is safe schema rollback, not destructive data reversal.
- Older documents such as `EVENT_VOTERS_MIGRATION_AUDIT.md` describe an earlier incomplete migration state. This report represents the current state after this session.

## 12. Final architecture summary

```text
Organizer registers/invites participant
              │
              ▼
users account + event_participants enrollment
              │
              ├── Election: ELECTION_VOTER
              ├── Competition: COMPETITION_JUDGE + competition_judges details
              └── Polling: POLLING_RESPONDENT
              │
              ▼
Module-aware invitation link
              │
              ▼
Login → optional password change → exact event
              │
              ▼
Vote / score / respond
              │
              ▼
event_participants completion state
              │
              ├── Voter dashboard
              ├── Organizer statistics and reports
              └── WebSocket event rooms
```

The central rule after this session is:

> `event_participants` is the source of truth for who is assigned to an event and whether they completed their event-specific participation.
