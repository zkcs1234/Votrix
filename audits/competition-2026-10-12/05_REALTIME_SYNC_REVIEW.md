# 05 — Competition Realtime Synchronization Review

Audit date: **October 12, 2026**. Scope: the current working tree, including uncommitted competition changes. This report records evidence and recommended repairs; no application code, routes, database migrations, real users or connected Supabase records were changed.

## Verdict and evidence limits

**Partially working. The current transport and principal organizer-to-judge refresh wiring exist, but reliable automatic synchronization across the entire competition workflow is not established.** The active judge has no HTTP polling fallback after becoming active, the organizer does not reload on reconnection, and the versioned tabulation/reviewer screens lack automatic invalidation. Consequently, manual navigation or refresh remains necessary in important review/publication and connection-loss scenarios.

The former `window.socketClient` and mismatched event-name problems are **not** findings against this working tree: `JudgeScoringPage` uses the shared native WebSocket client and `CompetitionLiveControlPage` listens to the emitted progress event. Historical process documents must not be treated as evidence that these old defects remain.

Evidence was collected in three distinct ways:

1. **Source tracing:** frontend callbacks, HTTP services/controllers, workflow service, SQL functions and triggers, socket server, authorization and receiving UI.
2. **Executed isolated transport characterization: 8 tests passed.** Actual `ws-server`, `ws-rooms`, `ws-emitter` and actual frontend `socket.service` executed over an ephemeral localhost port with separate client contexts. Authentication/database results were mocked and there were no application HTTP scoring requests. Exact extracted current React callback bodies were exercised for selected defects. The fixture closed every socket and its HTTP server.
3. **Not exercised:** real organizer/judge login, Supabase persistence, deployed WebSocket ingress, authentic cookie behavior across deployed origins, simultaneous real browser forms, server-side scoring rejection against the deployed database, and production multi-instance delivery. These remain **Cannot verify** here. A transport fixture is not a real competition end-to-end test.

Runnable evidence:

```powershell
cd C:\Github\Votrix
node backend/node_modules/vitest/vitest.mjs run --config audits/competition-2026-10-12/_evidence/vitest-realtime.config.mjs
```

Files: [_evidence/realtime_transport.test.js](_evidence/realtime_transport.test.js), [_evidence/vitest-realtime.config.mjs](_evidence/vitest-realtime.config.mjs), and [_evidence/realtime_transport_results.txt](_evidence/realtime_transport_results.txt). These are audit evidence, not production test source or repairs. Test output clock times come from the execution host; the audit date above follows the user's Asia/Bangkok context.

## Current transport, identity and room model

| Item | Actual implementation and evidence | Status |
|---|---|---|
| Transport | Native browser WebSocket connects to the API origin's `/ws`; `backend/src/server.js:10–12` attaches `ws` to the same HTTP server. `frontend/src/services/socket.service.js:3,24` derives the address from `API_BASE_URL`. | **Working in isolated transport fixture; deployed behavior Cannot verify** |
| Authentication | Upgrade checks allowed Origin and calls `socketIdentity`; this invokes HTTP `authenticate`, active-account and password checks. No bearer query token is supplied by the browser client. `backend/src/websocket/ws-server.js:39–85`; `ws-authorization.js:6–11`. | **Partially working**: source traced; real auth was mocked in fixture |
| Event authorization | Organizer room admission checks event organization ownership. Participant admission requires active event enrollment and forbids the organizer suffix. `ws-authorization.js:14–27`. Actual server rejected a participant attempting the organizer room in the fixture. | **Working for exercised mocked authorization boundary; real account/database outcomes Cannot verify** |
| Initial rooms | Automatically joins personal/role rooms, then all organizer-owned or actively enrolled event rooms. Organizer suffix is `:organizer`, participant suffix is `:voters`. `ws-server.js:130–153`. | **Partially working**: actual fixture auto-join passed; setup is asynchronous with no client-ready acknowledgment |
| Sensitive messages | `rankings:updated` is routed to organizer-only room even when called through `emitToEvent`; scoring progress explicitly uses organizer suffix. `ws-emitter.js:4–15`; workflow service `:130`. Both protections passed actual transport tests. | **Working for exercised transport isolation** |
| Heartbeat/revalidation | Every 25 seconds, reauthenticates, removes rooms and rebuilds authorized rooms, then pings. Revocation is not pushed immediately by this module. `ws-server.js:7,115–123`. | **Partially working**: implementation inspected; time-based revocation not exercised |
| Reconnection | Delays 1, 2, 4, 8… seconds, capped at 30 seconds. Resets intentional-close flag in `connect`, resets attempts on open and ignores callbacks from replaced connections. `socket.service.js:15–49`. Bootstrap reconnects on authenticated account identity changes (`Bootstrap.jsx:12–19`). | **Partially working**: transport connected successfully; prolonged recovery not exercised |
| Backend topology | Registry is an in-process `Map`; broadcasts do not cross processes. No durable sequence log, replay, acknowledgment or shared broker appears in these modules. `ws-rooms.js:1–28`. | **Missing** cross-instance delivery/replay; production topology **Cannot verify** |
| Capacity restriction | Upgrade rejects the eleventh concurrent connection from one IP with HTTP 429 (`ws-server.js:35–59`). The actual fixture reproduced this response. Multiple judges behind one campus/shared router count toward the same limit. | **Working restriction; potentially blocking reliability behavior** |

