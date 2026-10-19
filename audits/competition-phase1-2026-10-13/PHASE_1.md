# Phase 1 — Legacy Compatibility and Database Migration Preflight

Completed October 13, 2026. Phase 2 has not started.

## Scope and result

Added standalone, read-only inspection tooling and characterization tests. No application routes, UI, calculation engines, existing migrations, scores or database schema were changed. Election and polling are untouched. The preflight module is imported only by its CLI and tests, so it does not change runtime scoring behavior.

The configured Supabase project was inspected using service-role GET requests only. Its SQL catalog/permissions remain unverified: REST exposure is not evidence of an installed trigger or a validated foreign key. The tool returns a blocker rather than approving a migration in this situation.

No migration was created or executed. No existing event, participant, judge, contestant, session, lock, submission, deduction, rule or result was inserted, updated, deleted, promoted, reseeded or recalculated.

## Files added

| File | Purpose |
| --- | --- |
| `backend/src/modules/competition-legacy-preflight.js` | Classifies historical calculation semantics; reports dependencies, ambiguous cells, relation/lineage conflicts, guard/permission problems and preservation fingerprints without changing input records. |
| `backend/scripts/competition-preflight.mjs` | Explicit Supabase or PostgreSQL inspection. Does not import application startup or execute RPCs/migrations. Writes a new report and refuses to overwrite an existing report or its baseline. |
| `backend/src/database/scripts/competition-preflight-catalog.sql` | SELECT-only FK, index, trigger, function-signature/definition-hash, RLS and privilege inventory. Not a migration. |
| `backend/__tests__/modules/competition-legacy-preflight.test.js` | 24 tests covering preservation, diagnostics and existing calculation behavior. |
| `backend/__tests__/scripts/competition-preflight-cli.test.js` | 10 tests for explicit target selection, no-credential help, invalid-option rejection and baseline/path protection. |
| This report and adjacent JSON reports | Evidence, dependency order, compatibility contract and next-phase boundaries. |

Existing workspace edits predate this phase. SHA-256 checks of all 598 existing backend/frontend/shared source and migration files found zero changes during this phase. New audit files are additions rather than replacements for the earlier audit.

## Database observations

### Configured Supabase database

See [supabase-preflight-final.json](supabase-preflight-final.json). The earlier `supabase-preflight.json` is the baseline used for its record comparison; intermediate reports are superseded by the final report.

| Competition record set | Observed count |
| --- | ---: |
| Events (`competition_scoring` / `pageant`) | 11 |
| Judge participant enrollments | 15 |
| Master contestants/entries | 28 |
| Divisions | 12 |
| Rounds | 9 |
| Major criteria | 31 |
| Minor criteria | 46 |
| Judge assignments | 12 |
| Sessions | 5 |
| Stored score rows | 26 |
| Session judge-score rows | 3 |
| Calculation snapshots | 2 |
| Finalized snapshots | 1 |
| Published snapshots | 0 |
| Rule versions | 2 |
| Criterion lock-history records | 4 |
| Judge drafts | 1 |
| Submitted-round snapshots | 0 |
| Deductions / advancement decisions | 0 / 0 |

All 27 inspected table inventories completed. Their observed JSON fingerprints matched across repeat inspections. No duplicate score cells, cross-event relations or lineage conflicts were detected by the implemented checks in those observations.

Both calculation records are legacy snapshots (no `rules_version`); one is finalized. The frozen rule versions use rank-based calculation. These are distinct sources of history; the finalized legacy snapshot must not be interpreted or recomputed using newer rank rules.

There are historical locks but no `competition_round_submissions`. A lock remains a lock; it is not a completed judge sheet and must never be backfilled into a submitted round automatically.

The sole final blocker is `database_metadata_unverified`. Private trigger functions are marked unverified when absent from REST's RPC surface, rather than incorrectly labeled missing. The metadata and executable dependencies exposed through REST were observed, but the applied-migration ledger and exact SQL implementations cannot be certified from REST.

REST hashes describe parsed transport observations, not a transactionally consistent backup. Concurrent writes can change these observations; high-precision JSON numbers may be coerced by JavaScript. Use the PostgreSQL mode for lossless stored-row text fingerprints and a consistent snapshot before deployment.

### Existing local PostgreSQL test database

See [postgres-preflight-final.json](postgres-preflight-final.json), compared with `postgres-preflight-initial.json`. This database is a prior disposable fixture, not a clone of today's Supabase records.

