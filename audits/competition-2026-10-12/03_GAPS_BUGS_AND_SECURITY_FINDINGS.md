# Competition gaps, bugs and security findings

Audit date: **October 12, 2026**. Findings concern the current working tree, including uncommitted changes. No application repair or migration was performed. **Exercised** means an actual pure function, isolated transport, mocked service boundary or test was executed; it does not mean deployed PostgreSQL or authenticated browsers were exercised. **Code-evidenced** means a trace demonstrates a gap but its live outcome was not tested. **Cannot verify** is explicitly used for deployment-dependent exposure.

The module has reproducible defects and therefore fails the requested readiness standard. The security and integrity findings below are separated from business-policy questions. Evidence logs and test limits are in [07](07_END_TO_END_TEST_PLAN.md); the full control inventory is [02](02_FEATURE_AND_BUTTON_AUDIT.md).

## Critical blocker

### F-01 — Eliminated contestant can win weighted overall results

**Severity: Critical; P0 correctness blocker for weighted elimination competitions. Status: Broken, exercised actual engine.**

**Location:** [shared/competition-calculation.js](../../shared/competition-calculation.js), `calculateOfficial`, weighted overall branch at lines 114–129. Connection: Tabulation Calculate → `competition-workflow.service.calculate` → current submitted sources + approved effective rosters → `calculateOfficial` → saved ready calculation → verified/finalized/published result. The weighted branch includes every contestant with any included round cell and only checks completeness of cells that exist; it does not restrict championship entries to the selected Final field.

**Expected:** a contestant eliminated from the approved Final roster must not become the Final competition winner. **Reproduced:** Preliminary A=100 and B=90; Top 1 approves A only; weights 40%/60%; Final A=0 with an approved Final deduction of 10. Actual output is **B=36, rank 1; A=34, rank 2; ready=true**. B has only a Preliminary cell. This is not a missing-score conversion or a proposed formula: it is output from the existing engine. Zero is valid in the fixture's saved scale. Back-to-zero and carry-forward branches separately restrict the Final field and are not implicated by this fixture.

**Evidence/reproduction:** run [_evidence/scoring-probes.mjs](_evidence/scoring-probes.mjs); recorded JSON is [_evidence/scoring-probes.json](_evidence/scoring-probes.json). No database was used. **Impact:** organizer can receive a publishable eliminated champion despite correct advancement membership. **Recommended repair:** approve the championship field policy, then restrict the weighted championship field and validate every required applicable round cell. Keep existing approved arithmetic/weights. **Acceptance:** this fixture returns only A as a championship candidate; missing required finalist round inputs prevent ready status; special rounds, non-elimination continuation and both other progression modes retain approved behavior.

## High findings

### F-02 — Nested criteria operations cross event boundaries; category update omits ownership

**Severity: High; P1 authorization/integrity. Status: Broken service boundary exercised; live unauthorized DB write not attempted.**

**Location:** [competition.service.js](../../backend/src/services/competition.service.js), `addCriteriaToRound` at 471, `removeCriteriaFromRound` at 508, `updateRound` at 370–397; [competition-organizer.routes.js](../../backend/src/routes/competition-organizer.routes.js) round membership routes. Parent route correctly checks ownership of the **URL event**. Attach/delete then use supplied `roundId`/`criteriaId` without loading both inside that event. Round update validates division but accepts a foreign `categoryId` without the category's event check.

**Trace:** Criteria Attach/Remove → O `/rounds/:roundId/criteria/:criteriaId` → owned event check → raw membership INSERT/DELETE → round-linked setup trigger. Migration 015 has separate FKs, not a same-event link check; 091 rejects frozen foreign rounds but does not establish the actor's ownership of another draft round. Category FK also checks existence, not event consistency.

