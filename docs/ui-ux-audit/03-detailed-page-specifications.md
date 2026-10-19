# VOTRIX — Detailed Frontend Page Specifications

These are source-based descriptions for redesign. Screens were not rendered in a live browser; responsive behavior below reflects CSS/JS breakpoints and layout classes. Preserve the described business fields and actions when redesigning.

## Shared shell and component language

### Auth shell

Centered full-height light background; a max-width card contains the VOTRIX logo/tagline in a top band and the route form. Auth pages use compact icon/title, helper text, stacked fields, inline alerts, and a full-width primary submit. Motion is a short fade/vertical entrance. Keep guest screens simple and focused.

### Admin and organizer shell

`AppShell` places a dark navy sidebar beside a light content area. The sidebar has a VOTRIX logo, icon/text links grouped by section, active state, optional scoped event links, and an organizer-home footer. Desktop supports saved collapse state; narrower desktop auto-collapses, and tablet/mobile uses a drawer. A sticky white header contains page/module title, global search where enabled, notification bell/count, and account chip. Main content uses responsive padding; the fixed stage footer is used by guided setup pages.

No consistent global breadcrumb is present in the inspected shell. Page title and module label in the header are the primary location cues.

### Participant shell

The dashboard and participant pages omit the sidebar. Election ballot and poll response use a full-viewport form with a fixed progress strip, scrollable event/form content, and bottom submit action. The event header provides banner/fallback gradient, back-to-dashboard link, event name/description, organization identity, and archived-state notice.

### Existing visual tokens (verified in CSS)

- Default background `#F3F4F6`; surface `#FFFFFF`; elevated surface `#F9FAFB`.
- Text `#111827`; muted `#374151`; subtle `#6B7280`; border `#E5E7EB`; strong border `#D1D5DB`.
- Sidebar `#111827`, sidebar text `#D1D5DB`; primary indigo `#4F46E5`, hover `#4338CA`, soft `#EEF2FF`, brand accent `#7C3AED`.
- Success `#059669`; danger `#B91C1C`; warning `#B45309`; amber accent `#D97706`.
- Cards use 12px radii, thin border, white fill, subtle shadow. Inputs use 8px radii, 1px border, 10px/14px padding, 14px text. Tables have uppercase 12px headings, 14px body, 12px/16px cell padding, row separators, hover surface, and horizontal overflow wrapper.
- Typography stacks name Inter, Plus Jakarta Sans, and JetBrains Mono with system fallbacks. Actual font asset delivery was not verified. Page title is 24px/700; section title 20px/700; body 14px; caption 12px.
- Spacing tokens include 4, 8, 12, 16, 24, 32, and 48px. Reduced-motion media query suppresses animations/transitions.

## Auth pages

### Login: `/` and `/login`

One centered sign-in screen. Fields are email and password; remember-me checkbox is optional; forgot-password link opens `/forgot-password`. Email and password validation use Zod; submit uses the login service, shows inline error/loading, then redirects by role or to the protected destination. The source form is email-based even though repository prose elsewhere describes admin username login; clarify target account conventions before Figma copy is finalized.

### Forgot password: `/forgot-password`

Email-only form, send-reset-link action, inline error/success alert, and return-to-login link. Copy explicitly says a link is sent if an account exists.

### Reset password: `/reset-password?token=…`

New-password and confirmation fields; token comes from query parameter. Missing token creates an error and disables inputs. Password minimum is eight characters and confirmation must match. Success navigates to login with a success message in navigation state.

### Change password: `/change-password`

Current password, new password, confirmation. New password minimum is eight characters; confirmation must match. Submit updates session and routes to role home or a safe participant destination. Organizers and participant/voter roles also see a separate “Continue with temporary password” action; admin does not. Both paths have distinct loading labels and an inline error.

## Admin pages and overlays

### Admin dashboard: `/admin`

Top page heading (“Admin dashboard”) and signed-in account context; primary add-organizer and secondary add-participant actions. Five stat cards: total organizers, total events, participant accounts, active events, votes cast. Module-link cards, recent activity/list cards, and analytics charts follow. Loading uses delayed skeletons; load error uses an alert.

### User management: `/admin/users`

Top-level tabs are **Organizers** and **Participants**. The participant tab has secondary type tabs for election voter, competition judge, and polling respondent. The selected tab/type is encoded in query parameters; legacy `?tab=voters|judges|respondents` maps to participant subtypes.

