# Actual localhost competition integration audit

October14,2026. Exact requested URL: **http://localhost:5173/organizer/competition**. Final status: **PARTIALLY INTEGRATED**. Native implementations are connected to event-specific source routes, but the normal configured localhost application cannot currently run the native workflow. Full application acceptance is **BLOCKED**, not established by earlier unit/component-adapter tests.

## A. Exact root cause

There are three distinct findings:

1. The requested URL is the module dashboard. `routes/index.jsx:217` registers it under the organizer role guard and `PageantLayout`; its index renders **CompetitionDashboardPage**, not NativeSetupWorkspace. This dashboard still calls the existing event-summary API and was not replaced by a native child dashboard in Phases1–9. The parent Create Event form also deliberately remains the existing details/branding flow.
2. Native event screens have explicit default-off gates. The exact setup expression in `NativeSetupWorkspace.jsx:22` is `if(import.meta.env.VITE_COMPETITION_NATIVE_SETUP_ENABLED!=='true')return <Legacy/>`. The running Vite module at localhost5173 contains the native implementation but its injected environment omits all four native frontend flags. Consequently the normal workspace, contestants, judges and review routes select their **LegacyCompetition...** bodies; native context requests are not attempted. This is verified running-server configuration, not an assumption that files are missing or a cache diagnosis.
3. The local backend configuration points to the shared **HOSTED_PRODUCTION_SENSITIVE** Supabase project. Authorized metadata GETs return200, but a zero-row `competitions` read returns404 and the native child/setup/scoring/tabulation/results/navigation RPCs are not exposed. The configured REST API cannot serve this workflow. User-confirmed migrations103–108 were applied only to disposable local databases. SQL catalog/ledger remain unverified; REST absence alone is not an exact catalog proof.

Turning on flags against that project would surface disabled-service/missing-schema errors, not complete integration. No flags or shared schema were changed.

## B. Actual application execution path

`frontend/src/main.jsx` → Bootstrap / QueryClientProvider / RouterProvider → `app/router.jsx` → `createBrowserRouter(wrapWithSuspense(routeConfig))` → `routes/index.jsx` → ProtectedRoute(organizer) → PageantLayout → ModuleStageLayout → Outlet → **CompetitionDashboardPage**.

The dashboard's query is `pageantService.getDashboard()` → `GET /api/organizer/competition/dashboard` → `organizer.routes.js` authentication/profile boundaries → `pageant-organizer.routes.js` → controller `getDashboard` → `pageant.service.js:getOrganizerDashboard` → existing organization/event/enrollment/legacy scoring records. No native child-context discovery occurs on this landing screen.

Create Event links to `/organizer/competition/events/new`. CompetitionEventFormPage saves the parent draft, then calls `draftService.publishDraft('competition',payload)` → `POST /api/organizer/competition/drafts/publish` → `draft.controller.js:publishDraft('competition')` → draft/event creation services → existing parent event. Success navigates to `/organizer/competition/events/:eventId/workspace`. Creating this parent is not the same operation as creating a child competition.

The sidebar and event list reach the existing workspace/contestants/judges/review/live/tabulation/rankings/analytics/report routes. Source registration is real: `pageant-organizer.routes.js:25` mounts child routes **before** the event-only legacy boundary. The native route handler binds actor/event/child and invokes the native service/RPC. Its running authenticated behavior is not verified against the current incompatible database.

## C. Legacy versus native integration matrix

In the table, `E` means an explicit event ID and `C` an explicit child ID. Native API prefix is `/api/organizer/competition/events/E/competitions`; participant/reviewer operations use the corresponding `/api/participant/competition/...` prefix. Single phase uses NULL round, never an artificial round.

