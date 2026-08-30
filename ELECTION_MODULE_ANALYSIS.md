# Election Module — Design Smell & Production Readiness Analysis

**Date:** 2026-08-30
**Scope:** The Votrix Election module — backend service/controllers/validators/routes/migrations and the frontend organizer & voter surfaces.
**Verdict:** ⚠️ **Not production-ready as-is.** The module is well-structured at the routing/auth layer and has good instincts (atomic double-vote guard, audit logging, vote-guarded deletes), but it carries **three high-severity defects** (a crashing endpoint, a dead security control, and a non-transactional ballot write) plus several structural smells that undermine confidence for a system whose core promise is vote integrity.

---

## 1. Files Reviewed

| Layer | File | LOC |
|-------|------|-----|
| Service (core) | `backend/src/services/election.service.js` | 1270 |
| Controller (organizer) | `backend/src/controllers/election-organizer.controller.js` | 302 |
| Controller (voter) | `backend/src/controllers/election-voter.controller.js` | 28 |
| Validator | `backend/src/validators/election.validator.js` | 139 |
| Routes | `backend/src/routes/election-organizer.routes.js` / `election-voter.routes.js` | 63 / 14 |
| Schedule logic | `backend/src/utils/eventSchedule.js` | 44 |
| Migrations | `004`, `013`, `032`, `033_*` | — |
| Frontend service | `frontend/src/services/election.service.js` | 153 |
| Frontend pages | `frontend/src/pages/organizer/election/*.jsx` (7 pages) | ~2089 |
| Frontend voter | `frontend/src/pages/voter/VoterEventPage.jsx` | — |

---

## 2. Scorecard

| Dimension | Rating | Notes |
|-----------|:------:|-------|
| **Correctness** | 🔴 Poor | Crashing endpoint; non-atomic vote write |
| **Security** | 🟠 Fair | Auth layering strong, but advertised replay protection is dead code |
| **Vote integrity** | 🟠 Fair | Atomic double-vote guard is good; multi-row write is not transactional |
| **Maintainability** | 🟠 Fair | God-service (1270 LOC), duplicated aggregation logic |
| **Testability / Coverage** | 🔴 Poor | No automated tests exercise the election/ballot path |
| **Scalability** | 🟠 Fair | In-process cache defeats horizontal scaling |
| **Observability** | 🟡 Adequate | Audit log good; only `console.error` for failures |
| **Auth / Access control** | 🟢 Good | `authenticate → authorize(role) → requireActiveAccount → requirePasswordChanged → requireProfileComplete` |
| **Input validation** | 🟢 Good | Dedicated validator layer, UUID route guards, rate limits |

---

## 3. High-Severity Findings (fix before production)

### 3.1 ✅ RESOLVED (2026-08-30) — `registerExistingVoter` references an undefined `EMAIL_RE` → guaranteed crash
**Fix:** replaced the undefined `EMAIL_RE.test(...)` with the shared `validateEmailField(email)` (which throws `ApiError(400)`), and removed the unused `validateUUID` import. See Phase 1.


**File:** `election-organizer.controller.js:187`

```js
const email = sanitizeEmail(rawEmail)
if (!EMAIL_RE.test(email)) {        // ❌ EMAIL_RE is never imported or defined
  throw new ApiError(400, 'Invalid email format')
}
```

Imports at the top are `{ sanitizeEmail, validateUUID }` — there is no `EMAIL_RE`. Any call to `POST /organizer/election/events/:eventId/voters/register-existing` throws `ReferenceError: EMAIL_RE is not defined`, which surfaces as an opaque **500**, not the intended 400. The endpoint is effectively broken for every input. (`validateUUID` is imported but never used — the dead import is the tell that this file drifted.)

**Smell:** *Broken code path guarded by no test* — a linter/test would have caught this.

---

### 3.2 ✅ RESOLVED (2026-08-30) — Ballot **replay-protection nonce is dead code** (security theater)
**Fix:** `validateBallot` now returns `{ selections, votingNonce }` instead of dropping the nonce; the controller forwards the whole object; `submitBallot`'s comparison now actually runs (lenient: rejects only on a present-but-mismatched nonce, tighten later). See Phase 3.


**Files:** `election.validator.js:119` (`validateBallot`), `election-voter.controller.js:20`, `election.service.js:796` (`submitBallot`)

The chain is broken end-to-end:

1. Frontend correctly sends `{ selections, votingNonce }` (`VoterEventPage.jsx:191`).
2. `validateBallot(req.body)` iterates only `body.selections` and returns a **normalized object that drops `votingNonce`** (`election.validator.js:124-131`).
3. The controller passes that stripped object into `submitBallot` (`election-voter.controller.js:21-26`).
4. `submitBallot` then reads `payload?.votingNonce` — which is now **always `undefined`** — so the guard

