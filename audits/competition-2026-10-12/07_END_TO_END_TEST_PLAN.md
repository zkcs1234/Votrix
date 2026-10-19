# Competition end-to-end test plan and readiness checklist

Audit date: **October 12, 2026 (Asia/Bangkok)**. This distinguishes tests actually run during the read-only audit from proposed tests and manual scenarios. No production application startup, connected Supabase mutation, migration, real user/email or full browser scoring journey was executed. The isolated HTTP/CORS fixture exercised `createApp` with mocked configuration/database boundaries; the local WebSocket fixture used mocked identities/database responses and loopback sockets. Neither was a deployed two-account test.

## What actually ran

| Check | Actual result | What it establishes / limitation |
|---|---|---|
| Full existing backend suite | **468 passed, 1 failed, 3 skipped; 472 tests, 61 files: 59 passed/1 failed/1 skipped** | Mocked/unit orchestration and calculation coverage. The failure is a stale message assertion described below; database integration remained skipped. |
| Full frontend suite | **181 passed in 19 files** | Component/hook/navigation fixtures. Process-only `VITE_LOCK_PARTICIPANTS_ON_ACTIVE=true`; this does not establish the deployed flag. |
| Focused scoring/access/workbook tests | **70 passed in nine files** | Subset of the backend total above, not 70 additional tests. |
| Audit WebSocket transport/handler characterization | **8 passed** | Actual local socket client/server transport with mocked auth/DB, plus extracted current handlers and fake-timer/source characterization. Tests include defects; passing characterization does not mean those defects are repaired. |
| Audit security boundaries | **5 passed** | Actual `createApp` CORS/CSRF fixture plus mocked unchecked foreign-round/criterion/category requests. Characterizes current permission defects without database writes. |
| Pure scoring/advancement probe | Passed final assertions | Five numeric methods, missing-null behavior, shared cutoff ties, per-division ranks, decimal rounding, and reproduced weighted-eliminated-champion defect. |
| Frontend production build | Passed | Bundling succeeds; chunk larger than500KB warning remains. No production deployment was tested. |
| Frontend lint | **0 errors, 3 warnings** | Existing `useDelayedLoading.js` lines33,87,127 warnings; no fixes applied. |

Evidence logs and probe output are in [_evidence](./_evidence). Source-integrity verification is recorded by the root audit separately. Do not use historical test counts in older implementation reports as evidence for this audit.

The single existing backend failure is [round-rules-roster.test.js](../../backend/__tests__/services/round-rules-roster.test.js):68: expected message text `087-097`, while the current migration failure message says migrations through099. The operation still throws the expected503 and fails closed. This is an outdated test expectation, not evidence that qualification access succeeded. The assertion was deliberately left unchanged under the audit-only boundary.

## Safe rerun commands

Run from **`C:\Github\Votrix`** with existing dependencies. The audit guard blocks non-loopback fetch/HTTP(S) requests during test execution; it does not alter `.env` or production code. Keep `RUN_DB_INTEGRATION` unset/disabled for these commands. These tests must not be run with a real application startup side effect.

```powershell
$auditNodeOptionsBefore = $env:NODE_OPTIONS
$auditRosterFlagBefore = $env:VITE_LOCK_PARTICIPANTS_ON_ACTIVE
$auditDbIntegrationBefore = $env:RUN_DB_INTEGRATION
$auditGuardPath = (Resolve-Path 'audits/competition-2026-10-12/_evidence/block-external-network.cjs').Path
$env:NODE_OPTIONS = '--require "' + $auditGuardPath + '" ' + $auditNodeOptionsBefore
$env:RUN_DB_INTEGRATION = '0'
try {
    Push-Location backend
    try { npm.cmd test } finally { Pop-Location }

    $env:VITE_LOCK_PARTICIPANTS_ON_ACTIVE = 'true'
    Push-Location frontend
    try { npm.cmd test } finally { Pop-Location }

    node backend/node_modules/vitest/vitest.mjs run --config audits/competition-2026-10-12/_evidence/vitest-realtime.config.mjs
    node backend/node_modules/vitest/vitest.mjs run --config audits/competition-2026-10-12/_evidence/vitest-security.config.mjs
    node audits/competition-2026-10-12/_evidence/scoring-probes.mjs
} finally {
    $env:NODE_OPTIONS = $auditNodeOptionsBefore
    $env:VITE_LOCK_PARTICIPANTS_ON_ACTIVE = $auditRosterFlagBefore
    $env:RUN_DB_INTEGRATION = $auditDbIntegrationBefore
}
```

