# Voter Registration & Invitation Wrong-Table Fix

## Problem Statement

Across all three modules — **Election**, **Competition (scoring)**, and **Polling** — the **Register Voter/Respondent/Judge** and **Send Invitation** flows are broken because the backend still reads/writes the **legacy `event_voters` table** while **enrollment now happens in the canonical `event_participants` table**.

Migration `029_event_participant_roles.sql` introduced:

- A new `event_participants` table (with `participant_type`, `has_voted`, `has_scored`, `has_responded`, `metadata`)
- A backward-compatibility **VIEW** named `v_event_voters` (wrapping `event_participants`)
- `DB_TABLES.EVENT_VOTERS` was repointed to the view: `'v_event_voters'`

The legacy physical `event_voters` **table still exists** (`001_initial_schema.sql` created it and it was never dropped; `032_election_further_enhancements.sql` even added `voting_nonce` to it).

Because the module services (`election.service.js`, `pageant.service.js`, `polling.service.js`) still call `DB_TABLES.EVENT_VOTERS`, and `DB_TABLES.EVENT_VOTERS` points to the **`v_event_voters` view**, all enrollment reads/writes that flow through those services actually go to **`event_participants`** (the view is only SELECTable/read-only, with auto-update columns). Meanwhile, the **registration/enrollment write paths** in some legacy flows still target the **physical `event_voters` table** directly (or fail), producing inconsistent participant data.

---

## Root Cause Analysis

### 1. Two enrollment tables now coexist with confusing names

| Name                 | Kind  | Purpose                                                                                                                                                                 |
| -------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `events`             | table | Events (election, competition_scoring, polling)                                                                                                                         |
| `users`              | table | Accounts (global `role` = admin/organizer/voter)                                                                                                                        |
| `event_voters`       | table | **LEGACY** physical enrollment table (still exists, still used in a few writes)                                                                                         |
| `event_participants` | table | **NEW canonical** enrollment table (migration 029)                                                                                                                      |
| `v_event_voters`     | view  | Backward-compat read-only view over `event_participants` mapping old columns (`voter_id`, `has_voted`, `is_judge`, `has_scored`, `first_name`, `last_name`, `metadata`) |

In `constants.js`:

```js
EVENT_VOTERS: 'v_event_voters',        // ← now the VIEW
EVENT_PARTICIPANTS: 'event_participants',
```

### 2. Reads go to the view; writes go to the wrong table

- `election.service.js`, `pageant.service.js`, `polling.service.js`, `dashboard.service.js`, `reports.service.js` all use `DB_TABLES.EVENT_VOTERS` for **reads and counts** — these now correctly read from `event_participants` through the view.
- Registration enrollment uses **two different code paths**:
  - The **new** `participant.service.js` → `registerParticipant(eventId, userId)` → inserts into `event_participants`. ✅ (Used by `invitation.service.js` + `csv-import.service.js`)
  - The **legacy** competition path → `pageant.service.js` `inviteJudge()` / `registerJudge()` → `getClient().from(DB_TABLES.EVENT_VOTERS).upsert(...)` → because `EVENT_VOTERS` now points to the **read-only `v_event_voters` view**, this **fails / writes to the wrong place**. ❌

### 3. Competition judge registration writes to `v_event_voters` (the view)

In `pageant.service.js`:

```js
// inviteJudge / registerJudge still do this:
await getClient().from(DB_TABLES.EVENT_VOTERS).upsert({
  event_id: eventId,
  voter_id: user.id,
  is_judge: true, ...
}, { onConflict: 'event_id,voter_id' })
```

- `DB_TABLES.EVENT_VOTERS === 'v_event_voters'` → PostgREST/Supabase attempts to **INSERT/UPDATE a view**.
- This either errors out or (if the view happens to be auto-updatable) bypasses `participant_type`, leaving rows that the rest of the system can't see.
- **Result:** A registered judge never appears in `event_participants` (or appears with the wrong type), so:
  - `listJudges()` (reads via the view → `event_participants`) returns nothing → "No judges" in the UI.
  - `assertJudgeEnrolled()` fails → judge can't load scoring sheet → **"You are not a judge for this event"**.

### 4. Polling respondent registration functions are MISSING from `polling.service.js`

`polling-organizer.controller.js` imports and uses:

- `pollingService.listEventRespondents`
- `pollingService.registerRespondentToPoll`
- `pollingService.registerExistingRespondent`
- `pollingService.sendRespondentInvitation`
- `pollingService.sendAllPendingRespondentInvitations`

But `polling.service.js` **does NOT export any of these**. The file contains only event/question/analytics (+ voter poll submission) functions. **Conclusion: the respondent-management functions were never implemented in `polling.service.js`** — the controller references point at undefined functions → 500 on `/polling/events/:eventId/respondents/...`.

