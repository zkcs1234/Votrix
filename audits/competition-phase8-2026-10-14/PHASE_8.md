# Phase 8 — Local Remediation, Integration Hardening and Release Preparation

Assessment date: October 14, 2026 (Asia/Bangkok). **Release recommendation remains NO-GO.** No production migration/write/deployment, paid provisioning or production feature activation is authorized or performed. Phase 9 has not started.

## A. Phase 7 findings addressed

| Finding | Phase 8 result |
| --- | --- |
| Native judge dashboard used legacy parent flags | Permission-scoped child/round navigation metadata and accurate waiting/open/paused/submitted/closed/review cards; actual dashboard link tested. |
| Shared IP100 global quota blocked native workflow | Explicit bounded competition policy uses signature-verified cookie subjects; normal authorization remains. Election/polling namespace budgets unchanged. |
| Public polling exceeded IP60 window | Separate bounded burst/window budget with shared-network/recovery headroom. |
| Process-local hints could not cross processes | Optional compatible authenticated `ws` relay, locally tested across two room-registry processes; deployed topology remains unverified. |
| Missing browser acceptance | Actual Express routes/controllers/services, synthetic signed JWTs, actual PostgreSQL RPCs and a loopback SDK/PostgREST contract fixture. Five children and six extended scenario groups pass. Hosted login/PostgREST remain blocked. |
| Setup editing gaps | Revision-checked draft membership removal, confirmed stable-ID round reorder, native stepper terminology. No frozen/history amendment. |
| No capacity/export bounds | Conservative native admission and export guards plus measured 50-entrant/five-judge/3,000-target profile and concurrent RPCs. Production capacity remains unverified. |
| Lock click lost while autosave busy | Confirmed in actual-middleware browser testing; Lock is now queued under its original scope and committed after the in-flight draft. Regression test passes. |

No calculation engine, formula, normalization, weighted minor policy, per-round method variation or historical score recalculation was changed.

## B. Exact files changed

The complete source/script list is in [source-preservation.json](source-preservation.json); [FILE_CHANGES.md](FILE_CHANGES.md) expands every path. The start snapshot contains 649 files, including the Phase 8 baseline helper itself. **All 68 protected election/polling sources, both engines, judge table/CSS, legacy draft hook and shared CSV serializer remain byte-identical.** Earlier workspace edits were retained.

Changed backend areas: `app.js`, competition-only rate routing, native child/public/judge routes, native scoring/setup/results services, `pageant.service.js:listJudgeCompetitionEvents`, the competition branch in `voter.service.js`, preflight capabilities/signatures, `server.js`, and native-only hint forwarding in existing room/emitter modules.

Changed frontend areas: native setup/scoring/tabulation adapters and their tests, dashboard competition cards/refresh/deep links, selected native stepper labeling in shared layout components, native-only API retry handling, and transport-recovery reconciliation. Other module classification/write behavior remains untouched.

Added modules: `competition-rate-policy.js`, `competition-capacity.js`, `competition-hint-transport.js`, `competitionRetry.js`, migration 108, a standalone optional broker, local DB/PostgREST test helpers, browser/database/transport/capacity/restore/integration harnesses and associated tests/evidence.

Backend test additions: `api/competition-rate-policy.test.js`, `services/competition-native-dashboard.test.js`, `modules/competition-capacity.test.js`, `modules/competition-hint-transport.test.js`. Existing native setup/export service mocks now represent the new admission/projection reads; the export test additionally verifies rejection before CSV allocation.

**Database change:** one additive migration file, `108_competition_navigation_draft_tools.sql`, applied/rerun only in new verified localhost clones. It creates two authorized RPCs; it performs no migration-time row deletes/backfills/rewrites and replaces no existing scoring/calculation function. Configured Supabase receives no writes. Actual draft removal is an explicitly authorized runtime operation with owner/context/revision/frozen/history guards.

## C. Judge dashboard

108's `competition_child_judge_navigation(event,actor,includeReviewers)` requires current active competition enrollment/account and uses authorized child/round choices. It projects only names/identities, state, own current completion and availability. Internal live-view values never leave this metadata function. Missing/stale setup or qualification means waiting; current cleared heads cannot become submitted because historical snapshots exist.