The backend suite is expected to retain the one stale assertion failure until an approved test update. The transport/security/probe tests intentionally assert currently broken behavior, so their success is **evidence of those defects**, not production acceptance.

Build/lint can be repeated from `frontend` with `npm.cmd run build` and `npm.cmd run lint`. Build writes ordinary build artifacts; it is not a deployment. It does not start `backend/src/server.js`, its lifecycle/archival schedulers or an email operation.

The existing [competition-scoring.integration.test.js](../../backend/__tests__/integration/competition-scoring.integration.test.js) is gated by `RUN_DB_INTEGRATION=1`; its setup comments mention old migration058. It only checks module loading and optional fixture read shapes, not the requested twelve-step workflow. Do not enable it against the existing `.env`. First validate that the URL/key/fixture explicitly target a disposable database, update the migration/setup instructions after approval, and add real workflow assertions as proposed below.

## Disposable full-system test fixture — proposed, not executed

Use an isolated project/database and isolated environment overrides, with migrations appropriate to the current app through099. Do not run duplicate install/upgrade paths blindly:097 is the initial progression migration and099 updates already-installed097 functions. Confirm function definitions/schema state before testing. Existing Supabase contents, policies and installed migrations were not inspected during this audit.

Provide:

- OrganizerA owning EventA; OrganizerB owning EventB; both in separate organizations.
- JudgesJ1/J2/J3 with active participant identities, judge membership and EventA enrollment; an event-wide judge and scope-restricted judges. A judge belongs only to EventB for negative tests.
- An active appointed reviewerR, a nonappointed reviewerR2, and disabled/unassigned participants.
- Six or more EventA entries, including individual/duo/group/other, actual custom divisions, and entries excluded by approved decisions. Use harmless test names and a formula-looking literal text name for export tests.
- A flat event; a one-round event; Preliminary→Final events for no-elimination, TopN, percentage, threshold and manual-selection rules; an optional independent special-award round.
- Active parent percentages40/30/20/10 totaling100; configured raw maxima40/30/20/10 for the90-point worked example; a separate0–10 fixture for valid zero/missing tests. Configure a second fixture where score maximum differs from percentage.
- Published average, sum, highest, trimmed and rank-based configurations; compatible judge panels for rank-based, deliberately incompatible panels for rejection; manual rules requiring independent approval.
- Final progression variants `back_to_zero`, `weighted`, `carry_forward`; an approved10-point Final penalty for the weighted elimination regression.
- Mail/asset providers replaced by local recording fixtures or explicit disabled test delivery. Store no real credentials in screenshots/logs; never send account invitations to real addresses.

Use separate browser profiles or different browser applications for Organizer/Judge/Reviewer cookies. One browser profile's tabs share cookies and cannot safely represent independent roles. DevTools Network should preserve request/response timing and WebSocket frames. Capture role, event/session/rules/round, row revision and submission/calculation IDs with personal data redacted.

Only after this isolated environment is explicitly prepared should a manual tester start backend/frontend against it. Running `npm run dev` in the current backend directory with the existing `.env` can connect to the real project and start background services; that is outside this read-only audit.

## The required twelve manual end-to-end scenarios

All twelve below are **unexecuted full-system scenarios**. The Expected column states acceptance targets; it must not be read as an observed successful outcome.

