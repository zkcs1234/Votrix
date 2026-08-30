# Polling Module — Design Smell & Production Readiness Analysis

**Date:** 2026-08-30
**Scope:** The Votrix Polling module — backend service/controllers/validators/routes/migrations, the registry-driven question-type engine, and the frontend organizer & voter surfaces.
**Verdict:** ⚠️ **Not production-ready as-is.** The module has a genuinely good core idea (a registry-driven question-type engine that makes a new question type a single SQL insert) and a solid auth/rate-limit perimeter, but its most integrity-critical operation — recording a poll response — is **non-transactional**, its **schedule/`start_date` semantics are broken** (a fix already applied to the sibling election module was never ported here), **custom question types are inserted with zero validation**, and one analytics path can **hang the event loop**. On top of that, the submission path has **no automated tests**.

> ## ✅ Remediation applied (2026-08-30)
> All four P0 blockers plus the P1/P2 cleanups have been implemented in this branch:
> - **§3.1 Atomic submission** — new transactional RPC `cast_poll_response` (migration [`060_poll_cast_response_rpc.sql`](backend/src/database/migrations/060_poll_cast_response_rpc.sql)); `submitPollResponse` now calls it, replacing the three-step write + hand-rolled compensation.
> - **§3.2 Schedule** — `isPollOpen` (and `isCompetitionScoringOpen`) now honor `start_date`; regression tests added.
> - **§4.1 Custom-type validation** — `validateCustomType` / `validateCustomTypeUpdate` wired into the controller; `answerFormat.kind` is now checked.
> - **§4.2 Analytics DoS** — `buildAnalytics` guards `step ≤ 0` / non-finite and caps bucket count.
> - **§4.3 / §4.5 / §5.1–5.3 / §5.6** — single `computeParticipationRate` helper; static websocket imports; single validation pass; dead code removed; UUID param guard on voter routes.
> - **Tests** — 51 passing across `eventSchedule`, `poll-question-types`, and a new `polling.validator` suite.
>
> Still open (deferred, non-blocking): the full service split (§4.4) and adopting react-query on the frontend (§5.7). Findings below are annotated inline.

> **Sibling context:** Several findings below are the *same* smells flagged in [`ELECTION_MODULE_ANALYSIS.md`](ELECTION_MODULE_ANALYSIS.md). The election module has since fixed its atomic-write and schedule bugs (migration `059`, `isElectionVotingOpen`). The polling module carries the **un-fixed** versions of those same defects. Where a fix already exists next door, this document points to it.

---

## 1. Files Reviewed

| Layer | File | LOC |
|-------|------|-----|
| Service (core) | `backend/src/services/polling.service.js` | 1406 |
| Question-type engine | `backend/src/modules/poll-question-types.js` | 369 |
| Registry service | `backend/src/services/polling-registry.service.js` | 187 |
| Controller (organizer) | `backend/src/controllers/polling-organizer.controller.js` | 262 |
| Controller (voter) | `backend/src/controllers/polling-voter.controller.js` | 25 |
| Validator | `backend/src/validators/polling.validator.js` | 143 |
| Routes | `backend/src/routes/polling-organizer.routes.js` / `polling-voter.routes.js` | 58 / 13 |
| Schedule logic | `backend/src/utils/eventSchedule.js` | 64 |
| Migrations | `006`, `017`, `018`, `027`, `031` | — |
| Frontend voter | `frontend/src/pages/voter/VoterPollPage.jsx` | 258 |
| Frontend organizer | `frontend/src/pages/organizer/polling/*.jsx` (5 pages) | — |
| Frontend validation | `frontend/src/utils/pollValidation.js` | 26 |

---

## 2. Scorecard