**Evidence/repro:** five-test audit fixture [_evidence/security-boundaries.test.js](_evidence/security-boundaries.test.js) captures actual service requests: attachment/deletion targets foreign-round without any event predicate or round lookup; category update saves foreign-category without category lookup. Authentication and database responses are mocked. **Impact:** someone owning draft event A can request changes to draft round B if its UUID is known, or create inconsistent cross-event scoring structure. **Repair:** validate round, criterion and category belong to event; enforce same-event relations in DB as defense in depth after existing-link inventory. **Acceptance:** two disposable organizers/events; every nested foreign UUID is denied and leaves both events unchanged; own valid links still save. Add real rollback-only SQL coverage for direct cross-event inserts.

### F-03 — Preview origin wildcard admits unrelated Vercel applications

**Severity: High; P1 security. Status: Broken credentialed CORS boundary exercised; browser credential exploit/deployed exposure Cannot verify.**

**Location:** [app.js](../../backend/src/app.js):20–36, 58–79; [ws-server.js](../../backend/src/websocket/ws-server.js):20–29; [render.yaml](../../render.yaml), `ALLOW_VERCEL_PREVIEWS='true'`; [csrf.js](../../backend/src/middleware/csrf.js):35–76; production cookie/security configuration.

**Trace:** arbitrary HTTPS `*.vercel.app` Origin → wildcard allow decision → credentialed CORS → unauthenticated GET `/api/auth/csrf` returns token/cookie → equality-only CSRF gate. Actual isolated `createApp` test grants `Access-Control-Allow-Origin: https://unrelated-audit-tenant.vercel.app` and credentials=true; actual CSRF middleware accepts a matching token from that Origin. WS Origin uses the same broad host rule. HTTP permissions still require a valid user cookie; this test did not bypass authentication.

**Expected:** credentialed API/socket access only from this application's trusted deployment origins. **Impact:** unrelated Vercel tenants may read authenticated APIs or perform cookie-authenticated mutations when browser cookie policy permits; production SameSite=None increases relevance. No real browser victim, project access or malicious site was used. **Repair:** exact trusted production/preview-origin inventory shared by HTTP and WS; remove provider-wide trust. **Acceptance:** unrelated tenant receives no credentialed CORS and WS upgrade 403; approved application origin retains cookie/CSRF operations; test production cookie behavior in a disposable deployment.

### F-04 — No reliable active-session fallback or organizer reconnect refresh

**Severity: High; P0 no-refresh blocker. Status: Broken recovery path exercised/code-evidenced.**

**Location:** [JudgeScoringPage.jsx](../../frontend/src/pages/voter/JudgeScoringPage.jsx):187–217, 289–299; [CompetitionLiveControlPage.jsx](../../frontend/src/pages/organizer/competition/CompetitionLiveControlPage.jsx):99–105. See RT-01 in [05](05_REALTIME_SYNC_REVIEW.md).

**Trace:** successful organizer access RPC → WS refetch hint → judge GET; active polling exits before checking connection health. Organizer reloads domain events but does not reconcile on ws:connected/focus. **Repro:** block WS while HTTP works; close an entry/criterion or submit from another client. Actual extracted active polling effect schedules zero intervals. On organizer reconnect after a missed update, progress remains stale. **Impact:** judges must refresh to learn current permissions; organizer may miss completion. Server SQL can reject stale Draft/Lock, but rejection is not evidence UI synchronized. **Repair:** scoped authoritative fetch on reconnect/focus plus bounded active fallback; visible connection/recovery state. **Acceptance:** missed gates/submissions converge automatically within agreed interval; stale mutations reject; unsaved local values survive safe refresh.

### F-05 — Calculate → Reviewer → Verify → Organizer has no automatic handoff

**Severity: High; P0 review/publication workflow blocker under the no-workaround requirement. Status: Broken by connected source.**

**Location:** [CompetitionTabulationWorkspace.jsx](../../frontend/src/components/organizer/competition/CompetitionTabulationWorkspace.jsx):13–15; [CompetitionReviewer.jsx](../../frontend/src/components/voter/competition/CompetitionReviewer.jsx):6–8; [competition-workflow.service.js](../../backend/src/services/competition-workflow.service.js):225–226, 245–272.

