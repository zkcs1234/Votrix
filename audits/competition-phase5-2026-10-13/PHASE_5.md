# Phase 5 — Competition-Scoped Official Tabulation, Verification and Qualification

Completed October 13, 2026. Phase 6 has not started. Native results remain private; public publication, CSV exports and analytics redesign were not implemented.

## A. Implementation summary

Native competition/round tabulation now reads current immutable judge submissions, runs the existing authoritative calculation engine, preserves calculation inputs/output/trace, requires independent verification and explicit organizer finalization, and confirms qualification from current finalized results.

**A historical submission does not complete a reopened judge sheet.** Completeness comes from `competition_child_submission_heads`, joined to the matching immutable submission and validated against the current locked source revisions. Clearing a head immediately restores the incomplete state. Historical submissions, prior finalized calculations and old idempotent submit receipts cannot replace that missing current pointer.

Native worksheet/results reads are masked until every required current source is complete. Corrections revoke current calculation and qualification validity without modifying historical snapshots. Dependent active scoring sessions pause; reconfirming the unchanged roster requires an explicit resume.

## B. Files changed

Added:

| File | Purpose |
| --- | --- |
| `backend/src/database/migrations/106_competition_scoped_tabulation.sql` | Private immutable official tables, current-source/privacy reader, independent review, deductions, calculation/finalization/qualification RPCs and dependent-session guards. |
| `backend/src/modules/competition-native-tabulation.js` | Pure native identity/source adapter for the existing engine, explicit manual placements, and existing qualifier-selection policy adapter. |
| `backend/src/services/competition-native-tabulation.service.js` | Deployment gates, actor/context binding, masked reads, server-derived calculation inputs, transition boundaries and post-commit hints. |
| `backend/scripts/test-competition-native-tabulation.mjs` | Actual PostgreSQL verification in fresh local disposable clones. |
| `backend/__tests__/modules/competition-native-tabulation.test.js` | Nine engine/identity/manual/deduction/cutoff tests. |
| `backend/__tests__/services/competition-native-tabulation.test.js` | Eight privacy/actor/revision/error/confirmation tests. |
| `frontend/src/services/competition-native-tabulation.service.js` | Explicit owned/reviewer tabulation requests. |
| `frontend/src/components/organizer/competition/NativeTabulationWorkspace.jsx` | Native selectors, progress, gated worksheets, deduction review, trace, verification/finalization and qualification controls. |
| `frontend/src/components/organizer/competition/NativeTabulationWorkspace.test.jsx` | Eleven visibility, switching, late-response, review/finalization and qualification tests. |
| This report and JSON evidence | Preservation baseline, actual integration results, catalog/preflight and populated migration rerun verification. |

Modified:

| File | Change |
| --- | --- |
| `backend/src/routes/competition-child.routes.js` | Organizer native tabulation/reviewer/deduction/calculation/finalization/qualification endpoints. |
| `backend/src/routes/pageant-judge.routes.js` | Appointed reviewer choices, gated worksheets, independent verification and deduction review before the legacy boundary. |
| `backend/src/services/competition-native-scoring.service.js` | When native tabulation is enabled, source changes notify the child’s reviewers and dependent round audiences after commit. |
| `backend/src/middleware/eventGuards.js` | Extends the existing completed-competition official-result exception to explicit native tabulation paths only. Archive/cancellation protections remain. |
| `backend/src/modules/competition-legacy-preflight.js` | Optional 106 capability, native official namespaces, RPC signatures, private-helper permissions and official/dependency guard checks. |
| `backend/src/database/scripts/competition-preflight-catalog.sql` | Native official private tables and direct-service mutation privilege metadata. |
| `backend/scripts/competition-preflight.mjs` | Stable composite-key ordering for native policy rows. |
| `frontend/src/pages/organizer/competition/CompetitionTabulationPage.jsx` | Gated native dispatcher; original legacy workspace is retained. |
| `frontend/src/components/voter/competition/NativeCompetitionWorkspace.jsx` | Appointed native reviewers are routed to their authorized review contexts when enabled. Judge table/scoring state logic is retained. |
| `frontend/src/hooks/useCompetitionSync.js` | Same-child dependent-round hints and immediate invalidation callback, including while a reconciliation is already in flight. |
| `frontend/src/hooks/useCompetitionSync.test.jsx` | Dependent-round filtering, immediate clearing and burst reconciliation coverage. |

