# Plan: Admin-Owned Organizer Registration + Organizer Scoping

> **Status:** ✅ IMPLEMENTED — Phases A–F complete. Requires migration **076** to be applied (adds `users.scope`). Organizer scope is shown read-only in the organizer's ProfileCard (opened from the header avatar).
> **Date:** 2026-09-27
> **Builds on:** VOTER_PROFILE_AND_ADMIN_REGISTRATION_PLAN.md (Phases 1–9, already implemented). Same conventions: no new tables where a column/JSONB does, migrations continue from **076**.

---

## 0. Locked Decisions

| # | Decision | Choice |
|---|---|---|
| O1 | Who creates organizer accounts | **Admin** — manual add **and** CSV upload (mirrors voter registration). No self-service. |
| O2 | Organizer onboarding | **Removed entirely.** Admin fills the full profile at registration, so nothing is left to complete. |
| O3 | Scope granularity | **Program + Year & Section**, chosen from the managed taxonomy (voter Phase 2). |
| O4 | Multiple programs per organizer | **Yes.** |
| O5 | All-access organizers | **Yes** — an organizer can be unrestricted (`scopeType: "all"`), for small orgs or a super-organizer. |
| O6 | Isolation model | **Picture A** — one shared student pool; scope is a *permission filter*, not tenant isolation. Not multi-tenant. |
| O7 | Judge scoping | **(b) Admin assigns judges to organizers.** An organizer's judge pool shows only judges the admin assigned to them. |
| O8 | Existing organizers | **Default to all-access** on rollout (nothing breaks; admin narrows later). |
| O9 | Scope-bounded visibility | Scope limits **the cohort picker, the enrolled list, analytics, and the dashboard.** A BSCS-scoped organizer only ever sees BSCS voters, everywhere. |
| O10 | Sign-in | **Unchanged** — email + temporary password, forced change on first login. |

---

## 1. Goal (plain terms)

Register organizers the same way we now register voters — the **admin** creates the account with a complete profile (and their **scope**), so the organizer just logs in, changes their password, and starts working; **no onboarding step**.

An organizer's **scope** is the set of programs and year & sections they're allowed to handle. It bounds everything they see and do with voters: the cohort picker, enrolled lists, analytics, and dashboards all show **only** voters inside their scope. Judges are handled separately — the admin assigns specific judges to specific organizers.

---

## 2. Current State (verified earlier)

- **Admin creates an organizer** (email + temp password) via `CreateOrganizerModal` → `createOrganizer` (`user.service`/`admin.service`), route `POST /admin/organizers`. Credential email: `sendOrganizerInvitationEmail` (already includes temp password).
- **Onboarding:** organizer logs in and must complete a profile before the dashboard — `/organizer/onboarding` page, gated by `ProtectedRoute`. Fields (migrations 028/031): `organization_name`, `organizer_name`, `position`, `organization_type_display` on `users`. Each organizer owns **one organization**.
- **Voters:** single global pool, `profile_type='student'`, with `program` + `year_section` (admin taxonomy). Organizers invite **by cohort** (`cohort.service` — `getEventCohorts`, `inviteCohort`) and pick judges from the pool (`competition.service` — `getJudgePool`, `pickJudges`). None of this is scope-filtered yet.
- **Judges:** global pool, `profile_type='judge'`, extras in `profile_data`. Any organizer can currently pick any judge.
- Latest migration: **075** → new work starts at **076**.

---

## 3. Target Data Model (no new tables)

### 3.1 Organizer scope — new `scope` JSONB column on `users`
```
scope = {
  scopeType: "all" | "scoped",
  programs:  ["BSCS", "BSIT"],   // used when scopeType = "scoped"
  sections:  ["3-A", "3-B"]      // optional finer limit; empty = all sections of the scoped programs
}
```
- `scopeType: "all"` → unrestricted (default for existing organizers, O8).
- `scopeType: "scoped"` → limited to the listed programs, optionally narrowed to listed sections.
- Nullable; only meaningful for `role = 'organizer'`.