**Trace:** Calculate inserts snapshot, returns only to organizer; reviewer mount/local actions are its only reloads. Reviewer Verify/decision approval returns without organizer invalidation; organizer snapshot/status remains stale and Finalize can remain disabled. **Repro:** keep reviewer and organizer pages open; Calculate; reviewer does not discover calculation until reload/navigation; verify, organizer does not receive status. No complete browser run was executed. **Repair:** authorized event-scoped calculation/decision/advancement invalidations after commit; subscribe both pages, with reconnect/fallback and scoped refresh control. **Acceptance:** two actual accounts complete Calculate/Verify/Finalize/Publish without page refresh; pending decisions and corrections also update both actors.

### F-06 — Out-of-order sheet reads and cross-event status corrupt displayed context

**Severity: High; P0/P1 live reliability. Status: Broken, exercised actual extracted callbacks.**

**Location:** [JudgeScoringPage.jsx](../../frontend/src/pages/voter/JudgeScoringPage.jsx):22–27, 187–204, 225–237. The GET response identity guard checks account/event, not latest request or session revision; status handler does not filter `session.eventId`. The server automatically joins every actively enrolled event.

**Trace/repro:** delayed Preliminary GET starts → Final round event starts newer GET → Final response renders → older Preliminary response completes and overwrites sheet/session/context. Separate fixture delivers a pause for another enrolled event and the current sheet accepts it. **Impact:** wrong visible round/revision/availability and conflict/retry failures. This is event-state crosstalk between authorized rooms, not proof of access to an unauthorized event. **Repair:** account+event+session scoped event guard, latest-request cancellation/generation and monotonic revision reconciliation. **Acceptance:** reverse response order never regresses current context; events from another enrolled event leave this view unchanged; correction/round drafts remain correctly keyed.

### F-07 — Versioned progress does not refresh rankings; payload-free invalidations ignored

**Severity: High; P0 live aggregate connection. Status: Broken, callback exercised and emissions traced.**

**Location:** [competition-workflow.service.js](../../backend/src/services/competition-workflow.service.js):126–131, 241–242; [CompetitionRankingsPage.jsx](../../frontend/src/pages/organizer/competition/CompetitionRankingsPage.jsx):46–55; [VoterDashboardPage.jsx](../../frontend/src/pages/voter/VoterDashboardPage.jsx):128–130.

**Trace:** Draft/Lock/Submit Round emits organizer progress only; rankings view listens another event. Finalize/Publish emits `rankings:updated` with eventId only; unfiltered Rankings expects `payload.rankings` and ignores this invalidation. Versioned Start emits generic session event and bypasses legacy `competition:scoring-toggled`, which participant dashboard expects. **Repro:** actual unfiltered handler receives eventId-only event and does not load; source trace for missing other emissions. **Impact:** aggregate/official state or dashboard activity stays stale. **Repair:** treat eventId-only messages as scoped invalidation; emit/consume consistent lifecycle/submission hints, protect sensitive results from judge rooms. **Acceptance:** submit/publish/start updates open appropriate views automatically; no ordinary judge receives combined results.

### F-08 — Shared-IP socket cap and idle auth recovery can prevent judge updates

**Severity: High; P0 for larger/shared-network panels. Status: Capacity rejection exercised; idle-expiry recovery code-evidenced.**

**Location:** [ws-server.js](../../backend/src/websocket/ws-server.js):35–59, 115–123; [socket.service.js](../../frontend/src/services/socket.service.js):85; [API client](../../frontend/src/services/api.js). RT-06/RT-07 details in [05](05_REALTIME_SYNC_REVIEW.md).

