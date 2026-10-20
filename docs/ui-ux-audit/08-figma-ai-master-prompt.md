# VOTRIX — Figma AI Master Prompt

Copy and paste this prompt into Figma AI or another compatible UI design generator. It is self-contained and based on the verified frontend route/source inventory.

---

You are redesigning **VOTRIX**, a role-based online voting, competition-scoring, and polling platform for administrators, event organizers, and invited participants. Create a complete, consistent, responsive product UI system and linked screen prototypes. Preserve every workflow, field, action, role boundary, status, and data requirement described below. Do not invent backend capabilities or remove features.

## Product roles and access

- **Admin:** platform dashboard; organizer and participant account pools; global event oversight; system settings and participant taxonomy; health, alerts, archival, audit and email-delivery logs.
- **Organizer:** organization dashboard/profile; election, competition scoring and polling modules; cohort invitations; analytics and reports.
- **Participant:** one shared account may act as an election voter, competition judge, or polling respondent. Home page groups active, assigned and completed events.
- **Public viewer:** may see only approved published competition result snapshots at a standalone results screen.
- Authenticated pages require role authorization. A participant must also be enrolled in the event and module role. Organizer setup locks after publish; scheduled items can be unpublished only where allowed. Voting/scoring/polling opening is controlled by event schedule/session, not merely by the publish click.

## Visual direction and tokens

Design a professional civic/education operations product: calm, reliable, clear status language, data-first admin/organizer views, and focused participant tasks. Use a light neutral base and indigo primary:

- Primary `#4F46E5`, hover `#4338CA`, violet brand accent `#7C3AED`.
- Page `#F3F4F6`, card `#FFFFFF`, subtle surface `#F9FAFB`.
- Primary text `#111827`, secondary `#374151`, muted `#6B7280`.
- Border `#E5E7EB`, strong border `#D1D5DB`.
- Success `#047857` / `#ECFDF5`; warning `#B45309` / `#FFFBEB`; danger `#B91C1C` / `#FEF2F2`.
- Fonts: Inter/system for body, Plus Jakarta Sans/system for headings, tabular numerals for metrics. Use 4px spacing base, 8px control radius, 12px cards, 16px dialogs; subtle borders and shadows.
- Use icons consistently, never color alone for status. Provide visible keyboard focus, sufficient contrast, 44px touch targets, reduced-motion-safe transitions, labeled fields and accessible modal patterns.

Responsive design: desktop has 256px organizer/admin sidebar (collapsible to narrow rail), sticky top bar, responsive content grids and wide data workspaces. Tablet/mobile uses a navigation drawer. Forms stack to one column on small screens. Data tables use a mobile-prioritized card or accessible horizontal-scroll variant. Participant ballot and poll screens use a fullscreen layout with fixed progress at top, scrollable content, and a safe-area-aware fixed submit footer.

## Global shell and reusable components

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

## Required screens and behavior

### Authentication

1. **Login** at `/` and `/login`: centered logo card, email, password, optional Remember me, sign-in, forgot-password link, field validation and loading/error states.
2. **Forgot password**: email field, send-reset-link action, non-disclosing success copy, error state, back-to-login.
3. **Reset password**: token-based, new and confirm password, minimum eight characters, matching validation; missing token disables inputs and shows error; success returns to login.
4. **Change password**: current/new/confirm fields; admin must update; organizer and participant may continue using temporary password. Route user to role dashboard or safe participant destination.

### Admin

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

### Organizer home and shared flows

