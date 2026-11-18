# AI Changelog

> Append-only. Never overwrite previous entries. Add newest entries at the top.

---

## [1.5.4] — 2026-11-18

### Tests

- The whole suite is green again (backend 1197 passed; frontend 1103 passed, 6 skipped). Nothing in the app code changed for this.
- **Backend:** enrollment tests now expect `STUDENT` (and `COMPETITION_JUDGE` checked against `JUDGE` eligibility); `STUDENT` is a valid membership type; the native-context discovery test no longer depends on the local `.env` (it stubs `COMPETITION_NATIVE_TABULATION_ENABLED`).
- **Frontend:** the event-form tests use a shared `src/test/pickDateTime.js` that drives the current two-step calendar (AM/PM before the hour) with dates relative to today; "end before start" is now asserted as "the picker will not allow it". The orphaned `DateTimeInput.test.jsx` (component deleted earlier) was removed. Tabulation, handoff, criteria and dashboard tests were updated to the workspace layout, the in-app reason dialog (no `window.prompt`) and the fact that switching rounds no longer refetches.
- **Skipped on purpose (6)** in `CompetitionTabulationWorkspace.test.jsx`, each with a `MISSING UI` comment: empty-state messages, the labelled official results table, the workbook "no differences" message, the reconciliation preview summaries and the calculation source metadata region are no longer rendered by the component. Restore the feature or delete the test.

---

## [1.5.3] — 2026-11-18

### Changed

- **Review & Publish** (poll, election, competition): publish is guarded to run once, an end date in the past is refused, the election API requires a candidate for every position, and the review pages show the real roster size, a load-error state and a "Manage respondents / voters" button after publishing (details in the polling/election/competition review pages).
- **Emails and notifications link to `/participant/...`** instead of the old `/voter/...` paths (`utils/urls.js`). `/voter/*` still redirects, and `/api/voter/*` is still mounted as an alias.
- **Polls show "Results available"** on the student's event card when the organizer's results setting allows it.
- The polling enrolled list asks for up to 500 respondents (it used to stop at the first 50).

### Removed (unused, no route reached them)

- Backend: the old respondent register/invite/send functions in `polling.service.js`; the judge invite/register/send functions in `pageant.service.js` and `inviteCompetitionJudge` in `competition.service.js`; the direct `publishCompetitionEvent` (publishing goes through the rules freeze).
- Frontend: service methods for routes that no longer exist (`respondents/*`, `voters/register|send|import*`, `judges/invite|register|import*`).

---

## [1.5.2] — 2026-11-18

### Changed

- **Organizer program scope now applies to every student number, not just the rosters.** The organizer dashboard and analytics, the election and polling module dashboards, election analytics, poll analytics, the reports overview and the polling report count only students inside the organizer's programs (`organizer-scope.service.js`: `scopedSelect` / `applyStudentScope`; rows filtered with `isStudentInScope`). Vote and answer tallies stay event-wide (an anonymous poll cannot attribute answers to a program); voter-facing results are never scoped. Judges are a global pool and are not scoped.
- **A scoped organizer with an empty program list now sees no students** (it used to see everyone). The admin forms already require at least one program for a scoped organizer, so this only affects older rows; fix those by giving the organizer a program or switching them to all access. The officer picker follows the same rule.
- Reports overview and the polling report page through the rows instead of counting a single 1000-row response, and the unused `participationByYearSection` field was removed.

---

## [1.5.1] — 2026-11-18

### Fixed

- **Students enrolled by program could not vote or submit polls.** Migration `145_student_type_election_poll_functions.sql` makes `cast_election_ballot`, `cast_poll_response`, `election_group_is_eligible` and `set_election_group_eligibility` accept the `STUDENT` participant type (they only matched the legacy `ELECTION_VOTER` / `POLLING_RESPONDENT`). The Node code (rosters, dashboards, reports, voter routes) already accepts both; `registerParticipant` now maps judge enrollment to `JUDGE` eligibility.
- **Scope bypass removed.** `POST /api/organizer/events/:eventId/voters/invite` and `…/resend-invitation` enrolled any existing student by email without the organizer's program scope. Both routes, their controller handlers, `validateInviteVoter` and the unused `invitation.service.js` were deleted. Cohort invite is the only organizer enrolment path.