[source-preservation.json](source-preservation.json) compares 621 pre-existing source/script files. These eleven modified files are the complete changed-source list. All 67 checked election/polling, calculation-engine, judge-table and legacy draft-hook files remain byte-identical. Existing workspace edits were preserved. Backend test additions are outside the source/script baseline and are listed separately above.

## C. Database migrations and relationships

106 requires reviewed 105, runs transactionally and adds six tables. No historical data or score payloads are backfilled, converted or recalculated.

| Table | Purpose and relationship |
| --- | --- |
| `competition_child_review_policies` | One immutable independent reviewer appointment per native child/event, bound to an existing active score-reviewer enrollment/user. |
| `competition_child_deduction_decisions` | Immutable session/participation/frozen-rule/offense-bound proposals; unique session/entry/rule/offense identity. Amount/units are copied from frozen rules, not accepted from a client. |
| `competition_child_deduction_reviews` | Immutable independent approve/reject/revoke decisions with monotonic decision versions. |
| `competition_child_calculations` | Immutable event/child/round/session/rule-bound versions, SHA-256 source evidence, source/input/output snapshots, creator and timestamp. |
| `competition_child_calculation_transitions` | Append-only explicit verification/finalization, actor/reason/time, unique per calculation/action. |
| `competition_child_qualifications` | Immutable finalized-calculation/round/policy/roster/provenance versions; composite round/event/child FKs. |

Immutable and relationship guards reject updates/deletes, unrelated native references and archive/cancellation writes. New tables have RLS enabled with direct PUBLIC/anon/authenticated/service-role access revoked. Only authorized API RPCs are granted to `service_role`; raw-source and implementation helpers remain private, including under function default grants.

The 105 live-control/read implementations are retained as private `*_v105` helpers. Authorized 106 wrappers replace the temporary unconditional later-round prohibition with current confirmed-qualification checks. Migration 105’s source file is unchanged. Direct service execution of the older helpers is revoked, so it cannot bypass the new boundary.

Session source revisions advance on deduction changes. Existing child setup/input revisions are not changed by scoring/deduction/calculate/review/finalize activity. A change to an earlier session’s source/access/lifecycle pauses active later sessions in that child only. It does not alter sibling competitions.

## D. Judge worksheet visibility rules

Required judges come from the immutable child/round assignment snapshot and current active enrollment/account state. Empty grants never authorize native calculations. Each required head must match its judge/session/rules identity, contain the complete eligible entry/criterion field, preserve locked source revisions and provide every target within frozen bounds.

Before complete current sources, the SQL API returns progress and setup/reviewer metadata with **no submitted worksheets, calculation output, engine input evidence, aggregate totals or placements**. The service also masks score-bearing fields defensively. No native score-bearing download endpoint exists.

After complete current sources, authorized organizers and the appointed independent reviewer can read exact immutable submitted values, criteria, weights, bounds, judge IDs and submission timestamps. These raw values are presented separately from calculated totals. Ordinary scoring judges retain access only to their own judge sheet through the existing scoring boundary.

An authorized correction that clears a current head revokes worksheet and current-result access, even when old submissions and finalized calculation rows still exist. A retry of an earlier successful Submit returns its historical receipt but never reconstructs the cleared pointer. Resubmission creates a new snapshot and changes current source evidence.

Matching invalidations immediately clear score-bearing browser state. Request generations and selected identity reject late prior responses. Failed authoritative refreshes clear the view. Backend completeness and transaction checks remain authoritative; UI hiding is not the permission boundary.

## E. Calculation methods and deduction behavior

The native adapter reuses `shared/competition-calculation.js` without modifying it. It supplies explicit native participation IDs, frozen panel grants, current submission IDs, saved criterion/minor definitions and eligible round rosters. It never invokes the engine on unsubmitted drafts or mere locks.

| Method | Preserved behavior |
| --- | --- |
| Average judge scores (`weighted_average`) | Existing weighted criterion contributions, equal minor mean and judge mean. |
| Sum (`sum`) | Existing sum of complete normalized judge totals. |
| Rank-based (`rank_based`) | Existing positive versioned judge placement aggregate; lower wins. Approved placement penalties add. Historical negative legacy representations remain untouched. |
| Highest score (`highest_score`) | Existing highest complete judge total. |
| Remove extremes (`lowest_removal`) | Existing configured high/low removal counts and retained-panel mean. |
| Manual (`manual`) | Explicit complete participation/rank choices, documented frozen basis/reason and independent approval. Numeric totals remain NULL; none are fabricated. |