- Target: localhost:55439 / `votrix_repairs_1791835055235` in the existing workspace-only test cluster.
- 25 tracked tables inspected inside repeatable-read READ ONLY transactions, followed by ROLLBACK.
- 224 constraints, 57 triggers, 44 function definitions and 13 private-table permission inventories inspected.
- Zero final structural/permission/lineage blockers in this fixture.
- All table counts and lossless PostgreSQL JSONB-text fingerprints matched the initial inspection.
- 11 calculation snapshots: two finalized and one published. Six older versioned calculations lack input revisions. They are retained and flagged for review, not updated.
- Other review items are deliberately sparse calculation metadata in the old test fixture. No missing policy is invented from a current event configuration.

The test cluster was stopped before this work, started for read-only inspection, and stopped after verification. No migrations or fixtures were applied to it during Phase 1.

## Migration compatibility and dependency order

Do not run a directory-wide migration loop or blindly replay migrations 087–102. Several files contain non-idempotent CREATE TABLE/ADD COLUMN statements and replace or rename prior functions. Numbered migrations also have unrelated same-number files and down migrations.

The report includes SHA-256 fingerprints of relevant migration sources. `executed: false` means this preflight did not execute them; it is not a statement that they have never been applied to the target database. Capability checks similarly do not manufacture an applied-migration ledger.

| Dependency group | Required review |
| --- | --- |
| Legacy tables / rename / foundation | Existing competition tables, `events.scoring_config`, round memberships and current judge identity references. Foundation 015 originally used competition judge IDs; later unification uses participant IDs. Inspect actual columns and FKs. |
| Divisions / enrollment / assignments | Canonical event participants and event/round/category/division assignments. Empty assignments currently mean event-wide scoring; preserve this only within the eventual explicitly mapped legacy context. |
| Minor criteria 071 | Equal-weight minor averaging, per-minor bounds, optional NULL historical minor references and NULL-round uniqueness. Never repair ambiguity by choosing/deleting a score row. |
| Deductions / calculations 081–082 | Existing stored method, deduction scope, units, status and official snapshots. Preserve finalized/published data byte-for-byte at the payload level. |
| Workflow 087–088 | Official rules, drafts, submissions, access configuration, live-session uniqueness and operational/result RPCs. Duplicate active/paused sessions require explicit review, not automatic retirement. |
| Verification / amendments 089–090 | Offense uniqueness, independent decision approval and controlled rule amendments. Rule changes must not reinterpret old results. |
| Atomic setup / invalidation / history 091–093 | Setup guards, provisional invalidation, immutable rule/result/lock-history triggers. Verify installed triggers and enabled state, not just column presence. |
| Reconciliation / criteria / participation 094–096 | Reconciliation remains an explicit audited operation; publication uses saved criteria and registration sources. The preflight never invokes these RPCs. |
| Progression 097 → relationship repair 098 → upgrade 099 | 099 depends on earlier private function identities. 098 touches the shared participant relationship; inspect orphan rows and existing validated FK before considering it. No shared-table change is authorized by Phase 1. |
| Atomic integrity 100 | Full setup/input revisions, same-event relation guards and current-source checks. Existing inconsistent relations intentionally block this migration. Do not move records to make it pass. Event-wide revisions must later become competition-aware. |
| Private access 101 | Inspect actual roles, inherited privileges, RLS, policies, private views and service-role access. Local checks are not proof of deployed permissions. |
| Creation identity 102 | Retry-safe event creation and private request payloads. Preserve existing event IDs and request mappings. |

The catalog collector also records RPC argument types and definition hashes. These are review evidence; matching a function name is insufficient to certify its semantics. The finalized-before-advancement and all-advance completion conflicts remain scheduled work, not silently repaired here.

## Historical calculation compatibility contract

| Existing behavior | Phase 1 treatment |
| --- | --- |
| Legacy `average` and `weighted_average` methods | Keep existing engine interpretation. Flag legacy aliases for an explicit version transition; do not rename stored configuration. |
| Versioned Average, Sum, Highest, Remove Extremes | Preserve aggregation of complete weighted judge totals and configured rounding. |
| Legacy rank engine | Preserve negative `finalScore`, positive `placementTotal`, stored rank and historical deduction interpretation. |
| Versioned rank engine | Preserve positive placement aggregates, lower-is-better ordering and placement penalties. Do not reinterpret old negative results through this engine. |
| Manual official result | Keep explicit placements/approval; numeric engine must not fabricate an automatic manual score. |
| Minor criteria | Keep raw/max normalization and equal averaging. Weighted-minor support is future work requiring explicit rules. |
| Numeric deductions | Preserve one applicable deduction after aggregation. Never subtract a displayed penalty twice. |
| Rank deductions | Preserve addition of placement penalties. A point-based numeric carry basis requires new explicit configuration. |
| Back to Zero | Preserve Final-only result behavior. |
| Existing `carry_forward` | Preserve addition of applicable prior round totals. Do not relabel it as percentage carry. |
| Weighted ordinal combinations | Flag for review; historical records remain intact. A future numeric carry basis must be defined or new incompatible configurations rejected. |
| Top-N cutoff ties | Preserve existing shared-cutoff expansion in historical rules. A future exact-count policy must be explicit. |
| Locked scores / submitted rounds | Maintain their separate meanings. No automatic promotion. |
| Historical result without current input revision | Preserve snapshot. A new current approval needs fresh calculation/reverification; an old official payload does not. |