`listJudgeCompetitionEvents` attaches native metadata only behind native scoring gates. `classifyCompetition` emits one card per permitted child/round with a stable `dashboardKey`, independent state and explicit `competitionId`/`roundId` link. Parent `scoring_enabled`, `official_rules_id` and legacy `has_scored` do not determine native status. No parent completion flag is written. Legacy-only classification retains its old path.

The real `VoterDashboardPage` → `VoterEventCard` → `JudgeScoringPage` browser route is tested. Native page selectors honor authorized deep links and reject foreign/unassigned query identities. Native dashboard invalidations fetch the competition-only endpoint and merge that subset, retaining election/polling data and their existing subscriptions.

## D. Rate policy and measured acceptance

[TRANSPORT_AND_RATE_POLICY.md](TRANSPORT_AND_RATE_POLICY.md) documents budgets, assumptions, bounds and limitations. `COMPETITION_NATIVE_RATE_POLICY_ENABLED` defaults off; no production setting was enabled.

With explicit enablement: competition/pageant namespaces receive network IP12,000/minute, signature-verified subject600/minute, mutations300/minute, invalid-cookie IP60/minute; public competition results receive IP300/minute and4,000/15 minutes. Normal account/session/revocation/role/resource checks still run. The trusted internal request marker alone skips the older global quota; unrelated routes retain it. Native writes avoid the older dedicated30/minute limit only when the new bounded policy has already applied. Legacy dedicated write limit behavior remains.

Actual `createApp` tests pass: two signed identities make220 requests on one IP, forged bearer/client identities fail, request601 for one identity returns429 with `Retry-After`, revoked token versions fail, public competition125 requests have headroom, and unrelated requests still hit the original100 limit.

The actual-middleware five-child browser flow makes **867 application requests** and passes. Extended browser coverage makes **579** additional requests in its final successful run. These counts are across identities over the workflow; they are not a claimed per-minute throughput result. SDK fixture queries are separate internal calls.

Frontend native requests honor bounded `Retry-After` backoff by identity. Exact pending score bodies and request IDs survive; generic POSTs are never silently replayed. Stale/forbidden/invalid writes still require explicit review. Quota stores remain process-local: real distributed enforcement/shared-network load requires representative approval/testing.

## E. Shared hints

The installed `ws` library is retained. The new optional internal broker authenticates UUID instance/nonce/timestamp handshakes with HMAC, denies unsigned/replayed/stale peers and validates score-free frames. Only UUID recipients and allowlisted event/child/round/session/dependent-round identities are forwarded. Arbitrary fields/scores are rejected before local publication and at the broker. Bounded coalescing queues/frame caches, slow-peer bounds, duplicate suppression and bounded reconnect are implemented. Broker recovery tells authenticated local user rooms to reconcile authoritative views.

[transport.json](transport.json): **PASSED locally**, two publisher/room-registry Node processes, approximately **65.06 ms** delivery including coalescing, unsigned-peer denial, duplicate suppression, score rejection, broker restart, queued-hint recovery and reconciliation. Room sockets in that test are synthetic; browser testing separately exercises real signed-cookie WebSocket authorization on one HTTP API process. This is not a two-host/representative authenticated deployment test.

Remote transport requires approved WSS/service/network isolation and strong secret/rotation; loopback WS is for local/internal tests. No service was provisioned and no environment was configured. Best-effort hints do not replace immutable database history or guarantee durable delivery. Actual topology, HA/monitoring, cross-instance account revocation, delayed/out-of-order/missed frames and distributed operational acceptance remain **BLOCKED/NOT TESTED**. No Socket.IO adapter was installed.

## F. Browser integration

[browser-integration.json](browser-integration.json): four passing groups, five independently configured/assigned/frozen/scored/reviewed/finalized/published children with automatic updates and the unchanged judge table.

[browser-extended.json](browser-extended.json): six passing groups:

1. Real dashboard/card deep link selects the authorized child workspace.
2. Original parent details/branding form and actual create service produce one persistent parent; a separate one-child event reaches official publication.
3. All four owner CSV download actions invoke real export authorization/services.
4. Publication replacement/withdrawal and cross-role organizer denial.
5. Audited correction clears current completion, preserves historical snapshots and resubmission/review creates a new finalized version.
6. Preliminary/Final, independent deduction approve/revoke/reject, Top-N cutoff ties including both tied entrants, explicit qualification confirmation and subsequent Final scoring.

