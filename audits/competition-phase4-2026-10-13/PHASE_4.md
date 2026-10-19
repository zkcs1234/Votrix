# Phase 4 — Competition-Scoped Judge Scoring and Live Control

Completed October 13, 2026. Phase 5 has not started. This phase collects and locks scoring sources; it does not produce official results, qualification or advancement.

## A. Implementation summary

Native competitions now have independent live sessions, explicit judge context selection, draft saves, criterion locks, immutable round submissions and organizer completion progress. The existing `CompetitionScoringForm.jsx` table is reused without modification. Competition and round selection clear displayed state; pending local drafts retain their original authenticated judge/event/competition/round/session/rule/revision identity.

Organizer access changes and judge draft/lock/submission writes commit through PostgreSQL RPCs before confidential-score-free WebSocket invalidations are emitted. The selected judge and organizer views reconcile automatically. Session access versions and scoring-source versions are separate from the child setup/input revisions established in Phase 3.

Per-round different calculation methods, weighted minor criteria and new normalization remain unsupported. Migration 104's validation and both calculation engines remain unchanged. This phase performs no scoring aggregation, deductions calculation, tabulation or qualification.

## B. Files changed

Added:

| File | Purpose |
| --- | --- |
| `backend/src/database/migrations/105_competition_scoped_scoring.sql` | Private native sessions/drafts/submissions/audit, identity guards and authorized transactional scoring/control RPCs. |
| `backend/src/services/competition-native-scoring.service.js` | Deployment gates, server actor binding, explicit context validation, RPC/error boundaries and post-commit invalidations. |
| `backend/scripts/test-competition-native-scoring.mjs` | Actual PostgreSQL checks in new disposable clones of the reviewed Phase 3 fixture. |
| `backend/__tests__/services/competition-native-scoring.test.js` | Nine service tests for gates, context binding, confidential invalidations, transaction errors and notification failure. |
| `frontend/src/services/competition-native.service.js` | Explicit child/round live view, scoring and organizer control requests. |
| `frontend/src/components/voter/competition/NativeCompetitionWorkspace.jsx` | Gated page dispatcher, selectors, existing judge table adapter, persistent scoped drafts/retries and organizer controls/progress. |
| `frontend/src/components/voter/competition/NativeCompetitionWorkspace.test.jsx` | Thirteen judge/organizer tests, including automatic updates, late responses, round switching, reconnect and terminal event behavior. |
| This report and JSON evidence | Source preservation, database catalog/preflight and actual integration results. |

Modified:

| File | Change |
| --- | --- |
| `backend/src/routes/competition-child.routes.js` | Adds organizer context choices, live view and control endpoints. |
| `backend/src/routes/pageant-judge.routes.js` | Adds authorized native choices/live/scoring endpoints before the existing legacy safety boundary. |
| `backend/src/modules/competition-legacy-preflight.js` | Optional 105 capability, correct native session/rule/entry references, identity/immutability guards, RPC signatures and RPC-only table permission checks. |
| `backend/src/database/scripts/competition-preflight-catalog.sql` | Includes private scoring tables and direct service mutation privilege metadata. |
| `backend/scripts/competition-preflight.mjs` | Stable ordering for composite native draft and submission-head keys. |
| `frontend/src/hooks/useCompetitionSync.js` | Adds native invalidation type and exact event/competition/NULL-or-explicit-round matching. Existing recovery and reconciliation behavior remains. |
| `frontend/src/hooks/useCompetitionSync.test.jsx` | Adds native sibling/round filtering and selection-change cleanup coverage. |
| `frontend/src/pages/voter/JudgeScoringPage.jsx` | Adds gated native dispatcher; original legacy component body is retained. |
| `frontend/src/pages/organizer/competition/CompetitionLiveControlPage.jsx` | Adds gated native dispatcher; original legacy component body is retained. |