The standalone auditor reports these distinctions. It is not connected to application runtime and does not change either calculation engine.

## Future legacy-to-child-competition mapping

This is the contract for Phase 2; no child tables or backfills exist yet:

1. Each existing competition event gets one explicit compatibility competition mapping under the same parent event. Do not create another event or replace historical IDs.
2. Existing contestants remain reusable master entries. New competition participation is an explicit association, never implicit enrollment in every selected competition.
3. Preserve immutable historical JSON. Adapt its reads through explicit legacy provenance rather than mutating `event.id`, ranks, sources or rules in old snapshots.
4. Existing event-wide permissions map only to that legacy competition. An old enrollment without assignments must not grant access to newly added competitions.
5. Separate configuration, judge assignment, session uniqueness, revisions, submissions, deduction scope, advancement and result/publication state by competition.
6. Reject ambiguous event-only mutations when multiple contexts exist. Never pick the first competition as a fallback.
7. Keep `round_id = NULL` for a real single phase and introduce uniqueness that handles NULL deliberately.
8. Do not deploy/backfill until the configured database's full SQL catalog, precise function bodies and backup/restore plan are reviewed.

## Verification

- Backend: 26 files / 239 tests passed, including all module tests and relevant competition service tests.
- Of these, 34 are new Phase 1 tests (24 inventory/calculation characterization and 10 CLI guard tests).
- Frontend: seven files / 37 tests passed for judge table, header, locking/drafts, reconciliation, tabulation, advancement and published results.
- Numeric characterization: judge totals 90, 86, 92, 78 → Average 86.50; Sum 346; Highest 92; remove one highest/lowest → 88.00. Rank aggregation and one-time penalty units verified separately.
- Existing manual-advancement/official-result tests passed; numeric manual calculation correctly rejects instead of inventing a result.
- Both new JavaScript entry points passed `node --check`.
- PostgreSQL catalog collector ran successfully against the existing local fixture; repeated table fingerprints unchanged.
- Configured Supabase inspection completed; repeated 27-table fingerprints unchanged. One intentional deployment blocker remains for metadata unavailable through REST.
- All 598 pre-existing source/migration hashes unchanged, including election, polling, judge UI and calculation engines.

These are targeted regression checks, not five-competition acceptance or a full hosted multi-browser workflow. No new migration was exercised because this phase creates none.

## Running the inspection

Run from the repository root. Choose a NEW report filename on every run. Reports should remain private: they contain diagnostic IDs, schema information and hashes even though they exclude raw sheets and credentials.

```powershell
node backend/scripts/competition-preflight.mjs --help

node backend/scripts/competition-preflight.mjs --supabase --env-file backend/.env --output audits/competition-phase1-2026-10-13/new-rest-inspection.json

node backend/scripts/competition-preflight.mjs --postgres --host 127.0.0.1 --port 55439 --database votrix_repairs_1791835055235 --username postgres --output audits/competition-phase1-2026-10-13/new-sql-inspection.json
```

For PostgreSQL, select the intended target explicitly and use existing secure psql password handling; do not put a password or connection URI on the command line. The CLI disables startup scripts, uses READ ONLY transactions, sets timeouts, and uses `row_security=off` so a filtered inventory fails rather than claiming hidden rows are absent. It will not start a database server.

`--baseline <report.json>` compares observed records only when format, target and mode match. Row caps or incomplete reads are blockers, not empty tables. Raising `--max-rows` is explicit and bounded. A report never grants migration approval, even with zero blockers.

## Remaining risks and next phase

- Obtain deployed SQL catalog/ACL/function evidence before database rollout. REST cannot confirm migrations 093/100/101 at that level.
- The finalized-before-advancement, no-elimination completion, incomplete-tabulation visibility, per-round method, weighted-minor and carry-basis conflicts remain unmodified.
- The current system still has one competition context per event. Phase 1 establishes inspection and preservation foundations only; it does not claim multi-competition isolation is implemented.
- Shared participant/event dependencies need care in later migrations so competition changes do not alter election or polling behavior.
- Preserve the existing table-format judge score sheet and both historical calculation paths throughout future phases.

Recommended Phase 2: additive child competition identity plus explicit master-entry participation, with one-context legacy mapping and tests for five independent branches. Prepare reviewed migration/backfill code only after Phase 2 approval; deployment remains gated on the configured database metadata review. Judge-table redesign, new formulas, live-control changes and later phases remain out of scope.

STOP: await the user's approval before Phase 2.