### 5. `voting_nonce` mismatch (Election)

- Migration `032` added `voting_nonce` to the **physical `event_voters`** table.
- `election.service.js` `assertVoterEnrolled()` selects `voting_nonce` from `DB_TABLES.EVENT_VOTERS` (= `v_event_voters` view).
- The view (migration 029) does **not expose `voting_nonce`** → the field is undefined in the result → replay protection nonce never gets generated/validated properly.

### 6. `previewCsv`/`registerVotersFromCsv` use the view for `alreadyEnrolled` check

`csv-import.service.js` `previewCsv()`:

```js
.getClient().from(DB_TABLES.EVENT_VOTERS).select('voter_id, users!inner(email)').eq('event_id', eventId)
```

- This reads from the view → OK for reading.
- But `rollbackCsvEnrollments()` deletes from `EVENT_PARTICIPANTS` while the registration calls `registerParticipant()` (also `EVENT_PARTICIPANTS`) → coupled but both on the new table.
- **Inconsistency:** legacy `importVotersFromCsv()` (invite+send flow) still calls `inviteVoterToEvent`/`inviteRegisteredVoter` which → `registerParticipant`, so it's fine. But the **competition** path uses `registerJudge()`/`inviteJudge()` which writes to the **view** (`EVENT_VOTERS`) → **broken**.

### 7. `event.service.js getEventVoterAccounts`

Uses `DB_TABLES.EVENT_VOTERS` (the view) — OK for reading, but it's only used by `dashboard.service.js` for stats. Not a write path.

---

## Impact Matrix

| Module              | Area                        | Impact                                                                                                                                               |
| ------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Election            | Register Voter / Invite     | Registration goes to `event_participants` via `invitation.service.js` ✅; listing reads via view ✅. Works unless a legacy direct-write path is hit. |
| Election            | Ballot replay protection    | ❌ `voting_nonce` column not exposed by view → nonce never saved/validated.                                                                          |
| Election            | CSV import rollback         | ⚠️ Uses new table — consistent, but relies on registration also going to `event_participants`.                                                       |
| Competition         | Register Judge (manual/CSV) | ❌ `registerJudge()`/`inviteJudge()` write to `v_event_voters` view → judge not in `event_participants` → judge never appears / can't score.         |
| Competition         | listJudges                  | ✅ Reads via view (reads from `event_participants`) — but nothing is being written there by the legacy path.                                         |
| Polling             | Register Respondent         | ❌ Controller imports functions that **do not exist** in `polling.service.js` → runtime failure.                                                     |
| Polling             | List Respondents            | ❌ Same — `listEventRespondents` not implemented.                                                                                                    |
| Polling             | Send Invitation(s)          | ❌ Same — functions missing.                                                                                                                         |
| Reports / Dashboard | Counts                      | ⚠️ Read via view — mostly correct, but counts of judges/poll respondents will be wrong if writes never landed in `event_participants`.               |

---

## Definitive Fix Plan

### Principle

> **`event_participants` is the single source of truth for all event enrollment.**
> All reads and writes must go through `DB_TABLES.EVENT_PARTICIPANTS`.
> `DB_TABLES.EVENT_VOTERS` (the view) should be **retired from write paths** and eventually removed.

### Backend changes

#### A. `backend/src/services/pageant.service.js` — fix judge registration writes

Replace the upserts that write to `DB_TABLES.EVENT_VOTERS` with calls to `participant.service.js` `registerParticipant()`.

In **`inviteJudge()`**:

```diff
- const { error: evError } = await getClient().from(DB_TABLES.EVENT_VOTERS).upsert({
-   event_id: eventId, voter_id: user.id, is_judge: true, has_scored: false,
-   has_voted: false, first_name: firstName || null, last_name: lastName || null,
- }, { onConflict: 'event_id,voter_id' })
- if (evError) throw new ApiError(500, evError.message)
+ await registerParticipant(eventId, user.id, {
+   participantType: PARTICIPANT_TYPES.COMPETITION_JUDGE,
+   firstName,
+   lastName,
+ })
```

In **`registerJudge()`**: same change (also keep the `INVITATIONS` upsert with `invitation_sent: false`).

#### B. `backend/src/services/polling.service.js` — implement missing respondent functions

Add the missing exports used by `polling-organizer.controller.js`:

- `listEventRespondents(eventId, organizerId, page, limit)` — same shape as `listEventVoters` in election.service.js but filter `participant_type = 'POLLING_RESPONDENT'`.
- `registerRespondentToPoll({ eventId, email, organizerId, temporaryPassword, resetPasswordForExisting })` — mirrors `registerVoterToEvent` in invitation.service.js, but enforces `POLLING_RESPONDENT` via `registerParticipant`.
- `registerExistingRespondent({ eventId, email, organizerId })` — mirrors `registerExistingVoter`.
- `sendRespondentInvitation({ eventId, voterId, organizerId })` — mirrors `sendVoterInvitation`.
- `sendAllPendingRespondentInvitations({ eventId, organizerId })` — mirrors `sendAllPendingInvitations`.