**Trace/repro:** actual eleventh simultaneous loopback socket returns HTTP429 because connections are limited to ten per `req.socket.remoteAddress`; campus NAT or ingress shared addresses can aggregate legitimate users. Every heartbeat reauthenticates using upgrade request cookies. Token-refresh listener exists in frontend but no dispatcher was found; an active idle judge performs no scheduled HTTP refresh/fallback. **Impact:** larger panels or expired/revoked-cookie reconnects lose live delivery. No production proxy-IP or long idle real-session test was performed. **Repair:** evaluate authenticated-user/panel capacity and trusted proxy handling, retain abuse limits, use deliberate HTTP refresh/reconnect coordination and fallback. **Acceptance:** agreed panel size behind shared network all connect; expired access token refresh recovers if refresh session valid; revoked account never regains data.

### F-09 — Transition trusts a digest computed before its database lock

**Severity: High; P1 official result integrity. Status: Partially working; concurrency gap code-evidenced, not reproduced against PostgreSQL.**

**Location:** [competition-workflow.service.js](../../backend/src/services/competition-workflow.service.js):229–256; [088](../../backend/src/database/migrations/088_competition_operations.sql):104–139; [092](../../backend/src/database/migrations/092_competition_input_invalidation.sql):2–10.

**Trace:** JS reads/recomputes current digest → RPC later locks event → compares stored calculation digest with supplied earlier digest. It validates listed submission versions/pending decisions, but does not recompute all digest inputs under lock. Invalidation skips finalized/published snapshots. **Repro proposed, not executed:** finalize; pause publish request after JS check; commit an approved deduction/eligibility or relevant account/source change; resume RPC. Existing source-version/pending guards cover some races, not the full approved-data/account digest. **Impact:** stale reviewed result may publish across a concurrent input change. **Repair:** serialize/validate a complete input version/hash inside the same transaction as transition; define post-finalization changes. **Acceptance:** barrier-controlled concurrency permits either consistent publish or conflict, never stale publish; original historical snapshots retained.

### F-10 — Freeze guards do not compare the full validated rules snapshot

**Severity: High; P1 setup/rules integrity. Status: Partially working; source-evidenced race.**

**Location:** `freezeRules:47–120`; [095](../../backend/src/database/migrations/095_competition_criteria_publication_guard.sql):6–22; [096](../../backend/src/database/migrations/096_competition_participation_guards.sql):7–11; [099](../../backend/src/database/migrations/099_competition_round_progression_upgrade.sql):165–171; [091](../../backend/src/database/migrations/091_competition_atomic_setup.sql).

**Expected:** freeze exactly the configuration validated as saved at publication. **Trace:** JS validates foundation/panel/config; SQL compares criteriaSource and registrationSource under event lock. These cover many IDs/memberships/bounds but omit round contribution weight/progression, category weights, full scoringConfig and judge roles/accounts/assignments. A preceding concurrent draft edit in an omitted field can commit and the older snapshot still publish. **Impact:** apparent saved setup differs from governing frozen rules. **Repair:** complete canonical setup/panel/config source revision or digest guarded under transaction; retain immutable versions. **Acceptance:** mutate each omitted input between validation and publish; publication conflicts or freezes the new consistently validated version. Do not silently change formulas.

### F-11 — Sensitive legacy score/result tables lack repository RLS/grant hardening

**Severity: High deployment-sensitive privacy/integrity risk. Status: Cannot verify deployed exposure; missing repository defense.**

**Location:** migrations for `competition_scores`, `competition_session_judge_scores`, [081 deductions](../../backend/src/database/migrations/081_competition_deductions.sql), [082 calculations](../../backend/src/database/migrations/082_competition_result_calculations.sql), compared with explicit RLS for new 087/090/093 tables. No enable-RLS or anon/authenticated table privilege revocation for these four sensitive tables was identified in migration sources.