The service is a global event bus. `useSocketEvent` subscribes by **event type**, not event ID (`frontend/src/hooks/useSocketEvent.js:4–9`). `socket.service` forwards only message `data`; the server envelope `ts` is not used for ordering (`socket.service.js:35–39`). Most competition state lives in ordinary React state, rather than TanStack Query keys. There is no automatic query-cache invalidation hidden elsewhere for these pages.

## Organizer action → database → receiving judge

The versioned path is the normal current workflow. Legacy session event emitters remain in the file, but an early versioned return bypasses many of them; their presence does not establish emission for a versioned competition.

| Organizer action | Request and trusted update | Emission | Receiving UI/update | Status |
|---|---|---|---|---|
| Start live session | `CompetitionLiveControlPage.performAction` → frontend session service `startSession` → POST `/api/organizer/competition/events/:eventId/session/start` → session controller → `competition-session.service.js:610–613` → workflow `organizerAction('start')` → `competition_operational_action`. Event/session rows are updated inside SQL. | Versioned action emits **`session:contestant-changed`**, containing `{session:{id,eventId},refresh:true}` after RPC success (`competition-workflow.service.js:360–361`). | Judge callback calls `syncSessionView` → GET participant `session-view` → `judgeSheet`; inactive/waiting polling also runs every five seconds. Judge callback dispatch was exercised in fixture; actual start/persistence was not. | **Partially working** |
| Open/close entries | `setOpenContestants` → POST `/session/open-contestants` → versioned `organizerAction('access',{kind:'entries',gate})` (`competition-session.service.js:977–978`). SQL stores explicit all/none/selected gate and increments session revision (`097…sql:316–320`). | Generic **`session:contestant-changed`**. | Judge GET supplies `contestants[].open`; form disables closed rows. `JudgeScoringPage.jsx:243–249`; workflow `judgeSheet:144–151`; form `:254–269`. | **Partially working**; DB/browser pair not exercised |
| Open/close criteria or entry×criterion access | Criteria selector/toggles/intersection buttons in `CompetitionLiveWorkflowPanel.jsx:15–18` → POST `/workflow/access`; ordinary criteria controls route through same versioned action (`competition-session.service.js:1089–1090`). | Generic **`session:contestant-changed`** in versioned path. | Judge refetch loads major openness and intersection map. Form disables denied intersection inputs (`CompetitionScoringForm.jsx:254,329`). SQL independently checks gates. | **Partially working** |
| Pause/resume | Session service routes to versioned `organizerAction('pause'/'resume')` (`competition-session.service.js:1188–1189,1225–1226`). SQL stores status under event/session locks (`097…sql:286,301,311–314`). | Generic **`session:contestant-changed`**, rather than the legacy full `session:status-changed` emission. | Judge refetch changes `open` values; inactive-state polling can resume after state becomes paused. | **Partially working**; loss of generic event while active leaves stale UI |
| Switch round / Preliminary→Final | POST `/session/set-round` → versioned `organizerAction('round')` (`competition-session.service.js:1024–1025`). SQL validates qualification/effective roster, synchronizes continuing roster, replaces contestant order, clears lineup and resets gates (`097…sql:324–333`, supplemented by 099). | Generic **`session:contestant-changed`**. | Judge GET receives new round/criteria/context. Draft hook recovers separate judge/event/session/round/rules key and clears old context values (`useJudgeScoreDrafts.js:27–54`). | **Partially working**; HTTP response ordering defect below |
| Select primary contestant | POST `/session/set-contestant`, next/previous controls → direct session service update (`competition-session.service.js:825–922`). | Full **`session:contestant-changed`**. | Judge refetches own sheet. **Primary contestant is presentation context, not the permission gate**; see distinction below. | **Partially working** |
| Save/activate lineup or select slot | Save creates `competition_lineups` after exact field validation (`workflow.service.js:290–295`); activate/slot uses operational RPC (`097…sql:334–343`). | Save alone has no broadcast; activate/slot emits generic **`session:contestant-changed`**. | Judge refetches order and current-stage slot metadata; form defers visual reordering while focused/typing (`CompetitionScoringForm.jsx:22–24,172`). | **Partially working**; no proof of deployed delivery |
| Change presentation division | Session service routes through versioned workflow action (`competition-session.service.js:1135–1136`). SQL stores presentation division. | Generic **`session:contestant-changed`**; dedicated `session:division-changed` belongs to retained other path. | Refetch still respects judge's assignment scope. Modern `judgeSheet` returns allowed divisions, but its session DTO does not expose `currentDivisionId` (`workflow.service.js:148–151`). Presentation selection does not narrow judging assignments. | **Partially working**, with DTO/UI limitation |
| Authorized correction | Workflow panel `:25` → POST `/workflow/correction`; SQL invalidates matching submitted-round sources, removes locks, increments revision and audits, with finalized/advanced guards (`097…sql:344–355`). | Generic **`session:contestant-changed`**. | Judge GET restores values and reopened locks. Numeric engine reads submitted snapshots, so correction needs a fresh submit. | **Partially working**; calculation/reviewer screens do not receive this invalidation |
| End performance | End Session routes to `organizerAction('end-performance')` in versioned path (`competition-session.service.js:1265–1266`). SQL completes performance and closes input gates while keeping round submission a separate window (`097…sql:303–305`). | Generic **`session:contestant-changed`**. | Judge GET disables editing and may still allow Submit Round. This is not automatic official publication. | **Partially working** |
| Publish overall result | Tabulation Publish → tabulation service → versioned `transitionCalculation('publish')` → guarded `competition_result_transition`. | **`rankings:updated`** to organizer with `{eventId}` only; **`session:status-changed`** completed to event when overall (`workflow.service.js:241–242`). | Judge marks session completed; overall Rankings ignores this payload-free ranking event. | **Broken** automatic overall Rankings update; own publishing screen reloads |

