# Part 3 (detailed): Participant sidebar, including students who are also organizer officers

> **Status: implemented (uncommitted).** Built on the recommended defaults for every open decision (Q1-Q6, H1-H6, R1-R4). Differences from this plan: the intermediate "pages from existing data" phase (3C) was skipped in favour of going straight to the new endpoints; History shows no "contestants scored" count (no reliable source); the CSV export covers the loaded rows. See `docs/ai/CHANGELOG_AI.md` 1.5.0 for what shipped and its known limits.

Companion to `judge-pool-user-mgmt-split-participant-sidebar-plan.md` (Part 3 there is the summary; this file supersedes it).
Written after reading the current code. Everything marked **[verified]** was read in the repo; **[verify]** means it must be checked before building.

---

## 0. Corrections to what I said earlier

| Earlier statement | What the code actually does | Effect on the plan |
|---|---|---|
| "Types are exposed via `GET /participant/participant-types`." | That endpoint returns **per-event roles** (`event_participants` rows), not the account's STUDENT / JUDGE memberships (`user_participant_types`). `/auth/me` returns `officership` but **no participant types** **[verified: auth.service.js `attachOfficership`, voter.controller.js]**. | The frontend cannot currently tell "this account is a judge" before it has loaded events. Phase 3B adds `participantTypes` to `/auth/me`. |
| "Polls: show aggregate results if the organizer allows it." | Only **elections** have a participant-facing results setting (`results_visibility`: hidden / real_time / public, `canVoterViewElectionResults`). **Polls have no such setting** and no participant results endpoint **[verified: grep of services/utils/validators]**. | Poll results would need a new organizer setting. Not v1 (see §8, Q1). |
| "Judges see final standings after publication." | A public, published-results route exists: `GET /public/competition/events/:eventId/competitions/:competitionId/results` (`competition-public-results.routes.js`) **[verified]**. Gating inside `publicResults()` is **[verify]**. There is no per-judge "results" list. | Judge Results = list of published competitions from events they were enrolled in, linking to the existing page. Needs one new list query. |
| (not mentioned) | `DashboardLayout` **already contains** the officer-on-student-pages navigation ("Organizer workspace → Open workspace") and the organizer-side "Switch → Student view", but it is **dead code in production** because every participant route sets `showSidebar={false}`; only its unit test renders it **[verified: DashboardLayout.jsx L70-76, routes/index.jsx L303-338, DashboardLayout.officer.test.jsx L89-96]**. | Part 3 *activates* existing officer navigation instead of inventing it. |
| (not mentioned) | `AppShell` `ROLE_LABELS` has keys `admin / organizer / voter` but participant accounts have role `participant`, so the account chip shows "Account" **[verified: AppShell.jsx L22-26, constants.js L13-19]**. | Fix in Phase 3A (chip shows Student / Judge / Participant). |
| (not mentioned) | Student election listing still filters on `PARTICIPANT_TYPES.ELECTION_VOTER` in `listVoterElectionEvents` while migrations 135-137 move to `STUDENT` **[verified: election.service.js L1492]**. | Precondition: STUDENT/JUDGE migration work (135-137) must be finished/applied first, otherwise the sidebar lists would be empty or wrong. |

---

## 1. The people we are designing for

A participant account has **role `participant`** plus three independent things:

1. **Participant type** (`user_participant_types`): **STUDENT or JUDGE, never both.** The project's own rule (`student-judge-separation-migration.md`) makes them mutually exclusive. **Code gap [verified]:** `createJudge` and the judge CSV importer currently *attach* JUDGE to an existing student account instead of rejecting it, so the data can drift from the rule. **Fixed:** admin create and CSV import now refuse to add JUDGE to a STUDENT account and the reverse. Accounts that already hold both (created earlier) are not migrated automatically; check for them before relying on the rule (see the query in the final report). Part 3 designs for the rule.
2. **Event enrollments** (`event_participants`): which elections / polls / competitions they are in.
3. **Officership** (`organization_officers`): at most **one active** organization they act for (rule P8) **[verified: Phase E in the officers plan]**.