**Trace:** legitimate app HTTP guards → service-role client; separately a Supabase-key direct PostgREST request would be governed by database grants/RLS, not application JWT cookie ownership checks. **Impact conditional:** if deployed anon/authenticated grants expose these tables, own-score and unpublished-results privacy can be bypassed, with mutation risk depending on ACL. A public anon key is not itself a secret or an authorization proof. **Evidence/repro:** source search plus an unexecuted, read-only catalog/privilege inventory in [07](07_END_TO_END_TEST_PLAN.md); no project REST call or real data exposure attempted. **Repair:** inventory actual grants first, then approve least-privilege RLS/ACL migration consistent with backend-only access. **Acceptance:** direct anonymous/authenticated sensitive reads and writes fail; intended service role succeeds; SQL SECURITY DEFINER functions are audited/restricted.

### F-12 — Progress-grid Unlock cannot satisfy current correction contract

**Severity: High; P0 control blocker when correction is needed. Status: Broken by direct contract trace.**

**Location:** [CompetitionLiveControlPage.jsx](../../frontend/src/pages/organizer/competition/CompetitionLiveControlPage.jsx):180; frontend [competition-session.service.js](../../frontend/src/services/competition-session.service.js):128; backend [competition-session.controller.js](../../backend/src/controllers/competition-session.controller.js):221–226; versioned `unlockScore` → operational correction.

**Trace:** grid Unlock → `/session/unlock-score` supplies contestant/judge/criterion only; controller constructs only those fields; SQL requires nonblank reason and confirmed=true. Adding request fields alone cannot fix it because controller discards them. **Impact:** visible Unlock rejects modern events. Separate workflow-panel correction does collect the required fields and remains an alternate path; its successful database outcome is unverified. **Repair:** one reviewed correction flow with reason/confirmation all the way to RPC, preserving invalidation/history/finalization gates. **Acceptance:** reasonless correction rejects, confirmed reason reopens only intended lock, invalidates source version, preserves history, and updates both actors automatically.

### F-13 — Unpublish button offers a transition forbidden for all modern events

**Severity: High; workflow recovery gap. Status: Broken UI/server contract, code-evidenced.**

**Location:** [CompetitionReviewPage.jsx](../../frontend/src/pages/organizer/competition/CompetitionReviewPage.jsx):194; [pageant.service.js](../../backend/src/services/pageant.service.js):484–486; [eventLifecycle.js](../../backend/src/utils/eventLifecycle.js) setup guard message.

**Trace:** Finish & Publish creates official_rules_id → scheduled Review shows Unpublish to draft → POST unpublish → service rejects official_rules_id. Setup error still tells user to unpublish. **Impact:** mistaken published setup has no ordinary promised correction route; amendment is distinct and preserves history. **Policy needed:** whether pre-scoring correction uses a new version or an approved return to editable setup. **Recommended default:** preserve immutable versions, offer an explicit authorized revision rather than silently clearing rules. **Acceptance:** every displayed recovery action matches an allowed versioned transition; attempted edits cannot rewrite acknowledged history.

### F-14 — Manual placements use inconsistent field scope and accept unchecked round context

**Severity: High; P1 scoring integrity/conditional manual workflow blocker. Status: Partially working, source-evidenced.**

**Location:** [CompetitionTabulationWorkspace.jsx](../../frontend/src/components/organizer/competition/CompetitionTabulationWorkspace.jsx), manual entry; [competition-workflow.service.js](../../backend/src/services/competition-workflow.service.js):216–225; [shared roundField](../../shared/competition-calculation.js):44–45.

**Trace:** UI creates manual rows from all frozen contestants → selected round Calculate validates only effective eligible round scope, rejecting extra rows. For unknown/foreign supplied roundId, `roundField` falls back to no round/all entries; manual branch does not explicitly assert round ownership; calculation row stores supplied round FK, which validates existence rather than same event. Overall manual scope also needs a declared championship-field interpretation after elimination. **Repro proposed:** select Final with fewer contestants; supply all-frozen rows (reject); call owned-event manual calculation with valid foreign event's round UUID and coverage of fallback field. No real SQL insert attempted. **Repair:** reject invalid round before any calculation/decision, derive UI field from effective server scope, approve overall manual Final field. **Acceptance:** foreign/unknown round is 400/403 and no snapshot; eligible Final rows save; eliminated/ineligible IDs reject; independent approval remains mandatory.