- Organizer list: summary cards; name/email/organization search; status pills; CSV template, CSV preview/import, export, add/edit and account-state confirmation; table columns organization, organizer, email, status, created date, actions. Row click opens organizer activity detail.
- Voter/respondent pool: email, school ID, first/last name, program, and year/section fields on add/edit; taxonomy-backed select lists; CSV template/preview/import results/export; search, status, account-state and pool-membership actions.
- Judge pool: email, first/last name, expertise, optional title/affiliation, optional assignment to organizer(s); CSV pool operations, account state, and membership management.
- Key overlays: organizer editor, participant/judge editor, account status confirmation, CSV review/results.

Some account-status actions are destructive or access-changing: retain explicit status/impact copy and confirmation.

### Organizer activity detail: `/admin/organizers/:id`

Activity/audit list for one organizer. Filters include action/entity and page controls; rows can open an activity-detail modal with action, entity, timestamp, actor and recorded details. Modal supports copy JSON and close/Escape.

### Global events: `/admin/events`

Five aggregate stat cards; search by event title or organization; type and status filters; clear filters; export CSV. Table columns are title, type, organization, status, date range, actions. Row actions include activity, event report export, open organizer, and restore for archived events. Restore opens `window.confirm` and returns the item as completed/read-only. Search/filtering is client-side over the loaded event list; no page controls were found on this page.

### System settings: `/admin/settings`

Single card/form, admin-only notice, and immediate-effect note. Current known defaults include platform name, maintenance mode, maximum organizers; unknown settings are typed as string/number/boolean/JSON. Managed taxonomy has a dedicated panel and alert configuration is managed on its own page. Save validates numeric/JSON values and writes settings sequentially; status is inline. Taxonomy program and year/section lists affect participant account forms and cohort invites.

### System health: `/admin/health`

Overall status banner and cards for database, Cloudinary, and Resend, with healthy/degraded/unavailable indicators, service message and schema-ready warning. Refresh button and loading placeholders; error shown in alert.

### Alert configuration: `/admin/alerts`

Three alert rows: failed email delivery, event completion, suspicious activity/failed logins. Each uses a switch; first/third reveal positive numeric threshold fields. Save action uses success/error toast. Loading uses skeleton rows.

### Archival policy: `/admin/archival`

Explainer card describes completed-only archival based on event end date; automatic daily check when enabled. Switch and days-after-completion field (1–3650, default 90); field disabled while policy is off. “Run now” disabled while off; save policy, run loading, toast, and last-run message are present.

### Audit logs: `/admin/audit-logs`

Search; action, entity, entity ID (initial query value), start/end dates; sort direction; page size 25/50/100; pagination. Summary totals and current-page admin/organizer/system activity counts. Table, CSV export, and modal displaying action/entity/actor/details; copy-JSON and Escape/backdrop close. Search debounce is 350ms. The default query parameter `entityId` is read once on mount.

### Email delivery: `/admin/email-delivery`

Recipient search, workflow input, delivery-status select, start/end date, refresh, and server-backed 50-row pagination. Table: time, recipient, workflow, subject/template, provider status, details/error/provider ID. Status tones group delivered/sent/opened/clicked, failures/bounces/complaints, and queued/delayed/skipped. Empty state explains records depend on email-audit migration/sends.

## Organizer common pages

### Organizer dashboard: `/organizer`

Overview includes organizer identity, organization logo upload/profile surface, total/activity metrics, charts, module cards (Election, Competition Scoring, Polling), recent event list and active competition sessions. Dashboard fetches data and analytics concurrently and refreshes through WebSocket events; delayed skeletons and error alert are implemented.

### Reports overview: `/organizer/reports`

Three event lists grouped by elections, competition rankings/judge turnout, and polling charts/responses. Each event row links into the canonical module report page. Empty module list says no events yet; page-level loading spinner.

### Organizer profile overlay

Triggered from the account chip for organizer role. Loads profile; display/edit modes for organization name, organization type, organizer name and position. Save updates profile/session user and toasts; logout is available in the header/account menu. The profile editor is not a separate route.

### Shared module event forms

All modules use a guided form with persistent draft/autosave/session handling, step navigation, status locking, banner upload, and an unsaved-changes dialog offering save-and-leave, leave-without-saving, or cancel. Details schemas require title (max 200), start date, end date, valid date strings, and end on/after start; descriptions are optional (max 2000). All three modules use the shared `CalendarCard`; its min/max day constraints complement exact cross-field date/time validation.

