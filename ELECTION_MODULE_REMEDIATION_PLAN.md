# Election Module — Safe Remediation Implementation Plan

**Date:** 2026-08-30
**Companion doc:** [ELECTION_MODULE_ANALYSIS.md](ELECTION_MODULE_ANALYSIS.md)
**Goal:** Close the integrity/correctness defects found in the analysis **without risking live elections, existing data, or in-flight ballots.**

## Implementation Status (2026-08-30)

| Phase | Item | Status |
|:-----:|------|--------|
| 1 | `EMAIL_RE` crash fix (reuse `validateEmailField`) | ✅ Implemented |
| 2 | Atomic ballot write via `cast_election_ballot` RPC | ✅ Implemented (migration `059` + `submitBallot`) |
| 3 | Voting-nonce wired through validator & enforced (lenient) | ✅ Implemented |
| 4a | Schedule authoritative — future `start_date` holds voting closed (Option B) | ✅ Implemented |
| 4b | Public results gated on conclusion, not the transient voting flag | ✅ Implemented |
| 5 | Dashboard cache invalidated on all writes | ✅ Implemented (shared-store move still recommended for scale) |
| 6 | Unified turnout math + hoisted dynamic imports + dead-code cleanup | ✅ Implemented |
| 7 | Voter-list pagination silent-truncation removed | ✅ Partial — service wired |
| 7 | Service split (3 files) + react-query migration + pagination UI | ⏳ Deferred to staged per-PR work (behavior-preserving, low correctness value) |

**Tests:** `backend/__tests__/utils/eventSchedule.test.js` (Options B & 4b) and new `backend/__tests__/validators/election.validator.test.js` (nonce preservation). Full backend suite green: **335 passed / 3 skipped**.

**Migration to apply (Supabase SQL editor, forward order):** `059_election_cast_ballot_rpc.sql`. Rollback: `059_down_election_cast_ballot_rpc.sql`. Deploy order for Phase 2: **migration → backend** (the RPC is additive, so it is safe to apply ahead of the backend).

