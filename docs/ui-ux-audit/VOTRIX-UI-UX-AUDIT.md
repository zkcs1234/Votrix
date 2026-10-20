# VOTRIX — Complete UI/UX Audit

This consolidated reference combines the eight audit documents into one file. It retains the source-based scope and verification caveats of the original documents.

## Contents

- [System overview](#system-overview)
- [Complete page inventory](#complete-page-inventory)
- [Detailed page specifications](#detailed-page-specifications)
- [End-to-end workflows](#end-to-end-workflows)
- [Sitemap and navigation](#sitemap-and-navigation)
- [UI/UX audit](#ui-ux-audit)
- [Figma design specification](#figma-design-specification)
- [Figma AI master prompt](#figma-ai-master-prompt)

---

<a id="system-overview"></a>

## VOTRIX — System Overview

### Scope and confidence

This is a source-based inspection of the current checkout, intended as a Figma/redesign reference. The route tree, page components, shared components, styles, frontend services, and selected API route guards were inspected. No application browser tab was shared for visual verification, so no statement below claims that a live deployment was rendered. Styles are described from source; runtime behavior is marked where feature flags, data, or external services determine the result.

No application code or configuration was changed for this audit.

### Product purpose

VOTRIX is a role-based platform for creating and operating election ballots, competition scoring events, and polls/surveys. Organizers configure events, enroll existing participant accounts, publish events, operate the event, and review analytics and reports. Participants use a unified home page to vote, respond to polls, or score competitions. Administrators manage accounts, platform settings, event oversight, and operational monitoring.

### Technology stack

| Area | Verified stack |
|---|---|
| Frontend | React 19, Vite 8, JavaScript/JSX |
| Routing and access UI | React Router 7, `ProtectedRoute`, `GuestRoute` |
| Styling | Tailwind CSS 4 via the Vite plugin, `frontend/src/index.css`, theme CSS variables, a small set of module-specific CSS files |
| State/data | TanStack React Query 5, Zustand 5, local component state |
| Forms/validation | React Hook Form, Zod, `@hookform/resolvers` |
| HTTP and real-time | Axios with cookie credentials and CSRF header; WebSocket event hooks |
| Visualization and interaction | Recharts, dnd-kit, Lucide icons, Framer Motion, date-fns |
| Backend | Node.js (>=20), Express 5 |
| Database/auth | Supabase client/PostgreSQL; JWT and bcrypt; cookie parser and CSRF middleware |
| External services | Cloudinary image uploads, Resend email, WebSocket server |

The frontend is a Vite SPA. `main.jsx` composes the router, query client, bootstrap/auth/CSRF initialization, global toast container, and error boundary. `src/routes/index.jsx` is the route source of truth. Page components call domain services under `src/services`; backend endpoints are grouped into auth, admin, organizer, participant, reporting, and module-specific routers.

### User roles

1. **Admin** — system-wide user/account administration, organizer and participant pools, event oversight, platform settings, health, alerts, archival, audit, and email-delivery history.
2. **Organizer** — organizer overview and scoped election, competition scoring, polling, and report workspaces. An organizer may have a global/all-access or scoped cohort permission profile.
3. **Participant** — shared account role for one or more participant types: election voter, competition judge, and polling respondent.
4. **Legacy `voter` role** — still accepted by frontend role helpers and legacy `/voter/*` routes redirect to `/participant/*`. Current backend participant router authorizes the `participant` role; deployment/session compatibility should be confirmed separately.

The role shown in navigation is a UI affordance, not proof of authorization. Backend admin routes apply admin authorization, organizer APIs are mounted behind organizer authorization, and participant APIs require a participant account plus event-participant checks on module routes. The specific business permission for each event operation remains enforced by its endpoint/service.

### Major modules

- **Platform administration:** dashboard, organizer/participant management, global event list, settings/taxonomy, system health, alert configuration, archival policy, audit log, and email-delivery log.
- **Organizer home:** activity/statistics overview, module entry points, organization branding, recent events, and active competition sessions.
- **Election:** event details and branding, ballot groups/sections, positions, candidates, voter cohort invitation, review/publish, analytics, report, and participant ballot.
- **Competition Scoring:** event creation/type, competition/category configuration, rounds/divisions/criteria/scoring rules, contestants/entries, judges/assignments, review/publish, live control, tabulation, rankings, analytics/report, participant judging/review, and public published results. Native workspaces are feature-flagged.
- **Polling:** event details/branding/settings, question builder and registered question types, respondent cohort invitation, review/publish, analytics/report, and participant response.
- **Shared services:** search, notifications, organizer profile, image upload, drafts/autosave, reusable cards/tables/forms, reports/export.

### Architecture and UI shell

- Auth routes use a centered `AuthLayout` card with the VOTRIX logo and a nested page.
- Admin and organizer routes render an `AppShell`: dark left navigation, sticky light header, account control, notification trigger, optional global search, scrollable main content, and a sticky stage-footer portal.
- The sidebar becomes a mobile off-canvas drawer; at widths below 1280px it auto-collapses to a rail on desktop, and selected analytics/live/ranking routes collapse it for more content width. These are source-defined breakpoints/behaviors, not live-device observations.
- Participant pages use the shared shell without a sidebar/search. Voting and poll response screens switch to a fullscreen, fixed-top-progress/scrollable-content/fixed-action layout.
- Module layouts add event-scoped navigation and a setup-stage wrapper. Sidebar links for event-scoped stages are disabled until an event is selected.
- UI component exports and route modules are JavaScript rather than TypeScript. No global breadcrumb component was found in the inspected shell.

### Important source-to-notes discrepancies

The current source takes precedence over pasted implementation notes when designing from this checkout:

- Election, competition, and polling event forms use the shared `CalendarCard` date/time picker with date-range constraints, required-state and field-error support, and consistent local-to-ISO conversion.
- Polling settings include an optional `pollExpiresAt` field. The existing database column and schedule behavior are wired through frontend validation, backend validation, create/update persistence, and event editing; expiration must fall within the event start/end window.
- The root README mentions dark/light theme support, while the inspected base stylesheet sets `color-scheme: light` and defines the default light token set; no dark theme selector/toggle was found in the inspected frontend sources.
- Competition has native/fallback workspace boundaries and environment switches. The active production flags cannot be determined from source alone; design flows should accommodate the implemented native and legacy variants until the target deployment is checked.

### Related source

- [Frontend entry point](../../frontend/src/main.jsx)
- [Route configuration](../../frontend/src/routes/index.jsx)
- [Protected route](../../frontend/src/routes/ProtectedRoute.jsx)
- [App shell](../../frontend/src/layouts/AppShell.jsx)
- [Design tokens and components](../../frontend/src/index.css)
- [Backend route mounting](../../backend/src/routes/index.js)
- [Backend admin routes](../../backend/src/routes/admin.routes.js)

---

<a id="complete-page-inventory"></a>

## VOTRIX — Complete Page Inventory

### Inspection key

- **Source-confirmed:** route, component, and primary controls were verified in source.
- **Source / feature-flagged:** route is confirmed; native/legacy render variant depends on deployment flags.
- **Redirect / shell:** route is a redirect or shared layout, not a distinct content page.
- **Not browser-verified:** all inventory entries were not rendered in an authenticated live browser during this audit. This is not a claim that the route fails.

### Guest and authentication

| Route | Page/component | Role/access | Main content and actions | Status |
|---|---|---|---|---|
| `/` | Login — `LoginPage` | Guest; authenticated users redirect by role | Email, password, remember-me, sign-in, forgot-password link | Source-confirmed; not browser-verified |
| `/login` | Login alias — `LoginPage` | Same as `/` | Same login screen; backward-compatible alias | Redirect / shell |
| `/forgot-password` | Forgot password | Guest | Email and send-reset-link action; success/error alert | Source-confirmed; not browser-verified |
| `/reset-password?token=…` | Reset password | Guest with reset token | New and confirm password; invalid/missing token disables fields and reports error | Source-confirmed; not browser-verified |
| `/change-password` | Change password | Authenticated; permitted during forced password-change state | Current/new/confirm password; skip option for organizers and participants, not admins | Source-confirmed; not browser-verified |

### Admin

All `/admin/*` screens require the admin role in the frontend guard; backend `/admin` routes also require authenticated admin authorization and changed-password status.

| Route | Page/component | Main content and actions | Status |
|---|---|---|---|
| `/admin` | Admin dashboard | Platform stats, module links, activity and analytics; add organizer/participant shortcuts | Source-confirmed; not browser-verified |
| `/admin/users` | User management | Organizer/participant tabs; participant subtypes: election voter, competition judge, polling respondent | Source-confirmed; not browser-verified |
| `/admin/organizers` | Legacy redirect | Replaces old organizer area with `/admin/users` | Redirect / shell |
| `/admin/organizers/:id` | Organizer activity detail | Activity log, action/entity filters, pagination, detail modal and JSON copy | Source-confirmed; not browser-verified |
| `/admin/events` | Global events | Summary cards; title/organization search; type/status filters; CSV and per-event export; activity/organizer links; archived-event restore | Source-confirmed; not browser-verified |
| `/admin/settings` | System settings | Platform settings plus managed participant taxonomy editor | Source-confirmed; not browser-verified |
| `/admin/audit-logs` | Audit logs | Search, action/entity/date filters, sorting, page size/pagination, CSV export, detail modal | Source-confirmed; not browser-verified |
| `/admin/email-delivery` | Email delivery | Recipient/workflow/status/date filters, refresh, delivery table and pagination | Source-confirmed; not browser-verified |
| `/admin/health` | System health | Overall status and database/Cloudinary/Resend service cards; refresh | Source-confirmed; not browser-verified |
| `/admin/alerts` | Alert configuration | Enable/disable failed-email, event-completion, and suspicious-login alerts; thresholds; save | Source-confirmed; not browser-verified |
| `/admin/archival` | Event archival policy | Enable automatic archive, retention-day input, save, run-now action and last-run feedback | Source-confirmed; not browser-verified |

The `/admin/users` participant subviews share one route and query-string state. Organizer management has add/edit/status confirmation and CSV template/import/export surfaces. Participant pools have add/edit, status, pool membership, CSV review/import/export, and participant details. A judge add/edit form includes identity, optional expertise/title/affiliation, and organizer assignment.

### Organizer home and reports

| Route | Page/component | Main content and actions | Status |
|---|---|---|---|
| `/organizer` | Organizer dashboard | Organization logo/profile, stats/charts, recent events, module links, active competition sessions | Source-confirmed; not browser-verified |
| `/organizer/reports` | Reports overview | Event lists for elections, competitions, and polls with turnout/submission summaries | Source-confirmed; not browser-verified |
| `/organizer/reports/election/:eventId` | Legacy report redirect | Redirects to `/organizer/election/events/:eventId/report` | Redirect / shell |
| `/organizer/reports/competition/:eventId` | Legacy report redirect | Redirects to `/organizer/competition/events/:eventId/report` | Redirect / shell |
| `/organizer/reports/polling/:eventId` | Legacy report redirect | Redirects to `/organizer/polling/events/:eventId/report` | Redirect / shell |

### Election

All pages require organizer access and use `ElectionLayout`; event-scoped pages receive an event ID in the route and share the module sidebar/stage layout.

| Route | Page/component | Main content and actions | Status |
|---|---|---|---|
| `/organizer/election` | Election dashboard | Event/voting/voter/vote stats; per-event turnout table; create event | Source-confirmed; not browser-verified |
| `/organizer/election/events` | Election event list | Event cards, status, preview ballot modal, manage/continue setup, draft recovery | Source-confirmed; not browser-verified |
| `/organizer/election/events/new` | Election creation | Details and branding stages; save/draft/stage navigation | Source-confirmed; not browser-verified |
| `/organizer/election/events/:eventId/edit` | Election details edit | Same form, prefilled; read-only when setup locked | Source-confirmed; not browser-verified |
| `/organizer/election/events/:eventId/branding` | Election branding | Same form in branding stage; event banner upload | Source-confirmed; not browser-verified |
| `/organizer/election/events/:eventId/positions` | Ballot positions | Ballot-section selector/create/reorder/rename/delete; position form and eligibility controls | Source-confirmed; not browser-verified |
| `/organizer/election/events/:eventId/candidates` | Candidates | Section/position selectors; search/filter; candidate form/cards, photo upload and delete | Source-confirmed; not browser-verified |
| `/organizer/election/events/:eventId/voters` | Voter enrollment | Program or year/section cohort selection, invite/optional notification, enrolled roster, eligibility | Source-confirmed; not browser-verified |
| `/organizer/election/events/:eventId/review` | Review & publish | Position/candidate/voter counts, readiness, publish/unpublish controls | Source-confirmed; not browser-verified |
| `/organizer/election/events/:eventId/analytics` | Election analytics | Turnout, timeline, participation groups, rankings/position summary and full-report link | Source-confirmed; not browser-verified |
| `/organizer/election/events/:eventId/report` | Election report | Turnout and vote summaries; refresh; CSV/Excel/PDF/JSON export | Source-confirmed; not browser-verified |

### Competition Scoring

All organizer routes require organizer access and use `PageantLayout` (the product’s competition-scoring navigation). Several pages wrap legacy UI with native-competition boundaries.

| Route | Page/component | Main content and actions | Status |
|---|---|---|---|
| `/organizer/competition` | Competition dashboard | Event/session/contestant/judge/score stats; judge-completion table; create event | Source-confirmed; not browser-verified |
| `/organizer/competition/events` | Competition event list | Event cards, scoring-sheet preview, manage/continue setup, draft recovery | Source-confirmed; not browser-verified |
| `/organizer/competition/events/new` | Competition creation | Details, banner, and competition type flow; draft and stage controls | Source-confirmed; not browser-verified |
| `/organizer/competition/events/:eventId/edit` | Event details edit | Shared form; read-only when setup is locked or official rules are frozen | Source-confirmed; not browser-verified |
| `/organizer/competition/events/:eventId/branding` | Event branding | Shared form branding stage and banner upload | Source-confirmed; not browser-verified |
| `/organizer/competition/events/:eventId/type` | Competition type | Type selection; changing a configured type can remove draft competition setup after confirmation | Source-confirmed; not browser-verified |
| `/organizer/competition/events/:eventId/categories` | Competitions/categories | Configure one or more competitions/categories or pageant divisions; add/remove with confirmation | Source-confirmed; not browser-verified |
| `/organizer/competition/events/:eventId/workspace` | Structure & scoring | Tabs for rounds, criteria, divisions, and scoring rules; readiness/save/recovery and continue navigation | Source / feature-flagged; not browser-verified |
| `/organizer/competition/events/:eventId/contestants` | Contestants & entries | Entry form, number/division/type, photo, round assignment and filters | Source / feature-flagged; not browser-verified |
| `/organizer/competition/events/:eventId/judges` | Judges | Search/pick from admin-created judge pool, optional invitation, assignment panel, removal/role actions | Source-confirmed; not browser-verified |
| `/organizer/competition/events/:eventId/review` | Review & publish | Contestant/judge/criteria counts, criteria/scoring readiness, acknowledgement and official-rules confirmation | Source / feature-flagged; not browser-verified |
| `/organizer/competition/events/:eventId/live` | Live control | Start/pause/resume/complete session, round/contestant/criteria controls, progress, arrangement and finalize/advancement dialogs | Source / feature-flagged; not browser-verified |
| `/organizer/competition/events/:eventId/tabulation` | Tabulation overview | Defaults to overview section in tabulation workspace | Source / feature-flagged; not browser-verified |
| `/organizer/competition/events/:eventId/tabulation/:section` | Tabulation section | Overview, submissions, matrix, deductions, results, or audit trail based on `section` | Source / feature-flagged; not browser-verified |
| `/organizer/competition/events/:eventId/rankings` | Results & rankings | Live/official standings, search, division/round filters, refresh and report link | Source / feature-flagged; not browser-verified |
| `/organizer/competition/events/:eventId/analytics` | Competition analytics | Scoring progress, overall/category rankings, judge activity, round results | Source / feature-flagged; not browser-verified |
| `/organizer/competition/events/:eventId/report` | Competition report | Judge turnout, ranking/category/round performance, refresh and CSV/Excel/PDF/JSON export | Source / feature-flagged; not browser-verified |

The setup/scoring/results variants use environment switches (`VITE_COMPETITION_NATIVE_SETUP_ENABLED`, `VITE_COMPETITION_NATIVE_SCORING_ENABLED`, `VITE_COMPETITION_NATIVE_RESULTS_ENABLED`). Their effective values are not established here.

### Polling

All pages require organizer access and use `PollingLayout`.

| Route | Page/component | Main content and actions | Status |
|---|---|---|---|
| `/organizer/polling` | Polling dashboard | Poll/active/response stats; per-poll participation; create poll | Source-confirmed; not browser-verified |
| `/organizer/polling/events` | Poll list | Event cards, question preview, manage/continue setup and draft recovery | Source-confirmed; not browser-verified |
| `/organizer/polling/events/new` | Poll creation | Details, banner, settings (anonymous and multiple submissions) | Source-confirmed; not browser-verified |
| `/organizer/polling/events/:eventId/edit` | Poll details edit | Shared form and status-based read-only state | Source-confirmed; not browser-verified |
| `/organizer/polling/events/:eventId/branding` | Poll branding | Shared form branding stage and banner upload | Source-confirmed; not browser-verified |
| `/organizer/polling/events/:eventId/settings` | Poll settings | Shared form settings stage; anonymous/multiple-submission switches | Source-confirmed; not browser-verified |
| `/organizer/polling/events/:eventId/builder` | Question builder | Registry-provided question types, reorder, add/edit/duplicate/delete, type-specific config and image/options | Source-confirmed; not browser-verified |
| `/organizer/polling/events/:eventId/respondents` | Respondent enrollment | Program/year-section cohort invite, optional email, roster and active-state lock | Source-confirmed; not browser-verified |
| `/organizer/polling/events/:eventId/review` | Review & publish | Event/question/respondent summary; at least one question readiness; publish/unpublish | Source-confirmed; not browser-verified |
| `/organizer/polling/events/:eventId/analytics` | Poll analytics | Response rate, groups, activity, question and answer distributions | Source-confirmed; not browser-verified |
| `/organizer/polling/events/:eventId/report` | Poll report | Response summary/question charts; refresh and CSV/Excel/PDF/JSON export | Source-confirmed; not browser-verified |

### Participant and public

| Route | Page/component | Role/access | Main content and actions | Status |
|---|---|---|---|---|
| `/participant` | Participant dashboard | Participant account | Role/event counts; active, assigned, completed event cards; eligible election results | Source-confirmed; not browser-verified |
| `/participant/events/:eventId` | Election ballot | Enrolled voter; event-specific backend check | Fullscreen ballot sections, candidate selection, progress, local draft, review and submit | Source-confirmed; not browser-verified |
| `/participant/polling/events/:eventId` | Poll response | Enrolled respondent; event-specific backend check | Fullscreen question form, progress, local draft, submit and confirmation | Source-confirmed; not browser-verified |
| `/participant/competition/events/:eventId/score` | Judge scoring/reviewer | Enrolled judge/reviewer; event-specific backend check | Context-dependent score sheet/reviewer view, local draft/retry, submissions and results | Source / feature-flagged; not browser-verified |
| `/competition/events/:eventId/competitions/:competitionId/results?roundId=…` | Published competition results | Public route; no frontend auth wrapper | Approved result snapshot, publication metadata, method/tie policy, standings | Source-confirmed; not browser-verified |
| `/voter/*` | Legacy route redirect | Existing legacy URLs | Rewrites `/voter` to `/participant`, preserving remaining URL/query/hash | Redirect / shell |
| `*` | Not found | Any unmatched URL | 404 message and link to home | Source-confirmed; not browser-verified |

---

<a id="detailed-page-specifications"></a>

## VOTRIX — Detailed Frontend Page Specifications

These are source-based descriptions for redesign. Screens were not rendered in a live browser; responsive behavior below reflects CSS/JS breakpoints and layout classes. Preserve the described business fields and actions when redesigning.

### Shared shell and component language

#### Auth shell

Centered full-height light background; a max-width card contains the VOTRIX logo/tagline in a top band and the route form. Auth pages use compact icon/title, helper text, stacked fields, inline alerts, and a full-width primary submit. Motion is a short fade/vertical entrance. Keep guest screens simple and focused.

#### Admin and organizer shell

`AppShell` places a dark navy sidebar beside a light content area. The sidebar has a VOTRIX logo, icon/text links grouped by section, active state, optional scoped event links, and an organizer-home footer. Desktop supports saved collapse state; narrower desktop auto-collapses, and tablet/mobile uses a drawer. A sticky white header contains page/module title, global search where enabled, notification bell/count, and account chip. Main content uses responsive padding; the fixed stage footer is used by guided setup pages.

No consistent global breadcrumb is present in the inspected shell. Page title and module label in the header are the primary location cues.

#### Participant shell

The dashboard and participant pages omit the sidebar. Election ballot and poll response use a full-viewport form with a fixed progress strip, scrollable event/form content, and bottom submit action. The event header provides banner/fallback gradient, back-to-dashboard link, event name/description, organization identity, and archived-state notice.

#### Existing visual tokens (verified in CSS)

- Default background `#F3F4F6`; surface `#FFFFFF`; elevated surface `#F9FAFB`.
- Text `#111827`; muted `#374151`; subtle `#6B7280`; border `#E5E7EB`; strong border `#D1D5DB`.
- Sidebar `#111827`, sidebar text `#D1D5DB`; primary indigo `#4F46E5`, hover `#4338CA`, soft `#EEF2FF`, brand accent `#7C3AED`.
- Success `#059669`; danger `#B91C1C`; warning `#B45309`; amber accent `#D97706`.
- Cards use 12px radii, thin border, white fill, subtle shadow. Inputs use 8px radii, 1px border, 10px/14px padding, 14px text. Tables have uppercase 12px headings, 14px body, 12px/16px cell padding, row separators, hover surface, and horizontal overflow wrapper.
- Typography stacks name Inter, Plus Jakarta Sans, and JetBrains Mono with system fallbacks. Actual font asset delivery was not verified. Page title is 24px/700; section title 20px/700; body 14px; caption 12px.
- Spacing tokens include 4, 8, 12, 16, 24, 32, and 48px. Reduced-motion media query suppresses animations/transitions.

### Auth pages

#### Login: `/` and `/login`

One centered sign-in screen. Fields are email and password; remember-me checkbox is optional; forgot-password link opens `/forgot-password`. Email and password validation use Zod; submit uses the login service, shows inline error/loading, then redirects by role or to the protected destination. The source form is email-based even though repository prose elsewhere describes admin username login; clarify target account conventions before Figma copy is finalized.

#### Forgot password: `/forgot-password`

Email-only form, send-reset-link action, inline error/success alert, and return-to-login link. Copy explicitly says a link is sent if an account exists.

#### Reset password: `/reset-password?token=…`

New-password and confirmation fields; token comes from query parameter. Missing token creates an error and disables inputs. Password minimum is eight characters and confirmation must match. Success navigates to login with a success message in navigation state.

#### Change password: `/change-password`

Current password, new password, confirmation. New password minimum is eight characters; confirmation must match. Submit updates session and routes to role home or a safe participant destination. Organizers and participant/voter roles also see a separate “Continue with temporary password” action; admin does not. Both paths have distinct loading labels and an inline error.

### Admin pages and overlays

#### Admin dashboard: `/admin`

Top page heading (“Admin dashboard”) and signed-in account context; primary add-organizer and secondary add-participant actions. Five stat cards: total organizers, total events, participant accounts, active events, votes cast. Module-link cards, recent activity/list cards, and analytics charts follow. Loading uses delayed skeletons; load error uses an alert.

#### User management: `/admin/users`

Top-level tabs are **Organizers** and **Participants**. The participant tab has secondary type tabs for election voter, competition judge, and polling respondent. The selected tab/type is encoded in query parameters; legacy `?tab=voters|judges|respondents` maps to participant subtypes.

- Organizer list: summary cards; name/email/organization search; status pills; CSV template, CSV preview/import, export, add/edit and account-state confirmation; table columns organization, organizer, email, status, created date, actions. Row click opens organizer activity detail.
- Voter/respondent pool: email, school ID, first/last name, program, and year/section fields on add/edit; taxonomy-backed select lists; CSV template/preview/import results/export; search, status, account-state and pool-membership actions.
- Judge pool: email, first/last name, expertise, optional title/affiliation, optional assignment to organizer(s); CSV pool operations, account state, and membership management.
- Key overlays: organizer editor, participant/judge editor, account status confirmation, CSV review/results.

Some account-status actions are destructive or access-changing: retain explicit status/impact copy and confirmation.

#### Organizer activity detail: `/admin/organizers/:id`

Activity/audit list for one organizer. Filters include action/entity and page controls; rows can open an activity-detail modal with action, entity, timestamp, actor and recorded details. Modal supports copy JSON and close/Escape.

#### Global events: `/admin/events`

Five aggregate stat cards; search by event title or organization; type and status filters; clear filters; export CSV. Table columns are title, type, organization, status, date range, actions. Row actions include activity, event report export, open organizer, and restore for archived events. Restore opens `window.confirm` and returns the item as completed/read-only. Search/filtering is client-side over the loaded event list; no page controls were found on this page.

#### System settings: `/admin/settings`

Single card/form, admin-only notice, and immediate-effect note. Current known defaults include platform name, maintenance mode, maximum organizers; unknown settings are typed as string/number/boolean/JSON. Managed taxonomy has a dedicated panel and alert configuration is managed on its own page. Save validates numeric/JSON values and writes settings sequentially; status is inline. Taxonomy program and year/section lists affect participant account forms and cohort invites.

#### System health: `/admin/health`

Overall status banner and cards for database, Cloudinary, and Resend, with healthy/degraded/unavailable indicators, service message and schema-ready warning. Refresh button and loading placeholders; error shown in alert.

#### Alert configuration: `/admin/alerts`

Three alert rows: failed email delivery, event completion, suspicious activity/failed logins. Each uses a switch; first/third reveal positive numeric threshold fields. Save action uses success/error toast. Loading uses skeleton rows.

#### Archival policy: `/admin/archival`

Explainer card describes completed-only archival based on event end date; automatic daily check when enabled. Switch and days-after-completion field (1–3650, default 90); field disabled while policy is off. “Run now” disabled while off; save policy, run loading, toast, and last-run message are present.

#### Audit logs: `/admin/audit-logs`

Search; action, entity, entity ID (initial query value), start/end dates; sort direction; page size 25/50/100; pagination. Summary totals and current-page admin/organizer/system activity counts. Table, CSV export, and modal displaying action/entity/actor/details; copy-JSON and Escape/backdrop close. Search debounce is 350ms. The default query parameter `entityId` is read once on mount.

#### Email delivery: `/admin/email-delivery`

Recipient search, workflow input, delivery-status select, start/end date, refresh, and server-backed 50-row pagination. Table: time, recipient, workflow, subject/template, provider status, details/error/provider ID. Status tones group delivered/sent/opened/clicked, failures/bounces/complaints, and queued/delayed/skipped. Empty state explains records depend on email-audit migration/sends.

### Organizer common pages

#### Organizer dashboard: `/organizer`

Overview includes organizer identity, organization logo upload/profile surface, total/activity metrics, charts, module cards (Election, Competition Scoring, Polling), recent event list and active competition sessions. Dashboard fetches data and analytics concurrently and refreshes through WebSocket events; delayed skeletons and error alert are implemented.

#### Reports overview: `/organizer/reports`

Three event lists grouped by elections, competition rankings/judge turnout, and polling charts/responses. Each event row links into the canonical module report page. Empty module list says no events yet; page-level loading spinner.

#### Organizer profile overlay

Triggered from the account chip for organizer role. Loads profile; display/edit modes for organization name, organization type, organizer name and position. Save updates profile/session user and toasts; logout is available in the header/account menu. The profile editor is not a separate route.

#### Shared module event forms

All modules use a guided form with persistent draft/autosave/session handling, step navigation, status locking, banner upload, and an unsaved-changes dialog offering save-and-leave, leave-without-saving, or cancel. Details schemas require title (max 200), start date, end date, valid date strings, and end on/after start; descriptions are optional (max 2000). All three modules now use the shared `CalendarCard`; its min/max day constraints complement exact cross-field date/time validation.

- **Election:** Details fields title, description, start/end, results visibility (real-time, hidden, public); Branding event-banner upload. Results visibility default is public.
- **Competition:** Details fields title, description, start/end; Branding; competition type selection is represented through the event type route/creation flow and allows “other” text up to 32 characters.
- **Polling:** Details title, description, start/end; Branding optional banner; Settings anonymous responses, allow multiple submissions, and optional expiration date/time constrained to the event schedule.

### Election page specifications

#### Dashboard and list

Election dashboard cards: total events, voting active, registered voters, votes recorded. Per-event table links into positions, with turnout and create-empty state. List page cards show status and description; actions include read-only voter ballot preview modal, Manage, Continue setup for draft. Preview displays grouped positions, vote count/skip hint, candidate photo/name/party and empty candidates state.

#### Positions: `/organizer/election/events/:eventId/positions`

Election sections/groups are selectable and can be created, reordered, renamed, deleted. Position fields include name, description, winner count, max votes, display order, and program eligibility; organizer scope can limit eligibility management. Position records are filtered by selected section. Read-only banner/locked controls follow event status. Toast feedback, loading, and confirmation/prompt flows are present.

#### Candidates: `/organizer/election/events/:eventId/candidates`

Section and position selectors, candidate search and position facet. Form fields name, biography, platform, party/legacy partylist, photo. Candidate cards show position, optional photo/party/bio/platform; delete is confirmed. Add is optimistic and reconciles with service response. Loading skeletons and toast/error behavior are present.

#### Voters: `/organizer/election/events/:eventId/voters`

Shared cohort invite component switches between Program and Year & Section; select cohort values, optional notification checkbox, estimated eligible count, invite summary and email outcomes. Enrolled roster supports removing a participant. At active status, a lock banner replaces mutations. Organizer-visible group and position eligibility summaries may be present according to organizer scope.

#### Review: `/organizer/election/events/:eventId/review`

Summary counts of positions, candidates, registered voters; draft readiness requires at least one position and candidate, but not voters. Publish hands the event to its schedule; it does not start voting immediately. Scheduled event can be unpublished to draft; later/terminal state is read-only. Stage footer continues or links to analytics.

#### Analytics/report

Analytics uses shared analytics sections/cards with voting timeline, voter progress, participation by program and year/section, position summaries and candidate ranking, plus voter-facing results visibility and full-report action. Report has turnout, vote summaries, participation table and export actions (CSV, Excel, PDF, JSON) plus refresh/generated timestamp. Exact chart data depends on event records.

### Competition Scoring page specifications

#### Dashboard and event list

Dashboard cards show events, active sessions, contestants, judges, scores submitted; per-event judge completion table. The dashboard/event list may present native competition links depending on the native setup flag. Event list offers manage/continue setup and read-only scoring-sheet preview showing criteria, weights/minor criteria and contestants.

#### Type/categories

Type page has competition-type select and “other” input. Changing a type with child competitions requires confirmation warning that setup/scoring/entry links/judge assignments will be removed while shared event entrants remain. Category/competition page adds/removes independent competitions, participation format, and pageant divisions. Locked when event is not draft or official child rules are frozen. Add/remove errors and confirmation dialogs are part of the flow.

#### Structure & scoring workspace

Page uses query tabs `rounds`, `criteria`, `divisions`, `scoring` (plus a structure deep-link), stage readiness summaries and a sticky footer. Rounds and criteria are configured per event/round; criteria progress/readiness, score types, weights, scoring method/rules, deductions, and divisions appear in child panels. Keyboard arrow/Home/End navigation is coded for the primary tab flow. Load failure has retry; read-only state follows event/official rules; autosave/recovery/status surfaces are present.

#### Contestants & entries

Shared foundation-backed screen lists entries with search, optional division facet, round selector, qualifier-only filter, and selection for round assignment. Form fields include name, entry number, optional entry label/type, division, and photo. Number defaults to next available. Round participation can be assigned/removed separately from registration; batch write failures identify partial progress. Native boundary may provide another layout.

#### Judges

Current judges and available admin-created judge pool. Search pool; select multiple; optional notify; pick/enroll; remove; change judge roles and manage round/category assignments. Enrollment and notification are separate outcomes; roster lock follows event status/official rules. Errors/loading are explicitly surfaced.

#### Review & publish

Summary counts contestants/judges/criteria; readiness checklist covers at least one of each, complete criteria, confirmed scoring rules/reviewer setup, and acknowledgement. Publish freezes official setup and sends the event to schedule; it does not start the live session. Scheduled event can be unpublished only while rules are not frozen. Explain irreversible/frozen effects before the primary action.

#### Live control

Session states idle/active/paused/completed with start, pause, resume, complete controls. Event/session/foundation/progress are refreshed via competition sync. Controls include round, active contestant, stage/arrangement preview/publish, opening eligible contestants, progress matrix, round finalization preview/checklist and advancement. Every long-running action has busy feedback; failures toast/alert. Do not collapse this into a generic event-settings screen.

#### Tabulation, rankings, analytics, report

- Tabulation subroutes switch overview, judge submissions, score matrix, deductions/adjustments, results/rankings, and audit trail through a shared workspace.
- Rankings displays live preview or official standings; filters by contestant search, division and round; judge completion context; refresh; report link.
- Analytics contains totals, submitted/pending score progress, overall/category rankings, judge activity, and round results. Empty state suggests adding contestants/judges/criteria.
- Report includes judge turnout, ranking/category/round performance, refresh, CSV/Excel/PDF/JSON export. Excel may use a workbook export API and fall back to generated sheets when server response indicates conflict.

### Polling page specifications

#### Dashboard and event list

Dashboard cards show total polls, active polls, responses submitted, plus a per-poll respondents/responded/participation table. Event list shows status cards and a read-only preview modal with question ordering, required marker, type, image/options, open-response marker and empty-question state.

#### Question builder

Question types are loaded from the backend registry, not a fixed UI list. Questions are reorderable via pointer/keyboard drag-drop; create/edit/duplicate/delete; required toggle; image upload; options and option images for option-based types; type-specific config fields (numeric min/max/step, text length/multiline, ranking ties/min items) based on answer-format kind. Use saved/locked/empty/error states and preserve question-specific requirements.

#### Respondents and review

Respondents share cohort invitation and active roster-lock behavior with elections. Review shows poll title, question count and respondent count; at least one question is required to publish, but respondent enrollment is not required. Publish is scheduled; scheduled events can be unpublished back to draft. Anonymous/multiple-submission settings appear on the settings step.

#### Analytics/report

Analytics displays anonymous/identified mode, total response metrics, participation by program and year/section, daily activity, question statistics, most-selected options, rating distributions, open-text responses and question distributions where present. Report displays response summary, question data/charts, refresh and CSV/Excel/PDF/JSON export.

### Participant pages

#### Dashboard

Participant home groups cards under Active events, Assigned events, and Completed events; summary counts and participant-type badges distinguish voter/judge/respondent responsibilities. Election results appear only when data is available and permitted. Empty state says to check back after invitation; failure has retry.

#### Election ballot

Event banner, ballot section progress, election position sections, candidate vote controls, local per-event/section draft, review phase, then submit. Position selection count obeys min/max and allow-skip rules; ballot requires at least one selection. Multi-section ballots submit one section at a time, fetch next section, and handle already-submitted/not-next 409 by refreshing state. Final success shows recorded/locked state and permitted results. Before open and no-eligible-position states have explanatory back links.

#### Poll response

Fullscreen poll header and anonymous/identified notice; registry-derived question widgets; answered count/progress; local draft autosave/restoration message; answer validation before submit. Success offers another response only when multiple submissions are enabled and the poll remains open. Closed/expired and already-responded states have dedicated explanations. Event banner, questions, and submit action become disabled for archived/submitting state.

#### Judge scoring and reviewer

The same `/score` route renders a context-sensitive workspace (legacy or native): judge scoring sheet for an assigned judge, or reviewer/verification view when reviewer context applies. It supports assigned competition/round context, optional division choice, score drafts, save/retry queue, live updates, round submission and published results where authorized. Exact visible fields are determined by configured criteria/rules; design with dynamic score controls rather than hard-coded criteria.

#### Public competition results

Standalone page, no authenticated shell. Shows public approved result context: event/competition/round name; publication version/date; official method/tie policy; ranked entry/score or placement; organizer aggregate deductions when enabled. Polls every 15 seconds and refreshes on visibility/focus/online; withdrawn/unavailable snapshot shows a status message. Keep the result table readable on narrow screens.

### Empty/loading/error/disabled patterns

Source includes delayed skeletons, spinners, empty-data copy, inline `FormAlert`, toast, disabled/busy button states, retry actions, confirmation dialogs, draft recovery, read-only banners and modal preview/detail states. Coverage differs by page: several loaders are `null` for the first 300ms; some page/service failures are only logged or swallowed. A redesign should provide a consistent, accessible error/retry contract without inventing new business behavior.

---

<a id="end-to-end-workflows"></a>

## VOTRIX — End-to-End Workflow Documentation

### 1. Sign in and role landing

1. Guest opens `/` or `/login`.
2. Enters email, password, optionally Remember me; frontend validates email and non-empty password.
3. Sign-in calls auth service; shared API uses cookie credentials and bootstraps CSRF for mutations.
4. On success, guest routes redirect by role: admin, organizer, or participant dashboard. A forced password-change flag sends the user to `/change-password`.
5. Protected routes show a loading spinner during auth bootstrap, return guests to login with the requested location, and redirect a role mismatch to its own home.
6. Backend route middleware remains authoritative. Admin routes require admin; organizer router requires organizer and active account; participant router requires participant, active account, changed password, and module event participation where applicable.
7. Logout calls API, clears local session even if API logout fails, and returns to `/`.

### 2. Password recovery and first-login change

#### Recovery

1. Login user chooses **Forgot password?**.
2. Enters email on `/forgot-password`; submit calls recovery endpoint.
3. UI displays backend message or request error; copy intentionally says reset link is sent if an account exists.
4. User follows link containing token to `/reset-password?token=…`.
5. Sets new password and confirmation (minimum eight characters, matching); missing token disables form.
6. Success routes to login with “Password reset” message.

#### Forced password update

1. Authenticated user with `mustChangePassword` is redirected to `/change-password`.
2. Enter current password, new password, confirmation; admin must change password.
3. Organizer and participant roles can alternatively continue with temporary password.
4. On success, session is refreshed. Organizer/admin route to role home; participant honors a safe intended destination or asks the participant redirect API.

### 3. Admin manages organizers and participant accounts

1. Admin opens dashboard or **User Management**.
2. Chooses Organizer or Participant; participant tab has Election Voter, Competition Judge, Polling Respondent subtype.
3. Manual create opens a typed form. Organizer profile includes email, organizer/organization name, position, organization type and scope; scoped organizers select programs/sections. Participant forms include email, school ID, first/last name, program and year/section. Judge forms include identity, optional expertise/title/affiliation and optional organizer assignment.
4. Required identity/taxonomy fields are validated in browser and backend; taxonomy must be defined in system settings for participant entries.
5. Admin may instead download CSV template, preview a CSV/XLSX import, inspect valid/error rows, then confirm registration. Results show success/failure summary; export downloads CSV.
6. Success toasts and lists refresh. Account status can be suspended/reinstated/restored through a confirmation surface. Pool membership can be removed separately from the shared participant user account.
7. Organizer row opens `/admin/organizers/:id` for activity detail; event row’s activity action opens audit log pre-filtered by entity ID.

### 4. Organizer updates profile and brand

1. Organizer opens account chip → Organizer Profile.
2. Profile view loads organization name/type, organizer name and position; Edit opens fields validated through profile schema.
3. Save calls organizer-profile update, refreshes the user/profile, and displays toast; cancel returns to read view.
4. Organization logo upload is separately available from organizer dashboard.
5. Profile overlay and logo upload do not create new routes.

### 5. Create and publish an election or poll

1. Organizer starts from module dashboard/list and selects **Create event/poll**.
2. Details step collects title, optional description, required start/end date-time. Election also selects results visibility (real-time, hidden, public). Poll also offers optional banner and settings for anonymous responses and multiple submissions.
3. Date validation requires parseable start/end and end on/after start. All three forms now use `CalendarCard` with start/end date bounds; exact time ordering is enforced by schema validation.
4. Organizer uploads optional banner in Branding. Forms use draft/autosave and unsaved-change protection. Leave dialog offers save & leave, leave without saving, or cancel.
5. Election organizer configures ballot sections/groups, positions and candidates. Position details include vote maximum/winner count/program eligibility; candidate profile includes name and optional biography/platform/party/photo.
6. Poll organizer adds questions using registry-driven types, required flag, options/config/images, and reorder controls.
7. Review shows setup summary and readiness. Election requires at least one position and candidate; voters need not be invited before publishing. Poll requires at least one question; respondents need not be invited before publishing.
8. **Publish** changes draft to scheduled and hands event to its schedule. It does not open voting immediately. Setup becomes locked. While scheduled, organizer may unpublish to return to draft; active/terminal states do not offer this.
9. Organizer enrolls voters/respondents using cohort invitations, before active status. Select Program or Year & Section, optionally request email, invite and inspect enrollment/email counts. Existing cohort members are skipped; removing roster members is separate.
10. At active state participant roster is locked under the default participant-lock feature setting; setup is locked after publication. Backend enforces event lifecycle rules.

### 6. Election participation

1. Admin has created a participant account and organizer enrolled the user by cohort. Participant sees the assigned event card in `/participant`.
2. Participant opens the election event. If not open, not eligible, archived, or already voted, the route displays the corresponding state.
3. For an open election, participant selects candidate(s) by position; selection count cannot exceed max. Required positions must have selection unless skip is allowed; ballot must have at least one selection.
4. Partial selection is saved locally by event and ballot section. A progress bar reports section and position completion.
5. Participant selects review, verifies the ballot and submits. Backend receives selected candidates, ballot-section ID, and voting nonce.
6. For multi-section elections the next ballot section loads after submit; a conflict/already-submitted response reconciles by fetching ballot state. Final submission clears that section draft and shows confirmation/eligible results.

### 7. Poll participation

1. Admin creates participant account; organizer enrolls respondent via cohort; active/open poll appears in Active events.
2. Respondent opens poll. Closed/expired and already-responded states block entry unless multiple submissions are enabled.
3. Participant fills dynamic question controls. Answers are locally saved and progress counts answered questions.
4. Client validates required/format constraints via poll validation and submits answers with start time.
5. Success removes local draft and shows confirmation. If multiple submissions remain allowed and poll is open, participant may start another response; otherwise return to dashboard.

### 8. Competition setup, judging, and official results

1. Organizer creates a competition event and configures event details/banner/type.
2. Select competition/category/divisions; if type is changed after child setup exists, a confirmation warns about removed draft configuration and assignments.
3. Configure rounds, contestants/entries, divisions, round participation, criteria/minor criteria, scoring scale/method/rules, deductions, and reviewer requirements. Configure judge account pool from admin if needed.
4. Organizer picks available judges, optionally requests invitation email, then assigns judges to relevant competition/round scope. Notification delivery is reported separately from enrollment.
5. Review requires contestants, judges, criteria, criteria completeness, scoring rules readiness, and acknowledgement/confirmation. Publish hands event to schedule and freezes official setup/rules.
6. When ready to score, organizer opens Live Control and starts session. Sessions can be active, paused, resumed and completed. Organizer can set round/division/contestant/stage arrangement, control contestant access, review judge progress, preview round advancement/finalization and confirm the resulting action.
7. Judges open assigned event/context from participant dashboard, score using configured criteria, save drafts and submit. Offline/retry queue and live sync are implemented.
8. Organizer reviews tabulation (submissions, matrix, deductions, results, audit trail), verifies/republishes official calculations where available, and exports report/workbook.
9. Public results are shown at the standalone public result route only when published. Page polls for publication updates and reports withdrawn/unavailable snapshots.

### 9. Search, filtering, notifications, reporting

- Global search opens via header control or Ctrl/Cmd+K. Role-scoped static routes are searched locally; admin also gets delayed server search for organizers/events once query is at least two characters. Selecting a scoped route uses current event ID if present or falls back to module list.
- Admin global events filters locally by title/organization, type and status; admin audit/email logs query backend with filters and pagination. Organizer event pages and participant tables include module-specific search/facets where implemented.
- Notification bell shows unread count; modal lists at most 50 fetched notifications, supports text search/all/unread/read, opens action URL, mark one/all read and updates the count.
- Reports hub lists reportable events. Module reports have refresh and CSV/Excel/PDF/JSON exports; global events and account management have CSV export. Some report values are live preview until official tabulation is published.

### 10. Status and locking reference

Event status values in frontend constants: `draft`, `scheduled`, `active`, `completed`, `cancelled`, `archived`. Setup is editable only in draft. Participants are editable through scheduled and, by default, locked at active; a frontend feature flag may disable that lock in test builds. Unpublish is available only in scheduled status. Completed, cancelled, and archived events are read-only in organizer UI. Competition scoring session has separate `idle`, `active`, `paused`, `completed` states.

### 11. Unverified behaviors

No live data/browser session was available, so exact result ordering, generated reports for real data, emails actually delivered, device-specific native date-picker behavior, deployment feature-flag values, and backend error copy were not observed. These should be validated in a staging environment before finalizing Figma prototypes.

---

<a id="sitemap-and-navigation"></a>

## VOTRIX — Sitemap and Navigation Structure

### Global route tree

```text
/
├── /login                                  guest login alias
├── /forgot-password
├── /reset-password?token=…
├── /change-password                        authenticated/forced password change
├── /admin                                  Admin shell
│   ├── /                                  dashboard
│   ├── /users                             Organizer + participant pool tabs
│   ├── /organizers                        legacy redirect → /users
│   ├── /organizers/:id                    organizer activity detail
│   ├── /events                            global events
│   ├── /settings                          settings + taxonomy
│   ├── /audit-logs
│   ├── /email-delivery
│   ├── /health
│   ├── /alerts
│   └── /archival
├── /organizer                             Organizer shell/dashboard
│   ├── /election                          Election module
│   │   ├── /events
│   │   ├── /events/new
│   │   └── /events/:eventId
│   │       ├── /edit | /branding
│   │       ├── /positions | /candidates | /voters
│   │       ├── /review | /analytics | /report
│   ├── /competition                       Competition Scoring module
│   │   ├── /events
│   │   ├── /events/new
│   │   └── /events/:eventId
│   │       ├── /edit | /branding | /type | /categories
│   │       ├── /workspace | /contestants | /judges
│   │       ├── /review | /live
│   │       ├── /tabulation[/:section]
│   │       ├── /rankings | /analytics | /report
│   ├── /polling                           Polling module
│   │   ├── /events
│   │   ├── /events/new
│   │   └── /events/:eventId
│   │       ├── /edit | /branding | /settings
│   │       ├── /builder | /respondents | /review
│   │       └── /analytics | /report
│   └── /reports                           overview + legacy report redirects
├── /participant                           Participant shell (no sidebar)
│   ├── /events/:eventId                   election ballot
│   ├── /polling/events/:eventId           poll response
│   └── /competition/events/:eventId/score judge scoring/reviewer
├── /competition/events/:eventId/competitions/:competitionId/results
│                                           public published results
├── /voter/*                                legacy redirect → /participant/*
└── *                                       404
```

### Sidebar structure

#### Admin

- Overview
- **Manage:** User Management, Global Events
- **System:** System Settings, Archival Policy
- **Monitoring:** System Health, Alerts, Audit Logs, Email Delivery

`/admin/organizers/:id` is reached from organizer rows, global-event actions or admin search; it is not a dedicated sidebar item.

#### Organizer home

- Overview
- Module cards/links to Election, Competition Scoring, Polling, Reports (module cards are on dashboard, not all in the base sidebar)
- Account chip opens organizer profile; notification bell; global search.

#### Election module

- Dashboard
- Events
- **Setup:** Positions, Candidates, Voters, Review & Publish
- **Results:** Analytics, Report

Event-scoped links are disabled until an event ID is selected. In practice event cards and stage navigation supply that event context.

#### Competition Scoring module

- Competition Scoring Dashboard
- Competition Scoring Events
- **Setup:** Competition Type, Competitions/Categories, Rounds & Scoring, Contestants & Entries, Judges, Review & Create
- **Run:** Live Control
- **Results & Reporting:** Tabulation (Overview, Judge Submissions, Tabulation Matrix, Deductions & Adjustments, Results & Rankings, Audit Trail), Results & Analysis, Analytics, Report

#### Polling module

- Dashboard
- Polls
- **Setup:** Builder, Settings, Respondents, Review & Publish
- **Results:** Analytics, Report

#### Participant

No permanent sidebar. The dashboard event cards link to their action route; event headers and completion states link back to `/participant`. Participant account menu provides identity information and sign-out.

### Navigation behavior and aliases

- Guest `/` and `/login` share the login component. Authenticated visitors are redirected to their role dashboard.
- Legacy `/voter/*` preserves trailing route/query/hash while rewriting to `/participant/*`.
- Legacy `/organizer/reports/{election|competition|polling}/:eventId` redirects to the canonical module `/:eventId/report` route, where the module shell is retained.
- Competition tabulation supports both base route (default overview) and a selected section route.
- `GlobalSearch` searches route index by current role. Admin-only live results may navigate to organizer detail or Global Events; scoped results use current event ID if available.
- Notifications may deep-link through each notification’s `action_url`.
- Setup stage footer provides previous/next stage; EventStepper marks current/completed/available stages and allows navigation to completed stages.

### Access boundaries

- Admin route group is guarded for admin role. Backend admin APIs independently authorize admin and require password-change completion.
- Organizer routes are guarded for organizer role. Backend organizer router enforces organizer and active-account middleware.
- Participant pages are guarded for participant/legacy participant UI role. Backend participant router requires `participant`, active account, changed password; module APIs additionally check event enrollment/type.
- Public competition results have no frontend protected wrapper. Public access is intentional according to page purpose; snapshot availability remains backend-controlled.
- Wrong-role navigation returns to that role’s dashboard rather than rendering the requested page.

### Navigation observations

- No global breadcrumb hierarchy was found in the app shell; workflows rely on module label, sidebar, setup stepper/footer, and back-to-dashboard links.
- Setup sidebar entries without event context are intentionally disabled, but the reason (“Select an event first”) is only conveyed by title/hover in some variants. Keep this explanation visible and keyboard-accessible in a redesign.
- Organizer detail is a deep link rather than a sidebar destination.
- User management tabs and participant types are query-string state, so visual prototypes should preserve shareable URLs and back/forward state.

---

<a id="ui-ux-audit"></a>

## VOTRIX — UI/UX Audit

### Basis

Findings below are derived from inspected source and styles, not a live browser usability session. They distinguish existing UI facts from redesign recommendations. Priorities indicate expected user impact, not security severity.

### Prioritized findings

| Priority | Page/component | Observed issue | Why it matters | Specific recommendation |
|---|---|---|---|---|
| **Addressed** | Election, competition and polling date fields | All three event forms now use the shared custom `CalendarCard`, required and error states, start/end min/max date constraints, and the existing local/ISO conversion helpers. Cross-field validation remains authoritative, including same-day time ordering. | Consistent picker behavior and validation feedback across the three event modules. | Verify the date controls visually and interactively at desktop, tablet, and mobile sizes; confirm timezone expectations with product if display context is needed. |
| **Addressed** | Polling setup expiration | Polling settings now expose optional `pollExpiresAt` with start/end picker constraints and schema validation. The existing `events.poll_expires_at` column, mapper, schedule checks, and schedule synchronization are connected to backend create/update validation and persistence. | Organizers can configure the already-supported poll expiry without inventing a new storage or schedule mechanism. | Verify create/edit, clear-expiration, and participant poll-closing behavior against a running backend and database migration 006. |
| **High** | Competition setup/live control/tabulation | Several pages are native/legacy boundary wrappers; rendering is controlled by deployment flags not available in this source audit. | A designer could generate the wrong workflow or omit a mode used in production. | Confirm which flags are enabled in the target environment. Choose the active design as primary; keep any live legacy route as a compatibility variant until retired. |
| **Medium** | Navigation across modules | There is no global breadcrumb; event-scoped sidebar items can be disabled without a persistent inline explanation. Long module menus contain multiple nested levels. | Users may lose context and find it unclear why controls cannot be opened before selecting an event. | Add a compact breadcrumb/event context row; show disabled-link explanation on focus as well as hover; keep group names and current event visible on deep screens. |
| **Medium** | Admin and organizer lists | Some tables have horizontal overflow, client-side filters over a loaded list, dense action columns, and different pagination behavior (for example Global Events has no page controls while audit/email do). | Large datasets become difficult to scan; responsive layouts can hide columns or force horizontal scrolling. | Define table variants: essential columns first, compact row action menu, mobile card/list fallback, clear result counts, consistent server-side pagination/filter persistence where available. Do not promise server filtering on pages that currently filter locally. |
| **Medium** | Loading/error feedback | Patterns vary: some pages use delayed skeleton, some spinner, some return `null` briefly; selected data failures are logged or swallowed and some reports return no content instead of an actionable error. | Users may see blank states or lack a retry path when a request fails. | Standardize skeleton/empty/error/retry components and polite live-region announcements; preserve which APIs are optional/non-fatal, but make failure status visible where it blocks a task. |
| **Medium** | Theme claims | README mentions dark/light theme, but the inspected base stylesheet sets light color-scheme and the frontend search found no dark mode selector/toggle. | Designing a dark system mode without deployed implementation may create unsupported screens; current docs mislead expectations. | Treat light as the verified current theme. If dark mode is a future goal, specify tokens and contrast pairs as a separately labeled proposed enhancement. |
| **Medium** | Confirmations and destructive actions | Some flows use accessible shared modals, but other flows use native `window.confirm`/`window.prompt` for restore, rename/delete, and competition type changes. | Browser-native dialogs are inconsistent and difficult to style; impact/undo details differ between modules. | Replace with shared, focus-managed confirmation and edit dialogs; include object name, consequences, cancel, and clear primary/destructive actions. This is a visual interaction recommendation; preserve confirmation semantics. |
| **Medium** | Dense competition workflows | Rounds, criteria, contestants, judging, live control, tabulation, and reviewer flows expose many domain concepts; some panels are complex, data-heavy, and use separate custom CSS. | A generic dashboard redesign could obscure status, event context, or official vs preview data. | Use event-context header, setup/run/results navigation groups, clear readiness checklist, and persistent distinction between draft/live preview/official results. Design table/matrix horizontal scrolling deliberately. |
| **Low** | Global search | Ctrl/Cmd+K and a modal search exist; static route results are role-filtered, while admin live results begin at 2 chars and are debounced. | Keyboard discoverability and distinction between routes and records may be weak without visual affordance. | Show shortcut in search trigger, group “Pages” vs “Records,” explain event-scoped destinations, and provide loading/no-result/error states. |
| **Low** | Vote/poll completion | Fullscreen forms make good use of progress and fixed actions; local drafts restore silently/message briefly. | Voters should understand what is saved locally vs submitted/locked, especially on mobile or interrupted connection. | Keep progress and one primary action visible; explicitly communicate draft restore, successful submission, and locked finality. Respect safe-area insets and reduced-motion preferences. |
| **Low** | Admin User Management | Organizer and participant management share a route but participant subtype tabs and query-state mappings are not obvious from route name. | Users may not realize voter/judge/respondent accounts are one participant role with multiple memberships. | Use a clear account-vs-participant-type hierarchy and persistent filters; distinguish shared user account from module pool membership. |

### Accessibility notes

**Positive implementation evidence:** semantic labels/fieldset in key forms; `aria-current`, `aria-expanded`, `aria-selected`, and progressbar labels in shared components; keyboard tab navigation in competition workspace; reduced-motion CSS; modal role/aria-modal and Escape handling in some pages; `prefers-reduced-motion` support.

**Needs verification/improvement:** not every modal is confirmed to trap/restore focus; some close controls and table interactions need keyboard walkthrough; hover tooltips should have focus equivalents; custom switches need visible focus and descriptive labels; native browser confirmations are not controllable by the app; dynamic error/notification announcements are not uniform. Do not infer WCAG conformance from source alone—contrast and keyboard behavior need rendered testing.

### Strengths to retain

- Shared, token-based color and component vocabulary with responsive layouts.
- Reusable dashboard cards, table wrappers, badges, alerts, loading skeletons, module analytics/report components.
- Explicit event lifecycle readiness and read-only states.
- Draft/autosave and unsaved-changes safeguards on event forms.
- Event-specific enrollment rather than mixed account creation at organizer layer.
- Role-aware route handling, participant event grouping, dynamic poll question registry, and real-time updates.
- Focused fullscreen participant interaction with progress and fixed submit action.

### Recommended validation before redesign sign-off

1. Confirm deployed native competition flags and whether fallback pages remain user-facing.
2. Confirm whether the product requires poll expiration; current frontend/API form contract inspected here does not show it.
3. Confirm date widget choice and timezone wording, then align the implementation contract before designing detailed picker interactions.
4. Render role accounts and empty/loading/error fixtures at mobile, tablet and desktop widths.
5. Keyboard-test login, tabs, search dialog, dropdowns, tables, confirmation overlays, ballot review, and judge scoring.

---

<a id="figma-design-specification"></a>

## VOTRIX — Figma Design Specification

This section proposes a coherent redesign system. Proposed tokens are not claims about the deployed runtime beyond where they intentionally reuse the verified brand palette.

### Proposed design direction

Use a professional civic/education operations interface: trustworthy indigo actions, neutral high-contrast surfaces, restrained module accents, data-dense but calm admin tables, and a focused distraction-free participant experience. Avoid changing business semantics or implying that unimplemented controls exist.

### Proposed token set

| Token | Proposed value | Use |
|---|---|---|
| `brand/primary` | `#4F46E5` | Primary actions, links, current step |
| `brand/primary-hover` | `#4338CA` | Hover/pressed |
| `brand/secondary` | `#7C3AED` | Brand gradient accent, sparingly |
| `module/election` | `#4F46E5` | Election icon/eyebrow only; do not rely on color alone |
| `module/competition` | `#0F766E` | Competition accents |
| `module/polling` | `#C2410C` | Polling accents |
| `surface/page` | `#F3F4F6` | App background |
| `surface/card` | `#FFFFFF` | Cards, dialogs, forms |
| `surface/subtle` | `#F9FAFB` | Table header, secondary panel |
| `text/primary` | `#111827` | Heading/body text |
| `text/secondary` | `#374151` | Secondary text |
| `text/muted` | `#6B7280` | Captions/help |
| `border/default` | `#E5E7EB` | Separators |
| `border/strong` | `#D1D5DB` | Inputs/interactive borders |
| `status/success` | `#047857` | Success status |
| `status/success-bg` | `#ECFDF5` | Success surface |
| `status/warning` | `#B45309` | Warning |
| `status/warning-bg` | `#FFFBEB` | Warning surface |
| `status/danger` | `#B91C1C` | Destructive/error |
| `status/danger-bg` | `#FEF2F2` | Error surface |
| `navigation/sidebar` | `#111827` | Sidebar |

#### Typography and spacing

- Display/page headings: Plus Jakarta Sans or system fallback, 24px/700; section heading 20px/700; card heading 16px/600.
- Body: Inter or system fallback, 14–16px/400; labels 14px/500; helper/caption 12px/400; compact table metadata 12px.
- Numeric counts/scores: tabular numerals; optional JetBrains Mono for IDs and audit values only.
- Spacing base 4px; scale 4/8/12/16/24/32/48/64. Content sections 24–32px apart; controls 8–12px apart.
- Radii: 8px controls, 12px cards, 16px dialog/featured surfaces, pill status badges. Use subtle 1px borders; reserve shadows for floating surfaces/dialogs.

#### Layout and responsive rules

- Desktop admin/organizer: fixed-width sidebar 256px, optional 72px rail; sticky header 64–72px; content max width based on data density. Keep analytics and matrix views wide.
- Tablet: sidebar drawer; content grid two columns where cards fit; table controls wrap.
- Mobile: one-column cards/forms; compact top header; navigation drawer; convert wide event/participant tables to prioritized cards or accessible horizontal scroll with pinned identifying column.
- Proposed breakpoints: 640px small-to-medium, 768px tablet, 1024px desktop-shell transition, 1280px expanded desktop. Existing source uses Tailwind breakpoints and a 1280px sidebar auto-collapse threshold; align final breakpoint mechanics with implementation.
- Participant voting and survey: full-viewport shell, safe-area-aware fixed actions, max reading width around 640px, no competing sidebar.
- Use WCAG 2.2 AA contrast targets, visible 2px focus ring, touch targets ≥44×44px, error text adjacent to fields, and icon-plus-label status communication.

### Shared Figma component library

1. **Application shell:** role-aware sidebar, collapsible rail, active/disabled nav items, grouped nav, nested tabulation menu, mobile drawer, sticky header, account chip/menu, module label, search trigger.
2. **Navigation context:** breadcrumb, event context header, module stage stepper, next/back stage footer, scoped-link disabled state.
3. **Buttons:** primary, secondary, tertiary/ghost, destructive, icon-only with accessible label; sizes; loading/disabled/focus states.
4. **Forms:** text/email/password/number/textarea/date-time/select, checkbox, radio cards, switch, searchable multi-select/chip list, file/image upload, inline helper/error, fieldset.
5. **Data display:** stat card, event card, organization card, status badge, readiness checklist, table with responsive variants, search/filter bar, pagination, empty state, skeleton.
6. **Overlays:** modal/dialog, drawer, confirmation, detail viewer, toast/alert, preview sheet. Include focus, escape, loading, error, confirmation and disabled variants.
7. **Charts/reports:** chart card, timeline/distribution chart, ranking list, participation table, report document header, export bar, print layout.
8. **Participant:** event hero/banner, role badge, event status, fullscreen progress indicator, election position/candidate card, poll question card and dynamic answer controls, judge score row, submit footer, success/closed/locked screen.
9. **Competition operations:** round/criteria editor, contestant entry and assignment list, judge roster/assignment panel, live-session state controls, tabulation matrix, calculation breakdown, published result table.
10. **Admin operations:** account pool table, user/profile modal, CSV preview/results, service health card, audit detail, email delivery status row, alert switch row, archival policy panel.

### Page-by-page redesign briefs

#### Shared

- **Auth screens:** keep single focused card; consistent field sizing, password visibility, busy/error states, accessible recovery path. Use concise role-neutral copy because login is shared.
- **Admin shell:** emphasize system-wide scope and safe management actions; keep monitoring visible as a separate group.
- **Organizer shell:** preserve module grouping (Setup / Run / Results); show selected event name/status consistently above event-scoped setup.
- **Participant shell:** prioritize event/task, identity/privacy messaging, progress, and one primary action. Explicitly distinguish autosaved draft from submitted response.

#### Admin

- **Dashboard:** five primary platform metrics; recent activity and trends; rapid create entry points. Avoid overcrowding with redundant charts.
- **User management:** account-level tabs and participant-type subnavigation; search/status filters; clear create/import/export group; row actions in overflow menu; account status confirmation.
- **Organizer detail:** identity/context header, activity filters, paginated timeline/table, structured detail drawer/modal.
- **Global events:** summary metrics, compact persistent filters, table with action menu; date range and status clear; restore confirmation for archived items.
- **Settings:** editable setting rows/cards grouped by system function; taxonomy distinct from generic settings; clear save state and validation.
- **Health/alerts/archival:** status dashboard cards, labeled switches/thresholds, last-checked/last-run timestamps, confirmations and clear automation effects.
- **Audit/email logs:** server-filter panel with date range, applied-filter chips, results count, table and details drawer; preserve paging/sorting/export.

#### Organizer: common and election

- **Organizer home:** organization identity card, primary module launcher, live session attention area, recent events and high-value summary. Keep charts below immediate actions.
- **Reports overview:** three clearly labeled module groups and report-specific summaries; link directly to canonical report.
- **Election dashboard/list:** turnout metrics/table; event list with clear status, preview, manage, continue setup actions.
- **Election form:** one stepper, 2-column dates on wide screens/stacked on mobile; results visibility as explanatory radio cards; banner upload preview; draft/saving state.
- **Positions/candidates:** keep section context persistent; create/edit workspace paired with list; eligibility as explicit “all vs selected programs”; candidate card photo/party/bio/platform, filter by position.
- **Voters:** cohort selector, live estimate, notify option, invite action, enrolled list; visibly locked state after event opens.
- **Election review/analytics/report:** readiness checklist and distinct draft/scheduled/active states; charts/participation data; report export actions with print-friendly layout.

#### Organizer: competition scoring

- **Dashboard/events:** event and score completion overview; card/table linking to setup/run/results.
- **Type/categories:** hierarchy of event → competitions/categories → divisions; confirm destructive type changes with consequences.
- **Structure & scoring:** nested editor workspace with round context, criteria completeness, score method and save/recovery status; accessible tabs and responsive sticky footer.
- **Contestants/judges:** distinguish master entry pool from round assignments; show division and assignment state; expose judge scope and notification outcome.
- **Review/publish:** checklist and explicit freeze/schedule effect; do not imply session starts at publish.
- **Live control:** operational console with prominent session state, next action and judge progress; separate irreversible round finalization from routine controls.
- **Tabulation/results:** label preview vs official; show source/version/tie method; matrix and audit as dedicated views; preserve broad table width.
- **Analytics/report:** summary then round/category/judge details, with export and source status.

#### Organizer: polling

- **Dashboard/events:** participation and response count; preview the exact respondent question flow.
- **Form/settings:** details/date, optional banner, anonymous/multiple-response switches, and optional poll expiration constrained to the event schedule.
- **Builder:** one question card per item, reorder handle, type-specific configuration, required/image/options; clear distinction between delete and duplicate.
- **Respondents/review:** cohort invite estimate, roster, schedule readiness based on question count, clear locked state.
- **Analytics/report:** identify anonymous/identified reporting, present response rate and question-specific distributions; protect text response readability.

#### Participant and public

- **Dashboard:** event cards grouped by urgency (active/assigned/completed), role badges and due/open state; results visibility as separate content.
- **Election ballot:** full-screen stepper/progress, position cards and large candidate controls; review/submit confirmation, local-draft message and success state.
- **Poll response:** dynamic question blocks with clear question type and required status; preserve progress and fixed submit CTA.
- **Judge scoring:** configure dynamically from round/criteria/scale, visibly show autosave/queue/offline state, score-submit boundaries and reviewer alternatives.
- **Public results:** standalone brand header and publication status, event/competition/round context, responsive standings table, withdrawn/unavailable state.

### Required Figma variants

For every interactive component, design default, hover, keyboard focus, pressed, disabled, loading, validation error, empty, success, and permission/read-only variants where applicable. For complete pages, include desktop and mobile; add tablet where side navigation/table behavior changes. For workflows include state transitions and prototype links, especially publish/unpublish, invitation, ballot review/submit, judging session, and archival restore.

### Screen generation order

1. Tokens, typography, icon rules and shared component library.
2. Auth shell and app shell (admin, organizer, participant).
3. Participant dashboard and event card; organizer home; admin dashboard.
4. Election event list and setup flow; ballot section; results.
5. Poll event list, question builder and respondent answer flow.
6. Competition structure/scoring, contestants, judges, review and live control.
7. Tabulation, analytics, reports and public results.
8. Admin user/account management, event oversight, settings and monitoring.
9. Empty/loading/error/locked/confirmation states, mobile/tablet and print/export variants.

---

<a id="figma-ai-master-prompt"></a>

## VOTRIX — Figma AI Master Prompt

Copy and paste this prompt into Figma AI or another compatible UI design generator. It is self-contained and based on the verified frontend route/source inventory.

---

You are redesigning **VOTRIX**, a role-based online voting, competition-scoring, and polling platform for administrators, event organizers, and invited participants. Create a complete, consistent, responsive product UI system and linked screen prototypes. Preserve every workflow, field, action, role boundary, status, and data requirement described below. Do not invent backend capabilities or remove features.

### Product roles and access

- **Admin:** platform dashboard; organizer and participant account pools; global event oversight; system settings and participant taxonomy; health, alerts, archival, audit and email-delivery logs.
- **Organizer:** organization dashboard/profile; election, competition scoring and polling modules; cohort invitations; analytics and reports.
- **Participant:** one shared account may act as an election voter, competition judge, or polling respondent. Home page groups active, assigned and completed events.
- **Public viewer:** may see only approved published competition result snapshots at a standalone results screen.
- Authenticated pages require role authorization. A participant must also be enrolled in the event and module role. Organizer setup locks after publish; scheduled items can be unpublished only where allowed. Voting/scoring/polling opening is controlled by event schedule/session, not merely by the publish click.

### Visual direction and tokens

Design a professional civic/education operations product: calm, reliable, clear status language, data-first admin/organizer views, and focused participant tasks. Use a light neutral base and indigo primary:

- Primary `#4F46E5`, hover `#4338CA`, violet brand accent `#7C3AED`.
- Page `#F3F4F6`, card `#FFFFFF`, subtle surface `#F9FAFB`.
- Primary text `#111827`, secondary `#374151`, muted `#6B7280`.
- Border `#E5E7EB`, strong border `#D1D5DB`.
- Success `#047857` / `#ECFDF5`; warning `#B45309` / `#FFFBEB`; danger `#B91C1C` / `#FEF2F2`.
- Fonts: Inter/system for body, Plus Jakarta Sans/system for headings, tabular numerals for metrics. Use 4px spacing base, 8px control radius, 12px cards, 16px dialogs; subtle borders and shadows.
- Use icons consistently, never color alone for status. Provide visible keyboard focus, sufficient contrast, 44px touch targets, reduced-motion-safe transitions, labeled fields and accessible modal patterns.

Responsive design: desktop has 256px organizer/admin sidebar (collapsible to narrow rail), sticky top bar, responsive content grids and wide data workspaces. Tablet/mobile uses a navigation drawer. Forms stack to one column on small screens. Data tables use a mobile-prioritized card or accessible horizontal-scroll variant. Participant ballot and poll screens use a fullscreen layout with fixed progress at top, scrollable content, and a safe-area-aware fixed submit footer.

### Global shell and reusable components

Build shared variants for:

- Role-aware sidebar groups: Admin **Manage/System/Monitoring**; organizer modules; competition **Setup/Run/Results**; election and polling **Setup/Results**.
- Sticky header with page/module title, search trigger (Ctrl/Cmd+K), notifications/unread count, account chip/profile menu.
- Event context and breadcrumb, module stepper, stage previous/next footer, status/read-only banner.
- Buttons (primary/secondary/ghost/destructive/icon), text/email/password/number/date-time fields, textarea, select, checkbox, radio card, switch, searchable multi-select, upload field, validation/helper text.
- Stat cards, event cards, tables, status badges, search/filter bars, pagination, empty state, loading skeleton, alert/toast.
- Modal/dialog/drawer and confirmations; account/profile form; CSV preview/results; chart/report/export patterns.
- Participant event hero, progress indicator, election position/candidate cards, dynamic poll question cards, judge scoring rows, result/confirmation screens.
- Competition round/criteria editor, contestant/entry roster, judge assignments, live-session controls, tabulation matrix and calculation details.

Design each component with default, hover, focus, disabled, loading, error, success, empty and read-only variants when applicable. Include modal keyboard/focus behavior and mobile layout.

### Required screens and behavior

#### Authentication

1. **Login** at `/` and `/login`: centered logo card, email, password, optional Remember me, sign-in, forgot-password link, field validation and loading/error states.
2. **Forgot password**: email field, send-reset-link action, non-disclosing success copy, error state, back-to-login.
3. **Reset password**: token-based, new and confirm password, minimum eight characters, matching validation; missing token disables inputs and shows error; success returns to login.
4. **Change password**: current/new/confirm fields; admin must update; organizer and participant may continue using temporary password. Route user to role dashboard or safe participant destination.

#### Admin

- **Dashboard:** five stats (organizers, events, participant accounts, active events, votes cast), module shortcuts, recent activity and charts; add organizer/participant actions.
- **User Management:** Organizer and Participant tabs; participant subtypes Election Voter, Competition Judge, Polling Respondent. Search/status filters; account add/edit; CSV template, preview, import results and export; account status confirmation; pool membership. Participant identity fields: email, school ID, first/last name, program, year/section. Judge optional fields: expertise, title, affiliation, organizer assignment. Organizer fields: email, organizer name, position, organization name/type, scope type/programs/sections.
- **Organizer activity detail:** filtered activity log, pagination, structured action/entity/actor details and copy-JSON.
- **Global Events:** totals/status cards; search title/organization; type/status filters; CSV export; table with event type, organization, status, dates, activity, export, organizer and archived restore. Restore returns event as completed/read-only and requires confirmation.
- **System Settings:** platform name, maintenance mode, maximum organizer count, custom settings and a dedicated participant taxonomy editor. Validate values and show save status.
- **System Health:** overall and database/Cloudinary/Resend health with status, message, migration/schema warning and refresh.
- **Alerts:** switches for failed email, event completion, suspicious login activity; numeric thresholds where applicable; save and feedback.
- **Archival:** enable switch, retention days (1–3650; default 90), completed-only explainer, run-now action only when enabled, last-run feedback.
- **Audit Logs:** search, action/entity/date filters, page size/sort/pagination, CSV export, details dialog.
- **Email Delivery:** recipient/workflow/status/date filters, refresh, paginated delivery table with time/subject/status/provider detail.

#### Organizer home and shared flows

- **Organizer dashboard:** organization profile/logo, high-value metrics/charts, three module launchers, recent events, active competition sessions.
- **Organizer profile overlay:** organization name/type, organizer name and position; edit/save/cancel and logout.
- **Reports overview:** election turnout, competition judge completion/rankings, polling submissions; link to canonical event reports.
- Event forms have draft/autosave and unsaved-change protection. Required shared fields: title (max 200), start date/time, end date/time, parseable date; end must be on/after start. Description optional (max 2000). All three modules use the shared custom `CalendarCard` with constrained date selection and field-level validation.
- Election also has results visibility choices Real-time, Hidden, Public. Poll settings include Anonymous responses, Allow multiple submissions, and optional expiration date/time constrained inclusively to the event schedule.
- Publish transitions draft to scheduled; event opens by schedule. Setup is locked afterward. Unpublish is available while scheduled. Voters/respondents are enrolled by Program or Year & Section cohort, with optional email notification and separate enrollment/email outcome.

#### Election module

- **Dashboard:** events/voting/voter/vote stats, per-event turnout table, create event.
- **Events:** status cards, read-only ballot preview (groups, positions, vote limits, candidates), manage/continue setup, draft recovery.
- **Details/branding:** title, optional description, required start/end, results visibility; banner upload.
- **Positions:** ballot sections/groups create/reorder/rename/delete; position name/description/winner count/max votes/order/program eligibility.
- **Candidates:** section/position selectors; search/filter; name, biography, platform, party, photo; delete confirmation.
- **Voters:** cohort invite, selected count, optional notify, enrolled list/remove, eligibility summaries, active-state roster lock.
- **Review/publish:** counts/readiness; requires at least one position and candidate; voter invite is not required to publish.
- **Analytics/report:** live turnout, timeline, participation by program/year-section, candidate/position summaries, exportable report.
- **Participant ballot:** fullscreen section progress; candidates selectable within configured limits; required-position validation and skip rules; local draft; review then submit. Multi-section events submit a section and load the next. Show final locked confirmation and results only where permitted.

#### Competition Scoring module

- **Dashboard/events:** event, session, contestant, judge, score completion; event cards and read-only scoring preview.
- **Type/categories:** competition type, optional custom type (32 characters), categories/competitions, participation format and pageant divisions. Confirm destructive type changes.
- **Structure & Scoring:** accessible tabs for rounds, criteria, divisions, scoring rules; show readiness, save/recovery, selected round, score scale and calculation rules.
- **Contestants & Entries:** name, number, optional label/type, division, photo; available-round assignment; search/division/qualifier filters.
- **Judges:** search/select from admin-created pool, optional notification, role/round assignments, removal and lock states.
- **Review & Publish:** contestant/judge/criteria readiness, confirmed rules and acknowledgement; explain that publishing freezes official setup but does not start scoring.
- **Live Control:** idle/active/paused/completed session; start/pause/resume/complete; round/contestant/criteria/arrangement controls; judge progress; preview/finalize/advancement confirmation.
- **Tabulation:** sections Overview, Judge Submissions, Matrix, Deductions & Adjustments, Results & Rankings, Audit Trail.
- **Rankings/Analytics/Report:** distinguish live preview from official published tabulation; division/round/search filters; judge progress; category/round trends; CSV/Excel/PDF/JSON exports.
- **Judge scoring:** dynamic criteria/score scale and round context, autosave/retry/offline feedback, submit confirmation and reviewer/verification states.
- **Public results:** event/competition/round, publication version/date, method/tie policy, standings and allowed deduction totals; withdrawn/unavailable state. Standalone public page refreshes on interval.

Competition workspaces are feature-flagged in source. Confirm deployment mode before choosing legacy/native layout as the only production design.

#### Polling module

- **Dashboard/events:** total/active polls and submissions; participation table; cards and respondent-facing preview.
- **Details/branding/settings:** title, optional description, required start/end, optional banner, anonymous and multiple-submission switches.
- **Question builder:** available type registry from API; add/edit/duplicate/delete/reorder; required flag; type-specific options/config/images. Numeric: min/max/step; text: max length/multiline; ranking: ties/min items. Do not assume every question type shares the same answer controls.
- **Respondents:** Program or Year & Section cohort invitation, notification, roster, active lock.
- **Review/publish:** question/respondent summary; at least one question required, respondents need not be enrolled before publish.
- **Analytics/report:** response summary, participation by cohort, daily activity, question distribution/rating/text data, refresh/export.
- **Participant poll:** dynamic question widgets, required validation, answered progress, local draft restoration, fullscreen submit; closed/expired/already-responded and success states; another response only when policy allows and poll remains open.

#### Participant dashboard and public route

- Participant home groups active, assigned and completed cards; show role labels and only authorized election results.
- Keep event banner, organizer, date/status, task, role and one clear action visible.
- Candidate ballot and poll submission use fixed progress/actions and explicit saved-vs-submitted messaging.
- Judge screen is context-driven: assigned competition/round/criteria, judge draft and submit, optional reviewer verification.
- Public competition results require an approved published snapshot; never display preview calculations as official.

### Prototype and state requirements

Create linked prototypes for:

1. Login → forced password change → role dashboard.
2. Admin create/import account → confirmation/result → participant pool.
3. Organizer create event → setup → review/publish → cohort enrollment → active task → analytics/report.
4. Election participant select → review → submit → next section or completion.
5. Poll builder → respondent form → submit → completion/allowed resubmit.
6. Competition setup → judge assignment → publish → live session → round finalize → official tabulation/public result.
7. Search, filter, notifications, CSV preview, status restore, unpublish, error retry and logout.

Show loading, no-data, empty, validation error, service error/retry, disabled/read-only, save progress, success, confirmation, archived/closed and responsive variants. Make statuses and destructive consequences explicit. Preserve existing workflow order and data rules; mark any proposed extra affordance as optional, not implemented behavior.