| Case | Memberships | Officer? | Sidebar they should see |
|---|---|---|---|
| A. Student | STUDENT | no | Overview, My Events, History, Results |
| B. Judge | JUDGE | no | same four, content = competitions only |
| C. **Student officer** | STUDENT | **yes** | the four + **Organizer workspace** section (§2) |
| Admin / Organizer | n/a | n/a | unchanged |

(Only an account with the STUDENT type can be an officer, so there is no judge-officer case.)

The four-item nav is **identical for every participant**; membership only changes *content* (filters, empty states, labels). The officer entry is the only nav difference.

---

## 2. Student with an organizer membership (officer): what changes and how it looks

### 2.1 Today
- Student pages have **no sidebar**. The officer's only way into the workspace is the `OfficerWorkspaceCard` on the dashboard (`/participant`) **[verified]**. If they land on a ballot/scoring page after login, there is no entry point at all.
- Inside `/organizer/*` they get the organizer sidebar, an "Officer" chip, a banner ("You're working as *President* for *Org*… recorded under your name") and a "Student view" link **[verified]**.

### 2.2 Target: two workspaces, one account, always one click apart

**Student view** (`/participant/*`)

```
┌ sidebar ───────────────┐
│ VOTRIX                 │
│ WORKSPACE              │
│  ▣ Overview            │
│  ▣ My Events           │
│  ▣ History             │
│  ▣ Results             │
│ ORGANIZER WORKSPACE    │   ← only if officership exists
│  ▣ Open workspace      │      caption: "President · Computing Society"
│                        │
│ (collapsed rail on     │
│  ballot/poll/scoring)  │
└────────────────────────┘
header: account chip "Student" (or "Student · Officer")
```

**Organizer view** (`/organizer/*`): **unchanged**. Same organizer sidebar, officer banner, "Officer" chip, and the existing "Switch → Student view" link. "Student view" now lands on Overview with the student sidebar.

### 2.3 Rules that keep the two roles from mixing
1. **Data is never merged.** Student pages show only what the *student account* is enrolled in. Organization-managed events appear only inside `/organizer`. History/Results never include "events my organization runs" unless the student is also enrolled in them as a voter.
2. **Identity is explicit.** Student view = their own name/ID. Organizer view = acting as the owner, banner + "Officer" chip (existing). The sidebar section label shows organization and position so it is obvious which hat they are putting on.
3. **Entry link is advisory.** The server re-checks officership on every `/organizer` request (`resolveOrganizerContext`). The sidebar link only improves discoverability **[verified: comment in workspace.js]**.
4. **Single hop, no nesting.** The officer entry is hidden when the owner is suspended or officership is deactivated (already how `attachOfficership` works: `usable` check).
5. **`OfficerWorkspaceCard` stays on Overview** (prominent on mobile, where the sidebar is a drawer); the sidebar entry is the persistent one. Both read the same `isOfficer(user)`.

### 2.4 Officer edge cases (each gets a test)
| Situation | Behaviour |
|---|---|
| Officer is deactivated while in student view | Entry stays until next sync; clicking it admits via `ProtectedRoute` (store still says officer), then `useOfficershipSync` bounces them with the "officer access has ended" toast (existing behaviour). **Improvement:** also run the sync on Overview mount and tab focus so the entry disappears without a click. |
| Student is *newly* made officer | Today the store learns only at next login/refresh, because the sync runs only when `isOfficerWorkspace` is already true **[verified: useOfficershipSync(enabled)]**. **Fix:** run one `/auth/me` refresh on Overview mount for every participant (also loads `participantTypes`). |
| Owner organizer suspended | `attachOfficership` returns null → entry vanishes on next `/auth/me`. |
| Officer logs in with an active event | Login redirect (`getVoterLoginRedirect`) opens the ballot/poll/scoring page as today, now showing the collapsed rail with the workspace icon. No automatic landing in the organizer workspace (Q2). |
| Officer is also enrolled as a **voter in their own organization's election** | They vote like any student (server unchanged). Recommended: show a small "Your organization runs this" tag on the event card so the conflict of interest is visible, **not** blocked (Q3). |
| Officer on mobile | Sidebar is the existing hamburger drawer; the Overview card is the quick path. |
| Notifications bell | Always the signed-in student's own. **[verify]** that `/notifications` is not routed through `resolveOrganizerContext` so officer actions never show the owner's notifications in either view. |

---