The harness uses actual `createApp`, authentication/account/role/profile/CSRF/CORS/rate/resource middleware, routes/controllers/services, existing engine and actual PostgreSQL RPCs. **JWT issuance is synthetic; it does not test real password login/refresh/provider authentication.** SDK traffic uses a strictly loopback PostgREST contract adapter, not hosted PostgREST. Sparse fixtures are extended for account/profile/draft/default-key relations without mutating the source template. No schedulers, mail, real upload or hosted service is started.

CSV actions/HTTP responses are covered, but saved browser file contents on disk are not independently inspected; serializer/raw-value/privacy tests supply separate evidence. Browser all-six-method/carry-policy variations and hosted election/polling browser acceptance remain NOT TESTED; existing engine/SQL/regression evidence is separate.

Early fixture-only failures involved missing relation/default-key declarations, a non-data-router form fixture, locator/commit waits, synchronous adapter heartbeat starvation, excessive unused test tabs and a screenshot targeting a closed page. The final extended run passes. The actual application defect found was a lost Lock action during autosave; it was fixed without changing the table or calculation.

## G. Setup UX

Draft participation removal calls `/competitions/:competitionId/entries/:entryId` with both observed child revisions. SQL serializes ownership/context, rejects frozen setup/scoring history and explicit planned-roster references, deletes only that membership, and retains the shared master and siblings. It never removes a historical submission or rebuilds a current head.

Round reorder preserves IDs and criteria/assignment bindings, rewrites only draft order/next links after confirmation and removes outgoing advancement from the new last round. Review/freezing remains explicit. The parent stepper uses “Review & Freeze” only when actual native children are detected; legacy-only labels remain. Shared role/entrant changes still warn about genuine frozen dependencies. No frozen-rule, used-roster or reviewer replacement workflow was added.

Dedicated UI tests pass for revision-bound removal, stable-ID reorder, legacy/default boundaries and deep-link denial. Exact unsupported calculation fields remain rejected by the existing contract.

## H. Capacity and exports

[capacity.json](capacity.json) measures a local 50-entrant/five-judge/four-major/three-minor profile, **3,000 raw targets**:

- Twenty actual simultaneous draft RPCs: batch **1,874.74 ms**; wall mean **1,035.91 ms**, min358.37/max1,672.89 ms including process startup/queueing. Lock-wait time was not separately measured.
- Complete-source tabulation read: **384.88 ms including psql startup**; unchanged engine/adapter **26.09 ms**; source response **1,195,468 bytes**.
- Actual3,000-target CSV: **48.87 ms**, **2,191,364 bytes**; heap-used delta10,024,416/RSS delta18,264,064 bytes. Peak memory was not measured.

Twenty cells use real concurrent write RPCs. Remaining bulk source rows are seeded by guarded local SQL before real submission RPCs; this is **not** a full1,000-row HTTP autosave test. Production-size workload, real network/provider latency, long-label/decision-history growth, recursive carry depth, sustained tabs and peak/concurrent export memory remain unverified.

Explicit conservative native limits:100 entrants,5 rounds,10 judges/round,10 majors/round,5 equally averaged minors/major, combined12,000 raw targets/round. Native exports enforce target bounds, a conservative10 MiB estimate before CSV text allocation and actual10 MiB output checks. No partial/truncated result is emitted. The SQL source RPC and row projection still materialize data; a hard peak-memory or streaming guarantee is not claimed.

## I. Database and recovery

108 installation/rerun preserves all46 original tracked inventories in a catalog-reviewed fresh clone. Five new SQL scenario groups pass for navigation states, authorized draft removal/sibling/master preservation, stale CAS, frozen/history rejection, correction/head integrity and anon/authenticated denial. [native-preflight-final.json](native-preflight-final.json) reports46 tracked tables, zero local structural/permission blockers,12 unchanged sparse historical review items and `migrationApproved:false`.

The Phase 8 whole populated local restore matches49 public-table inventories and inspected definitions/ACLs, including108. It remains a sparse local fixture without election/polling/provider schemas/assets/global roles; no production recovery claim is made.

[deployed-rest-preflight.json](deployed-rest-preflight.json) uses authorized GET-only configured Supabase inspection:27 observed legacy tables, one unresolved catalog blocker, `migrationApproved:false`. No direct deployed catalog or applied ledger, confirmed recoverable production backup, signed RPO/RTO or approved hosted candidate was supplied. **All production catalog/recovery/hosted-auth gates remain BLOCKED.** No remote writes/migrations/repairs were attempted.