[source-preservation.json](source-preservation.json) compares 615 pre-existing source/script files to the start-of-phase baseline. The nine modified files above are the complete changed-source list. All 67 checked election/polling, engine, judge table and legacy draft-hook files are byte-identical. Earlier workspace edits were preserved. Backend test additions are listed separately because that baseline covers source/script trees.

## C. Database migrations and relationships

105 requires reviewed 104 and runs transactionally. It creates five new tables; no historical table columns or records are migrated/backfilled/recalculated:

| Table | Ownership and state |
| --- | --- |
| `competition_child_sessions` | Explicit event/competition/round or NULL, composite rule/round FKs, frozen eligible participation IDs, access gates, session revision and separate source revision. One session identity per child/round. |
| `competition_child_score_drafts` | Primary key `(session_id,judge_id,entry_id,criterion_id)`, raw target score map, own row revision and criterion lock. Participation IDs are distinct from master contestant IDs. |
| `competition_child_submissions` | Immutable judge/session/rule-bound source snapshots, including participation IDs, criteria, raw target scores, locks and row revisions. |
| `competition_child_submission_heads` | Current submission pointer per judge/session. Authorized correction removes only the pointer; historical submitted snapshots remain. |
| `competition_child_scoring_audit` | Immutable actor/request/action/body/result receipts for draft, lock, submit and live-control operations; unique session/actor/request identity. |

Identity/relation triggers reject mutable scoring identity, cross-child entry/criterion references, unrelated rule versions and mismatched current submission pointers. Immutable submission/audit triggers reuse the existing immutable guard without redefining it.

All five tables have RLS enabled and direct PUBLIC/anon/authenticated/service_role access revoked. Only the trusted API can execute the authorized scoring/control RPCs. Internal recipient selection is not a public RPC. A PostgreSQL catalog inspection is consequently required for a complete inventory; direct service REST table access is intentionally unavailable.

## D. Judge scoring and Live Control behavior

Judges select only currently assigned native competition/round contexts. A competition-wide NULL assignment is an explicit grant; empty assignment lists never grant access. Single phase has a real NULL round. Round-specific grants do not expose other rounds.

The existing table keeps contestant identity, photos, published participation order, major percentages, minor columns, numeric bounds, per-major Lock and completion status. Drafts save automatically while permitted. Lock requires every target for that major within its frozen raw bounds. Submit Round requires every eligible entry/criterion to be locked and creates an immutable source snapshot.

Local queues retain drafts and exact retry request bodies across connection loss and context changes. HTTP 400/403/409 failures block automatic replay; explicit retry retains the original request identity. The review action saves reviewed values as current drafts, so a stale Lock or Submit is not silently reissued under a new context. In-flight draft saves cannot discard newer keystrokes. Authoritative refreshes merge permitted local values with server rows and reconcile already committed retries.

Organizer Live Control provides competition/round selection, frozen eligible participation order, closed-by-default entry and criterion gates, pause/resume, scoring closure, and judge lock/submission progress. Organizer responses contain progress rather than confidential score values. Judge names are used where available, with stable identity as a fallback.

Reopening requires an explicit confirmation action and a reason. It pauses the session. Selecting a judge unlocks that judge's current sources and clears that judge's current submission pointer; existing snapshots and audit receipts remain immutable. This is a score-source correction workflow, not permission to amend frozen setup rules or finalized results.

Native writes require a draft or active parent event. Terminal event state also disables the authoritative judge sheet and organizer controls. Starting a session does not silently change the parent lifecycle.

Later rounds remain visible only where assigned, with scoring blocked pending future finalized, confirmed qualification. Closing Preliminary never creates a Final session. No automatic qualifiers or result decisions are stored.

## E. Real-time synchronization design

Mutation RPC results are returned after the database transaction commits. They include server-derived recipients from the current active owner and current active enrollments matching the frozen judge identities and selected round. The service strips the recipient list from the HTTP response and emits `competition:native-invalidated` to existing authenticated user rooms.

