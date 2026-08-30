# Migration Runbook — 061 → 063 (Issue D & E)

Fixes **Issue D** (votes/scores not anchored to `event_participants`) and **Issue E**
(judge-assignment `scope_id` has no integrity check) from
[`DATABASE_SCHEMA_CURRENT.md`](DATABASE_SCHEMA_CURRENT.md) §6.

Everything here is **additive and non-breaking** — the running app keeps working at every step.
You run each `.sql` file by hand in the **Supabase SQL Editor**, in numeric order, exactly like your existing migrations.

---

## Before you start (once)

1. **Take a backup / snapshot.** Supabase Dashboard → **Database → Backups** (or run a `pg_dump`). This is your ultimate rollback.
2. Open Supabase Dashboard → **SQL Editor** → **New query**.
3. Know how to paste a file: open the `.sql` from `backend/src/database/migrations/`, copy its whole contents into the editor, click **Run**.
4. ✅ = the editor shows **Success. No rows returned** (or a result grid for the check queries).

> Order to apply: **061 → (pre-check) → 062 → (pre-check) → 063**. Never run a `*_down_*` file during a forward run.

---

## STEP 1 — Apply `061_add_participant_id_to_ballots.sql`

Adds the nullable `participant_id` column to the four tables and backfills it. Cannot fail on existing data (no constraints yet).

1. Paste the full contents of **`061_add_participant_id_to_ballots.sql`** → **Run**.
2. Expect ✅ Success.
3. **Run the orphan post-check** (paste this separately and Run):

   ```sql
   SELECT 'election_votes' AS tbl, count(*) AS orphans FROM election_votes WHERE participant_id IS NULL
   UNION ALL SELECT 'poll_submissions',                 count(*) FROM poll_submissions                 WHERE participant_id IS NULL
   UNION ALL SELECT 'competition_scores',               count(*) FROM competition_scores               WHERE participant_id IS NULL
   UNION ALL SELECT 'competition_session_judge_scores', count(*) FROM competition_session_judge_scores WHERE participant_id IS NULL;
   ```

4. **Read the result:**
   - **All zeros** → perfect. Every existing vote/score maps to an enrolled participant. Continue to Step 2.
   - **Non-zero anywhere** → those are real rows whose voter/judge has **no `event_participants` row** for that event. This does **not** block anything — the column is nullable. But note the count; you must **not** run the later `NOT NULL` tightening (Step 5) until it's zero. To see the actual rows, e.g.:

     ```sql
     SELECT * FROM election_votes WHERE participant_id IS NULL LIMIT 50;
     ```

     Investigate whether they belong to deleted users or a botched enrollment, then either enroll the participant or delete the stray rows. Re-run 061's backfill by re-applying the file (it's idempotent) after fixing.

**Rollback for this step:** run `061_down_add_participant_id_to_ballots.sql` (drops the columns; loses nothing else).

---

## STEP 2 — Apply `062_validate_participant_id_fks.sql`

Adds the foreign keys `participant_id → event_participants(id)`. NULLs are still allowed, so current inserts keep working.

1. **Pre-check (optional but recommended)** — confirm no *non-null* value is dangling (should always be 0 because 061 only sets valid ids):

   ```sql
   SELECT count(*) AS bad
   FROM election_votes ev
   LEFT JOIN event_participants ep ON ep.id = ev.participant_id
   WHERE ev.participant_id IS NOT NULL AND ep.id IS NULL;
   ```
   Expect **0**. (Repeat for the other three tables if you like, swapping the table name.)

2. Paste the full contents of **`062_validate_participant_id_fks.sql`** → **Run**.
3. Expect ✅ Success. If `VALIDATE CONSTRAINT` errored, a non-null orphan exists — go back and clean it, then re-run.

**Rollback for this step:** run `062_down_validate_participant_id_fks.sql` (drops just the FKs; columns stay).

---

## STEP 3 — Apply `063_judge_assignment_scope_guard.sql`

Adds a trigger validating `competition_judge_assignments.scope_id` on new writes.

