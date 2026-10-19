# Competition repair test results

Updated October13,2026. This record separates current executed evidence from historical audit counts and unexecuted deployment checks. Exact final summaries are retained in `evidence/`; focused counts are subsets, not added to full-suite totals.

## Executed tests

| Run | Evidence | Meaning |
|---|---|---|
| Implementation baseline backend | [backend-baseline.log](evidence/backend-baseline.log):468 passed,1 stale failure,3 skipped | Reproduced original stale migration-message expectation before repair. |
| Full repaired backend | [backend-regression.log](evidence/backend-regression.log):**518 passed,3 skipped;69 passed files,1 skipped** | Includes substantive new arithmetic/tenant/origin/transport/report/creation/workflow tests. Database integration placeholder remains disabled/skipped. |
| Full repaired frontend | [frontend-regression.log](evidence/frontend-regression.log):**243 passed/36 files** | Mounted jsdom/component/hook/race/handoff/refresh tests, not authentic browser accounts. |
| Workflow/publication/manual focused | [workflow-focused.log](evidence/workflow-focused.log):23 passed/3 files | Service contract/projection/version/invalidation tests; included in full backend suite. |
| Existing actual SQL through099 | [sql-baseline.log](evidence/sql-baseline.log) | Local existing no-elimination/TopN/percentage/threshold/manual progression, old-session conflicts and source/history preservation. |
| New actual SQL100–102 | [sql-repairs.log](evidence/sql-repairs.log), [summary](evidence/sql-repairs-summary.json) | Actual PostgreSQL migration/roles/relations/scoring/corrections/transitions/advancement and concurrent connection checks; details below. |
| Build | [frontend-build.log](evidence/frontend-build.log) | Successful Vite build; existing>500kB chunk warning. |
| Lint | [frontend-lint.log](evidence/frontend-lint.log):0 errors/3 warnings | Existing unused disable directives in useDelayedLoading33/87/127; no unrelated cleanup. |

Backend/frontend test runs preload the audit external-network guard; database integration against `.env` is disabled. Frontend suite uses process-only `VITE_LOCK_PARTICIPANTS_ON_ACTIVE=true` for existing tests; persisted environment values are not changed. No production startup, Supabase write, email or media delivery was performed.

## Real PostgreSQL acceptance

`backend/scripts/test-competition-repairs.mjs` fixes host127.0.0.1/port55439, verifies `.tmp/competition-postgres-tests` through `SHOW data_directory`, clones only a regex-restricted disposable through099 fixture and does not read `.env`. Its domain schema is a minimal isolated fixture, not a claim that every deployed migration/table is identical.

Executed checks cover:

-100–102 install after099 and preserve preexisting rule, locked-score, submission, qualifier and result payloads.
- Actual local ACL inventory before101, direct anon/authenticated denial on12 private tables and creation requests, service-role reads.
- Owned stable Create request retries, changed details/foreign organization rejection without duplicate event.
- Direct SQL foreign membership/category/division/next-round rejection; complete atomic division reorder and invalid permutation rollback.
- Full setup revision rejecting old publication after round weight/progression, category weight, scoring config, panel role/account change.
- Draft revision conflict, valid zero, idempotent locks/submissions, closed scoring rejection and projection failure causing complete transaction rollback.
- Reason+confirmed correction preserving historical locked/source data and producing a new source version after relock/resubmit.
- Stale calculation INSERT, finalized publication and finalized advancement rejection after relevant input changes; independent approval and immutable snapshot/source identity.
- Current actual submitted sources and approved penalty→exact result→reviewer Verify→organizer Finalize/Publish; completed event and closed submission window.
- Verified Top1→approved Final field→eliminated lock rejected→Final zero submission; weighted championship34 excludes eliminated90 while retaining Preliminary history.
- Two PostgreSQL connections use an explicit lock barrier for gate closure versus stale Lock and concurrent duplicate Lock/Submit; exactly one current submission/numeric source.

Early SQL runner assertions used outdated error labels/order while existing guards correctly rejected. The runner was corrected to assert actual errors and close input gates before full Submit; application guards were not weakened to make those assertions pass. Final acceptance log is authoritative.

## Safe repeat commands

With existing dependencies, from repository root:

```powershell
$repairNodeOptionsBefore = $env:NODE_OPTIONS
$repairRosterBefore = $env:VITE_LOCK_PARTICIPANTS_ON_ACTIVE
$repairIntegrationBefore = $env:RUN_DB_INTEGRATION
try {
    $env:NODE_OPTIONS = '--require="C:\Github\Votrix\audits\competition-2026-10-12\_evidence\block-external-network.cjs"'
    $env:RUN_DB_INTEGRATION = '0'
    Push-Location backend
    try { npm.cmd test -- --maxWorkers=4 } finally { Pop-Location }
    $env:VITE_LOCK_PARTICIPANTS_ON_ACTIVE = 'true'
    Push-Location frontend
    try { npm.cmd test -- --maxWorkers=4; npm.cmd run build; npm.cmd run lint } finally { Pop-Location }
} finally {
    $env:NODE_OPTIONS = $repairNodeOptionsBefore
    $env:VITE_LOCK_PARTICIPANTS_ON_ACTIVE = $repairRosterBefore
    $env:RUN_DB_INTEGRATION = $repairIntegrationBefore
}
```

The local SQL runner requires the explicitly isolated cluster and a prepared fixture. It intentionally refuses an external host/data directory. After starting that test cluster, `node backend/scripts/test-competition-participation.mjs` prepares a new through099 database; `node backend/scripts/test-competition-repairs.mjs` clones it and tests100–102. These are fixture-creating commands, **not SQL to paste into Supabase**. Databases are retained for inspection; the test cluster is stopped after verification.

## Remaining full-system coverage

All twelve parent scenarios received partial component/service/SQL coverage. No complete authentic organizer/judge/reviewer browser run against disposable Supabase/PostgREST was performed. User/email creation, uploaded assets, real cookie origins, websocket hosting, full form persistence in browsers, direct REST grants and actual exports/spreadsheet/PDF behavior require the isolated deployment checklist. Do not present passing mocks or localhost RPCs as deployed production readiness.