[RELEASE_REQUIREMENTS.md](RELEASE_REQUIREMENTS.md) specifies exact catalog/ledger/forward108/recovery/activation/rollback owners and acceptance artifacts. Phase 7's recovery runbook remains applicable. Earlier migrations103–107 and approved Phase1–7 reports/evidence are retained.

## J. Security and preservation

Actor identity remains cookie/server bound; JWT quota verification is not resource authorization. SQL current assignments, enrollment/account state, frozen rule identities, child revisions, session access/row CAS, current heads, independent reviewer, source digest, confirmed qualifier roster and publication CAS remain authoritative.

Old snapshots/idempotent Submit receipts cannot complete a cleared sheet. Correction creates new sources/calculation versions; old finalized/publication history is not overwritten. Native metadata/hints contain no confidential scores. Private reads remain no-store; incomplete sources remain masked; public results remain an approved allowlisted edition. Native CSV continues using the unchanged shared formula-safe serializer and exact SQL decimal text separate from calculated values.

All68 protected sources remain byte-identical. Shared application/layout/voter files change only the documented competition branches/policy marker; full election/polling regressions run. No calculation function, historical value, lock, qualifier or publication was backfilled/recalculated. Writes are limited to disposable local test databases, including authorized synthetic correction cases.

## K. Verification

| Check | Result |
| --- | --- |
| Backend | **PASSED:88 files,663 tests. One existing integration file/three assertions SKIPPED, not passed.** |
| Frontend | **PASSED:45 files,314 tests**, two workers/process-only production roster-lock override. |
| Navigation/removal PostgreSQL | **PASSED**, five scenario groups plus installation/rerun inventory preservation. |
| Existing tabulation/publication SQL regressions | **PASSED:13+8 scenario groups**, fresh local clones. |
| Browser basic/extended | **PASSED locally:4+6 groups**, real application middleware/services with synthetic issuance/local SDK adapter. |
| Two-process hint relay | **PASSED locally**; representative production topology/auth across instances BLOCKED. |
| Larger source/concurrent RPC/CSV | **PASSED locally**, limitations in H. |
| Restore | **PASSED locally**, production recovery BLOCKED. |
| Native/default builds, targeted ESLint, syntax/diff/source preservation | **PASSED**, existing large-chunk warning retained. |
| Hosted login/PostgREST/catalog/recovery | **BLOCKED**. |
| Production peak memory/sustained HTTP/distributed rate/cross-host delivery | **NOT TESTED/BLOCKED**. |

Detailed manifests/logs are stored alongside this report. Final evidence records the workspace cluster restored to its original stopped state and all test listeners closed. Local clones/dumps remain retained; source templates were not changed.

## L. Remaining blockers

| Severity | Requirement |
| --- | --- |
| P0 | Direct deployed catalog/validated constraints/triggers/RLS/ACL/function/search-path and exact applied ledger/prerequisite comparison. |
| P0 | Recoverable production backup, retention/PITR/scope/owner, approved RPO/RTO and full isolated restore including election/polling/accounts/assets/roles. |
| P0 | Approved hosted whole-application/password/session/CSRF/CORS/PostgREST acceptance with real isolated accounts. |
| P1 | Representative shared transport topology/WSS/secret/availability/monitoring and real cross-instance authenticated failure/recovery tests. |
| P1 | Distributed quota enforcement/trusted proxy sizing, representative campus/public load and activation of the reviewed policy only after separate approval. |
| P1 | Production admission/export bounds, sustained HTTP/lock-wait/recursive-carry/peak memory and decision-history growth measurements. |
| P2 | Full real browser downloaded-file inspection, all-method/carry variations, large-roster UI/hosted election/polling acceptance. |
| Separate scope | Frozen-rule/used-roster/reviewer replacement and new scoring policies require explicit versioning/calculation approval. |

## M. Release recommendation

**NO-GO.** Confirmed Phase7 application gaps are remediated and stronger local evidence passes, but production safeguards and representative hosted/distributed/capacity acceptance are not established. Defaults/configuration were not silently activated.

**STOP after Phase8. Deployment and Phase9 require explicit user approval.**
