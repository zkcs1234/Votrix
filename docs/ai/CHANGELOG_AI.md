# AI Changelog

> Append-only. Never overwrite previous entries. Add newest entries at the top.

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