| # | Reproducible actions in isolated fixture | Expected acceptance / evidence to capture | Current audit evidence |
|---|---|---|---|
| 1. Configure and reload | OrganizerA creates EventA; enters title/dates, saves details/branding; creates/reorders rounds, criteria/minors, scoring rules, entries and initial assignments; enrolls judges and assigns scopes; reload each page; publish only when ready. Repeat with flat/single-round event and invalid dates/weights/bounds. | Persisted IDs/values match before/after reload; required criteria total100; invalid setup cannot publish; protected Final roster is not ordinary bulk-seeded; no unintended scoring/results release. Save failure preserves retryable input and does not duplicate writes. | Component/mock readiness coverage; no real create/save/publish journey. |
| 2. Assigned judge login | In separate profiles, sign in J1, scope-restricted J2, EventB-only judge, disabled participant and reviewerR. Open dashboard and directly request guessed EventA/other-round URLs. | Cookie-only session/CSRF behavior; each identity receives only permitted event/entry/round work; disabled/unassigned/other-event access rejects server-side. Reviewer sees verification rather than scoring controls. | Auth/access tests and source tracing; direct deployed API/RLS permissions unverified. |
| 3. Open stage/entry without refresh | Keep J1 page open in waiting state. Organizer starts Live Control, activates Preliminary, permits entry1 and its criteria. Do not refresh J1. | Authenticated UI→RPC→DB→event message→J1 refetch shows current session/rules/round and gates. Capture frame and matching GET response, correct inputs and timing. UI must distinguish active presentation from actual allowed scoring field. | Local mocked transport exercised current contestant-change handler; deployed cookies/proxy/event delivery not verified. |
| 4. Draft→Lock→Submit→progress | J1 types valid inputs; wait for draft persistence, navigate/reload, lock one complete parent, then remaining required entry/parent cells, finally Submit Round. Organizer watches grid/tabulation without refresh. | Draft is separate from lock; all parent inputs lock atomically; Submit Round snapshots complete sources once; organizer receives lock/submission progress automatically; live official aggregation uses submitted snapshots. Capture row revision, lock history, submission ID/version and receiving UI requests. | Pure/mocked tests; current Tabulation and overall Rankings invalidation gaps need repair/verification. |
| 5. Close scoring against stale client | Hold J1 screen/request using old gates. Organizer closes entry/criterion/intersection or pauses/ends performance; replay draft/lock POST with old context. Repeat closure racing a lock. | Server rejects a post-closure draft/lock; closure/lock serialization produces a deterministic before-or-after outcome, no partial JSON/projection writes. Submit Round is tested separately against its explicit submission window; do not assume performance closure automatically closes that window. | Current SQL gates traced; no real concurrent SQL test. |
| 6. Next entry/round and elimination | Organizer changes active slot/contestant; then attempt Final before verified TopN confirmation. Calculate Preliminary, reviewer verifies, organizer confirms approved qualifiers and activates Final. Repeat no-elimination and tied cutoff. | Open judge page updates; stale round context rejects; old drafts/locks are not copied into new round; qualification-blocked Final cannot score before approval; approved roster/version preserved; cutoff ties advance together; no-elimination derives eligible continuation without manual seeding. | JS roster and pure helper tests; current overall weighted field defect reproduced; full progression not verified. |
| 7. Disconnect/reconnect | Disconnect J1 network; organizer changes current stage/gates and completes another submission. Restore network without page refresh; repeat a dropped server connection and two-judge account switch. | Reconnect restores authenticated room membership and immediately refetches authoritative session/gates/saved values even when the event was missed. No offline queued score is replayed into another judge/session/round. | Transport characterization identifies reconnect synchronization gaps; full browser recovery unverified. |
| 8. Concurrent judges and totals | J1/J2/J3 enter corresponding raw values giving totals90/86/92; concurrently Lock/Submit. Repeat average/sum/highest/trimmed/rank fixtures and separate divisions. | Average89.33, sum268, highest92, drop-low/high one each90; rank fixture4/5/9 lower wins; equal min/max normalization and weights once; exactly one current source/version per judge/round; no duplicate projection rows. | Numeric/probe/XLSX serialization tests passed; concurrent persistence not exercised. |
| 9. Invalid/incomplete/ties/duplicates | Send blank/null/out-of-range/nonfinite/extra target scores; omit judge and assignment; double-click/replay identical lock and Submit; repeat different payload after lock, stale draft revision and shared final ties. | No fabricated missing zero; incomplete numeric result null/unranked/provisional and cannot finalize; true valid zero accepted; duplicates return existing commit/source; changed locked payload/conflicting draft reject; ties1,1,3 and Top5 cutoff includes all tied fifth-place contestants. | Pure test/probe plus SQL checks traced; API/transaction outcomes unverified. |
| 10. Correct and publish | Calculate selected-round/overall snapshot; reviewer verifies; organizer reopens an authorized mistake with reason; judge relocks/resubmits; attempt stale verification/finalization/publication. Recalculate→Verify→Finalize→Publish. Repeat amendment after confirmed advancement. | Reopening retains history, invalidates sources/review correctly; stale snapshot rejects; advancement corrections require approved amendment; publication uses verified current sources, immutable version and complete rules; overall publication ends scoring. Independently interleave approved penalty/account changes with Publish as below. | Source digest/state gates traced; finalized-digest race remains; no real publication transaction. |
| 11. Private vs approved results | J1 requests reviewer API, organizer rankings/report APIs, another judge's data and direct PostgREST with disposable anon credentials. R and R2 attempt verification. Test published results policy expressly agreed by stakeholders. | Scoring judge cannot read other judges' raw/unpublished data; only appointed independent reviewer can verify; organizer retains own-event control; direct database access cannot bypass HTTP restrictions. Ordinary judge final-results visibility follows an explicit approved policy rather than guessed access. | Local organizer-room privacy tested; deployed table grants/RLS unverified; no ordinary judge official-results endpoint found. |
| 12. Reload and exports | Reload all profiles after submission/publication, refetch same sources; export CSV/JSON/XLSX/print-PDF and division-specific report; verify XLSX server-side, then modify a harmless cell/formula/template ID and reverify. | Same saved rules/session/source versions and result values across reload; published snapshot stable; division filtering retained; exports identify provisional vs published; tampering detected with no score writes; spreadsheet recalculation matches agreed rounding; literal formula-looking name is safe text. | Existing XLSX roundtrip/tamper tests pass; published report filtering defect source-evidenced; external Excel/PDF/download behavior unverified. |