- **Election:** Details fields title, description, start/end, results visibility (real-time, hidden, public); Branding event-banner upload. Results visibility default is public.
- **Competition:** Details fields title, description, start/end; Branding; competition type selection is represented through the event type route/creation flow and allows “other” text up to 32 characters.
- **Polling:** Details title, description, start/end; Branding optional banner; Settings anonymous responses and allow multiple submissions booleans. `pollExpiresAt` is not in current source.

## Election page specifications

### Dashboard and list

Election dashboard cards: total events, voting active, registered voters, votes recorded. Per-event table links into positions, with turnout and create-empty state. List page cards show status and description; actions include read-only voter ballot preview modal, Manage, Continue setup for draft. Preview displays grouped positions, vote count/skip hint, candidate photo/name/party and empty candidates state.

### Positions: `/organizer/election/events/:eventId/positions`

Election sections/groups are selectable and can be created, reordered, renamed, deleted. Position fields include name, description, winner count, max votes, display order, and program eligibility; organizer scope can limit eligibility management. Position records are filtered by selected section. Read-only banner/locked controls follow event status. Toast feedback, loading, and confirmation/prompt flows are present.

### Candidates: `/organizer/election/events/:eventId/candidates`

Section and position selectors, candidate search and position facet. Form fields name, biography, platform, party/legacy partylist, photo. Candidate cards show position, optional photo/party/bio/platform; delete is confirmed. Add is optimistic and reconciles with service response. Loading skeletons and toast/error behavior are present.

### Voters: `/organizer/election/events/:eventId/voters`

Shared cohort invite component switches between Program and Year & Section; select cohort values, optional notification checkbox, estimated eligible count, invite summary and email outcomes. Enrolled roster supports removing a participant. At active status, a lock banner replaces mutations. Organizer-visible group and position eligibility summaries may be present according to organizer scope.

### Review: `/organizer/election/events/:eventId/review`

Summary counts of positions, candidates, registered voters; draft readiness requires at least one position and candidate, but not voters. Publish hands the event to its schedule; it does not start voting immediately. Scheduled event can be unpublished to draft; later/terminal state is read-only. Stage footer continues or links to analytics.

### Analytics/report

Analytics uses shared analytics sections/cards with voting timeline, voter progress, participation by program and year/section, position summaries and candidate ranking, plus voter-facing results visibility and full-report action. Report has turnout, vote summaries, participation table and export actions (CSV, Excel, PDF, JSON) plus refresh/generated timestamp. Exact chart data depends on event records.

## Competition Scoring page specifications

### Dashboard and event list

Dashboard cards show events, active sessions, contestants, judges, scores submitted; per-event judge completion table. The dashboard/event list may present native competition links depending on the native setup flag. Event list offers manage/continue setup and read-only scoring-sheet preview showing criteria, weights/minor criteria and contestants.

### Type/categories

Type page has competition-type select and “other” input. Changing a type with child competitions requires confirmation warning that setup/scoring/entry links/judge assignments will be removed while shared event entrants remain. Category/competition page adds/removes independent competitions, participation format, and pageant divisions. Locked when event is not draft or official child rules are frozen. Add/remove errors and confirmation dialogs are part of the flow.

### Structure & scoring workspace

Page uses query tabs `rounds`, `criteria`, `divisions`, `scoring` (plus a structure deep-link), stage readiness summaries and a sticky footer. Rounds and criteria are configured per event/round; criteria progress/readiness, score types, weights, scoring method/rules, deductions, and divisions appear in child panels. Keyboard arrow/Home/End navigation is coded for the primary tab flow. Load failure has retry; read-only state follows event/official rules; autosave/recovery/status surfaces are present.

### Contestants & entries

Shared foundation-backed screen lists entries with search, optional division facet, round selector, qualifier-only filter, and selection for round assignment. Form fields include name, entry number, optional entry label/type, division, and photo. Number defaults to next available. Round participation can be assigned/removed separately from registration; batch write failures identify partial progress. Native boundary may provide another layout.

### Judges

Current judges and available admin-created judge pool. Search pool; select multiple; optional notify; pick/enroll; remove; change judge roles and manage round/category assignments. Enrollment and notification are separate outcomes; roster lock follows event status/official rules. Errors/loading are explicitly surfaced.

### Review & publish

Summary counts contestants/judges/criteria; readiness checklist covers at least one of each, complete criteria, confirmed scoring rules/reviewer setup, and acknowledgement. Publish freezes official setup and sends the event to schedule; it does not start the live session. Scheduled event can be unpublished only while rules are not frozen. Explain irreversible/frozen effects before the primary action.

