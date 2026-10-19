# Scoring, tenant security, deployment origins and report repairs

Implementation scope: F-01, F-02, F-03, F-08, F-15, F-18, F-19, F-23; backend support for the F-16 atomic division move. F-14 shares the new championship-field helper with the root agent's authoritative manual calculation path. Existing working-tree changes were preserved. No connected Supabase operation, migration, email, scoring submission or deployed application was executed by this agent.

## Corrections and evidence

| Finding | Root cause and implemented correction | Files / focused acceptance |
|---|---|---|
| F-01 | Weighted overall candidates were the union of all round entries. Candidate selection now uses the effective selected Final field, excludes approved non-competing finalists, and requires every applicable included round's completed result. Arithmetic, weights, deductions, exact rounding, ties and unaffected progression methods remain unchanged; Preliminary history still includes eliminated entries. | `shared/competition-calculation.js`, `backend/__tests__/modules/official-competition.test.js`. Actual engine regression: Preliminary A100/B90, Final A0, Final deduction10, weights40/60 => A34/rank1 only, ready=true; B retains Preliminary90. Missing finalist source => null/unranked and not ready. Empty unconfirmed Final cannot crown a Preliminary entry. Category/division/no-elimination and special exclusion cases pass. |
| F-02 | Owned URL event was insufficient for nested UUIDs. Attach/detach require both round and criterion inside that event before any write. Round category/next-round changes require same-event ownership; self-advancement rejects. Failed resource/budget reads fail closed. | `backend/src/services/competition.service.js`, `competition-tenant-boundaries.test.js`. Foreign round/criterion/category/next-round denied before mocked mutation; legitimate own link passes. Root-owned migration100 provides database defense; direct real SQL acceptance belongs to root. |
| F-03 | Provider-wide preview trust granted credentialed HTTP/WS access to unrelated tenants. Both transports now share canonical exact origins; explicitly configured `CLIENT_URLS`/`PREVIEW_CLIENT_URLS` permit legitimate deployments. Invalid origin configuration rejects startup. Untrusted browser mutations reject with403 even when a matching token could otherwise be presented. All production approved origins require HTTPS. | `backend/src/config/trusted-origins.js`, `env.js`, `security.js`, `app.js`, `ws-server.js`, `render.yaml`, `competition-origins-and-capacity.test.js`. Actual isolated `createApp`: named origins receive credentialed CORS; unrelated tenant receives none and POST403. Actual loopback WS unrelated origin upgrade403. No browser cookie exploit or production deployment tested. |
| F-08 | Ten concurrent sockets per network peer blocked legitimate campus NAT panels. Capacity now bounds authenticated tabs per user and node total. Defaults5/user and1000/node; configured through positive-integer `WS_MAX_CONNECTIONS_PER_USER`/`WS_MAX_CONNECTIONS`. Pending upgrades time out, close releases quota, and max incoming WS payload is16KB. No forwarded-IP identity assumption. | Actual isolated WS fixture: twenty independent mocked identities sharing127.0.0.1 all upgrade101; redundant tabs beyond configured3/user reject429; closing frees capacity; missing identity rejects401. Real authentication/database is mocked. Realtime agent owns access refresh/reconnect coordination. |
| F-15 | Published rows replaced division-filtered rows; CSV read nonexistent `totalScore` and dropped export query scope. Reports now filter published rankings and round/division/award sections, preserving original official ranks. Historic round entries resolve division through event-scoped identities. CSV uses authoritative `finalScore` and missing values remain blank. Frontend adapters retain null and label incomplete/manual output; limited ranking presentation preserves server ordering. | `reports.service.js`, specific `exportCompetitionReport` controller, `frontend/src/modules/competition/views/competitionMetrics.js`. Published/unpublished report tests and export assertions pass; frontend numeric-zero/null/manual/report/PDF/top-N cases pass. Setup UI agent owns rendered page status formatting. |
| F-18 | Legacy rank-based engine omits criterion/round dictionaries. Mapper now tolerates optional breakdowns and retains placement metadata and signed legacy score ordering. Modern versioned branch is unchanged. | `pageant.service.js` legacy mapper only, `legacy-rank-results.test.js`: actual legacy engine/service read with mocked persistence returns stable ranks/placements and no throw. |
| F-19 | CSV quoting handled syntax but did not prevent formula interpretation. Shared `csv-export.js` prefixes risky text as a literal, quotes headers/data and preserves actual numeric score cells. Backend report and frontend download use the same helper. SpreadsheetML already explicitly types names as strings and is regression-tested. | `shared/csv-export.js`, backend/frontend export helpers; CSV prefix/whitespace/BOM/quote/missing/numeric tests, browser download payload test, SpreadsheetML type assertion. No external spreadsheet program was opened; target viewer behavior remains a release check. |
| F-23 | The migration guidance expectation was stale. Assertion now expects migration100 while retaining unavailable-eligibility503 fail-closed verification. | `round-rules-roster.test.js`; root owns updated migration guidance and full-suite verification. |
| F-16 backend support | Division move previously consisted of two independent PATCH operations. New POST `/divisions/reorder` requires a complete unique UUID permutation for the owned draft event and calls one transactional RPC. Missing function returns503 with migration100 guidance. | `competition-division.service.js`, specific controller/route; three mocked boundary tests pass. Root owns SQL100; setup agent owns frontend wiring. |

