# Phase 9 — Release Candidate Validation and Deployment Gate Closure

Completed October 14, 2026 (Asia/Bangkok). **Release recommendation: NO-GO.** Validation and one confirmed reliability fix were local. No production contact, migrations, writes, provisioning, feature activation or deployment occurred. Phase 10 has not started.

## A. Release candidate baseline

[baseline.json](baseline.json) records the 772-file source/script/test/configuration baseline, earlier Git status, Phase 1–8 report hashes and reviewed 100–108 migration hashes. The heavily edited workspace includes prior user work; it was neither reset nor represented as an approved immutable deployment artifact. [configuration-migrations.json](configuration-migrations.json) records source declarations and configuration key names only, never secrets. Native gates remain opt-in. Existing Render blueprint declares one Node web service/free plan; actual instances, ingress and supporting services are unconfirmed.

## B. Files changed

[FILE_CHANGES.md](FILE_CHANGES.md) lists every source/test addition and modification. **Only two pre-existing files changed:** the native hint bridge and its test. The bridge now bounds WebSocket handshake/readiness waiting at ten seconds and retries a peer that upgrades but never becomes ready. The new regression deliberately withholds readiness and verifies reconnection. No competition feature, formula, policy, migration or historical recalculation was added.

New scripts capture baseline/configuration evidence, rerun reviewed PostgreSQL/restore/transport/capacity scenarios in new local clones, extend real browser cases and measure export-process peak memory. Earlier Phase 1–8 evidence is not overwritten. 75 protected source/test paths remain byte-identical; prior reports and migration hashes also match.

## C. Production catalog and migration readiness

[SCHEMA_DIFFERENCE.md](SCHEMA_DIFFERENCE.md) distinguishes verified local expectations from the unavailable target-specific comparison.

**BLOCKED/P0.** No direct deployed read-only SQL access or applied ledger was supplied. Phase 9 did not contact Supabase. Earlier REST observations remain supporting as-of evidence, not exact catalog proof or a backup. A truthful target-specific schema difference cannot be produced until complete constraints/indexes/triggers/function bodies/owners/search paths/RLS/ACLs, provider roles, election/polling dependencies and migration checksums are supplied.

Local forward chain **103→104→105→106→107→108** passes in a fresh pre-103 clone, preserving 25 original inventories; only final108 is rerun. [chain-recovery.json](chain-recovery.json) contains checksums and timing. Read-only local preflight inventories 46 tables, zero structural/permission blockers and 12 unchanged sparse historical review items; `migrationApproved:false` remains. Reviewed 100–102 prerequisites and target-specific missing migrations must be established before any separately authorized execution. No migration file was added or edited.

## D. Backup and restore evidence

Fresh local chain and populated restores pass, with catalog/ACL and exact SQL inventory comparisons. [populated-restore.json](populated-restore.json) covers 49 public tables, including108, and confirms its source is unchanged. These sparse fixtures omit election/polling/provider-managed auth/storage/assets/global roles. Actual backup provider/ID/retention/PITR, recovery owner, approved numeric RPO/RTO and full isolated recovery remain **BLOCKED/P0**. Local durations are not recovery promises. Phase 7's recovery runbook remains applicable.

## E. Hosted authentication acceptance

**BLOCKED/P0.** No approved isolated hostname, accounts or real hosted PostgREST environment was supplied. Browser tests use synthetic signed JWT issuance, actual application authentication/account/role/profile/CSRF/CORS/rate/resource middleware and real SQL RPCs through a loopback SDK contract adapter. They do not test password login, provider refresh/rotation, real hosted logout/revocation or production ingress. Required accounts, scopes and approvals are specified in [BLOCKERS.md](BLOCKERS.md).

## F. Multi-instance transport

[transport.json](transport.json) passes two Node publisher/room-registry processes: 64.11 ms local delivery including coalescing, HMAC denial, duplicate suppression, score-field rejection and broker restart/queued recovery. Room sockets are synthetic; ordinary browser runs use real cookie-authorized sockets on one API process. The new two-test relay module suite also verifies bounded no-ready reconnection.