## Proposed real API and SQL regression tests

These are **proposals requiring approved implementation and an isolated database**, not newly added production tests. Existing fixture SQL under `backend/__tests__/fixtures` can inform setup; do not paste those seed/assertion files into the live Supabase project.

| Priority | Test and authoritative boundary | Required assertion |
|---|---|---|
| P0 | Full Organizer→Judge→Reviewer API workflow through actual routes, cookies/CSRF, installed migrations and two socket clients | All twelve scenarios pass without manual refresh/workarounds; saved IDs/versions follow one event; source values—not UI totals—drive results. |
| P0 | Weighted Final elimination shared-engine regression, then actual calculation/publication API | PreA100/B90; Top1 qualifiesA; FinalA0, approved Final deduction10, weights40/60. Current engine incorrectly publishes B36 ahead of A34. Approved championship field must exclude eliminated B while preserving Preliminary history. |
| P1 | Foreign event round/criterion/category mutation API and SQL composite integrity | OrganizerA-owned URL cannot mutate OrganizerB draft round or link foreign criteria/category; rejected transaction leaves both events unchanged. |
| P1 | Direct REST least privilege on every scoring/snapshot/history table and private RPC | anon/authenticated reads/mutations fail; service-role writes succeed only through event/actor-authorized application logic. |
| P1 | Draft/Lock versus gate closure two PostgreSQL sessions | Both acquire shared event/session serialization; a commit before closure remains valid, any commit after closure rejects; no partial source/projection/audit commit. |
| P1 | Two draft writers at the same revision | One update commits, the stale revision rejects, and the winning value/version is reloaded; no last-arrival overwrite without conflict. |
| P1 | Repeated lock and Submit from two API clients | Same source returned for duplicates; current unique index holds; altered locked payload rejects; numeric results are not double counted. |
| P1 | Publish interleaved with approved penalty/eligibility/account change | The transaction compares authoritative current revision under lock and rejects stale finalized snapshot. Historical finalized/published content remains immutable. |
| P1 | Publish rules interleaved with round weight/progression, category weight, config, judge role/activity/assignment edits | Every change since validated review is detected; source comparison covers the entire approved configuration. |
| P1 | Current verified calculation→approved advancement→Final activation including manual/tied modes | Approved qualifiers and source rules/calculation IDs retained; no ordinary AddAll bypass; stale/foreign calculation rejects; score guards deny eliminated entries. |
| P1 | Manual calculate with nonexistent/foreign round; selected Final field | Unknown/foreign round rejects before insert; coverage exactly equals approved eligible scope; required manual championship field explicitly defined. |
| P2 | Snapshot result/export identity after correction/new provisional snapshot | Current preview and historic publication are explicitly labeled; published division filters and JSON/CSV/XLSX result scope agree. |
| P2 | Forced socket disconnect, missed gate message, account switch, stale HTTP response | Reconnect/refetch restores current authoritative context; old event/round responses cannot overwrite newer context; all subscribers clean up correctly. |