Or **simpler**: since all three modules share the same core enrollment+invitation logic in `invitation.service.js`, refactor the polling controller to reuse `invitation.service.js` functions (registering with `POLLING_RESPONDENT` participant type), and add thin wrappers in `polling.service.js` so the controller imports keep working.

#### C. `backend/src/services/election.service.js` — fix `voting_nonce`

Two options:

1. **Add `voting_nonce` to the `v_event_voters` view** (migration 033) — simplest, keeps `assertVoterEnrolled()` unchanged:
   ```sql
   CREATE OR REPLACE VIEW v_event_voters AS
   SELECT ep.id, ep.event_id, ep.user_id AS voter_id,
          (ep.participant_type = 'ELECTION_VOTER' AND ep.has_voted) OR
          (ep.participant_type = 'POLLING_RESPONDENT' AND ep.has_responded) AS has_voted,
          ep.participant_type = 'COMPETITION_JUDGE' AS is_judge,
          ep.has_scored,
          ep.first_name, ep.last_name, ep.metadata,
          ep.created_at, ep.updated_at,
          ep.voting_nonce               -- ← ADD
   FROM event_participants ep;
   ```
2. Change `election.service.js` to use `EVENT_PARTICIPANTS` directly for the nonce read/write, keeping the view only for legacy stats.

**Recommendation:** Do **both** — fix the view for backward compat, and move the critical read/write paths in election.service.js to `EVENT_PARTICIPANTS`.

#### D. Add `voting_nonce` column to `event_participants` (migration 033)

Since migration 032 put `voting_nonce` on the legacy `event_voters` table, and `event_participants` is canonical, add the same column to `event_participants` and backfill from `event_voters`:

```sql
ALTER TABLE event_participants
  ADD COLUMN IF NOT EXISTS voting_nonce UUID DEFAULT gen_random_uuid();

UPDATE event_participants ep
SET voting_nonce = ev.voting_nonce
FROM event_voters ev
WHERE ev.event_id = ep.event_id AND ev.voter_id = ep.user_id
  AND ep.voting_nonce IS NULL;
```

#### E. `backend/src/services/csv-import.service.js` — unify on `event_participants`

- `previewCsv()`: change the `alreadyEnrolled` query from `EVENT_VOTERS` → `EVENT_PARTICIPANTS` (select `user_id, users(email)` with `.eq('participant_type', ...)` optionally).
- `rollbackCsvEnrollments()`: already uses `EVENT_PARTICIPANTS` — keep.
- Remove reliance on the view for competition CSV.

#### F. `backend/src/controllers/pageant-organizer.controller.js` — fix CSV judge import

`registerImportJudgesCsv` currently loops `pageantService.registerJudge()`. Once `registerJudge()` is fixed (A) to write to `event_participants`, this path works. Optionally switch it to the shared `registerVotersFromCsv` + a participant-type update, but the minimal fix is A + E.

#### G. `backend/src/services/dashboard.service.js` + `reports.service.js`

- Keep using the view (`EVENT_VOTERS`) for **read-only** counts — they already read through `event_participants`. No change required beyond ensuring the view is correct.
- Consider migrating them to `EVENT_PARTICIPANTS` in a later cleanup so the view can be removed.

#### H. Add a data-resync / migration

Because legacy writes went to `event_voters` while new writes went to `event_participants`, run a one-time backfill to reconcile:

```sql
-- Re-enroll all legacy physically-enrolled voters/judges/respondents into event_participants
INSERT INTO event_participants (event_id, user_id, participant_type, has_voted, has_scored, has_responded, first_name, last_name, metadata, voting_nonce, created_at, updated_at)
SELECT ev.event_id, ev.voter_id,
       CASE WHEN ev.is_judge THEN 'COMPETITION_JUDGE'::participant_type
            WHEN e.event_type = 'polling' THEN 'POLLING_RESPONDENT'::participant_type
            ELSE 'ELECTION_VOTER'::participant_type END,
       CASE WHEN e.event_type = 'election' THEN ev.has_voted ELSE FALSE END,
       CASE WHEN ev.is_judge THEN ev.has_scored ELSE FALSE END,
       CASE WHEN e.event_type = 'polling' THEN ev.has_voted ELSE FALSE END,
       ev.first_name, ev.last_name, ev.metadata,
       ev.voting_nonce, ev.created_at, ev.updated_at
FROM event_voters ev JOIN events e ON e.id = ev.event_id
ON CONFLICT (event_id, user_id) DO UPDATE SET
  has_voted = EXCLUDED.has_voted,
  has_scored = EXCLUDED.has_scored,
  has_responded = EXCLUDED.has_responded,
  voting_nonce = COALESCE(event_participants.voting_nonce, EXCLUDED.voting_nonce),
  first_name = COALESCE(event_participants.first_name, EXCLUDED.first_name),
  last_name = COALESCE(event_participants.last_name, EXCLUDED.last_name),
  metadata = CASE WHEN event_participants.metadata = '{}' THEN EXCLUDED.metadata ELSE event_participants.metadata END;
```

