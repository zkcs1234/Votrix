# VOTRIX — Complete Page Inventory

## Inspection key

- **Source-confirmed:** route, component, and primary controls were verified in source.
- **Source / feature-flagged:** route is confirmed; native/legacy render variant depends on deployment flags.
- **Redirect / shell:** route is a redirect or shared layout, not a distinct content page.
- **Not browser-verified:** all inventory entries were not rendered in an authenticated live browser during this audit. This is not a claim that the route fails.

## Guest and authentication

| Route | Page/component | Role/access | Main content and actions | Status |
|---|---|---|---|---|
| `/` | Login — `LoginPage` | Guest; authenticated users redirect by role | Email, password, remember-me, sign-in, forgot-password link | Source-confirmed; not browser-verified |
| `/login` | Login alias — `LoginPage` | Same as `/` | Same login screen; backward-compatible alias | Redirect / shell |
| `/forgot-password` | Forgot password | Guest | Email and send-reset-link action; success/error alert | Source-confirmed; not browser-verified |
| `/reset-password?token=…` | Reset password | Guest with reset token | New and confirm password; invalid/missing token disables fields and reports error | Source-confirmed; not browser-verified |
| `/change-password` | Change password | Authenticated; permitted during forced password-change state | Current/new/confirm password; skip option for organizers and participants, not admins | Source-confirmed; not browser-verified |

## Admin

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

## Organizer home and reports

| Route | Page/component | Main content and actions | Status |
|---|---|---|---|
| `/organizer` | Organizer dashboard | Organization logo/profile, stats/charts, recent events, module links, active competition sessions | Source-confirmed; not browser-verified |
| `/organizer/reports` | Reports overview | Event lists for elections, competitions, and polls with turnout/submission summaries | Source-confirmed; not browser-verified |
| `/organizer/reports/election/:eventId` | Legacy report redirect | Redirects to `/organizer/election/events/:eventId/report` | Redirect / shell |
| `/organizer/reports/competition/:eventId` | Legacy report redirect | Redirects to `/organizer/competition/events/:eventId/report` | Redirect / shell |
| `/organizer/reports/polling/:eventId` | Legacy report redirect | Redirects to `/organizer/polling/events/:eventId/report` | Redirect / shell |

## Election

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

## Competition Scoring

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

## Polling

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

## Participant and public

| Route | Page/component | Role/access | Main content and actions | Status |
|---|---|---|---|---|
| `/participant` | Participant dashboard | Participant account | Role/event counts; active, assigned, completed event cards; eligible election results | Source-confirmed; not browser-verified |
| `/participant/events/:eventId` | Election ballot | Enrolled voter; event-specific backend check | Fullscreen ballot sections, candidate selection, progress, local draft, review and submit | Source-confirmed; not browser-verified |
| `/participant/polling/events/:eventId` | Poll response | Enrolled respondent; event-specific backend check | Fullscreen question form, progress, local draft, submit and confirmation | Source-confirmed; not browser-verified |
| `/participant/competition/events/:eventId/score` | Judge scoring/reviewer | Enrolled judge/reviewer; event-specific backend check | Context-dependent score sheet/reviewer view, local draft/retry, submissions and results | Source / feature-flagged; not browser-verified |
| `/competition/events/:eventId/competitions/:competitionId/results?roundId=…` | Published competition results | Public route; no frontend auth wrapper | Approved result snapshot, publication metadata, method/tie policy, standings | Source-confirmed; not browser-verified |
| `/voter/*` | Legacy route redirect | Existing legacy URLs | Rewrites `/voter` to `/participant`, preserving remaining URL/query/hash | Redirect / shell |
| `*` | Not found | Any unmatched URL | 404 message and link to home | Source-confirmed; not browser-verified |