| Step/component | Existing path | Native connection / service / database dependency | Current localhost selection / required correction |
| --- | --- | --- | --- |
| Organizer dashboard / CompetitionDashboardPage | Event-summary GET `/dashboard`; existing parent stats | No replacement child dashboard was implemented. Existing event selection leads to native boundaries when enabled. | Existing dashboard. Added gated Manage competitions and workspace row links; parent aggregate statistics still use the existing read model. Per-child completion belongs to native Live Control, not these legacy counters. |
| Event selection / CompetitionEventsPage | GET `/events` → listCompetitionEvents | Same owned parent list; draft rows link to workspace, active to live, terminal to rankings | Existing parent event list; selecting a parent is still required. Its old event-preview helper is not native round preview. |
| Parent creation / CompetitionEventFormPage | Draft save/publish and shared parent creation | Same parent foundation; native child creation is a later explicit step | Parent wizard is intentionally unchanged. Real synthetic login/create is blocked pending full isolation. |
| Setup / CompetitionWorkspacePage | LegacyCompetitionWorkspacePage, parent scoring/round/criteria endpoints | NativeSetupBoundary → list children GET prefix → listChildCompetitions; then NativeSetupWorkspace → foundation/configuration/entries APIs → migrations103/104 | Disabled frontend setup flag selects legacy. Enable only after an isolated compatible backend is verified. |
| Child creation / NativeSetupWorkspace | No independent child identity in old setup | POST prefix → createChildCompetition → competition_create_child; competitions103 | Present/reachable through event workspace, unavailable in current flags/schema. |
| Contestants / CompetitionContestantsPage | Event master contestants and legacy participation | Same NativeSetupBoundary; shared masters plus child `/C/entries` → competition_add_entry; competition_entries103 | Legacy body now selected. No automatic conversion/master-ID scoring. |
| Judges / CompetitionJudgesPage | Parent enrollment and legacy assignment scopes | NativeSetupBoundary; explicit `/C/judge-assignments` → competition_assign_native_judge; assignments104 | Legacy body now selected. Explicit active enrollment/child/round grants required. |
| Criteria/rounds / native setup form | Parent criteria/round/scoring config | PUT `/C/configuration` → saveNativeConfiguration → competition_save_native_configuration; projections/revisions104 | Existing native form is connected, but gate/schema prevent use. No extra unused criteria page needed. |
| Review/freezing / CompetitionReviewPage | Legacy event-wide review/publication | NativeSetupBoundary → POST `/C/rules/freeze` → competition_freeze_native_rules; immutable rules104 | Legacy review now selected. Native freeze remains distinct from result publication. |
| Live Control / CompetitionLiveControlPage | Legacy event/session controls | CompetitionWorkspaceBoundary(owner) → GET scoring-contexts/live, POST live/action → competition_child_live_view/live_control; sessions105/qualification106 | Scoring flag disabled; legacy body. Empty native choices fail explicitly, rather than grant event-wide access. |
| Judge sheet / JudgeScoringPage | Legacy table/services/draft hook | Participant choices/context → NativeCompetitionWorkspace → existing unchanged CompetitionScoringForm → POST scores/action → competition_child_score_write; drafts/submissions/current heads105 | Native scoring gate disabled. Real login/assignment/session/own-source behavior unverified here. |
| Independent review/tabulation / CompetitionTabulationPage | Legacy event-level tabulation | NativeTabulationBoundary → snapshot/calculate/reviewer APIs → competition_child_tabulation_snapshot, competition_child_official_calculate/official_transition; immutable106 | Tabulation flag disabled. Engine preserved; only complete current heads and independent review can finalize. |
| Qualification / NativeTabulationWorkspace | Legacy advancement paths | Same existing native workspace → qualification/confirm → competition_child_confirm_qualification; confirmed rosters106 | Cannot run with current schema. Closure alone cannot qualify/start a later round. |
| Official results / CompetitionRankingsPage | Legacy rankings/result payloads | NativeResultsBoundary → `/C/results` → competition_child_owned_results; current finalized106 and publication107 | Results flag disabled. Native results never aggregate siblings into an overall winner. |
| Publication/analytics/reports | Legacy result/report exports | NativeResultsWorkspace through Rankings/Analytics/CompetitionReportPage; publication/export APIs → competition_child_publication_action/export_sources; publication ledger107 | Results flag disabled. Exact-current CSV and public immutable editions remain guarded. |

## D. Reachability and fallbacks

Native components are imported by the actual routed pages; no broken import or dead native route was found in this trace. They are **conditionally reachable**, not currently activated. The native setup, scoring, tabulation and results boundaries each check their own flag. API/context failures show errors rather than silently choosing legacy. A single explicitly mapped legacy child retains legacy setup; zero children can use native child creation when prerequisites are met, with an explicit legacy choice. Scoring/results only select legacy on explicit non-native context; unknown identity fails closed.