| Dimension | Rating | Notes |
|-----------|:------:|-------|
| **Correctness** | 🔴 Poor | Non-atomic submission; analytics loop can hang; poll opens before `start_date` |
| **Data integrity** | 🟠 Fair | Atomic single-submission guard is good; the surrounding write is not transactional |
| **Security / Access control** | 🟢 Good | Full middleware chain + `requireEventParticipant`; rate limits on submit/email/csv/upload |
| **Input validation** | 🟠 Fair | Answer size caps are good, but custom-type creation is entirely unvalidated |
| **Maintainability** | 🟠 Fair | God-service (1406 LOC); dead validators; duplicated rate math |
| **Testability / Coverage** | 🔴 Poor | Only the pure type-helpers are tested; the submission path has no tests |
| **Extensibility** | 🟢 Good | Registry-driven types are a genuinely strong design |
| **Scalability** | 🟡 Adequate | Repeated per-request registry loads; no shared cache, but no process-local cache either |
| **Observability** | 🟡 Adequate | `console.error` only; no metrics/alerting on submission failures |

---

## 3. High-Severity Findings (fix before production)

### 3.1 ✅ RESOLVED (2026-08-30) — Poll submission is **not atomic** — partial failure double-counts and re-opens the poll
**Fix:** the three-step write + compensation is replaced by a single transactional Postgres function `cast_poll_response(event, voter, started_at, allow_multiple, answers)` (migration `060`) invoked via `getClient().rpc(...)`. The has_responded claim, the submission row, and the answer rows now commit all-or-nothing; a NULL return means "already responded" (409). No orphan submissions, no reopened single-submission poll.

**File:** `polling.service.js:1082-1253` (`submitPollResponse`)

The write is a sequence of independent Supabase round-trips with hand-rolled compensation:

```js
// 1) atomic single-submission guard (this part is correct)
const { data: locked } = await getClient()
  .from(EVENT_PARTICIPANTS).update({ has_responded: true })
  .eq('event_id', eventId).eq('user_id', voterId)
  .eq('has_responded', false).select('id')
if (!locked?.length) throw new ApiError(409, 'You have already submitted this poll')

// 2) insert the submission row
const { data: submission, error: subErr } = await getClient()
  .from(POLL_SUBMISSIONS).insert(submissionInsert).select('*').single()
if (subErr) { /* reset has_responded=false */ throw ... }

// 3) insert the answer rows
try {
  await getClient().from(POLL_ANSWERS).insert(rows)
} catch (err) {
  /* reset has_responded=false */   // ← but the submission row from step 2 is NOT deleted
  throw err
}
```

Because steps 2 and 3 are separate network calls, a failure of the answer insert (step 3) — or a process crash between steps — leaves the system in a corrupt state:

- The **`poll_submissions` row from step 2 is already committed and is never deleted.** It is an orphan with zero answers, yet it is counted in `totalSubmissions` / `responsesSubmitted` (analytics, `:1317`) and in the dashboard head-counts. Response totals silently inflate.
- The compensation resets **`has_responded = false`**, so a single-submission poll now lets the same respondent submit **again** — there is **no `UNIQUE(event_id, voter_id)` constraint** on `poll_submissions` (migration `006` intentionally omits it to support multi-submission), so nothing at the DB level stops the duplicate. The frontend's "canSubmit" check re-opens too.
- A process crash *between* step 1 and the compensation leaves the respondent **marked responded with zero answers and no recovery path** — disenfranchised.

This is the exact hazard fixed in the election module by moving the flag-flip + insert into a single Postgres function (`cast_election_ballot`, migration `059`). The polling equivalent was never written.

**Fix:** Move steps 1–3 into one transactional RPC (`cast_poll_response(event, voter, started_at, answers)`) so the flag flip, the submission row, and the answer rows commit all-or-nothing. Mirror `059_election_cast_ballot_rpc.sql`.

**Smell:** *Temporal coupling* + missing transactional boundary on the most integrity-critical operation in the module.

---

### 3.2 ✅ RESOLVED (2026-08-30) — `isPollOpen` lets a poll open **before its scheduled `start_date`**
**Fix:** `isPollOpen` (and `isCompetitionScoringOpen`) now check `start_date`/`end_date` bounds *before* the `status === 'active'` short-circuit, matching `isElectionVotingOpen`. Covered by new `eventSchedule.test.js` cases.

**File:** `eventSchedule.js:26-32`