Raw/maximum normalization, equal minor averaging, exact rational arithmetic, existing rounding, effective precision (default 2), tie policy and deduction signs remain. Numeric deductions subtract after aggregation; ordinal penalties add placements. Criterion scopes remain provenance/control scopes with the existing post-aggregation penalty semantics.

Only independently approved decisions apply. Pending decisions block calculation; rejected/revoked decisions do not apply. Distinct offense identity prevents duplicate application of one approved decision. Revision/revocation is append-only and changes the appropriate current calculation evidence. Rule amounts/units are frozen and cannot be replaced through request bodies.

Global multi-round deductions belong to the final competition scope; criterion-bound rules retain their owning round. Invalid scope selections reject explicitly. Per-round different methods, weighted minors, per-division native policies and new normalization remain unsupported by the unchanged 104 contract.

## F. Verification and finalization workflow

The workflow is: **Scoring Closed → Complete Current Sources → Resolved Deductions → Calculate → Independent Review/Verify → Explicit Organizer Finalize**.

An owner appoints an existing active enrolled `score_reviewer` for that child. The reviewer must be distinct from the owner/calculation creator and frozen scoring panel. Native approval remains independent; no new bypass option was introduced. The appointment is immutable.

Calculation reads a single authoritative snapshot, checks the caller’s expected source digest, derives engine inputs on the server, and stores only validated complete output through a transactional RPC. Client-supplied engine inputs/results are ignored. SQL rechecks completeness, closure, deductions, current rules and source digest under the child/session locks before insertion.

The calculation snapshot preserves rules, judge/participation/source identities, immutable submitted values, effective method/precision, deduction decisions, round/carry inputs and the existing per-minor/major/judge trace. Verification and finalization revalidate the current calculation and sources transactionally. Reviewer verification and owner finalization each require an explicit reason. Stale calculations reject; duplicate finalization rejects through the unique transition boundary.

Corrections create new calculation versions. Prior outputs, submissions, deduction history, verification/finalization records and timestamps remain immutable. A historical finalized status does not make a calculation current after its inputs change.

## G. Qualification and carry-forward behavior

Qualification is derived only from the selected round’s current finalized official result. Existing `selectQualifiers` semantics are retained: Top-N and percentage cutoffs include all tied cutoff ranks; threshold uses the round’s own numeric score; manual selection requires explicit reviewed IDs/reason; `none` means all continue. SQL independently enforces the frozen policy and rejects arbitrary automatic-policy overrides.

Confirmation records the finalized calculation ID, source digest, frozen policy, actor/reason and stable participation roster. It does not create or start a session. Later scoring requires a separate organizer start and the current confirmed roster. Single phase and the last round have no outgoing qualification controls.

Back to Zero uses the target round’s existing engine path. Compatible additive carry uses the existing carry totals. Configured weighted final contributions use the existing engine’s normalized numeric basis and saved weights; no new weighted carry formula was created. Carry dependencies must have current complete, finalized preceding sources. Ordinal carry and incompatible panels/methods remain rejected by 104.

An earlier source change makes dependent qualification stale, masks dependent tabulation and pauses an active later session. Reconfirming the same roster creates an auditable qualification version while retaining the already frozen session order; the organizer explicitly resumes. Changing a roster already used by a scoring session rejects and requires a separately reviewed session/roster revision procedure. Existing scoring identities or rows are never silently replaced.

## H. Actual PostgreSQL integration results

[postgres-integration.json](postgres-integration.json) records **13 passed scenario groups** in fresh disposable `votrix_tabulation_1791894228454`, cloned from the catalog-reviewed Phase 4 fixture. The harness checks the workspace cluster path and original catalog/function/constraint/trigger/ACL evidence before cloning; it imports no dotenv, Supabase, mail or application startup.

Verified:

- 106 installation/rerun preserve all 39 original tracked local inventories.
- Incomplete current sheets expose progress without worksheets, engine evidence or results.
- Historical submissions/finalized calculations do not complete a corrected/reopened sheet.
- Old idempotent Submit receipts do not rebuild current heads.
- Resubmission/recalculation create new versions; independent verification and concurrent single finalization are enforced.
- One competition and five independent numeric-method calculations, plus manual results with explicit placements.
- Numeric subtraction, rank-placement addition, pending/revoked decisions, duplicate offenses and cross-child review rejection.
- Top-N cutoff ties, percentage, threshold, manual and all-continue policies.
- Confirmed rosters freeze without opening sessions; earlier corrections revoke downstream authority and require reconfirmation.
- Existing Back to Zero, additive carry and weighted final contributions.
- Earlier corrections pause an active dependent session; reconfirmation does not resume it.
- Actual owner/reviewer/cross-child authorization and exact raw/normalized/weighted traces.
- Immutable official records and denied direct anonymous/authenticated/service-table access; private raw-source helper execution is denied too.