## 3. Navigation, routes, layout

### 3.1 Routes (all `ProtectedRoute allowedRoles=[PARTICIPANT]`)
| Item | Path | Page |
|---|---|---|
| Overview | `/participant` | slim `VoterDashboardPage` → `ParticipantOverviewPage` |
| My Events | `/participant/my-events` | new |
| History | `/participant/history` | new |
| Results | `/participant/results` | new |
| Task pages (unchanged paths) | `/participant/events/:eventId`, `/participant/polling/events/:eventId`, `/participant/competition/events/:eventId/score` | collapsed rail |

`/voter/*` → `LegacyParticipantRedirect` stays (emailed links in `backend/src/utils/urls.js` use `/voter/...`).

### 3.2 Layout mechanics
- `DashboardLayout`: build a participant branch (`isParticipantRole(role)`): the four items under section "Workspace", plus the officer block that **already exists** (L70-76) with label changed to show organization + position. Pass `showSidebar` true by default for participants; task routes pass a new prop (`railOnly`) instead of `showSidebar={false}`.
- `AppShell`:
  - Collapse logic uses `isFocusPath(pathname)` which keys on the **last URL segment** in `{analytics, live, rankings}` **[verified]**. Participant task pages end in an id or `score`, so add a participant-path rule (`/participant/events/:id`, `/participant/polling/events/:id`, `/participant/competition/events/:id/score`).
  - Header: participants currently get the "wordmark / title" header because `showSidebar` is false. With a sidebar the standard header (title + hamburger) applies; the logo moves into the sidebar. (Q5.)
  - `ROLE_LABELS`: add `participant` → "Student" / "Judge" / "Participant" from `participantTypes`; officer in student view → "Student · Officer".
  - The collapsed/expanded preference key `votrix.sidebar.collapsed` is **shared** with the organizer workspace; an officer collapsing the student sidebar also collapses the organizer one. Acceptable, noted.
- Active-state rules: Overview exact match; My Events also active for `/participant/events/*`, `/participant/polling/events/*`, `/participant/competition/events/*` (the event you came from); History/Results exact.
- `showSearch` stays off for participants.

---

## 4. Backend

### 4.1 `/auth/me` and sign-in responses
- Generalize `attachOfficership` into `attachParticipantContext(userDto)` returning `{ officership, participantTypes }` where `participantTypes` = active `user_participant_types` rows (e.g. `['STUDENT','JUDGE']`). Reuse in every place that already attaches officership (login, refresh, change-password, `/auth/me`). One extra indexed query per participant auth response; failure → `participantTypes: []` (UI falls back to deriving from events).
- Purely cosmetic/UX: **no authorization decision uses `participantTypes`**. Access stays enforced per event enrollment.

### 4.2 Participant endpoints (new, under `voter.routes.js`; the router already applies `authenticate, authorize(PARTICIPANT), requireActiveAccount, requirePasswordChanged`)
| Endpoint | Returns | Notes |
|---|---|---|
| `GET /participant/events?bucket=active\|assigned\|completed&type=election\|polling\|competition_scoring&search=&page=&limit=` | paginated classified events | Reuses `classifyElection/Poll/Competition`; adds pagination + filters. |
| `GET /participant/history?page=&limit=` | completed items + `completedAt`, what the user did (ballot cast / response recorded / scores submitted) | **[verify]** whether `event_participants` stores timestamps for voted/scored/responded; if not, sort by event end date and say so in UI. |
| `GET /participant/results?page=` | list of events the caller may see results for | Elections: `canVoterViewElectionResults`. Competitions: published results for events where the caller is an enrolled judge. Polls: **omitted in v1**. Each item carries `resultPath`; **no result bodies in the list**. |
| `GET /participant/election/events/:id/results` | detail | already exists (`getVoterElectionResults`), fetched on demand. |

- `getVoterDashboard` currently fetches election results for every viewable election **sequentially** inside the overview call **[verified: voter.service.js L187-199]**. Move that out (Results page fetches detail on demand) and drop the "Election Results" block from the Overview. Keep `GET /participant/overview` response shape stable for `getVoterLoginRedirect` and old clients; only the `results` field per event becomes absent after the frontend switches.
- Authorization: every item is derived from the caller's own enrollments (`user_id = req.user.id`); never accept a user id from the client. Tests: user A cannot see user B's history/results; hidden-visibility elections never listed; unpublished competitions never listed.