### Rollback-only SQL concurrency designs — unexecuted

Use a seeded disposable fixture. The local SQL fixture files create/insert test data and were not executed during this audit. Wrap destructive assertions in `BEGIN ... ROLLBACK`; concurrency checks may need committed disposable setup so a second connection sees it. Never substitute a production event ID. Teardown should target only the explicitly created fixture database/records after inspection.

**Gate race:** connectionA locks the EventA/session row and applies the same gate closure path; connectionB starts `competition_scoring_write` with an old context. Assert B waits, then rejects after A's committed closure. Reverse ordering and assert a valid lock committed first is retained. Force a later projection/history insert error and confirm JSON locks, flat scores, draft removal and audit all roll back together.

**Finalized publication race:** finalize a current fixture calculation; pause application publication between digest read and RPC. ConnectionB reports/approves a predefined deduction or changes a required judge account state; resume A. Current code comparison can accept the old digest after pending decision resolves because finalized snapshots are not invalidated. The repair acceptance is a stale-input rejection followed by new calculation/reverification. A single uninterrupted SQL call is insufficient to test this service-read→RPC interval; use a test barrier around actual service orchestration.

**Review/publication race:** pause `freezeRules` after foundation/readiness validation, mutate one omitted setup field in B, then continue A. Current criteria/registration source representations omit some rule/panel fields; the acceptance is a conflict for each changed source, with no published rules row or scheduled event produced.

**Advancement immutability:** confirm a verified TopN fixture; attempt raw membership mutation, correction of finalized source, changed qualifier list without permitted manual rules and Final lock for an eliminated ID. Every rejection leaves approved qualifiers, prior source versions and historical result snapshots unchanged. Repeat no-elimination continuation to ensure those protections do not force an unnecessary qualification approval.

## Read-only deployment diagnostics

The following metadata queries are **optional manual diagnostics, not run in this audit**. They reveal constraints/permissions/function names, not credentials or score payloads. Use them only on the intended project and retain sanitized results. Do not run migrations or data updates while obtaining this evidence.

```sql
-- Sensitive table RLS and direct API-role privileges.
SELECT n.nspname AS schema_name, c.relname AS table_name,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
       CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
            THEN has_table_privilege('anon', c.oid, 'SELECT') END AS anon_select,
       CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
            THEN has_table_privilege('anon', c.oid, 'INSERT,UPDATE,DELETE') END AS anon_write,
       CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
            THEN has_table_privilege('authenticated', c.oid, 'SELECT') END AS authenticated_select,
       CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
            THEN has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE') END AS authenticated_write
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
  AND c.relname IN ('competition_scores','competition_session_judge_scores',
      'competition_result_calculations','competition_deductions',
      'competition_rule_versions','competition_judge_drafts',
      'competition_round_submissions','competition_eligibility_decisions',
      'competition_advancement_decisions','competition_criterion_lock_history')
ORDER BY c.relname;

SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename LIKE 'competition_%'
ORDER BY tablename, policyname;

-- Verify event/round relationship constraints and indexes exist.
SELECT conrelid::regclass AS table_name, conname, contype,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN ('public.event_participants'::regclass,
                  'public.competition_round_criteria'::regclass,
                  'public.competition_round_contestants'::regclass,
                  'public.competition_result_calculations'::regclass)
ORDER BY table_name, conname;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('competition_sessions','competition_judge_drafts',
                    'competition_round_submissions','competition_deductions');

-- Check exposed privileged function names and role execution grants.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer,
       CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
            THEN has_function_privilege('anon', p.oid, 'EXECUTE') END AS anon_execute,
       CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
            THEN has_function_privilege('authenticated', p.oid, 'EXECUTE') END AS authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'competition_%'
ORDER BY p.proname, arguments;
```