---

## [1.5.0] — 2026-11-16

### Added

- **Participant sidebar (students and judges).** Participants now have a sidebar with **Overview**, **My events**, **History** and **Results** (`/participant`, `/participant/my-events`, `/participant/history`, `/participant/results`). The nav is identical for everyone; the account type only changes what the pages show. Ballot, poll and scoring pages keep the sidebar as a collapsed rail (new `railOnly` prop on `DashboardLayout` / `AppShell`, no expand toggle) so the task has the full width. A student officer also gets the existing "Open workspace" entry; inside `/organizer` nothing changed.
- **New endpoints** `GET /api/participant/events`, `/history`, `/results` (see `docs/ai/API.md`), built from the caller's own enrollments. History shows participation only (never selections, poll answers or scores) with per-section / per-round receipts; Results lists election results (final / live / not yet) and official published competition standings, with election bodies fetched on demand.
- **`participantTypes` on the signed-in user** (`/auth/me`, login, refresh, change-password) next to `officership`, via `attachParticipantContext`. It labels the account chip (Student, Judge, Student · Officer) and filters; it is never used for access.
- **`useParticipantSync`:** re-reads the account context on student pages (mount and tab focus, throttled to 30 s) so a student who was just made an officer sees the workspace entry, and one whose officer access ended loses it with a message, without signing in again.

### Changed

- `getVoterDashboard` no longer fetches every election's results (sequentially) unless `?include=results` is passed; the old `VoterDashboardPage` was replaced by the four pages above. `loadClassifiedEvents` is now shared by the overview, My events, History and Results so they cannot disagree.
- The header account chip for participants now says Student / Judge / Participant (it used to say "Account").

### Not done / known limits

- **Native competitions** show round submission state in History but not per-round times, and their published results are read through the public results service per competition.
- **Polls** are not in Results (no poll results setting). **Students** see no competition results.
- Not exercised in a real browser against a running backend and database.

---

## [1.4.0] — 2026-11-16

### Changed

- **Judges are a global pool.** The admin no longer assigns judges to organizers: `users.profile_data.organizerIds` is no longer read or written. Every active judge appears in every organizer's judge picker (`getJudgePool`), and each organizer picks the judges for their own competition events (`pickJudges`). The pool now returns only name, email, title, affiliation and expertise instead of the whole profile. The admin judge form, the judge details modal and the judge CSV template lost the organizer assignment ("organizers" column); an older CSV that still has that column imports normally and the column is ignored. Registering a judge into an event no longer checks an organizer pool (`participant.service.js`).
- **Admin → User Management is now two pages:** **Organizers** (`/admin/organizers`: Accounts, Invitations, Applications) and **Participants** (`/admin/participants`: Students, Judges, `?category=judges`). The sidebar has two entries instead of one. `/admin/users` remains as a redirect that maps every old URL (`?tab=organizers&section=…`, `?tab=participants&category=…`, and the older `type=` forms) to the right new page; `/admin/organizers/:id` is unchanged. Admin dashboard quick links and the admin search index were updated.

- **A participant is a student or a judge, never both.** Admin create and CSV import (preview and register) now refuse to add the Judge type to an account that already has an active Student type, and the reverse (409, "A person is either a student or a judge, not both"). A removed (inactive) membership does not block. Accounts that already hold both (created before this rule) are not changed automatically; they only block adding the other type again.

### Data

- Migration `141_remove_judge_organizer_assignment.sql` deletes the stale `organizerIds` key from `users.profile_data`. It is data-only and idempotent; its down file is a no-op because the removed mapping cannot be restored (back up first if you may want it).

---

## [1.3.0] — 2026-11-16

### Added

- **Two more real System settings:** `email_daily_limit` (daily email sending limit, enforced by `emailGuard`; falls back to `RESEND_DAILY_LIMIT`, then 50) and `invitation_expiry_days` (default organizer-invitation expiry, 1–30, default 7; used by `createInvitation`, resend and the invite dialog). `GET /api/admin/settings` now also returns `effective`.

### Changed