### Presented contestant versus permitted scoring

The current design explicitly presents the entire eligible round field. `CompetitionScoringForm.jsx:64–79` orders all returned contestants; there is no filtering to `activeContestantId`. `judgeSheet` derives input availability from session status and `access_config.entries`, and parent availability from `access_config.criteria` (`competition-workflow.service.js:144–151`). The server also checks entry, criterion and intersection gates, rather than asserting the entry is the primary contestant (`097…sql:232–239`).

Therefore, selecting contestant 1 does **not** itself close contestant 2. An organizer requiring only contestant 1 open must use the selected-entry gate. Whether primary selection should also constrain inputs is a **business-policy question**, not an existing implemented rule or a repair silently proposed by this audit.

## Judge action → organizer, reviewer and rankings

| Judge action | Persistence / authorization | Emission and recipient | Receiving behavior / limit | Status |
|---|---|---|---|---|
| Type / autosave draft | Local state + judge-scoped local recovery; 800ms debounce → POST `/session-draft` → `scoringWrite('draft')` → SQL draft revision/bounds/scope checks. `useJudgeScoreDrafts.js:67–108`. | `session:judge-score-submitted` to organizer, **even for draft actions** (`workflow.service.js:126–131`). | Live Control calls GET judge-progress. Official calculations exclude drafts; the event name alone does not mean submitted. Frequent draft events can trigger repeated progress reads. | **Partially working** |
| Lock criterion | Flush draft → POST `/session-score` → versioned scoring RPC. JSON locks, projection rows and draft deletion are inside the SQL transaction (`097…sql:262–277`). | Organizer-only progress event. | Judge syncs own sheet (`JudgeScoringPage.jsx:355–364`); Live Control progress handler reloads (`:105`). Tabulation/Rankings do not subscribe to this event. | **Partially working** automatic Live Control; **Broken** automatic tabulation aggregate refresh |
| Submit Round | POST `/submit-round` → same RPC `submit`; validates all assigned eligible locks, unresolved drafts and submission window, writes versioned immutable score sources (`097…sql:205–226`). Existing submission returns duplicate success (`:200–203`). | Same organizer-only progress event with `action:'submit'`. | Judge reloads own sheet (`JudgeScoringPage.jsx:563`). Live Control updates submission metadata. No rankings invalidation event is emitted by this versioned path. | **Partially working** |
| Reviewer verifies calculation | Participant verifier endpoint → frozen reviewer/active account/independence/source digest checks → result transition RPC (`workflow.service.js:245–256`). | **No event** emitted by `reviewerVerify`. | Reviewer reloads own component. Organizer Tabulation remains on old snapshot/status until local action/filter change/navigation; Finalize stays disabled in an already open page. | **Broken** automatic review handoff |
| Reviewer approves/rejects eligibility, deduction or amendment | Dedicated reviewer methods validate appointed access, call decision/amendment RPC (`workflow.service.js:266–272`). | **No event** from these service methods. | Own reviewer component reloads. Judge/organizer state and calculation freshness are not proactively invalidated through this path. | **Broken** automatic decision propagation |