### 3.2 Judge → organizer assignment — reuse the judge's `profile_data`
```
profile_data = { title, affiliation, expertise, organizerIds: [<organizerUserId>, ...] }
```
- Admin sets `organizerIds` when registering/editing a judge (Judges tab).
- An organizer's judge pool = judges whose `organizerIds` contains that organizer's id.
- Many-to-many (a judge can serve several organizers) without a join table.

### 3.3 Organizer profile fields (already exist)
`organization_name`, `organizer_name`, `position`, `organization_type_display` stay as the organizer profile — the admin now fills them at registration instead of the organizer at onboarding.

### 3.4 Migration `076_organizer_scope.sql` (+down)
- Add `scope JSONB` to `users`.
- Backfill: `UPDATE users SET scope = '{"scopeType":"all","programs":[],"sections":[]}' WHERE role='organizer' AND scope IS NULL` (O8).
- `sanitizeUser` exposes `scope`.

---

## 4. Cross-cutting: how scope is enforced (O9)

A single helper resolves an organizer's scope into a reusable filter, applied everywhere voters are read for that organizer:

- **Cohort picker** (`getEventCohorts`) — return only scoped programs/sections.
- **invite-cohort** (`inviteCohort`) — reject any value outside scope (server-side guard, not just UI).
- **Enrolled list** (`listEventVoters` / `listEventRespondents`) — filter rows to scoped voters.
- **Analytics / dashboard** (election/polling analytics + organizer dashboard/report services) — count only scoped voters.
- `scopeType: "all"` short-circuits every filter (sees everything).

**Judges** ignore program/section scope (they have none); their pool is filtered by the O7 assignment instead (`profile_data.organizerIds`).

---

## 5. Implementation — Phase by Phase

### ✅ Phase A — Data model (migration + core, no behavior change)
- Migration `076_organizer_scope.sql` (+down): `scope` column, backfill all organizers to `all`, `sanitizeUser` exposes it.
- Add a `resolveOrganizerScope(organizerId)` helper (returns `{ scopeType, programs, sections }`).
- **Acceptance:** migration up/down clean; existing organizers behave exactly as today (all-access).

### ✅ Phase B — Admin: organizer registration (manual + CSV) + scope UI
- Backend: extend admin endpoints — `POST /admin/organizers` accepts the full profile **+ scope**; add `POST /admin/organizers/import-preview` + `import-register` (CSV) and `GET /admin/organizers/template`; `PATCH /admin/organizers/:id` to edit profile + scope.
- CSV columns (draft): `email, first name, last name, position, organization name, organization type, scope type, programs, year & sections`. Programs/sections validated against the taxonomy; `scope type = all` ignores them.
- Frontend: rework the **Organizers tab** in User Management — replace the "create + they onboard" modal with a full registration form (profile + scope picker from taxonomy) and a CSV import (preview → register), mirroring the Voters tab. Add an **Edit scope** action.
- **Acceptance:** admin registers an organizer with a scope; organizer needs no onboarding; scope persists; CSV import validates programs/sections.

### ✅ Phase C — Remove organizer onboarding
- Remove the `/organizer/onboarding` route + page and the `ProtectedRoute` profile-completion gate.
- Login → forced password change → dashboard (like voters).
- Show the organizer's profile + scope read-only (header account dropdown, reusing the voter pattern).
- **Acceptance:** a newly registered organizer lands straight on the dashboard; no onboarding prompt anywhere.

### ✅ Phase D — Enforce scope for voters (picker + invite + lists + analytics + dashboard)
- Apply `resolveOrganizerScope` across `cohort.service` (picker + invite guard), `election.service`/`polling.service` enrolled lists, and the analytics/dashboard/report services.
- **Acceptance:** a BSCS-scoped organizer sees only BSCS programs in the picker, can't invite others (even via a crafted request), and sees only BSCS voters in enrolled lists, analytics, and dashboard. An all-access organizer sees everything.