1. **Pre-check** — find existing rows that would fail a *future* update (reporting only; existing rows are not re-validated by the trigger):

   ```sql
   SELECT a.id, a.scope, a.scope_id
   FROM competition_judge_assignments a
   JOIN event_participants ep ON ep.id = a.participant_id
   WHERE
     (a.scope = 'event'    AND a.scope_id <> ep.event_id)
     OR (a.scope = 'category' AND a.scope_id NOT IN (SELECT id FROM competition_categories WHERE event_id = ep.event_id))
     OR (a.scope = 'round'    AND a.scope_id NOT IN (SELECT id FROM competition_rounds     WHERE event_id = ep.event_id))
     OR (a.scope = 'division' AND a.scope_id NOT IN (SELECT id FROM competition_divisions  WHERE event_id = ep.event_id));
   ```
   - **No rows** → clean. Continue.
   - **Some rows** → these are already-broken assignments. Fix or delete them so a later edit doesn't get rejected. (Applying 063 is still safe — the trigger only fires on new INSERT/UPDATE.)

2. Paste the full contents of **`063_judge_assignment_scope_guard.sql`** → **Run**.
3. Expect ✅ Success.
4. **Smoke test** (optional): try inserting a deliberately wrong assignment in a scratch query and confirm it's rejected, e.g. an `event` scope with a random `scope_id` should raise `scope_id ... is not a valid event`. Roll it back / don't commit.

**Rollback for this step:** run `063_down_judge_assignment_scope_guard.sql`.

---

## STEP 4 — Update application code (dual-write)

The DB is ready, but the RPCs still don't populate `participant_id`. Make them write it so **new** rows are anchored going forward. These are small, backward-compatible edits:

- **`cast_election_ballot`** (migration 059) already looks up the participant to flip `has_voted`. Capture that participant id and pass it into the `election_votes` INSERT (`participant_id`).
- **`cast_poll_response`** (migration 060) already updates the `event_participants` row for `has_responded`. Capture its id and set `poll_submissions.participant_id`.
- **Competition scoring writes** (`services/competition-session.service.js`, `pageant.service.js`) — when inserting into `competition_scores` / `competition_session_judge_scores`, resolve the judge's `event_participants.id` (you already have `event_id` + judge `user_id`) and set `participant_id`.
- Optional cleanup: delete the stale `COMPETITION_JUDGES` entry from `DB_TABLES` in `backend/src/utils/constants.js` (it maps to a view no code uses).

Deploy this code. From now on every new vote/score is anchored. `voter_id` / `judge_id` stay as-is (harmless).

> I can make these code edits for you as the next step — say the word.

---

## STEP 5 — (LATER) Tighten to NOT NULL — only when ready

Do this **only after** Step 4 is deployed *and* the Step 1 orphan check returns all zeros. This is the point where a missing `participant_id` becomes impossible.

Order: re-run the Step 1 orphan check → if all zero, apply a new migration `064_participant_id_not_null.sql` that runs, per table:

```sql
ALTER TABLE election_votes                    ALTER COLUMN participant_id SET NOT NULL;
ALTER TABLE poll_submissions                  ALTER COLUMN participant_id SET NOT NULL;
ALTER TABLE competition_scores                ALTER COLUMN participant_id SET NOT NULL;
ALTER TABLE competition_session_judge_scores  ALTER COLUMN participant_id SET NOT NULL;
```

> ⚠️ Do not run Step 5 early. If any older code path still inserts without `participant_id`, `SET NOT NULL` will make those inserts fail. That's why it's a separate, deliberate migration after the code is live. (Tell me when you reach this point and I'll generate `064` with its down file.)

---

## Rollback summary

| Undo | Run |
|------|-----|
| Trigger (063) | `063_down_judge_assignment_scope_guard.sql` |
| Foreign keys (062) | `062_down_validate_participant_id_fks.sql` |
| Columns (061) | `061_down_add_participant_id_to_ballots.sql` |

Run downs in reverse order (063 → 062 → 061). None of the downs lose enrollment, vote, or score data — they only remove the objects each forward file added.

---

## What's intentionally NOT in this batch

The remaining §6 issues (A: two score stores, B: invitations/participants overlap, C: poll type enum vs registry, F: `poll_answers.voter_id`) require **code changes first** and a source-of-truth decision each. They're not pure schema changes, so they come after this batch — converge the reads in code, then drop the losing column/table in a later migration. Ask when you want to tackle one and I'll scaffold it the same way.