`has_table_privilege(...,'INSERT,UPDATE,DELETE')` reports whether any listed privilege is present; inspect individual grants when it is true. RLS-enabled tables still need policy review. RLS-disabled tables with no direct role privileges may be inaccessible despite absent RLS; privileges must be tested rather than assumed. Core-table RLS/grant declarations are missing in repository migrations, but deployed exposure remains **Cannot verify** until this inventory and safe direct API negative tests are performed.

Inspect deployed WebSocket upgrade support, `/ws` proxy routing, cookie domain/SameSite/Secure settings, exact allowed origin set, number of backend workers and schema-cache refresh through configuration presence/sanitized logs. Do not print JWT/Supabase/email secrets. Check origin allowlisting with an unrelated `*.vercel.app` origin in a disposable deployment; wildcard preview acceptance currently permits that origin when its flag is enabled. Realtime rooms are process-local, so test multiple backend processes if that is the intended deployment.

Applied migration history is not established merely by local SQL files. Check deployed function definitions/columns/indexes against the current099 implementation and confirm the098 `event_participants.event_id→events.id` relationship. Metadata queries fail if relations are missing; that failure is itself evidence to record, not permission to apply a migration during this audit.

## Acceptance checklist for a real competition

No item below is marked complete based only on source reading. `Observed issue` means an audit test or code trace identified a blocker that still requires an approved fix and regression test.

| Required acceptance | Current status | Evidence still required |
|---|---|---|
| Configure/persist/reload flat and multiround setup | Not verified end-to-end | Scenario1 on isolated installed schema. |
| Judge account/event/round/entry boundaries | Partially exercised; observed tenant setup gap | Scenario2 and cross-event API/SQL tests, direct REST/RLS inventory. |
| Open/close/round/slot updates without manual refresh | Partially exercised transport; not verified deployment | Scenarios3/5/6 including actual cookie accounts and real HTTP/DB. |
| Judge Draft/Lock/Submit updates organizer automatically | Observed invalidation gaps | Scenario4; Tabulation/Rankings receiving state after approved repair. |
| Stale client cannot save after closure | Not verified against PostgreSQL | Scenario5 plus serialized gate race and transaction rollback. |
| Disconnect/reconnect/account switch recovery | Observed recovery gaps | Scenario7 with missed frames and slow stale GETs. |
| Deterministic calculation, approved round/rank/division scope | Pure arithmetic exercised; weighted elimination broken | Scenario8 and eliminated-champion regression; required business decisions settled. |
| Completeness/ties/duplicate writes | Pure/mock cases exercised; SQL not verified | Scenario9 with actual unique indexes/RPCs and cutoff ties. |
| Corrections/history/publication version current | Observed source race gaps | Scenario10 and interleaved finalized publication/setup review tests. |
| Explicit judge/reviewer/private result visibility | Ordinary judge policy unresolved; deployed access unverified | Scenario11 with approved policy and direct REST negative tests. |
| Published reload/report/export consistency | XLSX serialization exercised; division report defect | Scenario12 plus external spreadsheet/PDF behavior and literal text safety. |
| All critical actionable controls connected and recoverable | Source audit reports partial/dead/error cases | [02 button audit](./02_FEATURE_AND_BUTTON_AUDIT.md), agreed repair acceptance and full scenario rerun. |
| No application changes during audit | Verified: 649 files checked, zero changed | [_evidence/application-change-check.json](./_evidence/application-change-check.json); audit artifacts are the only additions made for this request. |

**Readiness: NOT VERIFIED for a real competition, with reproduced and code-evidenced blockers.** The test suite/build results are useful component evidence, not a substitute for the real database, cookies, concurrent accounts, websocket recovery and official-publication tests above. See [06_PRIORITIZED_IMPLEMENTATION_PLAN.md](./06_PRIORITIZED_IMPLEMENTATION_PLAN.md) for the approval-gated repair order.