Organizer Calculate creates a saved snapshot but emits **no reviewer event** (`competition-workflow.service.js:225–226`). The reviewer component loads only on mount and after its own action (`CompetitionReviewer.jsx:6–8`). New pending calculations, deductions or amendments consequently do not appear automatically on an already open reviewer page.

Reports have a separate HTTP recovery mechanism: `CompetitionReportPage.jsx:34–38` configures 15-second polling; `modules/analytics/hooks/useModuleAnalytics.js:87` schedules it. This does not refresh the separate Tabulation or Rankings pages.

## Priority findings, reproduction and acceptance

### RT-01 — High / no-refresh blocker: active/disconnected judges and reconnected organizers have no complete recovery path

**Expected:** an open page converges to current permitted state after a missed event or reconnect without browser refresh.

**Evidence:** active judge polling effect returns before scheduling an interval (`JudgeScoringPage.jsx:212–217`), including when `socketConnected=false`; this exact effect was executed in the audit fixture. Judge reconnect refetch exists (`:289–294`), but persistent failed connection receives no active HTTP fallback. Disconnect does not set `connectionError`, so the visible refresh/recovery banner normally remains absent (`:296–299,545–560`). Organizer listens to domain events only (`CompetitionLiveControlPage.jsx:99–105`), with no `ws:connected`, polling or visibility-focus reconciliation.

**Reproduce:** load active judge and organizer sheets; interrupt only WS delivery; change entry/criterion gates and submit from another client; restore connection. Judge can recover on successful reconnect, organizer remains stale. Leave WS unavailable while HTTP works: active judge stays stale.

**Recommendation:** event-scoped HTTP reconciliation on reconnect and focus for both actors, plus bounded fallback polling during active state when connection/delivery is unhealthy. Keep saved drafts and scope guards. No scoring formula or database migration required.

**Acceptance:** block WS, retain HTTP, close scoring; judge UI disables within the agreed fallback interval and stale request is rejected. Restore WS after a missed submission; organizer progress converges automatically once.

### RT-02 — High / no-refresh blocker: tabulation ↔ independent reviewer handoff is disconnected

**Evidence:** `CompetitionTabulationWorkspace.jsx:13–15` and `CompetitionReviewer.jsx:6–8` have mount/local-action loading only. Calculate, reviewer verification, decision approvals and advancement methods return without matching recipient emissions (`workflow.service.js:225–226,245–272,344–358`).

**Impact:** an open reviewer page cannot discover the new calculation without refresh; an open organizer page cannot discover independent verification and enable Finalize without another reload-triggering action. Decision approval can also leave scoring availability stale.

**Reproduce:** open Tabulation and reviewer page concurrently; calculate; inspect reviewer page; refresh it and verify; inspect original Tabulation status/button.

**Recommendation:** explicit event-scoped invalidations for calculation, verification, decision/amendment and advancement changes, with receiving subscriptions plus reconnect/fallback reconciliation. Sensitive worksheets stay authorized GET data, not public socket payloads. A small emitter/client repair can use the existing native WS architecture; durable delivery is a separate larger task.

**Acceptance:** each side observes the other actor's action without refresh; invalidated calculations cannot be finalized; rejected/approved decisions update appropriate scopes and maintain history.

### RT-03 — High / result-staleness blocker: versioned rankings do not refresh on submission/publication

**Evidence:** current scoringWrite emits only progress (`workflow.service.js:130`); current transition emits `{eventId}` with no `rankings` (`:241`). `CompetitionRankingsPage.jsx:46–55` reloads filtered views, but unfiltered views do nothing without a supplied ranking payload. Executing its actual callback proved no reload/setData on the current publication envelope. No reconnect reload exists. Error-catching ranking loads also silently substitute empty results (`:21–34`).