### Frontend implications

- The frontend services (`election.service.js`, `pageant.service.js`, `polling.service.js` in `frontend/src/services/`) already call the API endpoints described above. Once the backend functions exist and write to `event_participants`, the pages (`ElectionVotersPage.jsx`, `CompetitionJudgesPage.jsx`, `PollingRespondentsPage.jsx`) work without change.
- If the polling API shapes change (e.g., new response property names), update the frontend polling service/types accordingly.

---

## Files to Change

| #   | File                                                                       | Change                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `backend/src/database/migrations/033_fix_participant_enrollment.sql` (new) | Add `voting_nonce` to `event_participants`; backfill; fix `v_event_voters` view to expose `metadata` + `voting_nonce`; reconcile duplicates.                                                           |
| 2   | `backend/src/services/pageant.service.js`                                  | `inviteJudge()` / `registerJudge()` → use `registerParticipant()` (writes `event_participants` with `COMPETITION_JUDGE`)                                                                               |
| 3   | `backend/src/services/polling.service.js`                                  | Implement `listEventRespondents`, `registerRespondentToPoll`, `registerExistingRespondent`, `sendRespondentInvitation`, `sendAllPendingRespondentInvitations` (or delegate to `invitation.service.js`) |
| 4   | `backend/src/services/csv-import.service.js`                               | `previewCsv()` → use `EVENT_PARTICIPANTS` for `alreadyEnrolled`; ensure rollback/register consistent                                                                                                   |
| 5   | `backend/src/services/election.service.js`                                 | Use `EVENT_PARTICIPANTS` for ballot nonce read/update (or rely on fixed view)                                                                                                                          |
| 6   | `backend/src/services/event.service.js`                                    | `getEventVoterAccounts()` → optionally move to `EVENT_PARTICIPANTS` (read-only)                                                                                                                        |
| 7   | `backend/src/controllers/pageant-organizer.controller.js`                  | `registerImportJudgesCsv` → ensure it uses the fixed `registerJudge` path                                                                                                                              |
| 8   | `backend/src/database/migrations/029_event_participant_roles.sql`          | If 033 is preferred, leave 029 as-is to preserve history; note the `metadata`/`voting_nonce` gaps are fixed in 033.                                                                                    |
| 9   | `frontend/src/services/polling.service.js`                                 | (Optional) align any response shape changes for respondents                                                                                                                                            |

---

## Verification Steps

1. **Run the new migration** (`033...`) and verify:
   - `SELECT count(*) FROM event_participants WHERE participant_type='COMPETITION_JUDGE'` equals judges previously in `event_voters`.
   - `v_event_voters` exposes `metadata` and `voting_nonce`.
2. **Competition manual register judge** → verify judge appears in `event_participants` with `COMPETITION_JUDGE`, shows in `CompetitionJudgesPage`, can load scoring sheet, can submit scores.
3. **Polling manual register respondent** → verify respondent is created in `users`, enrolled in `event_participants` as `POLLING_RESPONDENT`, listed in `PollingRespondentsPage`, and can take the poll.
4. **Election register voter + ballot** → verify voter appears, ballot loads, `voting_nonce` is generated/consumed correctly, `has_voted` flips to true on submit.
5. **CSV import for all three modules** → verify preview detects existing accounts, register writes to `event_participants`, rollback works.
6. **Send invitation (single + all)** in all three modules → verify `invitations` rows update `invitation_sent`, email sent, notification created.
7. **Run the backend test suite** (`cd backend && npm test`).

---

## Notes & Risks

- **Migration ordering matters.** `033` must run after `029` and `032`.
- If `v_event_voters` view is `WITH CHECK OPTION` on the DB (from external tooling), `INSERT/UPDATE` through it may be restricted — this is exactly why writes must move to `event_participants`.
- Some legacy code (e.g., direct `event_voters` queries in `dashboard.service.js`) may still read the physical table where the view is used interchangeably. After the resync migration, both tables should agree, but the plan retires the physical table from all write paths.
- Do **not** drop `event_voters` until all read references use `event_participants`/the fixed view and production data is verified.