## Tests executed by this agent

Network protection during all npm tests:

```powershell
$env:NODE_OPTIONS='--require=C:\Github\Votrix\audits\competition-2026-10-12\_evidence\block-external-network.cjs'
```

From `backend`, **9 files / 62 tests passed**:

```powershell
npm.cmd test -- __tests__/modules/official-competition.test.js __tests__/modules/csv-export.test.js __tests__/modules/scoring-engine.test.js __tests__/modules/competition-workbook.test.js __tests__/services/competition-tenant-boundaries.test.js __tests__/services/competition-origins-and-capacity.test.js __tests__/services/competition-report-scope.test.js __tests__/services/legacy-rank-results.test.js __tests__/services/competition-division-order.test.js --reporter=dot --maxWorkers=4
```

From `frontend`, **2 files / 5 tests passed**:

```powershell
npm.cmd test -- src/utils/exportReport.test.js src/modules/competition/views/competitionMetrics.test.js --reporter=dot
```

The second frontend run includes the three metric tests already run individually; do not add those three twice to aggregate totals. These counts include pre-existing arithmetic/workbook tests. Root's final suite totals supersede focused counts.

## Dependencies and limitations

- Migration100 protections/RPCs must be reviewed and tested on the isolated local database. They were not applied to the configured Supabase project. Historical result rows are not rewritten by the engine or DTO changes.
- Exact deployment origins must be configured before releasing the hardened app. The removed provider wildcard is deliberately ignored even if `ALLOW_VERCEL_PREVIEWS=true` remains in a deployment environment. Name each legitimate preview in the explicit list.
- WebSocket authentication is still revalidated with the upgrade cookies. Realtime agent's HTTP-token-refresh/reconnect replaces stale upgrade authentication; server authorization remains enforced.
- Per-node rooms do not distribute events across different backend instances. Topology is not discovered by a local code change. Bounded HTTP convergence and real deployed routing/capacity tests are still needed.
- F-11 deployed table grants/RLS and real cookie authentication/browser scoring are not established by mocked fixtures. Root owns ACL inventory/migrations and safe SQL verification.
- External Excel/LibreOffice CSV import/recalculation, actual frontend downloads/print dialogs and authenticated organizer/judge/reviewer multi-browser operation remain unverified production release gates.
- Review of root migration100 identified category same-event coverage, calculation revision immutability and stale finalized advancement as additional transaction checks; root was notified before local SQL acceptance.

No production-ready claim is made by these focused results.
