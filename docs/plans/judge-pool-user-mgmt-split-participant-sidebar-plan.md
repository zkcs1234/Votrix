# Plan: Global Judge Pool, Split User Management, Participant Sidebar

> **Status:** Changes 1 and 2 are **implemented** (uncommitted). Change 3 is **implemented** too, with the choices in `participant-sidebar-part3-detailed-plan.md` (uncommitted, not exercised in a real browser). Migration `141_remove_judge_organizer_assignment.sql` has been written but **not applied** to any database.

Three changes, to be implemented **in this order** (2 builds on the page that 1 edits; 3 is independent but largest).

| # | Change | Size | Risk |
|---|--------|------|------|
| 1 | Remove admin "assign judge to organizer"; all organizers see all judges | Small | Low |
| 2 | Split User Management into **Organizers** and **Participants** pages | Small-Medium | Low |
| 3 | Sidebar for participants (students + judges): Overview, Events, History, Results | Large | Medium |

---

## Change 1 — Global judge pool (no admin→organizer assignment)

### Target behaviour
Admin creates a participant account with type **Judge** → it is automatically visible to **every** organizer in the judge picker → each organizer selects which judges join *their* competition event. Admin never maps judges to organizers.

### Current state (what exists today)
The mapping is stored as `users.profile_data.organizerIds` on the judge account and is enforced in two places:
- `backend/src/services/competition.service.js` `getJudgePool` (~L736-746) filters the pool by `organizerIds`; `pickJudges` re-checks via the pool (~L776-777).
- `backend/src/services/participant.service.js` L149 rejects a judge "outside this organizer's authorized pool" on registration.

It is written/read by:
- `backend/src/services/admin-participant.service.js`: `organizers` CSV column alias (L42) and template header (L47), parse (L655), `judgeProfileData` (L679-680), `createJudge` (L805), `updateJudge` (L841), import preview email→id resolution (~L923).
- `frontend/src/components/admin/JudgesPanel.jsx`: "Assign to organizers" block + `adminService.getOrganizers()` fetch (L43-55, L62, L130+).
- `frontend/src/components/admin/ViewJudgeDetailsModal.jsx` (L13): shows assigned organizers.
- Comment in `backend/src/services/organizer-scope.service.js` L9.

The organizer-side picker (`CompetitionJudgesPage`, `JudgeAssignmentPanel`) already does the "organizer selects judges for their event" part. **No new organizer UI is needed.**

### Steps
1. **Backend – pool**: in `getJudgePool`, delete the `organizerIds` filter; keep search, active-membership and `account_status = active` filters. In `participant.service.js` L149, delete the authorized-pool check.
2. **Backend – narrow what organizers can see**: `getJudgePool` currently returns the whole `profile_data`. Now that every organizer sees every judge, return only `id, email, first/last name, title, affiliation, expertise` (privacy: no other profile fields cross organizers).
3. **Backend – admin judge CRUD/import**: stop reading/writing `organizerIds` in create/update/import; remove the `organizers` column from the CSV template. Keep the importer **tolerant**: if an old CSV still has an `organizers` column, ignore it instead of failing.
4. **Data cleanup**: new migration `UPDATE users SET profile_data = profile_data - 'organizerIds' WHERE profile_data ? 'organizerIds'` (judges only). Without it nothing breaks (value is ignored), but stale data would linger. Export/backup first — the old mapping is not recoverable afterwards.
5. **Frontend**: remove the "Assign to organizers" section, the organizer fetch and related state from `JudgesPanel.jsx`; remove the assigned-organizers row from `ViewJudgeDetailsModal.jsx`; update CSV help text/template download.
6. **Docs**: update `docs/ai/BUSINESS_RULES.md`, `docs/ai/API.md`, `docs/ai/DATABASE.md`, `docs/ai/CHANGELOG_AI.md` (grep `organizerIds`; decision "O7" is superseded).
7. **Tests**:
   - Backend: pool returns the same judges for two different organizers; `pickJudges` succeeds for a judge that formerly had a different `organizerIds`; suspended/inactive judges still excluded; import ignores legacy `organizers` column; `__tests__/api/admin.api.test.js` adjustments.
   - Frontend: `JudgesPanel` has no organizer section; `ViewDetailsModals.test.jsx` (currently passes `organizerIds`) updated.