The hint contains only event ID, competition ID, explicit/NULL round ID and session ID. It contains no scores, rankings, snapshots or other judges' values. The subscriber treats hints only as invalidations and reads the authoritative filtered view RPC.

`useCompetitionSync` binds the selected child and round, coalesces bursts, refetches on reconnect/focus/online/visible-tab transitions and reconciles every 15 seconds disconnected or 60 seconds connected. Existing authenticated user rooms are rejoined by the socket server on reconnect, avoiding broad event-room native broadcasts. A missed notification, delivery failure or dependency change is therefore covered without manual refresh. Hidden tabs reconcile when visible.

Each view request checks the selected identity and request generation; older session or source versions cannot replace newer accepted state. Context changes clear displayed state immediately. A failed authoritative permission/context read disables scoring while retaining local drafts. Draft autosave only attempts runnable pending jobs; it does not continuously refetch an idle scoring sheet.

Session revision changes reflect control/access transitions. Source revision changes reflect draft/lock/submission/correction activity. Neither changes native setup/input revisions or sibling validity. Real shared account, enrollment, master-entry and parent lifecycle dependencies retain their existing meanings.

## F. Authorization and integrity controls

Every scoring/control write validates event, native competition, explicit/NULL round, current frozen rule identity, child setup/input revisions, current enrollment/account and frozen judge identity. Writes bind the authenticated API actor; a client-selected judge identity is never used for scoring.

The child/session locks make permission, control and scoring writes transactional. Organizer controls use expected session revision. Judge writes use expected session/access revision plus per-row CAS; another judge's draft does not stale that judge's own row. Cross-competition and unopened access reject. Completed/paused/closed sessions reject new score writes as appropriate.

Receipts implement request idempotency, including concurrent duplicate submissions and retries after a lost response. Reusing an ID with a different action or payload rejects. Duplicate valid retries do not create new source versions or submitted snapshots. Current authorization still applies to retries. Immutable history is never replaced by mutable drafts.

The frontend gate is `VITE_COMPETITION_NATIVE_SCORING_ENABLED=true`. Native API operations require all three backend gates: `COMPETITION_CHILD_CONTEXTS_ENABLED=true`, `COMPETITION_NATIVE_SETUP_ENABLED=true`, and `COMPETITION_NATIVE_SCORING_ENABLED=true`. No environment file or deployed configuration was changed. Disabled/default operation retains the original legacy page bodies. When explicitly enabled, native schema/API failures fail closed rather than selecting event-level scoring.

## G. Actual PostgreSQL integration results

[postgres-integration.json](postgres-integration.json) records **17 passed scenario groups** in a fresh disposable clone of `votrix_native_1791883232718`. The harness verifies the workspace cluster data directory and reviewed actual catalog/constraints/triggers/function definitions/ACLs before cloning. It imports no dotenv, Supabase, mail or application startup.

Verified:

- Installation/rerun preserve all 34 original tracked table inventories.
- One native competition, then five independent sessions, with current frozen sibling rules.
- Explicit single-phase NULL and authorized round-specific choices; unauthorized judge/owner rejection.
- Separate sessions, access, source revisions and unaffected sibling pause/resume behavior.
- Cross-child entries/criteria/rule stamps, stale setup/input/session/row revisions, raw bounds and incomplete/foreign minor scores reject atomically.
- Draft CAS, exact request retries and judge score confidentiality.
- Complete criterion locks and complete-round submission requirements.
- Immutable submitted sources and organizer progress without score values.
- Closure enforcement and audited correction preserving the previous submission.
- Frozen Preliminary roster; Final remains blocked after closure.
- Concurrent same-row and organizer-control writes: one success and one stale rejection.
- Two different judges save concurrently without invalidating each other's context.
- Concurrent identical submissions return one snapshot identity.
- Terminal parent lifecycle blocks reads of writable access and judge/control writes.
- Current enrollment revocation and child dependency invalidation fail closed without rewriting history.
- Direct anon/authenticated/service-role scoring-table access and anonymous RPC denial.