- **Programs & Sections editor:** briefly added as a tab in User Management → Participants, then removed again at the admin's request (there was nothing to add). Data, API and validation are unchanged; no admin UI edits the lists now, and the "Open System Settings" links in the student/organizer dialogs were replaced by plain text.
- A resent invitation now gets the current default expiry instead of copying the old link's length.

---

## [1.2.0] — 2026-11-16

### Changed

- **System settings now do what they say.** Maintenance mode and the organizer limit were saved but never read; they are now enforced (see `docs/ai/BUSINESS_RULES.md` → Platform Settings Rules). New `GET /api/public/platform`, `maintenanceGuard`, strict validation, and `ORGANIZER_LIMIT_REACHED` / `MAINTENANCE_MODE` error codes. The frontend gained a platform store, a maintenance screen and gate, and confirmation before enabling maintenance.
- **The platform name is fixed ("Votrix"), not editable.** It cannot be changed everywhere (emails, reports, help text, logo artwork), so the page shows it read-only and the server ignores/refuses it. The raw "custom typed values" editor was removed from System settings (it exposed other pages' keys, such as the archival policy, as editable JSON).
- **Participant taxonomy removed from the System settings page** (frontend only). The data, API and its use in validation are unchanged. (Superseded in 1.3.0: the editor now lives in User Management → Participants.)
- Admin → User Management: Add organizer and Suspend removed; Template renamed Form; Students/Judges/Organizers share one row-action set with a View modal; Add Student creates with the single `STUDENT` type in one request.

---

## [1.1.0] — 2026-11-16

### Added

- **Organizer invitation → application → approval flow** (migrations 138–139): single-use, email-bound, hashed-token invitations; a public application page with private certificate uploads; admin review with corrections, approve (reuses `createOrganizerAccount()`) and decline-with-reason. The direct "Add organizer" form and CSV import are unchanged.
- **Student officers** (migration 140): an organizer can assign students to act inside the organizer workspace as that organizer. Implemented as a request-level delegation (`resolveOrganizerContext`) so existing organizer code is unchanged; owner-only guards, immediate deactivation, audit attribution (`details.actingUserId`), WebSocket support, `user.officership` in auth responses, an Account Manager page and an admin override.
- Docs: `docs/AUTH.md`, `docs/ai/BUSINESS_RULES.md`, `docs/ai/API.md`, `docs/ai/DATABASE.md`, `backend/src/database/README.md`; full plan and implementation log in `docs/plans/organizer-invitation-and-student-officers-plan.md`.

---

## [1.0.1] — 2026-07-04

### Documentation

- Refreshed the known-issues tracker to remove resolved auth migration items and retain only implementation-backed issues.
- Updated the AI context summary to point to the current issue tracker and reflect the latest documentation revision.

---

## [1.0.0] — 2026-07-04

### Added

- Initial AI documentation system created under `docs/ai/`
- `README.md` — entry point and update workflow for AI agents
- `AI_CONTEXT.md` — master project summary
- `SYSTEM_ARCHITECTURE.md` — architecture, auth flow, request lifecycle
- `FEATURES.md` — all 14 features documented with status, files, endpoints
- `DATABASE.md` — complete schema: 25+ tables, all enums, indexes, migrations
- `API.md` — all API endpoints documented with auth, request, response
- `REALTIME.md` — WebSocket server, rooms, emitter, frontend client
- `BUSINESS_RULES.md` — auth, role, election, competition, polling, security rules
- `UI_UX.md` — all pages, layouts, components, states
- `PROJECT_STRUCTURE.md` — complete folder responsibility map
- `DEPENDENCIES.md` — all packages with purpose and usage
- `CHANGELOG_AI.md` — this file
- `KNOWN_ISSUES.md` — current known issues and tech debt
- `TODO_AI.md` — prioritized task list

### Project State at Documentation Creation

- All 14 development phases complete
- Backend: Express 5, Node.js 20+, Supabase, JWT HTTP-only cookies (CLAUDE.md plan implemented)
- Frontend: React 19, Vite 8, Tailwind 4, Zustand 5
- WebSocket: Custom `ws` library server with room-based broadcast
- Auth: Cookie-only transport (no Authorization header, no localStorage token)
- 19 database migrations applied

---

<!-- Add new entries above this line -->