At the specified root route there is **no eventId**. An event's legacy/native/zero/multiple-child classification cannot be inferred from that URL. No production event was selected or converted. Directly mounting NativeSetupWorkspace at the root would lose the required event identity; the safe connection is event selection → existing event-scoped workspace.

## E. Active flags and URLs

| Flag | Checked value/source | Execution consequence |
| --- | --- | --- |
| VITE_COMPETITION_NATIVE_SETUP_ENABLED | Absent in frontend env layers and running Vite injection | Disabled: workspace/contestants/judges/review choose legacy. |
| VITE_COMPETITION_NATIVE_SCORING_ENABLED | Absent in frontend env layers and running Vite injection | Disabled: Live Control/judge native dispatcher inactive. |
| VITE_COMPETITION_NATIVE_TABULATION_ENABLED | Absent in frontend env layers and running Vite injection | Disabled: native tabulation inactive. |
| VITE_COMPETITION_NATIVE_RESULTS_ENABLED | Absent in frontend env layers and running Vite injection | Disabled: Rankings/Analytics/Report native dispatcher inactive. |
| COMPETITION_CHILD_CONTEXTS_ENABLED | Absent in backend/.env/current diagnostic process | Configured default disabled. |
| COMPETITION_NATIVE_SETUP_ENABLED | Absent in backend/.env/current diagnostic process | Configured default disabled. |
| COMPETITION_NATIVE_SCORING_ENABLED | Absent in backend/.env/current diagnostic process | Configured default disabled. |
| COMPETITION_NATIVE_TABULATION_ENABLED | Absent in backend/.env/current diagnostic process | Configured default disabled. |
| COMPETITION_NATIVE_RESULTS_ENABLED | Absent in backend/.env/current diagnostic process | Configured default disabled. |
| COMPETITION_NATIVE_RATE_POLICY_ENABLED | Absent in backend/.env/current diagnostic process | Configured default disabled. |

The live backend process's inherited environment has not been inspected independently; these backend values describe the checked file/default configuration. No authenticated capability endpoint was used to infer otherwise. Frontend running values are independently checked through Vite's served native module.

Frontend: **http://localhost:5173** (localhost/IPv6 listener; probing only127.0.0.1 would miss it). Frontend configured API: **http://localhost:5000/api**, so it calls localhost, not Render. Source derives WebSocket `/ws` from that API origin. Backend already listens on5000. Local PostgreSQL55439 remains stopped. There is no demonstrated frontend/backend source-version mismatch; activated native prerequisites are absent. After safe isolated environment activation, both backend and Vite must restart to load changed configuration. A restart of the present unsafe configuration is not the remedy.

## F. Database compatibility

[hosted-schema-read-only.json](hosted-schema-read-only.json) records fresh200 REST schema and404 zero-row child-identity observations. Required child/configuration/assignment tables and native service RPCs are not exposed. Native sessions/sources/calculations/qualification/publications are intentionally private in the reviewed migrations, so absence of their raw REST table definitions alone is not treated as proof of missing SQL objects. Missing operational child identity/foundation is sufficient to block this native backend.

Only metadata GETs were made; no scores/accounts/events were retrieved, no RPC called and no SQL/seed/migration/write executed. Direct catalog/ledger remain BLOCKED. Current shared Supabase is not the isolated environment used in Phase7–9 tests. Standalone sparse PostgreSQL fixtures do not supply the actual application's complete login/draft/profile/PostgREST stack.

## G. Files changed

- Modified **frontend/src/pages/organizer/competition/CompetitionDashboardPage.jsx**: when native setup is explicitly enabled, existing dashboard rows open `/events/:eventId/workspace`, and Manage competitions opens the existing event list. Default legacy row paths remain unchanged.
- Added **frontend/src/pages/organizer/competition/CompetitionDashboardPage.native-navigation.test.jsx**: two mock-only navigation tests, no database target.
- Added **backend/scripts/diagnose-native-competition-ui.mjs**: read-only config/running Vite/optional hosted metadata diagnostics; never starts backend or executes RPCs.
- Added this audit/evidence and inactive isolated env examples/setup instructions. Earlier partial Phase10 safety/discovery additions are retained and are not attributed as new product repairs here.