```js
if (enrollment.voting_nonce && submittedNonce && submittedNonce !== enrollment.voting_nonce) { ... }
```

**never executes.** Migration `033` even adds a `DEFAULT gen_random_uuid()` nonce column and backfills it, and `getVoterBallot` generates one — all of that effort protects nothing, because the token never reaches the comparison.

The system is saved only because the *real* guard is the atomic `has_voted=false → true` conditional UPDATE (§4.1). But the codebase, migrations, and comments all advertise "replay protection" that does not work. For an election product this is a **false assurance** and should be either wired up correctly (validate & forward the nonce) or removed honestly.

**Smell:** *Speculative generality / dead security control* — infrastructure built and documented for a check that is unreachable.

---

### 3.3 ✅ RESOLVED (2026-08-30) — Ballot submission is **not atomic** (no DB transaction)
**Fix:** the two-step write + hand-rolled compensation is replaced by a single transactional Postgres function `cast_election_ballot(event, voter, votes)` (migration `059`) called via `getClient().rpc(...)`. The flag flip and vote insert now commit all-or-nothing; a failure rolls back both, so the "locked-out with zero votes" state is impossible. See Phase 2.


**File:** `election.service.js:879-909`

The write is two independent round-trips with a hand-rolled compensating action:

```js
// 1) flip the flag
const { data: locked } = await getClient()
  .from(EVENT_PARTICIPANTS).update({ has_voted: true, voting_nonce: null })
  .eq(...).eq('has_voted', false).select('id')
...
try {
  // 2) insert the vote rows
  await getClient().from(ELECTION_VOTES).insert(voteRows)
} catch (err) {
  // 3) manual rollback
  await getClient().from(EVENT_PARTICIPANTS).update({ has_voted: false })...
  throw err
}
```

Because these are separate network calls (not a single transaction), a process crash, connection drop, or failure of the compensating update between steps 1 and 3 leaves the voter **marked as voted with zero ballots recorded** — permanently disenfranchised with no recovery path. The reverse hazard (rows inserted, flag left true, but partial) is bounded by the unique constraint, but the "locked-out with no vote" case is real and, in an election, unacceptable.

**Recommendation:** Move the flag-flip + vote insert into a single Postgres transaction / RPC (`pg` transaction or a Supabase stored procedure) so the ballot commits all-or-nothing.

**Smell:** *Temporal coupling* + missing transactional boundary on the most integrity-critical operation in the product.

---

## 4. What the Module Gets Right (context for the above)

- **4.1 Atomic double-vote guard.** `submitBallot` gates on `.eq('has_voted', false)` in the UPDATE and treats an empty result as "already voted" (`election.service.js:879-890`). This is the correct, race-safe pattern and is the module's real integrity backbone.
- **Vote-guarded deletes.** `deletePosition` / `deleteCandidate` refuse (409) when votes exist (`:411-420`, `:575-583`).
- **Audit trail.** `recordAudit` on every mutating action (create/update/delete/finalize/duplicate/voting-toggle).
- **Strong auth layering.** Election routes sit behind role authorization, active-account, password-changed, and profile-complete middleware (`organizer.routes.js:15-26`).
- **Rate limiting** on uploads, CSV import, email, and voting (`election-*.routes.js`).
- **DB hygiene.** Unique ballot constraint, FK `ON DELETE CASCADE`, and targeted indexes (`004_election_module.sql`).
- **Image-asset cleanup** with reference counting on banner/photo replacement.

---

## 5. Design Smells (structural)

### 5.1 🟠 Large Class / God Service — `election.service.js` (1270 LOC)
One module owns events, positions, candidates, voter lists, invitations glue, voting, results analytics, time-series analytics, ballot preview, event duplication, and finalization. This is a classic **Divergent Change** magnet: a change to any of these concerns forces edits in the same file. Split into `election-events`, `election-ballot`, and `election-analytics` services.

### 5.2 ✅ RESOLVED (2026-08-30) — Duplicated aggregation + inconsistent turnout math
**Fix:** all three call sites now use a single `computeTurnoutRate(voted, total)` helper (2-dp number), so dashboard, results, and the websocket payload agree. See Phase 6.

**Original finding:**

Turnout is computed in at least three places with **two different rounding conventions**:
- `getOrganizerDashboard` → `Math.round((voted/registered)*10000)/100` (2-dp number) — `:109`
- `fetchElectionResultsData` → same convention — `:1042`
- `submitBallot` → `((votedCount/totalVoters)*100).toFixed(1)` (**string, 1-dp**) — `:944`

The same "count participants / count voted / count votes" trio of head-count queries is re-issued in the dashboard, in `submitBallot`, and in `fetchElectionResultsData`. Extract one `getElectionTallies(eventId)` helper and one `formatTurnout()` so numbers agree across dashboard, results, and websocket payloads.