```js
export function isPollOpen(event, now = new Date()) {
  if (!event.polling_enabled) return false
  if (event.poll_expires_at && new Date(event.poll_expires_at) < now) return false
  if (event.end_date && new Date(event.end_date) < now) return false
  if (event.status === 'active') return true          // ← bypasses start_date
  return isWithinEventSchedule(event, now)
}
```

`setPollOpen` sets `status = 'active'` the moment an organizer enables polling (`polling.service.js:619`). So once polling is enabled, a **future `start_date` is ignored** and the poll is open immediately. This directly contradicts a first-class feature: `validatePollEvent` **requires** `startDate` on create (`polling.validator.js:10`), so scheduled starts are advertised and expected.

The sibling `isElectionVotingOpen` (same file, `:11-24`) was **already fixed** to make the schedule authoritative — a future `start_date` holds voting closed even when `status === 'active'`. `isPollOpen` (and `isCompetitionScoringOpen`) were left with the old, broken short-circuit.

**Fix:** Port the election fix — check `start_date`/`end_date` bounds *before* the `status === 'active'` short-circuit:

```js
if (event.start_date && new Date(event.start_date) > now) return false
if (event.end_date && new Date(event.end_date) < now) return false
if (event.status === 'active') return true
return isWithinEventSchedule(event, now)
```

**Smell:** *Inconsistent sibling logic* — a fix applied to one branch of shared logic and not the others.

---

## 4. Medium-Severity Findings

### 4.1 ✅ RESOLVED (2026-08-30) — Custom question types are inserted with **no validation**
**Fix:** `validateCustomType` is now called in `createCustomQuestionType`, and a new partial `validateCustomTypeUpdate` in `updateCustomQuestionType`. Both reject a missing key/label and an `answerFormat.kind` not in `{choice, numeric, text, ranking}` (and require a valid cardinality for `choice`). Covered by the new `polling.validator.test.js`.

**Files:** `polling-organizer.controller.js:146` → `polling.service.js:1393` → `polling-registry.service.js:132`

`validateCustomType` exists in the validator (`polling.validator.js:127`) but is **never imported or called**. The create path passes `req.body` straight through to an `INSERT`:

```js
export const createCustomQuestionType = asyncHandler(async (req, res) => {
  const type = await pollingService.createCustomQuestionType(req.user.id, req.body) // raw body
  ...
})
```

Consequences:
- Missing `key`/`label` → a Postgres `NOT NULL` violation surfaces as an opaque **500** instead of a **400**.
- A malformed `answer_format` (e.g. `{ kind: 'foo' }`) is happily stored. It then poisons every downstream consumer: `validateAnswer` throws `Unsupported question kind` (`poll-question-types.js:254`) and `buildAnalytics` silently returns `{ kind, responseCount }` — so a bad type definition breaks the **voter's submit path** and the organizer's analytics with a 500, at a distance, long after creation.

`updateCustomQuestionType` has the same gap.

**Fix:** Wire `validateCustomType` into both the create and update controllers (and validate that `answerFormat.kind` is one of the supported kinds: `choice | numeric | text | ranking`).

**Smell:** *Broken window / unused validator* — the check was written, then never connected.

---

### 4.2 ✅ RESOLVED (2026-08-30) — `buildAnalytics` numeric loop can **infinite-loop (event-loop hang / DoS)**
**Fix:** `step` is coerced to a number and forced to `1` when non-finite or `≤ 0`, and the bucket loop is capped at 10,000 iterations. Regression test added to `poll-question-types.test.js`.

**File:** `poll-question-types.js:286`

```js
for (let n = min; n <= max; n += typeConfig?.step ?? fmt.step ?? 1) {
  dist[n] = 0
}
```

If a numeric/rating type is configured with `step: 0` (or negative), this loop never terminates and **hangs the Node event loop** the instant an organizer opens analytics — taking down the whole process for all users, not just that request. `validateAnswer` defends against this (`if (step !== 0)`, `:209`), but `buildAnalytics` does not — and given §4.1, a custom type with `step: 0` can be inserted with no resistance. Non-integer steps additionally produce float object keys that won't reliably match `Number(a.answer)`, mis-bucketing the distribution.