**Reproduce:** keep unfiltered Rankings open; submit last round and publish from another tab. The heading/results can continue to show live/previous values until Refresh.

**Recommendation:** event-scoped invalidation should always fetch authoritative rankings/results, including payload-free events and reconnect. Emit a ranking/source invalidation after official submitted-source changes; do not calculate from socket payloads or treat draft/locks as official submissions.

**Acceptance:** complete Submit Round updates provisional standings; Publish changes all open ranking views to the exact official snapshot; filters retain their intended scope.

### RT-04 — High: stale HTTP response can overwrite newer round context

**Evidence:** `getGuardedView` checks account/event identity, not request order or revision (`JudgeScoringPage.jsx:22–27`). `syncSessionView` installs every response (`:187–204`). Two deferred responses executed against the exact current callback demonstrated newer Final/revision 2 being overwritten by older Preliminary/revision 1. Live Control and Tabulation loading also lack response sequencing (`LiveControl:48–70`; TabulationWorkspace:13`).

**Impact:** wrong round labels, stale input gates, reopened stale context and save errors; SQL context guards prevent a stale-round request from being accepted, but do not correct the UI.

**Recommendation:** sequence/abort requests and validate event, session, rules, round and monotonic revision before applying context responses; coalesce event storms. Keep local edits scoped to the context. No new scoring rule required.

**Acceptance:** deliberately invert GET completion order during rapid round/pause/access changes. The newest server context remains displayed and drafts are never moved to another round.

### RT-05 — Medium: global event handlers accept another enrolled event's state

**Evidence:** server auto-joins all enrolled/owned events (`ws-server.js:135–152`); subscriptions are type-only. Judge status callback lacks `eventId`/session match (`JudgeScoringPage.jsx:225–241`); exact execution accepted a foreign event's paused status. Unfiltered Rankings also accepts a full rankings payload with no event identity check (`CompetitionRankingsPage.jsx:46–55`), although most versioned emissions are payload-free.

**Impact:** one competition's publication/pause can temporarily change another open sheet's status; legacy full ranking emissions can install the wrong owned event's standing. This is a cross-event UI correctness defect, not evidence of joining an unauthorized room.

**Recommendation/acceptance:** put event ID on every envelope, filter before applying/refetching, and test a judge and organizer legitimately associated with two simultaneous competitions. Event B must leave Event A state unchanged.

### RT-06 — High when users share one IP: hard ten-connection cap blocks judges

**Evidence/reproduction:** actual eleventh upgrade received HTTP **429** in audit fixture (`ws-server.js:35–59`). The cap is per IP, not account/event. Multiple browser tabs, organizers and judges share it. Load balancer remote-address behavior was not verified.

**Impact:** a panel behind one venue/campus NAT can lose automatic sync after ten connections; disconnected active polling is already absent.

**Recommendation:** define expected shared-network concurrency and use appropriate authenticated/user/IP limits, verifying trusted proxy handling and resource budget. This is a capacity/security policy decision, not an invented numeric replacement.

**Acceptance:** run the agreed panel/tab count behind one shared IP; all authorized required clients remain synchronized while excessive abusive connections are bounded.

### RT-07 — Medium: token refresh listener has no repository dispatcher; expired access can leave a reconnect loop

`socket.service.js:85–87` listens for `votrix-token-refreshed`, but repository search found no dispatcher for that event. Axios refresh updates session/CSRF (`frontend/src/services/api.js:143–152`) without notifying the socket. The server revalidates access-cookie authentication every heartbeat. An idle active judge makes no periodic HTTP request, so an expired access cookie can close the socket and upgrades may fail repeatedly until an HTTP refresh occurs. This is a source-supported failure scenario; expiry was not exercised.

**Recommendation/acceptance:** coordinate socket reauthentication/reconnect with the existing serialized HTTP refresh procedure and avoid unbounded unauthorized retry. Test expiry while only the scoring sheet is open, both valid refresh and revoked-session cases. No token may enter JavaScript storage.

### RT-08 — Medium: participant dashboard misses versioned start lifecycle event

Participant dashboard listens only to `competition:scoring-toggled` for competition lifecycle refresh (`VoterDashboardPage.jsx:122–130`). Versioned start returns early via workflow (`competition-session.service.js:610–613`), before retained legacy `scoring-toggled` emission at `:809`. Generic session events are not observed by the dashboard. Thus an already open dashboard can retain waiting state after start. Direct opening of the scoring route has its own GET/polling and is a different path.

**Recommendation/acceptance:** issue or receive an event-scoped lifecycle invalidation on versioned start/end/publication; test the already open dashboard and its card state without navigation/refresh.

### RT-09 — Medium/conditional deployment risk: no delivery replay or multi-instance fan-out

Service emits happen after database work and are not transactionally coupled to a durable event/outbox. Initial automatic room setup is asynchronous and heartbeat removes/rebuilds room membership. An event can be missed during setup, transient outage, service restart or process split. The client does not replay or compare a message sequence. Actual deployment replica count/load-balancer upgrade behavior remains **Cannot verify**.

**Recommendation:** first add authoritative reconciliation and verify deployment is compatible with the current single-process registry. If multiple processes are required, use a shared pub/sub transport or durable invalidation mechanism consistent with the existing WS server. Do not add a second Supabase realtime architecture merely because Supabase is the database.

**Acceptance:** disconnect/restart during mutation; all clients converge from GET. If scaled deployment is used, mutation on process A reaches authorized socket on process B, with no sensitive cross-room data.

## Server authority, close races and stale retries

The versioned scoring path has stronger guards than merely disabling buttons:

- Event and session row locks serialize draft/lock/submit with operational gate changes (`097_competition_round_progression.sql:186–190`; operation `:286,301`).
- Exact judge/session/current-rules/current-round context, active enrollment and account, frozen panel and scope, eligible roster, finalized-round guard and entry/criterion/intersection access are checked (`:186–199,228–239`).
- Draft revisions detect stale concurrent drafts (`:253–258`); equal duplicate locks return duplicate success and differing locked values are rejected (`:240–243`).
- Submit Round is separate from performance inputs: it checks `submission_window`, complete locks and unresolved drafts and snapshots score sources (`:205–226`). **Closing input gates need not forbid a later complete Submit Round** while that explicitly separate window remains open.
- Retry queues now bind judge/event/session/round/rules context and reject mismatched current context (`JudgeScoringPage.jsx:61–64,395–396,437–438`); draft recovery keys also include that scope (`useJudgeScoreDrafts.js:4`). These are improvements present in current code, not proposed repairs.

**Code-supported expected race outcome:** if closing scoring acquires the shared lock first, a subsequent draft/lock sees the closed gate/status and rejects. If a valid write acquires it first, that valid write commits before closing. This ordering should be tested against the migrated database; the transport fixture does not prove SQL concurrency behavior or migration installation.

Direct primary-contestant next/previous/jump updates remain a different service path (`competition-session.service.js:825–922`), outside the unified operational RPC and without a revision increment/event-row transaction in those functions. They alter presentation context rather than the entry scoring gate. Acceptance must cover concurrent round switch versus primary selection to avoid stale presentation state, without redefining permission semantics.

## Required multi-browser acceptance run

Use separate authenticated organizer, scoring-judge and appointed-reviewer browser profiles against an isolated test competition and known applied migrations. Record API/WS frames and resulting database IDs/revisions; do not use real competition submissions as disposable fixtures.

1. Create/publish setup, open waiting judge and dashboard, start; both destinations update automatically.
2. Set selected-entry and selected-criterion gates; judge receives exact scope without refresh. Primary selection alone is tested separately as presentation.
3. Enter/autosave valid raw values, lock each parent and Submit Round. Organizer progress separates draft/lock/full-lock/round-submit states and official aggregates use only submitted snapshots.
4. Close access during stale judge request; validate event/session locking and rejection. Close submission window separately and verify Submit Round behavior.
5. Activate next slot/round and Preliminary→Final qualification; verify correct effective roster, scoped recovery and no preliminary draft reuse.
6. Disconnect WS with HTTP available, mutate, reconnect; validate current UI on all three profiles without refresh and test inverted GET response ordering.
7. Calculate while reviewer is already open, verify while organizer is already open, finalize/publish; reviewer handoff and all ranking views converge to official snapshot.
8. Approve/reject a deduction, non-competing decision and authorized amendment; check scoped UI updates, stale-snapshot rejection and preserved history.
9. Enroll the same identities in two competitions; events from B never overwrite A. Judge cannot subscribe to organizer room or retrieve unauthorized numerical sources.
10. Test agreed simultaneous panel count behind one shared IP, access-cookie expiry, revoked session, server restart and any actual deployment replicas.

The present source and isolated evidence do **not** satisfy all these readiness criteria. Recommendations above are a repair plan requiring approval; none were implemented by this audit.