### 4.3 Not touched
- `organization_officers`, `resolveOrganizerContext`, `/organizer/*` API, WebSocket auth, audit attribution: **no change**. Part 3 is read-only with respect to officer data.

---

## 5. Frontend work list
- New: `ParticipantEventsPage`, `ParticipantHistoryPage`, `ParticipantResultsPage`, `ParticipantOverviewPage` (rename/slim of `VoterDashboardPage`), `useParticipantSync` (one `/auth/me` on mount + focus; updates `auth.store` `officership` and `participantTypes`).
- Extract `EventSection`/table from `VoterDashboardPage.jsx` into `components/voter/EventList.jsx` so Overview and My Events share it.
- `voter.service.js`: add `getEvents`, `getHistory`, `getResults`.
- `workspace.js`: add `getParticipantTypes(user)`, `isJudgeOnly(user)`, `hasType(user, t)`.
- `routes/index.jsx`: add three routes; switch task routes to `railOnly`.
- `DashboardLayout.jsx`, `AppShell.jsx`: per §3.2.
- Keep `OfficerWorkspaceCard` on Overview; `OfficerBanner` and organizer layouts untouched.
- Student-type theming: existing `data-module` per event type (`VoterEventCard`) stays.

---

## 6. Phases (each independently shippable)

| Phase | Scope | Acceptance |
|---|---|---|
| **3A Shell** | Participant nav in `DashboardLayout`; sidebar on `/participant`; rail on task pages; `ROLE_LABELS`; participant focus-path rule; officer block activated; links point to routes that exist (new pages can be placeholders redirecting to Overview). | Plain student sees 4 items; officer also sees "Organizer workspace"; organizer/admin layouts byte-for-byte unchanged in tests. |
| **3B Identity data** | `attachParticipantContext`; `participantTypes` in auth responses and store; `useParticipantSync` on Overview. | Judge-only account chip says "Judge"; newly assigned officer sees the entry without re-login; deactivated officer's entry disappears on focus. |
| **3C Pages from existing data** | My Events + Overview slim + History using `/participant/overview` client-side filtering (no new endpoints). | Same data as today, now split across pages. |
| **3D Endpoints** | `/participant/events`, `/history`, `/results`; remove election-results loop from overview; switch pages to them. | Pagination works; overview payload smaller; authorization tests pass. |
| **3E Results** | Results page: election cards (on-demand detail) + published competition results for judges. | Hidden/real-time/public rules respected; judge sees only their own events' published results. |
| **3F (optional, later)** | Poll results visibility setting on the organizer side + participant exposure. | Out of v1. |

Suggested PRs: **3A+3B**, **3C**, **3D+3E**.

---

## 7. Tests
- `DashboardLayout` participant matrix: cases A-C from §1 (student, judge, student officer: nav items, officer block, no organizer-only links, no banner on student pages).
- Existing `DashboardLayout.officer.test.jsx` (student pages block) must still pass; update to render with the participant branch.
- `AppShell`: rail on each task path; preference persisted only on list pages; chip labels.
- `ProtectedRoute.officer.test.jsx` unchanged and green (officer admission untouched).
- Sync hook: newly assigned / deactivated officer on Overview.
- Backend: `attachParticipantContext` (student, judge, none, DB failure → `[]`), endpoints' ownership/visibility rules, regression for `getVoterLoginRedirect`.
- Manual QA: the 3 account cases (student, judge, student officer) × desktop/mobile; officer round-trip student ⇄ organizer; deactivate while in each view.

---

## 8. Remaining decisions (recommendation first)
1. **Q1 Poll results:** omit from v1 Results (polls have no visibility setting); History still shows "Response recorded". Add an organizer-side setting only if you want it (3F).
2. **Q2 Officer landing:** always land in the student view after login (as today). No "remember last workspace".
3. **Q3 Officer voting in own org's election:** allowed; show an "Your organization runs this" tag. No blocking.
4. **Q4 Duplicate entries:** keep both the Overview card and the sidebar entry.
5. **Q5 Participant header:** use the standard header with the sidebar (logo moves to sidebar) rather than keeping the wordmark header.
6. **Q6 Judge History:** "Scores submitted" with the round/competition name; no per-contestant score detail.