Actual topology, WSS/network isolation, secret rotation, availability/monitoring, real authenticated users on distinct API instances, revocation and representative delayed/out-of-order/missed-frame recovery remain **BLOCKED/P1**. Best-effort hints require authoritative reconciliation and do not establish durable delivery. No external service was provisioned.

## G. Rate and capacity acceptance

The complete backend suite retains the actual-createApp campus-IP/verified-subject/public-window/429/revocation/unrelated-module tests from Phase 8. Scoped quotas and frontend Retry-After handling remain default-off/explicitly gated. Stores are process-local. Source trusts one reverse-proxy hop; approved ingress must overwrite forwarding headers and prohibit bypass. Actual topology/distributed enforcement/campus load remain **BLOCKED/P1**; no global/election/polling policy was changed.

[capacity.json](capacity.json) reruns 50 entrants/five judges/four majors/three minors: 3,000 targets, 20 concurrent real draft RPCs, batch 2183.57 ms, tabulation read 439.85 ms including psql startup and engine 25.05 ms. Remaining source rows are guarded SQL fixture seed followed by real submission RPCs; full-roster HTTP autosave and separate lock-wait times are not measured.

[export-memory.json](export-memory.json) measures an isolated Windows serializer process retaining two outputs of 2192564 bytes each: peak working set **107282432 bytes**, including Node runtime/modules/input. Serialization overlaps output retention but is sequential; it is not concurrent HTTP/SQL export acceptance. Native 100-entrant/five-round/ten-judge/ten-major/five-equal-minor/12,000-target/10 MiB guards are unchanged. Provider connection limits, sustained HTTP/public load, long decision histories, deep carry and representative peak/cross-host resource measurements remain NOT TESTED.

## H. Browser workflow results

All evidence is local Chromium with production React components/unchanged table and the middleware/adapter limits in E.

| Case | Executed result |
| --- | --- |
| Five independent children | PASSED: 4 groups/867 application requests; shared master, separate setup/panels, scoring/review/finalization/publication and automatic updates. |
| Dashboard, one-child parent, corrections/deductions/qualification/publication | PASSED: 6 groups/579 requests; original details/branding parent creation, independent review, head clearing/resubmission, replace/withdraw, Preliminary/Final and tied Top-N confirmation. This does not exercise the complete hosted login/profile/information-form wizard. |
| All six methods | PASSED: 4 workflow groups/1038 requests across six method-configured children; numeric expected totals/placements checked, manual explicit placement retains NULL numeric score. One entrant/two judges per method; exhaustive method/tie/panel variations remain SQL/unit evidence. |
| Compatible carry | PASSED: 3 groups/538 requests for Back to Zero65, additive140 and weighted70. Setup is a reviewed SQL RPC fixture; live/scoring/review/finalization/qualification are actual UI. |
| Saved CSVs | PASSED: all four Chromium-written files parsed from disk. Scope, exact raw88/maximum100/final88 and shielded formula-like name verified; hashes/files in [browser-downloads.json](browser-downloads.json). |
| Large roster | PASSED: actual 50-entry/600-input judge table, closed locked sources, audited correction, retained values and one persisted edit/major lock without reconstructing a current head. Full 600-cell interaction/load is NOT TESTED. |
| Election/polling | PASSED local regression suites/protected hashes. Hosted browser/recovery scenarios remain BLOCKED; local competition fixtures contain no election/polling tables. |

Individual JSONs record requests/scopes and expected outcomes. The initial sandbox browser attempt could not expose Chromium and was interrupted; the explicitly approved loopback retry passes. Later fixture/locator assumptions, if corrected, are identified in the test logs; no engine is changed to obtain expected values.

## I. UI/UX findings and fixes

Browser logs include the deliberate cross-role 403 and temporary Vite socket-abort messages during tab/context changes; all asserted cases completed. PowerShell's stderr redirection reports a shell failure even for a zero-exit Node diagnostic, reproduced separately. The passing per-case assertions/artifacts and sequential Node runner are the browser evidence; the shell status is not counted as a passed assertion. The completion generator was corrected to decode PowerShell UTF-16 logs before verifying test totals.