[preservation.json](preservation.json) compares the pre-edit789-file snapshot: only the dashboard's pre-existing source changed; all75 protected election/polling/engine/judge-table/CSV paths and actual environment/deployment/workflow configuration hashes remain unchanged. No migrations, authentication code, calculation formula or historical records changed.

## H. Safe fix and its limits

The navigation fix connects an existing dashboard to an existing native-capable workspace; it creates no parallel implementation and makes no native request from the root. It is still gated. It does **not** activate native features or replace the dashboard's parent/legacy summary read model with child completion statistics. Existing native Live Control is the authoritative per-child completion view. The database blocker was not repaired by forcing flags, faking context or migrating the shared project.

## I. Actual localhost verification

| Check | Result/evidence |
| --- | --- |
| Exact `/organizer/competition` SPA entry | HTTP200, imports real `/src/main.jsx`. |
| Running router/dashboard/native modules | HTTP200; current route index/component and repaired Manage competitions source served by actual Vite. |
| Browser-served frontend flags | All four absent/disabled in parsed Vite environment injection. |
| Existing backend no-cookie dashboard/native-context reads | Both401; inspected authenticate rejects missing cookies before user/database lookup. This does not prove authenticated native handler/schema execution. |
| Supabase REST metadata / zero-row child table |200/404; read-only capability blocker. |
| Navigation and native/legacy/unknown-context checks | **8 tests /2 files PASSED**, mocked frontend services/sockets, database target NONE. Not full application acceptance. |
| Targeted ESLint, diagnostic syntax, git diff check | PASSED. |
| Real login, organizer DOM, five-child full real-app workflow | **BLOCKED/UNVERIFIED**. No isolated complete application stack/accounts supplied; production login/testing would write sensitive data. |

[served-route-verification.json](served-route-verification.json), [diagnosis.json](diagnosis.json) and [navigation-tests.log](navigation-tests.log) provide evidence. No development server or PostgreSQL cluster was started by this audit. Existing user-started servers were left running. Prior Phase9 browser tests used synthetic JWT/local SDK adapters; they are not reused as proof that this ordinary localhost install is activated.

## J. Remaining blockers

1. A positively identified isolated full Supabase/PostgREST/application database, reviewed foundation/103–108 ledger and synthetic real-login accounts are missing.
2. Native frontend/backend gates are disabled in checked configuration; enabling them is unsafe before item1.
3. Authenticated exact-route DOM/network and whole-app acceptance remain unverified; backend process-specific flags/version are not independently certified.
4. Root organizer summary/old event preview retain event/legacy read models; a child-aware root statistics redesign is not supplied or claimed by this repair.
5. The source backend starts event synchronization immediately and archival later. Both can write to its target. The already running user backend may therefore affect the shared project; this audit does not certify it as read-only. Stop that local backend before reconfiguration/testing against an isolated target.

## K. What you should see and exact next steps

**With today's unchanged shared-database configuration, the root still shows the existing dashboard and event screens still choose legacy. The native workflow is not fixed/activated.** This is the safe expected result, not a claim that the UI is ready.

Follow [ISOLATED_LOCAL_SETUP.md](ISOLATED_LOCAL_SETUP.md). The inactive examples are not Vite/backend-loaded files. Establish and verify a complete separate database/API, curated foundation/migration chain, synthetic accounts and side-effect isolation first. Then install the reviewed isolated configuration, enable matching gates, restart both servers, log in synthetically and open the same root. Manage competitions leads to the existing parent event list; Create Event still creates a parent. Its `/workspace` should then show child creation, separate configuration/entries/panels and explicit freezing. Complete actual normal-app scoring/review/qualification/results/publication acceptance there before declaring integration complete. Never apply these migrations to the shared project as a UI shortcut.

## L. Final status

**PARTIALLY INTEGRATED**: source routing/services are connected, and dashboard-to-workspace navigation has a safe gated repair. **The actual configured localhost native workflow remains blocked by disabled flags and incompatible REST capabilities.** No full acceptance or deployment readiness is claimed. No hosted modification, commit, push, Render/Vercel deployment or automatic legacy conversion occurred. STOP after this audit and safe repair.