**Not done deliberately:** the Phase 0 DB-backed ballot API integration tests (the repo's API tests are auth-boundary only; a seeded test DB is needed) and the large Phase 7 refactor. Both are called out below.

## Guiding "Safe" Principles

1. **Additive-only DB migrations.** New columns/functions use `IF NOT EXISTS` / `CREATE OR REPLACE`; no `DROP`, no destructive rewrites. Every migration ships with a paired `_down` script.
2. **Backward compatibility at every step.** Old clients keep working while new code deploys. The API contract only *widens* (never removes fields) until a later cleanup phase.
3. **Deploy order is fixed:** migration → backend → frontend. Never a frontend that depends on un-deployed backend.
4. **One concern per PR.** Each phase is independently revertible with a clean `git revert`.
5. **Test-first for integrity fixes.** The ballot-path fixes land *with* their tests in the same PR.
6. **No behavior change without a flag** for anything that alters when voting opens or when results appear (§Phase 4). Default the flag to *current behavior*, flip after review.
7. **Verify on a copy first.** Run each migration against a staging/branch database before production.

> ⚠️ **Freeze rule:** Do not deploy Phases 1–2 while an election is actively in its voting window. Schedule the ballot-write change (Phase 2) during a maintenance window with no open elections. Phase 1 (crash fix) is safe anytime.

---

## Phase Ordering & Risk

| Phase | Fix | Analysis ref | Risk | Data migration? | Deploy window |
|:-----:|-----|:------------:|:----:|:---------------:|---------------|
| 0 | Test & CI safety net | §7 | none | no | anytime |
| 1 | `EMAIL_RE` crash fix | §3.1 | very low | no | anytime |
| 2 | Atomic ballot write (RPC) | §3.3 | medium | additive fn | maintenance window |
| 3 | Nonce: wire-up or honest removal | §3.2 | low | no | anytime after P2 |
| 4 | Voting-window / results-visibility semantics | §6.1, §6.2 | medium (behavioral) | no | flagged rollout |
| 5 | Dashboard cache correctness/scaling | §5.3 | low | no | anytime |
| 6 | Turnout unification + dead-code cleanup | §5.2, §5.6 | low | no | anytime |
| 7 | Structural refactor (split service, FE query layer) | §5.1, §5.7 | low but large | no | last |

Each phase is shippable on its own. **Do not batch.**

---

## Phase 0 — Safety Net (do this first)

**Why first:** every subsequent fix touches vote integrity; we need a regression harness before changing that code. There are currently **no tests on the election/ballot path**.

**Actions**
- Add `backend/__tests__/api/election-ballot.api.test.js` covering the *current* behavior as a baseline:
  - single valid ballot → recorded, `has_voted=true`;
  - second submit → **409** (double-vote guard);
  - submit when `voting_enabled=false` / before start / after end → **403**;
  - invalid candidate-for-position → **400**;
  - `allow_skip` position omitted → allowed; required position omitted → **400**.
- Add a controller-level test that `POST …/voters/register-existing` returns **400** (not 500) for a bad email — this test **fails today** and becomes the acceptance test for Phase 1.
- Wire the suite into CI so a red build blocks merge.

**Rollback:** tests are inert; nothing to revert.
**Verification:** baseline suite green except the intentionally-failing register-existing test.

---

## Phase 1 — Fix the `registerExistingVoter` crash (§3.1)

**Change (surgical, reuse existing validator):**
`backend/src/controllers/election-organizer.controller.js`

```js
// remove the unused import
- import { sanitizeEmail, validateUUID } from '../utils/sanitize.js'
+ import { sanitizeEmail } from '../utils/sanitize.js'
+ import { validateEmailField } from '../validators/email.validator.js'
...
  const email = sanitizeEmail(rawEmail)
- if (!EMAIL_RE.test(email)) {
-   throw new ApiError(400, 'Invalid email format')
- }
+ validateEmailField(email)   // throws ApiError(400) on invalid format
```

`validateEmailField` already owns the canonical `EMAIL_RE` (`email.validator.js:3-13`), so this removes the undefined reference **and** the duplicated regex.

**Safe because:** pure bug fix; the endpoint currently 500s on all input, so any correct behavior is strictly better. No schema, no contract change.
**Rollback:** single-file `git revert`.
**Verification:** the Phase-0 register-existing test flips to green; valid email enrolls, invalid email returns 400.

---

## Phase 2 — Make ballot submission atomic (§3.3) — *the critical fix*

**Approach:** move the `has_voted` flip **and** the vote-row insert into **one Postgres function** so they commit all-or-nothing inside a single transaction. Supabase has no client-side multi-statement transaction; an RPC is the correct, safe mechanism.

### 2a. Migration (additive, reversible)
`backend/src/database/migrations/034_election_cast_ballot_rpc.sql`

```sql
BEGIN;

CREATE OR REPLACE FUNCTION cast_election_ballot(
  p_event_id  UUID,
  p_voter_id  UUID,
  p_votes     JSONB   -- [{position_id, candidate_id}, ...]
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_locked INT;
BEGIN
  -- Atomic claim: only the first caller flips the flag.
  UPDATE event_participants
     SET has_voted = TRUE, voting_nonce = NULL
   WHERE event_id = p_event_id
     AND user_id  = p_voter_id
     AND has_voted = FALSE;
  GET DIAGNOSTICS v_locked = ROW_COUNT;

  IF v_locked = 0 THEN
    RETURN FALSE;   -- already voted; caller maps to 409
  END IF;

  INSERT INTO election_votes (event_id, voter_id, position_id, candidate_id)
  SELECT p_event_id, p_voter_id,
         (e->>'position_id')::UUID, (e->>'candidate_id')::UUID
    FROM jsonb_array_elements(p_votes) AS e;

  RETURN TRUE;   -- both statements commit together; any error rolls back the flag too
END;
$$;

COMMIT;
```

Paired `034_down_*.sql`: `DROP FUNCTION IF EXISTS cast_election_ballot(UUID, UUID, JSONB);`

### 2b. Backend: call the RPC, keep all validation
`election.service.js` `submitBallot` keeps *every* pre-check (enrollment, voting-open, position/candidate validation, dedup) **unchanged**, then replaces the two-step write + manual compensation (`:879-909`) with:

```js
const { data: committed, error } = await getClient()
  .rpc('cast_election_ballot', { p_event_id: eventId, p_voter_id: voterId, p_votes: voteRows })
if (error) {
  if (error.code === '23505') throw new ApiError(409, 'You have already submitted your vote for this event')
  throw new ApiError(500, error.message)
}
if (committed === false) {
  throw new ApiError(409, 'You have already submitted your vote for this event')
}
```

The post-commit stats recompute + websocket emits stay as-is.

**Safe because:**
- The migration is purely additive — the old code path still works until the backend deploys, so **migration can go out ahead of backend with zero impact**.
- The unique constraint `election_votes_unique_ballot` remains the last line of defense.
- Behavior is *identical* on the happy path; the only difference is the failure mode changes from "voter locked out, no votes" to "nothing committed, voter can retry."

**Rollback:** revert the backend commit → old code calls resume working against the same schema (function simply goes unused). The migration itself need not be rolled back.
**Verification:**
- Phase-0 double-vote and happy-path tests stay green.
- New test: simulate an insert failure (e.g., a candidate_id violating FK) → assert `has_voted` remains `FALSE` **and** no `election_votes` rows exist (proves atomic rollback).
- Load test: N concurrent submissions for one voter → exactly one succeeds.

---

## Phase 3 — Voting nonce: wire it up, or remove it honestly (§3.2)

Pick **one**. Recommended: **3-A (enforce)** since the column and generation already exist.

**Option 3-A — Enforce (preferred):**
- `election.validator.js` `validateBallot`: preserve the nonce —
  ```js
  return { selections: normalized, votingNonce: body?.votingNonce ?? null }
  ```
- `election-voter.controller.js`: pass the whole object through.
- `submitBallot`: read `payload.votingNonce`, and **fail closed** only when a nonce exists on the enrollment and the submitted one mismatches (keep it lenient for legacy in-flight ballots for one release, then tighten).
- Keep the RPC clearing `voting_nonce = NULL` on success (already in Phase 2) so a replay after success finds no nonce.

**Option 3-B — Remove:** delete the nonce generation in `getVoterBallot`, the dead comparison, and drop the column in a later additive-safe migration. Update analysis/docs so nothing advertises replay protection.

**Safe because:** the atomic `has_voted` guard from Phase 2 already prevents double votes, so this phase is not load-bearing for integrity — it can roll out calmly and be reverted freely. Ship the lenient version first; flip to strict only after logs confirm real clients always send a matching nonce.
**Verification:** test that a mismatched nonce is rejected (3-A) or that the field is fully gone (3-B); double-vote test still green either way.

---

## Phase 4 — Voting-window & results-visibility semantics (§6.1, §6.2)

These are **behavioral** changes to *when voting opens* and *when results show* — the highest-blast-radius edits.

**4a. `status==='active'` bypasses `start_date` (§6.1) — ✅ DECIDED & IMPLEMENTED (Option B)**
- **Product decision (2026-08-30):** the **schedule is authoritative**. A future `start_date` holds voting closed even after an organizer manually enables voting — enabling early only "arms" the election; it opens when `start_date` arrives.
- **Implemented** in `isElectionVotingOpen` (`backend/src/utils/eventSchedule.js`): added `if (event.start_date && new Date(event.start_date) > now) return false` *before* the `status === 'active'` short-circuit. When no `start_date` is set, the manual toggle retains immediate control (unchanged).
- Because `getVoterBallot` returns `votingOpen` from this function and the voter UI reads `ballot.votingOpen` (`VoterEventPage.jsx:217`), the frontend inherits the fix with no code change. The previously-unreachable "Voting has not started yet" 403 in `submitBallot` (`election.service.js:813`) is now correctly reachable.
- **Tests:** `backend/__tests__/utils/eventSchedule.test.js` extended — armed-but-not-started → closed; started+active → open; no-schedule+active → open; passed end_date → closed. Full suite green (8/8).
- **Rollback:** single-file revert of the `eventSchedule.js` guard restores prior behavior; no schema/data involved.
- **Note (feeds Phase 4b):** with Option B, a `public`-visibility event before its start now reports `canViewResults = true` — harmless today (zero votes exist pre-start), but confirms 4b should gate public results on a *finalized* state, not on the transient voting flag.

**4b. "Public" results leak on pause (§6.2)**
- Change `canVoterViewElectionResults` `public` branch to reveal only when `election_status IN ('finalized','completed')` rather than `!isElectionVotingOpen`. Guard with the same flag pattern.

**Safe because:** flag-default = no change; each toggle is independently observable and instantly reversible by flipping the flag (no redeploy).
**Verification:** unit tests for both branches under flag on/off; manual QA: pause voting mid-election → results stay hidden with flag on.

---

## Phase 5 — Dashboard cache: correctness + scale (§5.3)

Two safe sub-steps, either alone is an improvement:

- **5a (minimal, ship now):** invalidate on write. Add `dashboardCache.delete(organizerId)` inside `createElectionEvent`, `updateElectionEvent`, `setEventVoting`, `finalizeElectionEvent`, and on vote commit (via the organizer id already resolved in `submitBallot`). Removes the stale-30s window.
- **5b (for horizontal scaling):** move the cache to Redis (shared) **or** delete the cache entirely and rely on the indexed count queries + existing websocket refresh. Recommended: **delete it** unless profiling shows the dashboard query is hot — the counts are all indexed.

**Safe because:** cache is a read-optimization; removing or invalidating it cannot corrupt data, only changes latency.
**Verification:** create an event → dashboard reflects it immediately; run two backend instances → stats consistent across both.

---

## Phase 6 — Consistency & dead-code cleanup (§5.2, §5.6)

Low-risk hygiene, batch into one PR:
- Extract `getElectionTallies(eventId)` + `formatTurnout()`; use in dashboard, results, and `submitBallot` so turnout math/rounding agree everywhere.
- Remove `minVote` from `duplicateElectionEvent` (`:1206`); remove unused `validateUUID` import (done in Phase 1); add explicit `import { randomUUID } from 'node:crypto'`.
- Decide the timeline source of truth: either use the `v_election_vote_timeline` view or delete it and keep the JS bucketing — not both.

**Safe because:** no external contract change; covered by Phase-0 tests plus a turnout-parity assertion.
**Verification:** a test asserting dashboard turnout === results turnout === websocket turnout for the same fixture.

---

## Phase 7 — Structural refactor (last, optional) (§5.1, §5.7)

Only after Phases 1–6 are stable:
- Split `election.service.js` into `election-events.service.js`, `election-ballot.service.js`, `election-analytics.service.js` (pure move-file + re-export shim so imports don't break in one step).
- Adopt react-query on the 7 organizer pages incrementally (one page per PR); wire `page`/`limit` through `listVoters`.

**Safe because:** mechanical, behavior-preserving; the re-export shim keeps every existing import path valid during the transition.
**Verification:** full suite green after each extraction; no route or response shape changes.

---

## Deployment & Rollback Summary

| Phase | Ship order | Rollback |
|:-----:|-----------|----------|
| 0 | tests + CI | inert |
| 1 | backend only | `git revert` (1 file) |
| 2 | **migration → backend** | revert backend; leave fn (unused) |
| 3 | backend (+ FE if 3-A) | revert; lenient-first de-risks |
| 4 | backend, flag **off** → flip later | flip flag off (no redeploy) |
| 5 | backend only | revert; cache is non-durable |
| 6 | backend only | `git revert` |
| 7 | many small PRs | revert per PR |

## Definition of Done (production-ready gate)
- [ ] Phase 0 suite green in CI and blocking merges.
- [ ] `register-existing` returns 400 on bad email (Phase 1).
- [ ] Atomic-rollback test proves no "locked-out, zero votes" state (Phase 2).
- [ ] Nonce path either enforced-and-tested or removed-and-undocumented (Phase 3).
- [ ] Cache invalidates on writes or is removed; verified across 2 instances (Phase 5).
- [ ] Turnout parity test passes (Phase 6).
- [ ] No live election in its voting window during Phase 2 deploy.