### ✅ Phase E — Judge assignment (O7)
- Admin: in the Judges tab, add an **"Assign to organizers"** control (multi-select) writing `profile_data.organizerIds`; support it in the judge CSV too (a column of organizer emails/ids).
- Organizer: `getJudgePool` returns only judges assigned to that organizer.
- **Acceptance:** an organizer sees only judges the admin assigned to them; picking/scoring flow otherwise unchanged.

### ✅ Phase F — Backfill, tests, cleanup
- Existing organizers already defaulted to all-access (Phase A). Confirm dashboards/analytics unchanged for them.
- Update seeds/fixtures/tests; remove any dead onboarding code.
- **Acceptance:** suite green; no references to the removed onboarding flow.

---

## 6. Files likely to change (indicative)

**Backend:** `migrations/076_organizer_scope.sql`(+down); `utils/userMapper.js` (expose scope); `services/admin-participant.service.js` or a new `admin-organizer.service.js` (organizer CRUD + CSV + scope, judge assignment); `services/user.service.js` (createOrganizer takes profile+scope); `controllers/admin.controller.js` + `routes/admin.routes.js` (organizer endpoints); `services/cohort.service.js` (scope filter + guard); `services/election.service.js` / `polling.service.js` (scoped enrolled lists); analytics/`dashboard.service.js`/`reports.service.js` (scoped counts); `services/competition.service.js` (`getJudgePool` filtered by assignment); `middleware`/`ProtectedRoute` equivalent for onboarding removal.

**Frontend:** `pages/admin/UserManagementPage.jsx` + Organizers panel (new registration form, CSV import, scope + judge-assignment UI); `services/admin.service.js` (organizer methods); remove `pages/**/OrganizerOnboardingPage` + route + gate in `routes/index.jsx`/`ProtectedRoute.jsx`; `components/organizer/CohortInviteManager.jsx` (already scope-agnostic — driven by server); header dropdown to show organizer scope.

---

## 7. Open Questions / Risks

1. **Enrolled list semantics:** confirmed as scope-bounded (shows scoped voters). Because cohort-invite enrolls the whole cohort, an organizer's enrolled list ≈ their scoped population once they invite. If you want the list to show *all* scoped voters even *before* inviting, that's a small variant — flag it and I'll adjust.
2. **Scope vs. section-only:** if `programs` empty but `sections` set, treat as "any program, these sections"? (Recommend: require at least a program when `scopeType='scoped'`, sections optional.)
3. **Judge CSV assignment:** identify organizers by **email** in the judge CSV (more human-friendly than ids)?
4. **Editing scope after events exist:** narrowing an organizer's scope doesn't un-enroll voters already invited — it only limits *future* actions and *views*. Confirm that's acceptable (recommended) vs. retroactively hiding already-enrolled out-of-scope voters.
5. **Multi-org organizers:** current model is one organization per organizer; scope is per organizer. Unchanged here.

---

## 8. Testing & Verification (high level)

1. Admin registers an organizer (manual) with scope = BSCS → organizer logs in → **no onboarding** → dashboard.
2. Admin CSV-imports organizers; bad program/section rejected; all-access import works.
3. BSCS-scoped organizer: picker shows only BSCS; invite of a non-BSCS program via raw request is rejected; enrolled list/analytics/dashboard show only BSCS voters.
4. All-access organizer sees every program (regression).
5. Admin assigns judges to organizer X; organizer X sees only those judges; organizer Y sees none of them.
6. Existing (pre-change) organizers default to all-access and behave exactly as before.

---

## 9. Rollback
- Phases are additive/independently revertible; migration 076 has a down (drops `scope`).
- Onboarding removal is the only lossy UI step — keep the profile columns (used as the organizer profile), so a revert only re-enables the onboarding gate.