The Phase 8 dashboard, setup, participation, criteria/round/panel/freeze, live, tabulation, qualification, results/publication and CSV connections remain intact. Extended checks confirm error/disabled gates and cross-role denial. No unrelated UI redesign was made. The only new runtime fix addresses stalled relay readiness. Existing frozen-rule/used-roster/reviewer replacement procedures remain deliberately absent and separately scoped. Hosted full information-form/upload/profile flow and exhaustive all-method/carry/large-roster variations require candidate acceptance rather than optimistic labeling.

## J. Security and privacy

Actual SQL/privacy/immutability/actor/CAS/current-source suites pass. Historical snapshots or old Submit receipts never replace a cleared current head; incomplete worksheets/results/exports stay masked. Independent verification, finalized calculation/qualification/publication provenance, exact raw CSV text and formula shielding remain unchanged. Hints remain score-free and recipient scoped. Private no-store/public allowlist/tombstones and unknown/foreign context denial retain regression coverage. No auth token or configuration secret values were recorded in the configuration inventory.

## K. Activation and rollback

[RELEASE_RUNBOOK.md](RELEASE_RUNBOOK.md) defines assigned owners/signoff, reviewed artifact and target identity, catalog/ledger and full backup preconditions, forward sequence, matched API/UI flags, scoped rate/relay approval, hosted smoke/load/security tests, monitoring/stop criteria and safe rollback. No owner or numerical RPO/RTO/traffic/error threshold is invented.

Disable affected UI/API features on approved rollback while retaining populated-child ambiguity, current-head/qualification guards and additive immutable history. Do not drop tables, replay old RPCs, fabricate heads, rewrite rules or recalculate history. Restore/cutover and publication withdrawal are separate authorized operations. No flag/configuration was changed here.

## L. Full verification

| Check | Result |
| --- | --- |
| Backend | PASSED88 files/664 tests; one existing gated integration file/three assertions SKIPPED, not passed. |
| Frontend | PASSED45 files/314 tests; two workers, process-only roster-lock override. |
| SQL | PASSED5 navigation/removal +13 tabulation +8 publication groups, fresh reviewed local clones. |
| Chain/restore | PASSED locally103–108, final rerun and fresh whole/populated restores. |
| Browser | PASSED basic/extended/method/carry/large roster; saved four CSV artifacts verified. Hosted scope BLOCKED. |
| Relay | PASSED local process delivery/auth/privacy/recovery and stalled readiness regression. |
| Builds/syntax/diff | Default/native-enabled builds PASSED; existing large-chunk warning retained. Changed JS syntax and git diff checks PASSED. |
| Preservation | 772 baseline files compared; 75 protected paths unchanged; earlier reports/migrations retained. |
| Production | Catalog/ledger, recovery, hosted auth and distributed operational gates BLOCKED/NOT TESTED. |

The workspace PostgreSQL cluster is restored to its original stopped state. Test listeners are closed; disposable clones/dumps/downloads remain local. No source template was removed or mutated.

## M. Remaining blockers

[BLOCKERS.md](BLOCKERS.md) gives severity, unresolved reason, exact missing evidence/resource/owner, local feasibility and required approval for every gate. P0: deployed catalog/ledger, complete production recovery and hosted authentication. P1: representative shared transport/proxy/distributed quotas and supported production capacity. Local passing evidence does not close these gates. [release-checklist.json](release-checklist.json) explicitly distinguishes PASSED, FAILED release gate, BLOCKED and NOT TESTED.

## N. Prerequisites requiring user approval

Supply approved read-only target catalog access or owner-exported evidence; separately approve isolated candidate/restore resources and sensitive backup/account access, hosted migrations/test writes, transport/quota/ingress configuration, supported load and numeric recovery/monitoring targets. Paid provisioning, production migrations/writes, flags, deployment and restore/cutover each need explicit authorization. None is authorized by this assessment.

## O. Final recommendation

**NO-GO.** Local reliability and acceptance evidence improved, but required production safeguards are unresolved. No new competition policy/features are added. **STOP after Phase 9; deployment and any further phase require explicit user approval.**