Legacy score/session/submission/calculation/deduction/lock-history row counts remain unchanged. [rerun-after-scoring.json](rerun-after-scoring.json) additionally verifies that rerunning final 106 preserves all populated native scoring, decision, calculation and qualification rows.

[native-preflight-complete.json](native-preflight-complete.json) inventories **45 tracked tables with zero structural/permission blockers**. Twelve existing sparse-fixture review items remain unchanged. `migrationApproved:false` remains intentional. These local checks are not deployed Supabase evidence.

## I. Backend/frontend verification

- Full backend: **79 files passed, one existing file skipped; 631 tests passed, three existing assertions skipped**.
- Full frontend: **40 files / 285 tests passed**, with two workers and the same process-only production roster-locking override used in earlier phases.
- New coverage: nine engine/adapter tests, eight service tests, eleven tabulation workspace tests and one dependent synchronization test.
- Frontend build passed with native scoring/tabulation flags enabled for the build process only. Existing large-chunk warning remains; no publication/deployment occurred.
- Targeted ESLint for new/modified native workspace/services/synchronization passed; JavaScript syntax and `git diff --check` passed.

An added SQL relation guard’s ambiguous local variable and an exact text-query assumption matching both base/final cells were corrected. Final verification uses fresh clones and passing runs. No scoring formula was changed to satisfy tests.

## J. Historical preservation and production deployment status

Configured Supabase received **no requests, migrations, backfills, repairs, writes, schema changes or recalculations**. Database writes were limited to fresh localhost disposable clones; no source template was mutated. The local test cluster was returned to its original stopped state.

[template-after.json](template-after.json) compares the original Phase 4 template to its reviewed baseline: all 39 inventories remain unchanged. Source hashes preserve migrations 103–105, both calculation engines, the existing judge table, legacy draft hook and all election/polling source. The shared event guard change is limited to completed competition tabulation; the full regression suites retain election/polling coverage.

Backend enablement requires the three earlier native gates and `COMPETITION_NATIVE_TABULATION_ENABLED=true`. Frontend native scoring/reviewer routing and tabulation use `VITE_COMPETITION_NATIVE_SCORING_ENABLED=true` and `VITE_COMPETITION_NATIVE_TABULATION_ENABLED=true`. No .env or deployed configuration was changed. Default/disabled operation retains legacy page bodies; explicitly enabled native schema/API failures fail closed.

Production remains blocked on deployed SQL catalog/constraint/trigger/function/ACL verification, recoverable backup confirmation and tested restore. Normal forward order is reviewed 100–102, 103, 104, 105, then 106, with an applied-migration ledger. Do not replay earlier RPC definitions over 106. Safe feature rollback disables native tabulation/front-end gates while retaining the child safety/qualification guards and additive immutable history. No destructive down migration is supplied.

## K. Remaining risks and Phase 6 dependencies

- Hosted Supabase and authenticated multi-browser acceptance remain unverified. Actual PostgreSQL and automated frontend/API tests are separate evidence, not hosted end-to-end verification.
- Existing transport uses local authenticated user rooms in one API process. Multiple API instances need shared invalidation delivery before relying on immediate updates across instances; reconnect/focus/periodic reconciliation still refetches authoritative state.
- Parent locks transiently serialize child writes. Current-source validation and recursive carry/qualification checks prioritize correctness; production-size performance requires measurement before optimizing.
- Changing an already-used qualified roster requires a reviewed session/roster version procedure. Same-roster reconfirmation is implemented; silent replacement of used eligibility is prohibited.
- Frozen setup changes and replacement of an immutable reviewer appointment require an explicit authorized amendment/version policy. No automatic rule reopening or independent-approval bypass is provided.
- Native policies remain competition-wide for calculation method, equal minor averaging and existing normalization. Unsupported variations need separate explicit policies and tests.
- Historical legacy event-only operation retains its existing compatibility boundary. Native calculations never use legacy draft/lock/result tables as a fallback.
- Public publication, Results & Analytics redesign and CSV exports remain unimplemented. Private finalization does not publish anything.

Recommended Phase 6: separately approved result publication/access rules and final results integration, with hosted acceptance and deployment recovery gates resolved first. Any export, new calculation policy or amendment workflow requires explicit scope and tests.

**STOP: Phase 6 requires the user's approval.**
