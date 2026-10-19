# Phase 6 — Official Results, Controlled Publication, Analytics and CSV

Completed October 13, 2026. Phase 7 has not started. Implementation and verification were local only. **Production remains blocked**, including on multi-instance transport and hosted authenticated acceptance.

## A. Implementation summary

Native competitions now have private official results, separately selected historical finalized versions, authorized participation/completion analytics, an immutable publication ledger, privacy-safe public results and four organizer CSV export formats.

Finalization does not publish. The organizer explicitly chooses the current verified/finalized calculation to publish or replace. Withdrawal is a separate recorded action. Later scoring corrections cannot change an existing published snapshot and cannot export or publish stale current sources.

No scoring formula, normalization, weighted minor behavior, per-round method variation or frozen-rule amendment procedure was added.

## B. Files changed

Added:

| File                                                                            | Purpose                                                                                                                          |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/database/migrations/107_competition_scoped_results.sql`            | Immutable publication history, authorized publication CAS/idempotency, safe public projection and private result/export readers. |
| `backend/src/modules/competition-native-exports.js`                             | Four CSV formats using the existing safe shared serializer; exact SQL decimal text separated from calculated values.             |
| `backend/src/services/competition-native-results.service.js`                    | Feature gates, actor/context binding, public allowlist, publication and export integrity checks.                                 |
| `backend/src/routes/competition-public-results.routes.js`                       | Rate-limited anonymous published-result GET with no private source endpoint.                                                     |
| `backend/scripts/test-competition-native-results.mjs`                           | Real PostgreSQL publication/export/privacy/concurrency/preservation verification.                                                |
| `backend/__tests__/modules/competition-native-exports.test.js`                  | Five format, exact-value, privacy, manual and CSV safety tests.                                                                  |
| `backend/__tests__/services/competition-native-results.test.js`                 | Eight service authorization/gating/projection/publication/export tests.                                                          |
| `frontend/src/services/competition-native-results.service.js`                   | Native private/public/publication/download requests.                                                                             |
| `frontend/src/components/organizer/competition/NativeResultsWorkspace.jsx`      | Results/version selectors, private analytics, explicit publication controls and guarded downloads.                               |
| `frontend/src/components/organizer/competition/NativeResultsWorkspace.test.jsx` | Seven current/historical/privacy/publication/retry/switching/manual tests.                                                       |
| `frontend/src/pages/public/NativeCompetitionResultsPage.jsx`                    | Approved public snapshots with anonymous HTTP reconciliation and withdrawal-version handling.                                    |
| `frontend/src/pages/public/NativeCompetitionResultsPage.test.jsx`               | Three public privacy, withdrawal/out-of-order and focus-recovery tests.                                                          |
| Report and evidence                                                             | Source baseline, integration/preflight results and explicit deployment requirements.                                             |

Modified:

| File                                                                    | Change                                                                                                                       |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/routes/competition-child.routes.js`                        | Adds native owned results, publication and CSV endpoints.                                                                    |
| `backend/src/routes/index.js`                                           | Mounts a separate public competition results router.                                                                         |
| `backend/src/middleware/eventGuards.js`                                 | Extends the completed-competition exception to native official results/publication; archive/cancellation protections remain. |
| `backend/src/modules/competition-legacy-preflight.js`                   | Optional 107 capability, publication lineage namespaces, guard/index/RPC/private-projection checks.                          |
| `backend/src/database/scripts/competition-preflight-catalog.sql`        | Includes private publication table and direct-service privilege evidence.                                                    |
| `frontend/src/pages/organizer/competition/CompetitionRankingsPage.jsx`  | Gated native result dispatcher; original legacy component retained.                                                          |
| `frontend/src/pages/organizer/competition/CompetitionAnalyticsPage.jsx` | Gated native analytics dispatcher; original legacy component retained.                                                       |
| `frontend/src/routes/index.jsx`                                         | Adds a standalone public native results page outside authentication guards.                                                  |

[source-preservation.json](source-preservation.json) compares 628 pre-existing source/script files. These eight files are the complete changed-source list. All 68 checked election/polling, calculation-engine, judge-table, legacy draft-hook and shared CSV files remain byte-identical. Earlier workspace changes were retained. Backend test additions are outside the source/script baseline and are listed separately.

## C. Database migrations and relationships

107 requires reviewed 106 and creates one additive table: `competition_child_publications`. It stores explicit event/child/NULL-or-real-round, monotonic scope version, previous publication ID, action, exact calculation reference, immutable approved public snapshot, actor/reason/time and request ID/body.

Composite child/event and round FKs plus relationship guards reject cross-competition/round calculation or publication lineage. Scope version uniqueness enables atomic compare-and-swap. Actor/child/request uniqueness implements retries without duplicating or resurrecting older publication state. UPDATE/DELETE are rejected by the existing immutable guard.

The table has RLS and direct PUBLIC/anon/authenticated/service access revoked. Authorized server RPCs provide publication/private reads/exports/public projection. The raw public-projection implementation helper is private. Public HTTP users receive only the allowlisted result response; they do not receive database grants.