### Live control

Session states idle/active/paused/completed with start, pause, resume, complete controls. Event/session/foundation/progress are refreshed via competition sync. Controls include round, active contestant, stage/arrangement preview/publish, opening eligible contestants, progress matrix, round finalization preview/checklist and advancement. Every long-running action has busy feedback; failures toast/alert. Do not collapse this into a generic event-settings screen.

### Tabulation, rankings, analytics, report

- Tabulation subroutes switch overview, judge submissions, score matrix, deductions/adjustments, results/rankings, and audit trail through a shared workspace.
- Rankings displays live preview or official standings; filters by contestant search, division and round; judge completion context; refresh; report link.
- Analytics contains totals, submitted/pending score progress, overall/category rankings, judge activity, and round results. Empty state suggests adding contestants/judges/criteria.
- Report includes judge turnout, ranking/category/round performance, refresh, CSV/Excel/PDF/JSON export. Excel may use a workbook export API and fall back to generated sheets when server response indicates conflict.

## Polling page specifications

### Dashboard and event list

Dashboard cards show total polls, active polls, responses submitted, plus a per-poll respondents/responded/participation table. Event list shows status cards and a read-only preview modal with question ordering, required marker, type, image/options, open-response marker and empty-question state.

### Question builder

Question types are loaded from the backend registry, not a fixed UI list. Questions are reorderable via pointer/keyboard drag-drop; create/edit/duplicate/delete; required toggle; image upload; options and option images for option-based types; type-specific config fields (numeric min/max/step, text length/multiline, ranking ties/min items) based on answer-format kind. Use saved/locked/empty/error states and preserve question-specific requirements.

### Respondents and review

Respondents share cohort invitation and active roster-lock behavior with elections. Review shows poll title, question count and respondent count; at least one question is required to publish, but respondent enrollment is not required. Publish is scheduled; scheduled events can be unpublished back to draft. Anonymous/multiple-submission settings appear on the settings step.

### Analytics/report

Analytics displays anonymous/identified mode, total response metrics, participation by program and year/section, daily activity, question statistics, most-selected options, rating distributions, open-text responses and question distributions where present. Report displays response summary, question data/charts, refresh and CSV/Excel/PDF/JSON export.

## Participant pages

### Dashboard

Participant home groups cards under Active events, Assigned events, and Completed events; summary counts and participant-type badges distinguish voter/judge/respondent responsibilities. Election results appear only when data is available and permitted. Empty state says to check back after invitation; failure has retry.

### Election ballot

Event banner, ballot section progress, election position sections, candidate vote controls, local per-event/section draft, review phase, then submit. Position selection count obeys min/max and allow-skip rules; ballot requires at least one selection. Multi-section ballots submit one section at a time, fetch next section, and handle already-submitted/not-next 409 by refreshing state. Final success shows recorded/locked state and permitted results. Before open and no-eligible-position states have explanatory back links.

### Poll response

Fullscreen poll header and anonymous/identified notice; registry-derived question widgets; answered count/progress; local draft autosave/restoration message; answer validation before submit. Success offers another response only when multiple submissions are enabled and the poll remains open. Closed/expired and already-responded states have dedicated explanations. Event banner, questions, and submit action become disabled for archived/submitting state.

### Judge scoring and reviewer

The same `/score` route renders a context-sensitive workspace (legacy or native): judge scoring sheet for an assigned judge, or reviewer/verification view when reviewer context applies. It supports assigned competition/round context, optional division choice, score drafts, save/retry queue, live updates, round submission and published results where authorized. Exact visible fields are determined by configured criteria/rules; design with dynamic score controls rather than hard-coded criteria.

### Public competition results

Standalone page, no authenticated shell. Shows public approved result context: event/competition/round name; publication version/date; official method/tie policy; ranked entry/score or placement; organizer aggregate deductions when enabled. Polls every 15 seconds and refreshes on visibility/focus/online; withdrawn/unavailable snapshot shows a status message. Keep the result table readable on narrow screens.

## Empty/loading/error/disabled patterns

Source includes delayed skeletons, spinners, empty-data copy, inline `FormAlert`, toast, disabled/busy button states, retry actions, confirmation dialogs, draft recovery, read-only banners and modal preview/detail states. Coverage differs by page: several loaders are `null` for the first 300ms; some page/service failures are only logged or swallowed. A redesign should provide a consistent, accessible error/retry contract without inventing new business behavior.