### Acceptance
- Create judge as admin → log in as organizer A and organizer B → both see the judge in the pool; each can add them to their own event; the other's event is unaffected.
- No "assign to organizers" control anywhere in admin UI or CSV template.

### Decision flagged
Every organizer will see every judge's name/email. That is what you asked for; step 2 limits it to the minimum fields.

---

## Change 2 — Split User Management into Organizers + Participants

### Naming recommendation
**"Organizers"** and **"Participants"** — agreed, keep them. They match the role names used everywhere else (`USER_ROLES.ORGANIZER` / `PARTICIPANT`), and "Participants" already contains Students/Judges as a sub-toggle. Sidebar group stays **Manage**:

```
Manage
  Organizers      /admin/organizers
  Participants    /admin/participants
  Events          /admin/events
```

### Current state
One page `frontend/src/pages/admin/UserManagementPage.jsx` with top tabs (Organizers | Participants), organizer sub-tabs (Accounts / Invitations / Applications) and participant category toggle (Students / Judges). Route `/admin/users`; `/admin/organizers` is currently a redirect to it, and `/admin/organizers/:id` is `OrganizerDetailPage` (keep).

### Steps
1. **Two pages**, reusing existing panels (no panel rewrites):
   - `OrganizersPage` → sub-tabs Accounts (`OrganizerManagementPage`), Invitations (`OrganizerInvitationsPanel`), Applications (`OrganizerApplicationsPanel`) incl. the pending-applications count badge. URL: `/admin/organizers?section=invitations|applications`.
   - `ParticipantsPage` → Students (`StudentsPanel`) / Judges (`JudgesPanel`) toggle, URL `/admin/participants?category=students|judges`, keeps the `data-module` theming switch.
2. **Routes** (`frontend/src/routes/index.jsx`): add `organizers` (page) and `participants`; keep `organizers/:id`. Make `/admin/users` a redirect that maps legacy params: `?tab=participants[&category|type]` → `/admin/participants?category=…`, `?tab=organizers[&section]` → `/admin/organizers?section=…`. Keep the existing legacy `type=` mapping (election-voter, polling-respondent, competition-judge…).
3. **Sidebar** (`layouts/DashboardLayout.jsx` L83-89): replace the single "User Management" item with two items; "Organizers" `isActive` covers `/admin/organizers` and `/admin/organizers/:id`.
4. **Links to update**: `AdminDashboardPage.jsx` L214/L220, `config/searchIndex.js` L21 (split into two entries), and grep backend (`utils/urls.js`, email templates) for `/admin/users` — none found in backend source, so frontend only.
5. **Tests**: split `UserManagementPage.test.jsx`, `.organizers.test.jsx`, `.importForm.test.jsx`, `.accountActions.test.jsx` accordingly; update `AdminDashboardPage.inviteOrganizer.test.jsx` hrefs; add a redirect test for legacy `/admin/users?…` URLs and a `DashboardLayout` nav test.
6. Delete `UserManagementPage.jsx` once nothing imports it (leave the redirect route).

### Acceptance
Two sidebar entries, each opens only its own area; every old bookmarked `/admin/users?…` URL lands on the correct new page/section.

---

## Change 3 — Participant sidebar (Students + Judges)

> **Superseded by `participant-sidebar-part3-detailed-plan.md`** (includes student officers, corrections to the results decisions below, and the final phase list). The text below is the earlier summary.

### Target
Participants (currently `showSidebar={false}` everywhere under `/participant`) get a sidebar:

```
Workspace
  Overview     /participant             (today's VoterDashboardPage: stats + what needs you now)
  My Events    /participant/my-events   (all assigned/active events, filterable)
  History      /participant/history     (completed events: ballots cast, polls answered, scores submitted)
  Results      /participant/results     (events whose results you are permitted to see)
```

### Current state (important constraints)
- All participant routes use `DashboardLayout … showSidebar={false}` (`routes/index.jsx` L303-338). `DashboardLayout` already has the `navItems` machinery and an officer "Open workspace" link, so the participant branch fits there.
- One endpoint, `GET /participant/overview`, returns events pre-bucketed `assigned / active / completed` plus election results (`voter.service.js getVoterDashboard`). History and Results are **derivable from it today**; no new data source required for v1.
- Student vs Judge is not a different account role — both are `PARTICIPANT` with participant-type memberships; an account is a student or a judge, not both. Types are exposed via `GET /participant/participant-types`.
- Route `/participant/events/:eventId` is the **election ballot** page, so the list uses `/participant/my-events` instead.
- Event pages (ballot, poll, scoring) are full-screen task flows, so they get a collapsed rail rather than the full sidebar.