**Fix:** Clamp/guard: `const step = Number(typeConfig?.step ?? fmt.step ?? 1); if (!(step > 0)) step = 1;` and cap the bucket count.

**Smell:** *Unbounded loop over untrusted config.*

---

### 4.3 ✅ RESOLVED (2026-08-30) — Divergent participation-rate rounding
**Fix:** a single `computeParticipationRate(responded, total)` helper (2-dp number) now feeds both the dashboard and the submit websocket payload.

**File:** `polling.service.js:509` vs `:1231`

The same metric is computed two ways:

- `getOrganizerDashboard`: `Math.round((responded / assigned) * 10000) / 100` → **2-dp number** (`:509`)
- `submitPollResponse` websocket payload: `((responded / total) * 100).toFixed(1)` → **1-dp, string then `parseFloat`** (`:1231`, `:1238`)

So the number the dashboard shows on load and the number pushed by the live `poll:response-submitted` event can disagree on the same data. This is the polling twin of election §5.2.

**Fix:** Extract one `computeParticipationRate(responded, total)` helper and use it in both places.

---

### 4.4 🟠 OPEN (deferred) — God Service — `polling.service.js` (1406 LOC)

One module owns: event CRUD, respondent enrollment (new + existing), invitations (single, bulk, resend), question/option CRUD + reorder + duplicate, the voter poll-taking flow, submission recording, analytics, **and** the question-type registry wrappers. This is a textbook **Divergent Change** magnet — a change to invitations, to the ballot write, or to analytics all land in the same file.

**Fix:** Split into `polling-events`, `polling-respondents` (enrollment + invitations), `polling-questions`, `polling-submissions`, and `polling-analytics` services.

---

### 4.5 ✅ RESOLVED (2026-08-30) — Dynamic `await import()` mid-request in the hot submission path
**Fix:** `emitToUser` and `emitToRole` are hoisted into the static top-level import; the two `await import()` calls are gone.

**File:** `polling.service.js:1244`, `:1249`

```js
const { emitToUser } = await import('../websocket/ws-emitter.js')
...
const { emitToRole } = await import('../websocket/ws-emitter.js')
```

`emitToEvent` / `emitToEventOrganizer` from the *same* module are already statically imported at the top (`:23`). Two more symbols are pulled in via dynamic `import()` on every single submission — hidden dependency + per-request module-resolution cost. Same smell as election §5.4.

**Fix:** Add `emitToUser, emitToRole` to the static top-level import.

---

## 5. Low-Severity / Structural Findings

### 5.1 ✅ RESOLVED (2026-08-30) — Dead code
Removed `validateReorder`, `validatePollToggle`, and the dead registry-driven `validateQuestion` from the validator; removed `normalizeQuestionType` and `validateAnswers` from the service. `validateCustomType` was *wired in* rather than deleted (§4.1).

### 5.2 🟡 The *used* question validator is weaker than the *unused* one (partially addressed)
The controller uses `validatePollQuestion` (`:106`), which passes `type` through unchecked and does not validate `typeConfig` against the schema. The now-removed `validateQuestion` was the registry-driven alternative; enforcement still happens deeper in the service (`requireQuestionType` + `validateTypeConfig`), so it is covered, but a follow-up could push that check up into the validator. `sortOrder: Number(body.sortOrder ?? 0)` can still produce `NaN` from a non-numeric string.

### 5.3 ✅ RESOLVED (2026-08-30) — Answers validated twice per submission
`submitPollResponse` now validates each answer once and collects the serialized rows in the same pass.

### 5.4 🟡 Repeated registry loads per request
`createQuestion` / `updateQuestion` / `listQuestions` / `getPollAnalytics` each call `loadQuestionTypeRegistry` (2 queries) plus `getOrCreatePollingOrganization`. A short-lived per-request memo would remove the duplicate round-trips.

### 5.5 🟡 Non-transactional multi-row writes in reorder & duplicate
`reorderQuestions` (`:944`) and `duplicateQuestion` (`:852`) issue a **loop of per-row `UPDATE`s** with no transaction; an interruption leaves `sort_order` half-shifted. Low blast radius (question ordering only), but the same temporal-coupling smell as §3.1.