### 5.3 🟡 PARTIALLY RESOLVED (2026-08-30) — Non-invalidated, process-local dashboard cache
**Fix:** an `invalidateDashboardCache(organizerId)` now fires on create/update/voting-toggle/finalize and on each vote, eliminating the stale-30s window. **Still open:** the cache remains process-local (a shared store / removal is still needed before horizontal scaling). See Phase 5.

**Original finding:**

**File:** `election.service.js:44-56, 125`

```js
const dashboardCache = new Map()   // module-level
const DASHBOARD_CACHE_TTL = 30_000
```

- **Never invalidated on writes** — `grep` shows only `.get`/`.set`, no `.delete`. Creating an event, opening voting, or a vote landing does not bust the cache; the organizer sees stale stats for up to 30s despite real-time websocket events firing elsewhere. That is a **jarring inconsistency** with the app's live-update design.
- **Process-local** — breaks the moment the API runs more than one instance (each replica has its own map; a user's requests hit different caches). This is a direct **horizontal-scaling** blocker.
- **Unbounded** — one entry per organizer, never evicted → slow memory leak.

Move to a shared store (Redis) or drop the cache and rely on indexed count queries + the existing websocket refresh.

### 5.4 🟡 PARTIALLY RESOLVED (2026-08-30) — Long Method — `submitBallot` (~170 LOC)
**Fix:** the two `await import()` calls mid-request are gone — `emitToUser`/`emitToRole` are hoisted to the top-level import, and the atomic RPC collapsed the ~30-line lock/insert/compensate block. The method is shorter but could still be split into "validate / commit / notify". See Phase 6.

**Original finding:**

It validates, re-fetches candidates, locks, inserts, compensates, recomputes three tallies, and fires **three** websocket emits — two via **`await import()` inside the handler** (`:957`, `:962`). Dynamic imports mid-request are a code smell (they hide dependencies and add per-call resolution cost). Hoist the imports and extract the "post-commit notification" block.

### 5.5 🟡 Polymorphic / defensive input shapes (Primitive Obsession)
`submitBallot` accepts `payload?.selections || payload` and `payload?.votingNonce || payload?._votingNonce` (`:801-807`), and the frontend `submitVote` re-wraps `{ selections }` conditionally (`election.service.js:146`). The endpoint tolerates several ballot shapes, which is why the nonce silently vanished (§3.2). Pin one contract in the validator and reject the rest.

### 5.6 🟡 PARTIALLY RESOLVED (2026-08-30) — Dead code & speculative generality
**Fixed:** removed the unused `validateUUID` import; removed the ignored `minVote` from `duplicateElectionEvent`; added an explicit `import { randomUUID } from 'node:crypto'`. **Still open (low priority):** the unused `v_election_vote_timeline` view vs JS bucketing, and the `party`/`partylist` dual-naming.

**Original finding:**

- `validateUUID` imported, never used (`election-organizer.controller.js:15`).
- `duplicateElectionEvent` passes `minVote` to `createPosition` (`:1206`) — a field that no longer exists (comment in validator says "minVote removed") and is ignored.
- DB view `v_election_vote_timeline` (`032`) is created but **unused** — `getElectionVotingTimeline` re-buckets timestamps in JS (`:1126-1143`), duplicating the view's logic.
- `party` vs `partylist` dual-naming carried through mapper, validator, and duplication (`:38-41`, `:104-116`) — a backward-compat workaround that has metastasized across layers.
- `crypto.randomUUID()` used without importing `crypto` (`:724`) — works on the Node 20 global, but relies on an implicit global rather than an explicit `import`.

### 5.7 🟡 Frontend: repeated manual fetch triad, no query layer
Across the 7 organizer election pages: **57 `useState` + 19 `useEffect`, zero `react-query`/`useQuery`**. Every page re-implements the `loading / error / data` fetch-effect by hand (e.g. `BallotPreviewModal`, `ElectionEventsPage.jsx:14-24`), with no caching, dedup, or retry. Also, backend `listEventVoters` supports `page`/`limit` pagination, but the frontend `listVoters(eventId)` never passes them (`election.service.js:77`) — the pagination is built but unreachable from the UI, so large voter lists load a single unpaginated page.

---

## 6. Behavioral / Domain Correctness Issues

### 6.1 ✅ RESOLVED (2026-08-30) — `status === 'active'` short-circuits the schedule window
**Resolution:** Product chose **Option B (schedule is authoritative)**. `isElectionVotingOpen` now returns `false` when `start_date` is in the future, even for manually-enabled/`active` events; enabling voting early only "arms" it. Voting opens when `start_date` arrives (or immediately if no `start_date` is set). Covered by `eventSchedule.test.js`. See Phase 4a of the remediation plan.

**Original finding:**
**File:** `eventSchedule.js:11-16`

```js
export function isElectionVotingOpen(event, now) {
  if (!event.voting_enabled) return false
  if (event.end_date && new Date(event.end_date) < now) return false
  if (event.status === 'active') return true          // ← bypasses start_date
  return isWithinEventSchedule(event, now)
}
```

`setEventVoting` sets `status='active'` whenever voting is enabled (`election.service.js:283`). So once an organizer opens voting, a **future `start_date` is ignored** — voting is open immediately regardless of the scheduled start. If scheduled starts are a supported feature, this contradicts it.

### 6.2 ✅ RESOLVED (2026-08-30) — "Public" results can leak the moment voting is paused
**Fix:** `canVoterViewElectionResults` no longer gates `public` on the transient `!isElectionVotingOpen`. It now reveals results only once the election has genuinely concluded — `end_date` passed, or `status === 'completed'` / `election_status ∈ {finalized, closed, archived}`. Pausing voting no longer exposes partial results. See Phase 4b.

**Original finding:**

`canVoterViewElectionResults` returns, for `public` visibility, `!isElectionVotingOpen(event)` (`eventSchedule.js:43`). If an organizer merely toggles `voting_enabled=false` mid-election (a pause, not a close), `isElectionVotingOpen` becomes false and **public results immediately become visible to voters** before the election is actually finalized. Consider gating public results on `election_status === 'finalized'`/`completed` rather than on the transient voting toggle.

---

## 7. Production Readiness Checklist

| Item | Status | Comment |
|------|:------:|---------|
| Core happy-path works | 🟠 | Works, but `register-existing` endpoint is broken (§3.1) |
| Vote integrity under failure | 🔴 | Non-atomic write can disenfranchise a voter (§3.3) |
| Advertised security controls functional | 🔴 | Nonce replay-protection is dead (§3.2) |
| Automated test coverage | 🔴 | No tests touch election/ballot/vote paths |
| Horizontal scalability | 🟠 | In-process cache must move to shared store (§5.3) |
| Auth & authorization | 🟢 | Solid middleware chain |
| Rate limiting | 🟢 | Present on sensitive routes |
| Input validation | 🟢 | Dedicated validators + UUID route guards |
| Audit logging | 🟢 | Comprehensive |
| Structured observability/metrics | 🟡 | Only `console.error`; no metrics/alerting on vote failures |
| Data-model constraints/indexes | 🟢 | Unique ballot constraint, cascades, indexes |
| Consistent numeric reporting | 🟡 | Turnout rounding diverges across surfaces (§5.2) |

---

## 8. Prioritized Recommendations

**P0 — must fix before any real election runs**
1. Fix `EMAIL_RE` crash in `registerExistingVoter` (reuse the shared email regex/validator). (§3.1)
2. Make ballot submission atomic — single transaction/RPC for the `has_voted` flip + vote insert. (§3.3)
3. Either wire the voting nonce through (`validateBallot` must preserve it and `submitBallot` must enforce it) or remove the nonce machinery and stop advertising replay protection. (§3.2)
4. Add integration tests for the ballot path: single vote, double-vote rejection, closed-voting rejection, invalid candidate/position, and the failure-rollback case.

**P1 — before scale / launch**
5. Replace the in-process `dashboardCache` with a shared cache **and** invalidate it on writes, or drop it. (§5.3)
6. Reconcile the `status==='active'` vs scheduled-`start_date` semantics. (§6.1)
7. Gate `public` results on a finalized state, not on the transient voting toggle. (§6.2)
8. Unify turnout computation and rounding in one helper. (§5.2)

**P2 — maintainability**
9. Split `election.service.js` into events / ballot / analytics services. (§5.1)
10. Adopt a query layer (react-query) on the organizer pages; wire voter-list pagination through the UI. (§5.7)
11. Remove dead code (`validateUUID` import, `minVote` in duplication, unused timeline view or the JS re-bucketing), add an explicit `crypto` import, and pin a single ballot payload contract. (§5.5, §5.6)

---

## 9. Bottom Line

The election module is **architecturally sound at the edges** (routing, auth, validation, auditing, and — critically — the atomic double-vote guard) but **fragile at its integrity core**. The two guarantees an election system exists to provide — *every cast vote is durably recorded* and *the anti-replay control actually works* — are currently not met: the ballot write is non-transactional, and the nonce check is unreachable. Combined with a crashing voter-registration endpoint and the complete absence of tests on the voting path, the module needs the four P0 items closed before it can be trusted with a live election. The design smells (God service, uninvalidated cache, duplicated tallies) are real but secondary; they raise the cost of change rather than threaten correctness, and can follow once the integrity fixes and a test harness are in place.