## Medium findings

### F-15 — Published report drops division filtering and obscures incomplete values

**Severity: Medium; official output correctness. Status: Broken filter substitution by source.**

**Location:** [reports.service.js](../../backend/src/services/reports.service.js):230–237; [CompetitionReportPage.jsx](../../frontend/src/pages/organizer/reports/CompetitionReportPage.jsx); report metrics/export mapping in [02](02_FEATURE_AND_BUTTON_AUDIT.md). **Trace:** selected division → filtered rankings fetched → nonempty published overall result replaces them without filtering → report/export DTO includes other divisions. Some displays coerce null missing totals to 0 or use unavailable timestamp fields. **Impact:** incorrect selected-scope report or misleading incomplete score. **Repair:** preserve official snapshot ranks and requested scope, explicit null/status formatting and correct timestamps. **Acceptance:** Men-only/Women-only report and each export contain exactly selected official entries with unchanged official ranks; incomplete is not displayed as a completed zero.

### F-16 — Frozen setup controls remain actionable; bulk assignment failures are silent

**Severity: Medium; UX/recovery. Status: Partially working/broken feedback by source.**

**Location:** [CompetitionWorkspacePage.jsx](../../frontend/src/pages/organizer/competition/CompetitionWorkspacePage.jsx):178, 547–568, 580–627, 651–655, 709; [JudgeAssignmentPanel.jsx](../../frontend/src/components/organizer/competition/JudgeAssignmentPanel.jsx), `bulkAssignAll`; corresponding draft/frozen backend guards. **Trace:** scheduled/active division or hidden structure controls mutate → server refuses; several awaits lack catch/toast. Assign all uses `Promise.allSettled` but does not inspect rejected operations. Division reordering uses two separate writes, unlike atomic round reorder. **Impact:** apparent dead controls, silent all/partial failure or duplicate order after one failure. **Repair:** propagate readOnly/frozen state, report per-item results and retry, atomic division reorder if required. **Acceptance:** frozen actions unavailable with explanation; forced direct requests deny; partial failures accurately counted; reorder remains all-or-none.

### F-17 — New-event Branding footer Back targets an unmounted route

**Severity: Medium; setup navigation. Status: Broken by route trace.**

**Location:** [StageFooter.jsx](../../frontend/src/components/ui/StageFooter.jsx):28, `stagePath`; [eventStages.js](../../frontend/src/utils/eventStages.js):80–87; [CompetitionEventFormPage.jsx](../../frontend/src/pages/organizer/competition/CompetitionEventFormPage.jsx); [routes/index.jsx](../../frontend/src/routes/index.jsx). **Trace:** new Branding footer Back uses pseudo ID `new` and builds `/organizer/competition/events/new/branding`; router does not mount it. EventStepper separately handles new routes correctly. **Impact:** footer navigation can leave create wizard through fallback route; unsaved/draft recovery confusing. **Repair:** shared create-stage routing or explicit footer previous handler consistent with stepper. **Acceptance:** Details→Branding→footer Back returns to populated Details; edit-mode links remain correct.

### F-18 — Legacy rank-based result mapping can dereference absent objects

**Severity: Medium; High for affected legacy events. Status: Broken shape contract by source; full GET not exercised.**

**Location:** [scoring-engine.js](../../backend/src/modules/scoring-engine.js):298–369; [pageant.service.js](../../backend/src/services/pageant.service.js):1992–2012. **Trace:** no official_rules_id → legacy rank-based engine lacks perCriterion/perRound objects → public mapper dereferences them. **Impact:** retained old rank-based event ranking read may throw. Modern official engine result shape differs and tested cases pass. **Repair:** normalize documented legacy DTO or correct legacy mapper without changing official arithmetic. **Acceptance:** legacy rank-based event GET succeeds with actual legacy shape and stable placement ranks; modern path unchanged.