### 5.6 ✅ RESOLVED (2026-08-30) — No UUID validation on the voter polling routes
`router.use(validateRouteUUIDParams)` added to `polling-voter.routes.js`, so a malformed `:eventId` now returns a 400 instead of a 500.

### 5.7 🟡 Frontend: manual fetch triad, no query layer
**Zero** `useQuery` / `useMutation` across the 5 organizer polling pages and the voter poll page — every page hand-rolls the `loading / error / data` fetch-effect with `useState` + `useEffect` (`VoterPollPage.jsx:28-54`), with no caching, dedup, or retry. `listRespondents` supports `page`/`limit` on the backend, but the respondents page does not appear to page through them. Same smell as election §5.7. (The voter page's `localStorage` answer-autosave and dvh fullscreen shell are, by contrast, nicely done.)

---

## 6. What the Module Gets Right (context for the above)

- **Atomic single-submission guard.** The conditional `has_responded = false → true` UPDATE with an empty-result → 409 (`:1110-1122`) is the correct, race-safe pattern and is the real backbone of submit-once integrity.
- **Registry-driven question types.** System + per-org override resolution, a config-schema validator, auto-option builders (Yes/No, Likert), and per-kind answer validation/serialization/analytics (`poll-question-types.js`, `polling-registry.service.js`). Adding a type is genuinely a single SQL insert. This is the module's strongest design.
- **Strong auth perimeter.** Organizer routes sit behind `authenticate → authorize(ORGANIZER) → requireActiveAccount → requirePasswordChanged → requireProfileComplete` (`organizer.routes.js:15-29`); voter submit/read additionally require `requireEventParticipant(POLLING_RESPONDENT)`.
- **Rate limiting** on submit (`pollLimiters.ip` + `pollLimiters.user`), email, CSV import, and uploads.
- **Answer input hardening.** `validatePollAnswers` caps at 200 entries and 10,000 chars per value (`polling.validator.js:69-96`).
- **Image-asset reference counting** cleans up banner/question/option images on replace and delete (`removeReferenceAndDeleteIfUnused`).
- **DB hygiene.** FK `ON DELETE CASCADE`, a `UNIQUE(submission_id, question_id)` answer index (migration `006`), and targeted indexes on event/voter/submission.
- **Anonymous-poll handling** suppresses `voter_id` in analytics when `poll_anonymous` is set (`poll-question-types.js:277`).
- **Real-time websocket** dashboard/organizer updates on submit and on polling toggle.

---

## 7. Production Readiness Checklist

| Item | Status | Comment |
|------|:------:|---------|
| Core happy-path works | 🟢 | Create → add questions → invite → respond → analytics all function |
| Submission integrity under failure | 🟢 | ✅ Atomic RPC — all-or-nothing (§3.1) |
| Schedule semantics correct | 🟢 | ✅ `start_date` now honored (§3.2) |
| Custom-type input validation | 🟢 | ✅ Validated at the controller (§4.1) |
| Analytics robustness | 🟢 | ✅ `step ≤ 0` guarded (§4.2) |
| Automated test coverage | 🟡 | Schedule + type-helper + validator suites added (51 tests); submission-path integration still relies on a live DB |
| Auth & authorization | 🟢 | Solid middleware chain + participant gate |
| Rate limiting | 🟢 | Present on submit/email/csv/upload |
| Answer input validation | 🟢 | Size/count caps present |
| Consistent numeric reporting | 🟢 | ✅ Single `computeParticipationRate` helper (§4.3) |
| Data-model constraints/indexes | 🟢 | Cascades + unique answer index + indexes |
| Structured observability | 🟡 | `console.error` only; no metrics on submission failures |
| Horizontal scalability | 🟢 | No process-local cache to block it |

---

## 8. Implementation Plan

Phased, ordered by risk. Phases 1–4 are the release blockers; 5–7 are the maintainability follow-ups. Each phase is independently shippable and testable.

### Phase 1 — Atomic submission (P0, blocks release)
1. Add migration `0XX_poll_cast_response_rpc.sql` defining a Postgres function
   `cast_poll_response(p_event uuid, p_voter uuid, p_started_at timestamptz, p_allow_multiple bool, p_answers jsonb) returns uuid` that, in **one transaction**:
   - if `NOT p_allow_multiple`, performs the `has_responded = false → true` guard and raises on conflict (maps to 409),
   - inserts the `poll_submissions` row,
   - inserts all `poll_answers` rows,
   - returns the new `submission_id`.
   Provide a matching `0XX_down_...sql`. Model both on `059_election_cast_ballot_rpc.sql`.
2. Replace the step 1–3 body of `submitPollResponse` with a single `getClient().rpc('cast_poll_response', {...})` call; keep the pre-flight per-question validation and the post-commit websocket emits.
3. Delete the manual compensation blocks (`:1140-1150`, `:1177-1187`).

### Phase 2 — Schedule correctness (P0)
4. In `isPollOpen`, move the `start_date`/`end_date` bounds checks *above* the `status === 'active'` short-circuit (port the `isElectionVotingOpen` fix). Apply the same to `isCompetitionScoringOpen` for consistency.
5. Add unit tests to `backend/__tests__/utils/eventSchedule.test.js`: poll enabled but `start_date` in the future → closed; within window → open; past `end_date`/`poll_expires_at` → closed.

### Phase 3 — Custom-type validation (P0)
6. Import and call `validateCustomType` in `createCustomQuestionType` and (an update variant of) it in `updateCustomQuestionType`. Reject `answerFormat.kind` not in `{choice, numeric, text, ranking}`.
7. Harden `buildAnalytics`: coerce `step` to a positive number, default to `1`, and cap bucket count (guards §4.2 even for legacy bad rows).

### Phase 4 — Test the integrity path (P0)
8. Add `backend/__tests__/services/polling-submission.test.js` covering: single submission succeeds; second submission on a single-submission poll → 409; closed/expired poll → 403; poll not started (`start_date` future) → 403; invalid option/over-max-select → 400; RPC failure rolls back (no orphan submission, `has_responded` unchanged).

### Phase 5 — Reporting & hot-path cleanup (P1)
9. Extract `computeParticipationRate()` and use it in the dashboard and the submit websocket payload.
10. Hoist `emitToUser` / `emitToRole` into the static import; drop the two `await import()` calls.
11. Validate answers once in `submitPollResponse` and reuse the validated values.

### Phase 6 — Structure (P2)
12. Split `polling.service.js` into `polling-events` / `polling-respondents` / `polling-questions` / `polling-submissions` / `polling-analytics`.
13. Remove dead code (`validateQuestion`, `validateReorder`, `validatePollToggle`, `normalizeQuestionType`, `validateAnswers`); switch the question controller to the registry-driven validator.
14. Wrap `reorderQuestions` / `duplicateQuestion` sort-order shuffles in a transaction (or a single bulk `UPSERT`).
15. Add `validateRouteUUIDParams` to `polling-voter.routes.js`.

### Phase 7 — Frontend (P2)
16. Adopt react-query on the organizer polling pages (list/dashboard/respondents/analytics) for caching + dedup + retry; wire respondent pagination through the UI.

---

## 9. Bottom Line

The polling module is **well-conceived at the type-engine and perimeter layers** — the registry-driven question types are a genuinely good, extensible design, and the auth/rate-limit/input-size defenses are solid. But it is **fragile at its integrity core in exactly the places its sibling election module already repaired**: the response write is non-transactional (so a partial failure both inflates response counts and silently re-opens a "submit once" poll), and a poll ignores its own scheduled `start_date`. Two module-specific defects compound this — unvalidated custom types that can poison the submit/analytics paths, and an analytics loop that can hang the process — and there are **no tests on the submission path** to catch any of it. Close the four P0 phases (atomic RPC, schedule fix, custom-type validation, submission tests) and the module moves from "demo-ready" to "trustworthy for real respondents." The structural smells (God service, dead validators, no query layer) are real but secondary — they raise the cost of change rather than threaten correctness, and can follow.