No historical score, source, calculation, qualification, rule or result record was backfilled or rewritten. Migrations 103–106 were not edited.

## D. Official Results behavior

Each native child/round has its own result view. Current official standings require the current complete, verified/finalized immutable calculation. Draft/live/unfinalized values are never substituted. Manual rows retain explicit placements and NULL numeric scores.

Historical finalized versions are explicitly labeled historical/superseded and are not publishable/exportable as current. Their score-bearing private views are masked whenever current submissions/qualification are incomplete. Historical existence never completes a reopened sheet. Publication metadata remains visible so the owner can withdraw an earlier public version safely.

The view shows ranks, tie indicators, method, precision, tie policy, finalization time and approved deduction totals/units. Independent competitions are never combined into an overall ranking or winner.

## E. Publication workflow and privacy

Organizer base: `/api/organizer/competition/events/:eventId/competitions/:competitionId/results`.

- `GET /` — private owned results, history metadata and authorized statistics.
- `POST /publication` — explicit publish/replace/withdraw, acknowledgment, reason, exact current calculation/digest, expected publication version and stable request ID.
- `GET /export` — authorized selected-scope CSV, current source digest and appropriate calculation/judge identity.

Public base: `/api/public/competition/events/:eventId/competitions/:competitionId/results?roundId=...`.

Publish/replace revalidate complete current sources, verification, finalization, exact selected calculation and current source digest transactionally. Withdrawal requires ownership, the active publication and its expected version, and an explicit reason. It remains possible after a source correction because it does not depend on current sheet completeness. Archive/cancellation mutation protections remain.

Public data contains only event/competition/round labels, publication/calculation version, method/tie/precision/finalization metadata and approved standing fields: participation, entry number/name, rank or manual placement, score where numeric, tie indication and approved aggregate deduction total/units. No worksheets, trace, raw scores, reviewer identities, private decision reasons or internal input snapshot are exposed. Responses use `Cache-Control: no-store`.

Policy after a source correction: the earlier approved publication remains its exact immutable snapshot until the owner explicitly withdraws or replaces it. It is presented as a published version/as-of snapshot, not as a fresh calculation. Private owner status identifies a publication requiring review; new publication and exports reject stale sources. No automatic withdrawal, replacement or score rewriting occurs.

Never-published scopes return generic unavailable/404. Withdrawn scopes return a score-free versioned tombstone so clients can reject an older delayed response. Historical publication audit rows remain immutable and private. A retry of an old publish request cannot undo a later withdrawal/replacement.

## F. Analytics implementation

The existing Results & Analytics pages dispatch to native selectors when explicitly enabled. Statistics identify their source as frozen participation/current submission heads: child participation count, selected-round eligible count, required/current-submitted judge counts, current finalized version and publication status.

Numeric visual summaries use current official scores only. Rank/manual methods show placement lists rather than interpreting ordinal placements as numeric percentages. Historical versions remain labeled; no sibling competition values are mixed. Before current completion, score-bearing standings, historical payloads and visual summaries are hidden while permitted completion statistics remain.

## G. CSV formats and evidence

All four exports are organizer-owned and revalidated in one authoritative SQL source snapshot at download time:

| Kind         | Content and gate                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `judge`      | One authorized required judge’s immutable current submitted targets; all required current sheets must be complete.                         |
| `worksheets` | All current submitted sheets in the selected child/round; same complete-source gate.                                                       |
| `tabulation` | Current finalized rows plus raw-target rows, decision history and stored engine input/trace; exact current finalized calculation required. |
| `final`      | Exact current finalized official rank/score or manual placement, version, validity and finalization/publication evidence.                  |

Where applicable, columns include event/competition/round IDs and names, judge ID/authorized display name, participation/number/name, rule/method/precision, criterion/minor IDs and names, raw value/bounds/weight decimal text, normalization formula, stored calculated normalization/judge totals, submission/source-row versions, source digest/revision, calculation IDs/versions/time/currentness, decisions/units and finalization time.

Raw values are SQL decimal text and never replaced with rounded trace values. Frozen maximum/minimum/major-weight text is also preserved. The calculated columns are explicitly separate and use stored authoritative outputs; the exporter performs no new score formula. Unavailable calculated columns remain blank. Spreadsheet tools that auto-detect numbers should import decimal-text columns as text to retain their exact representation.

The existing `shared/csv-export.js` is unchanged and handles quoting, commas/newlines, quotes and formula-triggering text. Its literal safety prefix is retained for applicable text cells. Manual final exports contain ranks and documented basis with blank numeric totals. No public/reviewer worksheet export route was introduced.

Stale digests, corrected/reopened sheets, wrong judge/child/round and superseded/unfinalized official calculation requests reject. Historical official downloads are intentionally not offered as current exports.

## H. Real-time synchronization

Publication transactions persist before authorized, score-free `competition:native-invalidated` hints are emitted to existing user rooms. Organizer views clear score-bearing data immediately on matching invalidation, refetch authoritative state and reject old selected-context responses. Publication retries preserve the original request ID/body.