Legacy score/session/submission/calculation/deduction/lock-history row counts also remain unchanged. The source Phase 3 template was inspected separately and remains unchanged.

[native-preflight-complete.json](native-preflight-complete.json) inventories 39 tracked tables with **zero structural/permission blockers**. Twelve existing sparse-fixture historical review items remain. `migrationApproved:false` is intentional; this local fixture is not deployed Supabase evidence.

## H. Backend/frontend test results

- Full backend: **77 files passed, one existing file skipped; 614 tests passed, three existing assertions skipped**.
- Full frontend: **39 files / 273 tests passed** with two workers and the same process-only production roster-locking override used in earlier phases.
- New coverage: nine backend service tests, thirteen workspace tests, one scoped synchronization test.
- Frontend builds passed with default flags and with the native frontend flag enabled only for the build process. The existing large-chunk warning remains; no deployment/publishing occurred.
- Targeted ESLint for the new native frontend workspace/service and modified synchronization hook passed.
- Changed backend JavaScript/script syntax checks and `git diff --check` passed.

Initial test runs caught SQL alias/trigger field-reference errors and one organizer test's exact text-query assumption. They were corrected; final runs used fresh clones. No calculation formula was changed to satisfy a test.

## I. Historical compatibility and production deployment status

Configured Supabase received **no requests, migrations, backfills, repairs, schema changes, writes or recalculations** during this phase. Database writes were limited to fresh localhost disposable clones. The local PostgreSQL test cluster was returned to its original stopped state.

[template-after.json](template-after.json) compares the original Phase 3 template to its reviewed baseline: all 34 inventories are unchanged. Source hashes preserve migration 103, migration 104, both calculation engines, the existing judge table and all election/polling source. No legacy score locks were converted into submissions.

Production remains blocked on deployed catalog/constraints/triggers/function/ACL verification, a recoverable backup and a tested restore procedure. Normal deployment order is reviewed 100–102, 103, 104, then 105, with an applied-migration ledger. Do not replay earlier migrations over later RPC definitions. Rerunning 105 itself was verified.

Safe feature rollback is to disable native scoring and its frontend gate while retaining child context isolation, existing additive data and immutable history. Do not disable the populated-child ambiguity guard or drop native tables. No destructive down migration is supplied.

## J. Remaining risks and Phase 5 dependencies

- Hosted Supabase and authenticated multi-browser acceptance remain unverified. Automated frontend transport/view tests and actual PostgreSQL tests are separate evidence, not a hosted end-to-end claim.
- Existing user-room transport is single-process; multiple API instances require a shared delivery mechanism. Periodic/focus/reconnect reconciliation covers missed hints, but no distributed delivery guarantee is claimed.
- Child operations still acquire existing parent locks transiently. This preserves integrity but serializes some writes; it does not cause sibling revision invalidation. Optimize after lifecycle/authorization review.
- No later-round scoring is enabled until official tabulation and explicit confirmed qualification exist. Scoring closure is not result finalization.
- Frozen setup made stale by a genuine dependency change still needs a separately authorized rule-amendment procedure. Score-source correction does not clear or rewrite frozen rules.
- Multiple native competitions use explicit child endpoints. Historical event-only operations retain the earlier ambiguity guard; mixed native/legacy events do not gain an implicit legacy fallback.
- Per-round different methods, weighted minors, per-division native policies and new normalization still require separate explicit policies and tests before implementation.
- Local storage remains browser-specific; it is a retry aid, not the authoritative source. Submitted server snapshots are authoritative. Storage failure is surfaced to the judge.
- Native CSV exports, calculation, deductions application, verification/publication, qualification decisions and analytics remain outside Phase 4.

Recommended next phase: competition-scoped official tabulation using the preserved authoritative calculation engine and immutable submitted sources, followed by reviewed/confirmed qualification boundaries. Carry/deduction/rank semantics must retain their current explicit policies; unsupported calculation features require separate approval and tests.

**STOP: Phase 5 requires the user's approval.**