### F-19 — CSV quoting does not neutralize spreadsheet formula-like text

**Severity: Medium; export safety. Status: Code-evidenced; external spreadsheet execution not attempted.**

**Location:** [reports.service.js](../../backend/src/services/reports.service.js):19–22; [exportReport.js](../../frontend/src/utils/exportReport.js):53–57. **Trace:** user-controlled name/text → syntactic CSV quoting → downloaded CSV → spreadsheet can interpret leading =/+/-/@. **Impact:** formula interpretation depends on viewer/settings; no harmful formula opened. **Repair:** shared safe literal text export handling and explicit data types for XLSX, preserving numeric columns. **Acceptance:** harmless formula-looking names remain literal in chosen spreadsheet applications and exports still match official rows/numbers.

### F-20 — Load failures are presented as empty/not-started state

**Severity: Medium; operational reliability. Status: Broken error feedback by source.**

**Location:** [CompetitionLiveControlPage.jsx](../../frontend/src/pages/organizer/competition/CompetitionLiveControlPage.jsx):46–69; [CompetitionEventsPage.jsx](../../frontend/src/pages/organizer/competition/CompetitionEventsPage.jsx):151; custom type validation in form `handleNext:208` versus `handleSubmitDetails:303`; report [02](02_FEATURE_AND_BUTTON_AUDIT.md). **Trace:** failed session/progress/foundation requests → caught to null/empty → Start/empty display instead of explicit migration/auth/network failure. Several other loading actions lack catch/retry. Whitespace custom type can bypass separate submit validation on wizard Next. **Impact:** operator acts on a false empty view or cannot diagnose deployment error. **Repair:** distinct loading/error/empty/data states, authoritative retry and consistent validated transition handlers. **Acceptance:** mocked 401/403/409/503/offline each show accurate actionable state; do not erase last good session or suggest duplicate Start.

### F-21 — Deployment socket path and cross-process delivery are unverified/incomplete

**Severity: Medium; High if selected deployment topology triggers it. Status: Cannot verify / Missing cross-instance mechanism.**

**Location:** [socket.service.js](../../frontend/src/services/socket.service.js):3; [vite.config.js](../../frontend/vite.config.js) `/api` proxy only; [constants.js](../../frontend/src/utils/constants.js):1; [frontend/vercel.json](../../frontend/vercel.json); [ws-rooms.js](../../backend/src/websocket/ws-rooms.js):1–28. **Trace:** unset VITE_API_URL uses relative `/api`, WS derives `/ws` at frontend origin; dev configuration proxies API but not WS. Rooms are in memory per process. Current local VITE_API_URL is present; actual production values/reverse proxy/instance count unknown. **Impact:** environment mismatch or multi-process requests may lose automatic updates. **Repair:** document/test supported API/WS origin and ingress; add shared delivery only if approved topology requires it, retaining HTTP fallback. **Acceptance:** supported local and deployed origins upgrade successfully, account cookies sent appropriately, missed updates recover; two-instance delivery tested if used.

### F-22 — Result visibility and special policies are not a complete user-configurable workflow

**Severity: Medium decision gap; Status: Missing optional flows / Cannot verify intended policy.**

**Location:** [pageant-judge.routes.js](../../backend/src/routes/pageant-judge.routes.js), reviewer routes, [CompetitionRulesEditor.jsx](../../frontend/src/components/organizer/competition/CompetitionRulesEditor.jsx), effective eligibility/round rules. Current ordinary judge own-scores and appointed-reviewer full-data paths exist; no general ordinary-judge published-results release page, contestant account, public competition observer route or dedicated per-judge recusal workflow was found. `judgingSettings` stored on round workflow is not a demonstrated applied permission/formula policy. **Impact:** prompt requests involving these features cannot be asserted as implemented. **Repair proposed only:** obtain explicit policy; expose only approved data/actions using existing roles/versioning. **Acceptance:** role/time visibility matrix approved and tested; prohibited intermediate/private data inaccessible through guessed URLs/API/direct DB. Do not introduce new rules as part of this audit.