Anonymous public users are not admitted to private WebSocket rooms. The public page reconciles with privacy-safe HTTP every 15 seconds and on focus/online/visibility recovery. Request generations and monotonic publication versions reject delayed snapshots; withdrawal tombstones prevent older versions from reappearing.

**Multi-instance delivery is not implemented or verified.** Existing user rooms are process-local. HTTP reconciliation provides bounded recovery, not an immediate distributed-delivery guarantee. This remains a deployment blocker where multiple API instances serve traffic.

## I. PostgreSQL integration results

[postgres-integration.json](postgres-integration.json): **8 passed scenario groups** in fresh disposable `votrix_publication_1791898451572`, cloned from the catalog-reviewed Phase 5 fixture. The harness checks the workspace data directory and actual reviewed SQL catalog/constraints/triggers/functions/ACLs before cloning, and imports no dotenv, Supabase, mail or app startup.

Verified installation/rerun preservation of 45 original tracked inventories; incomplete/unpublished denial; five independent private result/analytics scopes; publication privacy and sibling isolation; all four CSV formats and version evidence; post-publication correction/export revocation; withdrawal/republish/replacement/idempotency/concurrent CAS; cross-child and owner authorization; immutable publication history; manual nonnumeric output; real export formula shielding/exact text; direct table/public RPC denial; and unchanged source-template metadata/history.

The all-six-method results behavior also uses the unchanged engine and the previously verified Phase 5 method fixtures. No test modifies a formula to obtain a passing output.

[native-preflight-complete.json](native-preflight-complete.json) inventories **46 tracked tables with zero structural/permission blockers**. Twelve existing sparse-fixture review items remain. `migrationApproved:false` is intentional; local fixtures do not establish deployed SQL correctness.

## J. Backend/frontend results

- Full backend: **81 files passed, one existing file skipped; 644 tests passed, three existing assertions skipped**.
- Full frontend: **42 files / 295 tests passed**, two workers and the same process-only production roster-locking override used in prior phases.
- New coverage: five CSV module tests, eight service tests, seven organizer workspace tests and three public reconciliation tests.
- Frontend native-enabled build, targeted ESLint, changed JavaScript syntax and `git diff --check` passed. The existing large-chunk warning remains; no deployment/publishing occurred.

An initial fixture reader attempted to parse SQL NULL as JSON; it was corrected to use explicit JSON null. A missing lazy route import was added before build verification. These were local implementation/test fixes; calculation engines and scoring data were not altered.

## K. Historical compatibility and deployment status

Configured Supabase received **no requests, migrations, backfills, repairs, recalculations, schema changes or writes**. Only new localhost disposable clones were modified. [template-after.json](template-after.json) verifies the original Phase 5 template’s 45 inventories remain unchanged. The workspace PostgreSQL cluster was returned to its original stopped state.

Source preservation retains the six methods, deduction/qualification semantics, migrations 103–106, both engines, the existing judge table, immutable score/calculation history, legacy results and election/polling source. Existing legacy page bodies and compatibility boundaries remain; native paths never reinterpret legacy records.

Native results require prior backend gates plus `COMPETITION_NATIVE_RESULTS_ENABLED=true`; organizer frontend dispatch additionally uses `VITE_COMPETITION_NATIVE_RESULTS_ENABLED=true`. No .env or deployed configuration was changed. New public endpoints remain backend-gated and do not expose unpublished data. Safe rollback disables results UI/API gates while retaining additive history and all child/source/qualification safety boundaries; no destructive down migration exists.

Production is **not ready**. [DEPLOYMENT_REQUIREMENTS.md](DEPLOYMENT_REQUIREMENTS.md) and [deployment-requirements.json](deployment-requirements.json) explicitly retain deployed catalog/permission review, recoverable backup, tested restore, hosted authenticated acceptance and topology/shared-transport requirements. None is marked resolved by local tests.

## L. Remaining risks and Phase 7 dependencies

- Hosted authenticated organizer/judge/reviewer/public acceptance has not run. Do not substitute local database/UI tests for hosted evidence.
- Process-local WebSocket delivery must be replaced or supplemented with reviewed shared delivery for multi-instance deployment. Public polling/reconciliation is bounded recovery only.
- Source correction does not automatically withdraw an approved historical publication. Operators must explicitly withdraw or replace it; the public page labels the immutable published edition.
- Export authorization is checked against an atomic current source snapshot. A file already legitimately downloaded cannot be recalled after a later correction.
- Large exports currently use the existing in-memory CSV serializer. Production data-volume measurement and appropriate size/rate limits are needed before high-volume deployment.
- Superseded/private historical result payloads remain hidden during current-source incompleteness. Historical download/amendment policies require separately approved scope.
- Used-roster changes, frozen-rule changes and reviewer replacement remain subject to the explicit amendment/version requirements from Phase 5; no unapproved amendment workflow was added.
- Weighted minors, per-round method variations and new normalization remain unsupported.

Recommended Phase 7: resolve and document deployment/hosted acceptance/shared-transport/recovery requirements, then perform a separately approved release review. Do not deploy or add new scoring/amendment policies without explicit authorization.

**STOP: Phase 7 requires the user's approval.**