## 9. Risks
- Wrong/empty lists if migrations 135-137 are not applied (precondition).
- Officer link visible for up to a sync interval after deactivation (cosmetic; server blocks).
- Shared collapsed-sidebar preference between workspaces (cosmetic).
- Results leakage when adding list endpoints (mitigated by deriving from the caller's enrollments and the existing visibility helpers + tests).
- Overview changes could affect login redirect (`getVoterDashboard` shared): keep response shape and add a regression test.

---

## 10. Page-by-page contents (added after discussing History and Results)

Principle: **one question per page.**

| Page | Question it answers | Contains | Never contains |
|---|---|---|---|
| Overview | What needs me right now? | Stat tiles (needs you now, coming up, results ready); "Needs your action" (active events with a CTA); next upcoming event; "New results" teaser; officer card if officer | Full lists, completed events, result bodies |
| My events | What can I act on? | Active and upcoming events only; status chips (All, Active, Upcoming); type chips (shown only if the account has more than one type); search; event cards with organization, deadline, CTA | Completed events (moved to History) |
| History | What have I done? | Table: event + type, organization, **what you did** (Ballot submitted / Response recorded / Scores submitted / Missed), detail (e.g. "3 of 3 sections", "Final round, 12 contestants"), **when**, link to Results if any; filters: type, date range, search; click a row for a read-only **participation receipt** | What you voted for, poll answers, other judges' scores |
| Results | What was the outcome I may see? | Election results (per position bars, turnout, "Final" or "Live" badge), only for positions you were eligible for; "Not yet" rows for results that appear later; competition official standings (rank, entry, contestant, final score, published date and version) for judges; withdrawn notice if an organizer withdraws a publication | Hidden elections, unpublished competitions, polls (v1), other judges' worksheets |

### 10.1 History page (detailed)

**Layout, top to bottom:** header with *Export CSV* -> summary tiles -> filter bar -> grouped list (or table) -> inline receipt.

**A. Summary tiles (for the filtered range)**
| Student / officer | Judge |
|---|---|
| Took part: "4 of 5" and the percentage of *closed* events you were enrolled in | Events judged ("2 of 3 assigned") |
| Ballots (with a "1 partial" hint) | Rounds submitted |
| Polls | Contestants scored |
| Missed (enrolled, not submitted) | Missed (round closed before submit) |

**B. Filters:** type chips (students only: All / Elections / Polls; a judge has one type so none), outcome chips (All / Took part / Missed), date range (Last 12 months default, This year, All time), search by event or organization, view toggle **Timeline** (grouped by month, expandable rows) or **Table** (flat, sortable). State is kept in the URL (`?type=&outcome=&range=&q=&view=`) so a filtered view can be shared or bookmarked.

**C. Outcomes (one badge per row)**
| Outcome | Meaning |
|---|---|
| Submitted | You completed everything you were enrolled for |
| Partial | Election only: some ballot sections submitted before it closed (e.g. 2 of 3) |
| Missed | Enrolled, the event closed, nothing submitted |
Rows also show the one-line summary ("3 of 3 sections submitted", "2 rounds submitted, 27 contestants scored") and the time you finished (or "Closed <date>" for missed).

**D. Participation receipt (opens under the row)**
- Common block: event, organization, **your role** (Student, or Judge / Head judge from `judge_role`), event window and final status, outcome and summary, a plain-language reason for Partial and Missed.
- **Election:** table of ballot sections: section name, submitted time, status. Never selections.
- **Poll:** number of responses recorded (more than one only if the poll allows resubmission) and a privacy line ("Anonymous poll: your answers are not linked to you").
- **Competition:** table of rounds: round, submitted time, contestants scored, status. Plus a link to your own read-only scoresheet.
- Footer line: "Your selections are never shown in History" (students) or "Other judges' scores are never shown" (judges).
- Actions: **View event**, **View results** (only when results exist for you; shows the publication status), **Open scoresheet** (judges), **Print receipt** (browser print stylesheet, no new endpoint).

**E. Other states**
- **Empty:** "No matching history" with a hint to clear filters; a brand-new account sees "Take part in an event and it will show up here".
- **Loading:** skeleton rows; **error:** retry button; **pagination:** "Load more" (20 per page).
- **Mobile:** each row becomes a card (title, badge, summary, time); the receipt expands under the card; the summary tiles become a 2 x 2 grid.
- **Realtime:** a new submission appears without refresh via the existing `useCompetitionSync` / socket events used by the overview.

**F. What is *not* in History**
Archived events, events you were not enrolled in, upcoming and in-progress events (those are in My events), the organization's own events for an officer (those are in the organizer workspace), and anything that would reveal how you voted or answered.

**G. Data per row (what the API returns)**
`id, eventId, eventType, title, organizationName, role, outcome, summary, completedAt (or closedAt for missed), window {start,end}, eventStatus, resultsStatus {state, publishedAt, path}, receipt {kind, rows[]}, scoresheetPath?`. `receipt.rows` is built per type: election = ballot sections, poll = response count + anonymity flag, competition = rounds with contestant counts.

**H. Data sources and what still needs verifying**
- Elections: `election_ballot_submissions` (per-section `submitted_at`); `submittedSections` / `totalSections` already exist in the dashboard classification. **[verify]** the table links a submission to the *participant*, not only to the event.
- Polls: `poll_submissions.completed_at`. **[verify]** that anonymous polls still keep the voter link needed to read the caller's own submission time without exposing answers.
- Competitions: `competition_round_submissions` (`submitted_at`, `status = 'submitted'`, `round_id`). **[verify]** where "contestants scored" is counted (worksheet or score rows).
- `event_participants` only has the booleans `has_voted`, `has_scored`, `has_responded` (no timestamps), so every date above needs a join. When a timestamp is missing, the row falls back to the event end date and says "Event ended".
- Sorted newest first by `completedAt`, falling back to the event end date; paginated.

### 10.2 Results rules
- **Elections:** `canVoterViewElectionResults` decides (hidden, real_time, public-after-close) and the existing per-position eligibility filter applies. Result bodies are fetched **on demand** (one election at a time), not in the list.
- **Competitions (judges):** only the **official published snapshot** for events where the caller is an enrolled judge, using the existing published-results data (`competition_child_public_results` / `workflowService.getPublishedResults`). If an organizer withdraws a publication, show "Results withdrawn", not stale standings. **[verify]** that withdrawn publications are excluded server-side.
- **Polls:** not in v1 (no results visibility setting exists). They appear in History as "Response recorded". (Decision R1.)
- **Students and competitions:** students are not enrolled in competitions, so they see no competition results in v1. (Decision R2.)
- **Pending:** an enrolled election whose results will appear later (public visibility, not closed) is listed as "Not yet" with the date it closes, so students are not left guessing. Hidden elections are not listed at all.

### 10.3 Per account type (what each person sees)
| Account | My events | History | Results |
|---|---|---|---|
| Student | elections, polls | ballots, poll responses, missed | election results |
| Judge | competitions | scores submitted | published competition standings |
| Student officer | same as student | same as student (their own participation only, not the organization's events) | same as student |

### 10.4 Data flow
New participant endpoints read only the caller's own rows and combine three modules: elections (ballot time, results rules), competitions (round submission, publication), polls (submission time). They feed History (`GET /participant/history`) and Results (`GET /participant/results`, detail on demand).

### 10.5 New decisions to confirm
| # | Question | Recommendation |
|---|---|---|
| H1 | Show "Missed" rows in History? | Yes, muted, with a filter to hide them. |
| H2 | Show a judge a link to their own submitted scoresheet? | Yes (read-only). Never show voters their selections. |
| H3 | History range default | Last 12 months, with "All time" in the filter. |
| H4 | Export CSV of your own history | Yes (client-side from the loaded rows; no new endpoint). |
| H5 | "Partial" outcome for elections with several ballot sections | Yes. |
| H6 | Timeline and Table views | Both; Timeline is the default. |
| R1 | Polls in Results | No in v1. Add an organizer setting later if wanted. |
| R2 | Students seeing competition results | No in v1. |
| R3 | Show "Not yet" rows for elections whose results appear later | Yes. |
| R4 | Live (real_time) election results | Show with a "Live" badge and "Provisional" label until close. |