### Decisions (confirmed: recommendations accepted)
1. **Overview vs My Events** — *Overview* becomes a short summary (stats + "needs action now" + results teaser); *My Events* is the full filterable list.
2. **Results per type** —
   - Elections: existing results card, gated by `canVoterViewElectionResults`.
   - Polls: aggregate results only when the organizer allows participants to see them; otherwise the event is not listed.
   - Judges/competitions: final standings only after the organizer publishes results (link to the existing public native results page `/competition/events/:eventId/competitions/:competitionId/results`).
   - All visibility is enforced server-side per event.
3. **One sidebar for everyone**, content filtered by participant type (a judge sees competition events only; a student never sees judge items).
4. **Event task pages** (ballot / poll / scoring) show a collapsed sidebar rail (reuse `AppShell` collapse + `FOCUS_SUBPAGES` mechanism); the four list pages show the full sidebar.
5. **Route** for the event list is `/participant/my-events` (avoids clashing with `/participant/events/:eventId`, the ballot page).

### Phases
**Phase 3A — Shell (frontend only, no behaviour change)**
- In `DashboardLayout`, add participant nav (`Overview / My Events / History / Results`, section "Workspace") when role is participant; keep officer link.
- Enable the sidebar on `/participant` and the new routes; keep event task pages on `showSidebar={false}` or collapsed per Q4.
- Mobile: verify the existing hamburger drawer.

**Phase 3B — Pages (reuse `/participant/overview`)**
- `ParticipantEventsPage`: all events with filters (status bucket, type: election/poll/competition). Extract `EventSection`/`VoterEventCard` from `VoterDashboardPage` into shared components.
- `ParticipantHistoryPage`: `completed` bucket as a table (event, type, your action, date) with search/sort.
- `ParticipantResultsPage`: events with `canViewResults` / published results; reuse `ElectionResultsCard`.
- `VoterDashboardPage` → slim Overview (stats, active events, results teaser). Keep `useSocketEvent` / `useCompetitionSync` refresh behaviour.
- Rename gradually (`VoterDashboardPage` → `ParticipantOverviewPage`) only if it does not bloat the diff.

**Phase 3C — Backend support (only if 3B needs it)**
- Add `GET /participant/history` (paged, completed events with action timestamps) and `GET /participant/results` (permitted results across election/poll/competition) so lists are paginated and results fetching leaves the overview payload (today `getVoterDashboard` loops election results sequentially — slow with many elections). Authorization stays inside `voter.routes.js` (`authorize(PARTICIPANT)`), and each result is gated server-side by the existing `canVoterViewElectionResults`-style rules — **never trusted from the client**.
- Add `participantType` filter param.

**Phase 3D — Type-aware polish**
- Fetch `participant-types` once (store) and filter nav/content.
- Empty states per type ("No competitions assigned yet").

**Phase 3E — Tests & docs**
- Frontend: nav items per participant type, officer link still present, redirect from `/voter/*` still works (`LegacyParticipantRedirect`), existing `VoterDashboardPage.reconciliation.test.jsx` updated.
- Backend: results/history endpoints deny results not permitted, only return the caller's own events.
- Update `docs/ai/API.md`, `docs/ai/CHANGELOG_AI.md`.

### Risks
- Results visibility leaks (new aggregate endpoint) — mitigate with server-side per-event checks and tests.
- Overview payload size/latency — mitigated by 3C.
- Task pages losing screen width — mitigated by collapsed rail.
- Existing emailed links use `/voter/...` (`backend/src/utils/urls.js`); they keep working through `LegacyParticipantRedirect`, do not remove it.

---

## Suggested delivery
1. PR 1 — Change 1 (backend + JudgesPanel + migration + tests).
2. PR 2 — Change 2 (routes/pages/sidebar/tests).
3. PR 3 — Phase 3A+3B (shell and pages from existing data).
4. PR 4 — Phase 3C+3D (new endpoints, type-aware polish) once Results/History rules are confirmed.