## Low finding and verification limits

### F-23 — Current backend suite has one stale migration-message expectation

**Severity: Low; validation hygiene. Status: Broken existing assertion, exercised.**

**Location:** [round-rules-roster.test.js](../../backend/__tests__/services/round-rules-roster.test.js):68; [competition-workflow.service.js](../../backend/src/services/competition-workflow.service.js):21. Test expects text `087-097`; actual fail-closed ApiError still has status503 but says migrations through099. Full run: **468 passed, 1 failed, 3 skipped**. **Impact:** CI is not green; it does not demonstrate a permission fail-open or runtime roster bug. **Repair after approval:** reconcile documented supported schema and expected contract, assert substantive fail-closed behavior. **Acceptance:** unavailable eligibility relation never falls back to full Final field and current migration guidance is accurate.

Frontend build passes with a >500kB chunk warning; lint has zero errors and three unused eslint-disable warnings in `useDelayedLoading.js` (33/87/127). These are low-priority existing quality observations, not competition end-to-end blockers. Browser visual/accessibility, actual print, authentic cookies, SMTP/Cloudinary, real database FKs/grants, source conflicts and deployed upgrade behavior remain unverified.

## Existing protections confirmed by current tracing/tests

Do not restore outdated findings from earlier Markdown analyses. The current organizer parent route checks ownership; HTTP authentication is cookie-only and checks user/session/token version; WS now uses the same identity/account checks and authorized room admission; private progress/ranking events are organizer-only in the isolated transport test. Judge-pool POST repeats GET visibility restrictions. Modern scoring enforces frozen roles/assignments/qualification/context/gates, and JSON/projection locking is one RPC transaction. Round creation now obtains ordered values and atomic reorder exists. Completed competitions permit the intended tabulation/workflow routes, so the older end-then-tabulate terminal guard defect is no longer current.

These are source/mocked-test protections, not a blanket declaration of live security. Foreign nested criteria targets, stale digest races, missing direct-table hardening and transport/UI gaps remain.

## Business questions requiring an approved default before implementation

| Question | Current implementation | Recommended default for approval, not current fact |
|---|---|---|
| Does primary contestant selection also close others? | Presentation and access gates are separate; sheet can show all eligible open entries. | Keep explicit gates unless one-at-a-time scoring is approved; label presentation clearly. |
| May a paused/ended performance submit already locked scores? | Submit Round uses a separate submission window. | Preserve intentional separate window, with explicit operator control/status. |
| Should tied Top5 advance six? | Automatic standard competition cutoff includes all tied cutoff ranks. | Preserve implemented tie inclusion unless competition organizers approve an exact-slot alternative. |
| Who is eligible for weighted/manual championship after elimination? | Weighted branch includes eliminated entries; manual overall uses broad field. | Only approved eligible Final field; required earlier applicable scores remain inputs. |
| Can published setup be corrected before scoring? | Ordinary Unpublish conflicts with freeze; approved amendment creates new version. | Versioned explicit correction with audit and required reacknowledgment. |
| What may ordinary judges see after publication? | Own sheet; privileged independent reviewer sees full verification data. | Own scores only until explicit official-result release policy is approved. |
| What do recusal/no-show/disqualification mean? | Approved `non_competing` exclusion and reasons; no distinct per-judge recusal system found. | Define policy and missing-score implications before adding statuses or altered arithmetic. |

Repairs are proposed in [06](06_PRIORITIZED_IMPLEMENTATION_PLAN.md). No change in this report has been applied.