- **Organizer dashboard:** organization profile/logo, high-value metrics/charts, three module launchers, recent events, active competition sessions.
- **Organizer profile overlay:** organization name/type, organizer name and position; edit/save/cancel and logout.
- **Reports overview:** election turnout, competition judge completion/rankings, polling submissions; link to canonical event reports.
- Event forms have draft/autosave and unsaved-change protection. Required shared fields: title (max 200), start date/time, end date/time, parseable date; end must be on/after start. Description optional (max 2000). The source currently uses native date-time controls; do not design a bespoke picker unless the product team confirms it is the target.
- Election also has results visibility choices Real-time, Hidden, Public. Poll settings include Anonymous responses, Allow multiple submissions, and optional expiration date/time constrained inclusively to the event schedule.
- Publish transitions draft to scheduled; event opens by schedule. Setup is locked afterward. Unpublish is available while scheduled. Voters/respondents are enrolled by Program or Year & Section cohort, with optional email notification and separate enrollment/email outcome.

### Election module

- **Dashboard:** events/voting/voter/vote stats, per-event turnout table, create event.
- **Events:** status cards, read-only ballot preview (groups, positions, vote limits, candidates), manage/continue setup, draft recovery.
- **Details/branding:** title, optional description, required start/end, results visibility; banner upload.
- **Positions:** ballot sections/groups create/reorder/rename/delete; position name/description/winner count/max votes/order/program eligibility.
- **Candidates:** section/position selectors; search/filter; name, biography, platform, party, photo; delete confirmation.
- **Voters:** cohort invite, selected count, optional notify, enrolled list/remove, eligibility summaries, active-state roster lock.
- **Review/publish:** counts/readiness; requires at least one position and candidate; voter invite is not required to publish.
- **Analytics/report:** live turnout, timeline, participation by program/year-section, candidate/position summaries, exportable report.
- **Participant ballot:** fullscreen section progress; candidates selectable within configured limits; required-position validation and skip rules; local draft; review then submit. Multi-section events submit a section and load the next. Show final locked confirmation and results only where permitted.

### Competition Scoring module

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

### Polling module

- **Dashboard/events:** total/active polls and submissions; participation table; cards and respondent-facing preview.
- **Details/branding/settings:** title, optional description, required start/end, optional banner, anonymous and multiple-submission switches.
- **Question builder:** available type registry from API; add/edit/duplicate/delete/reorder; required flag; type-specific options/config/images. Numeric: min/max/step; text: max length/multiline; ranking: ties/min items. Do not assume every question type shares the same answer controls.
- **Respondents:** Program or Year & Section cohort invitation, notification, roster, active lock.
- **Review/publish:** question/respondent summary; at least one question required, respondents need not be enrolled before publish.
- **Analytics/report:** response summary, participation by cohort, daily activity, question distribution/rating/text data, refresh/export.
- **Participant poll:** dynamic question widgets, required validation, answered progress, local draft restoration, fullscreen submit; closed/expired/already-responded and success states; another response only when policy allows and poll remains open.

### Participant dashboard and public route

- Participant home groups active, assigned and completed cards; show role labels and only authorized election results.
- Keep event banner, organizer, date/status, task, role and one clear action visible.
- Candidate ballot and poll submission use fixed progress/actions and explicit saved-vs-submitted messaging.
- Judge screen is context-driven: assigned competition/round/criteria, judge draft and submit, optional reviewer verification.
- Public competition results require an approved published snapshot; never display preview calculations as official.

## Prototype and state requirements

Create linked prototypes for:

1. Login → forced password change → role dashboard.
2. Admin create/import account → confirmation/result → participant pool.
3. Organizer create event → setup → review/publish → cohort enrollment → active task → analytics/report.
4. Election participant select → review → submit → next section or completion.
5. Poll builder → respondent form → submit → completion/allowed resubmit.
6. Competition setup → judge assignment → publish → live session → round finalize → official tabulation/public result.
7. Search, filter, notifications, CSV preview, status restore, unpublish, error retry and logout.

Show loading, no-data, empty, validation error, service error/retry, disabled/read-only, save progress, success, confirmation, archived/closed and responsive variants. Make statuses and destructive consequences explicit. Preserve existing workflow order and data rules; mark any proposed extra affordance as optional, not implemented behavior.
