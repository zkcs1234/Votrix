# Plan: Admin-Owned Participant Registration + Profiles + Cohort/Judge Invitations

> **Status:** ✅ IMPLEMENTED — Phases 1–9 complete (migration 075 applied). Participant profile shown in the header account dropdown (§6.5). Remaining follow-up: full `voting_nonce` ballot anonymization (separate mini-plan, D12 tail).
> **Date:** 2026-09-25 (rev 3 — decisions locked)
> **Scope:** All three participant types — Election Voters, Polling Respondents, and Competition Judges.

---

## 0. Locked Decisions (the source of truth for this plan)

| # | Decision | Choice |
|---|---|---|
| D1 | Who creates participant accounts | **Admin** (not organizers), via CSV/Excel **and** a manual single-add form |
| D2 | Organizer's job for voters/respondents | **Invite by cohort** — pick a Program or a Year & Section |
| D3 | Organizer's job for judges | **Pick/select judges** from the registered judge pool |
| D4 | Judge profile model | **Fixed** judge schema (NOT arbitrary/dynamic columns), stored globally on `users` |
| D5 | Profile storage | New **columns on `users`** + `profile_data jsonb`. **No new tables.** |
| D6 | Role discriminator | `profile_type` on `users`: `'student'` or `'judge'` |
| D7 | Multi-role rule | A **student** can be ELECTION_VOTER and/or POLLING_RESPONDENT. A **judge** can only be COMPETITION_JUDGE. The two pools never overlap. |
| D8 | Information form | **Removed** from all three modules (election, competition, polling) |
| D9 | Voter post-login flow | Login → **forced** temp-password change (no skip) → dashboard. **No form gate.** |
| D10 | Participant types | **Unchanged** — still assigned per-event on `event_participants` |
| D11 | Emails | Two emails: **A) account provisioning** (admin, at registration) and **B) event invitation** (organizer, optional + throttled) |
| D12 | **Vote anonymity (#1 → Option A)** | **Contain now:** never expose the voter↔ballot link in any UI/report/export; restrict to admin/DB only; audit access. **Full anonymization via `voting_nonce` is a tracked follow-up, NOT in this plan.** |
| D13 | **Program/Section quality (#3 → Option A)** | **Managed lists:** admin defines valid Programs & Sections in `system_settings` (JSON, no new table). Imports validate against them; the cohort picker reads from them. |
| D14 | Admin nav | "Organizer Management" → **"User Management"** |
| D15 | Sign-in | **Unchanged** for everyone: email + temporary password |

---

## 1. Goal (plain terms)

Move participant creation from organizers to the **admin**, give every participant a real
**profile**, delete the per-event **information form** in all three modules, and shrink the
organizer's job to **inviting** existing people:

- **Students** (election voters + polling respondents) share one fixed profile: email, school ID, first name, last name, program, year & section. Organizers invite them **by cohort**.
- **Judges** have their own fixed profile (email, name, title, affiliation, expertise). Organizers **pick** them from the pool.
- **Sign-in is unchanged**; the only new first-login behavior is a forced password change with **no info form after it**.

---

## 2. Current State (verified in code)

- **`users`** ([DATABASE_SCHEMA_CURRENT.md](DATABASE_SCHEMA_CURRENT.md) §2): `id, email, password, role (admin|organizer|voter), image_asset_id`. **No** name/program/section/school_id. Users are a **single global pool** (no organization scoping).
- **`event_participants`**: canonical enrollment, keyed by `participant_type` (`ELECTION_VOTER | COMPETITION_JUDGE | POLLING_RESPONDENT`); has `metadata` JSONB (currently holds info-form answers), `voting_nonce`, `display_name`/`judge_role` (judges).
- **Information form:** `events.information_form_schema` (JSONB) + builder + voter gate:
  - [ParticipantInformationFormBuilder.jsx](frontend/src/components/organizer/ParticipantInformationFormBuilder.jsx), [ParticipantInformationGate.jsx](frontend/src/components/voter/ParticipantInformationGate.jsx), [ParticipantInformationForm.jsx](frontend/src/components/voter/ParticipantInformationForm.jsx)
  - Save path: [voter.controller.js:59](backend/src/controllers/voter.controller.js) `updateMyParticipantInformation` → `event_participants.metadata`.
- **Organizer voter register/CSV (to be removed):** [csv-import.service.js](backend/src/services/csv-import.service.js) (email-only), [invitation.service.js](backend/src/services/invitation.service.js), routes [election-organizer.routes.js:40-45](backend/src/routes/election-organizer.routes.js), [polling-organizer.routes.js:44-49](backend/src/routes/polling-organizer.routes.js), pages [ElectionVotersPage.jsx](frontend/src/pages/organizer/election/ElectionVotersPage.jsx), [PollingRespondentsPage.jsx](frontend/src/pages/organizer/polling/PollingRespondentsPage.jsx).
- **Organizer judge register/CSV (to be removed):** [pageant-csv.service.js:35](backend/src/services/pageant-csv.service.js) (email-only), [pageant.service.js](backend/src/services/pageant.service.js) (`inviteJudge`, `registerJudge`), routes [competition-organizer.routes.js:47-49](backend/src/routes/competition-organizer.routes.js), page [CompetitionJudgesPage.jsx](frontend/src/pages/organizer/competition/CompetitionJudgesPage.jsx).
- **Admin manages organizers only:** [admin.routes.js](backend/src/routes/admin.routes.js) (`/organizers*`), [OrganizerManagementPage.jsx](frontend/src/pages/admin/OrganizerManagementPage.jsx), nav [DashboardLayout.jsx:32](frontend/src/layouts/DashboardLayout.jsx).
- **Vote identity:** `election_votes.voter_id` and `poll_answers.voter_id` point at `users` (DATABASE_SCHEMA_CURRENT.md §5/§7) → the anonymity concern D12 addresses.
- **Latest migration:** `074_*` → new migrations begin at **075**.

---

## 3. Target Data Model (no new tables — D5)

### 3.1 New columns on `users`
| Column | Type | Applies to | Notes |
|---|---|---|---|
| `profile_type` | `varchar` / enum-like | all voter accounts | `'student'` or `'judge'` (D6). Discriminates the two pools. |
| `first_name` | `varchar` | student + judge | |
| `last_name` | `varchar` | student + judge | |
| `school_id` | `varchar` | student | Partial-unique among students. Dedup key. |
| `program` | `varchar` | student | Validated against managed list (D13). |
| `year_section` | `varchar` | student | Validated against managed list (D13). |
| `profile_data` | `jsonb` | judge (+ future extras) | Judge fields: `{ title, affiliation, expertise }`. Absorbs future optional fields without new migrations. |

- All columns **nullable** so existing organizer/admin rows are untouched.
- **Partial unique index:** `lower(school_id)` where `profile_type = 'student' AND school_id IS NOT NULL`.
- **Cohort indexes:** on `(profile_type, program)` and `(profile_type, year_section)` for fast cohort queries.
- `sanitizeUser` exposes the profile fields (never the password).

### 3.2 `event_participants`
- No schema change. `participant_type` still assigned at invite time (D10).
- Stop writing info-form answers into `metadata`. Optionally stamp `metadata.enrolled_via = { cohortType, cohortValue }` for auditing.

### 3.3 `events.information_form_schema`
- Becomes dead in all three modules. **Do not drop** (keeps rollback cheap); simply stop reading/writing it. Optional cleanup migration later.

### 3.4 Managed lists (D13) — stored in `system_settings` (existing table)
- Key e.g. `participant_taxonomy` → `{ programs: ["BSIT","BSCS",...], sections: ["1-A","1-B",...] }`.
- Admin CRUD via new settings endpoints. Voter CSV import **validates** program/year_section against these; unknown values → row error. Cohort picker reads these lists.

### 3.5 Judge fixed profile (D4) — the two CSV templates
- **Voter/respondent template (fixed):** `email, school id, last name, first name, program, year & section`.
- **Judge template (fixed):** `email, last name, first name, title, affiliation, expertise` (expertise optional).
- No arbitrary/dynamic columns. Unknown columns are ignored with a warning.

---

## 4. Cross-cutting Designs

### 4.1 Emails (D11)
- **Email A — Account provisioning** (admin registration, per new account, once): "Your account was created," temp password, login link. Reuses/extends [email.service.js](backend/src/services/email.service.js) + templates.
- **Email B — Event invitation** (organizer invite): "You've been invited to *[Event]*," link, **no credentials**. **Optional** (organizer toggles "notify") and **throttled** (existing `emailLimiter`); enrollment succeeds even if some emails fail (report partial failures).

### 4.2 Vote anonymity containment (D12 — Option A)
- **In scope now:** no screen, report, or export may join `voter_id` to a ballot (`election_votes`, `poll_answers`, `poll_submissions`). Audit-log any admin access to identity↔vote data. Organizers see participation status (`has_voted`) but never ballot content tied to a name.
- **Follow-up (separate mini-plan, referenced but NOT built here):** rewrite `cast_election_ballot` and poll write paths to store ballots against `event_participants.voting_nonce` instead of `voter_id`, breaking the link at the data layer.

### 4.3 Multi-role guard (D7)
- Enrollment guard: `profile_type='student'` → only ELECTION_VOTER / POLLING_RESPONDENT; `profile_type='judge'` → only COMPETITION_JUDGE. Violations rejected with a clear 400. Email uniqueness keeps pools disjoint.

### 4.4 Authorization
- New admin endpoints: admin-only. Organizer register/CSV/send-invitation routes: **removed + guarded** (return 404/410), not just hidden in UI.

---

## 5. Implementation — Phase by Phase

> Each phase is independently shippable and testable. Do them in order; a feature flag (`ADMIN_PARTICIPANT_REGISTRATION`) gates the UI switch so data work can land before behavior changes.

### ✅ Phase 0 — Prerequisites & decisions (no code)
- Confirm the follow-up anonymization mini-plan is filed (D12 tail).
- Confirm initial Programs/Sections seed values with the school.
- **Exit:** this doc approved; taxonomy seed ready.

### ✅ Phase 1 — Data model & taxonomy (DB + core, no behavior change)
**Backend/DB**
- Migration `075_participant_profiles.sql` (+down): add §3.1 columns, indexes, and backfill `profile_type='student'` for existing `role='voter'` rows.
- Seed `participant_taxonomy` into `system_settings`.
- Extend `sanitizeUser` and user model to carry profile fields.
**Acceptance:** migration up/down clean on a copy; existing app behavior unchanged; profile fields returned (blank) in user payloads.

### ✅ Phase 2 — Admin: taxonomy management
**Backend:** `GET/PUT /admin/settings/taxonomy` (programs & sections CRUD).
**Frontend:** a Taxonomy panel in admin System Settings (add/edit/remove programs & sections).
**Acceptance:** admin can define programs/sections; values persist in `system_settings`.

### ✅ Phase 3 — Admin: Voter (student) registration
**Backend**
- New service `admin-participant.service.js` (or extend `admin.service.js` + generalize `csv-import.service.js` to the fixed 6-column schema, validating program/section against taxonomy).
- Endpoints on [admin.routes.js](backend/src/routes/admin.routes.js): `GET /admin/voters`, `POST /admin/voters`, `PATCH /admin/voters/:id`, `PATCH /admin/voters/:id/status`, `POST /admin/voters/import-preview`, `POST /admin/voters/import-register`, `GET /admin/voters/template`.
- Email A on new-account creation; dedup by email then school_id; re-import updates profile, never resets password.
**Frontend**
- Rework [OrganizerManagementPage.jsx](frontend/src/pages/admin/OrganizerManagementPage.jsx) → **User Management** with tabs **Organizers | Voters | Judges**; build the **Voters** tab (table, filter by program/section, manual add modal, CSV preview→register). New `adminService` methods + 6-column template.
- Rename nav/search/route ([DashboardLayout.jsx:32](frontend/src/layouts/DashboardLayout.jsx), [searchIndex.js:20](frontend/src/config/searchIndex.js), [routes/index.jsx](frontend/src/routes/index.jsx)); redirect `/admin/organizers` → `/admin/users`.
**Acceptance:** admin bulk-imports and manually adds students; bad program/section rejected; Email A delivered; duplicates handled.

### ✅ Phase 4 — Admin: Judge registration
**Backend:** `GET/POST /admin/judges`, `PATCH /admin/judges/:id`, `POST /admin/judges/import-preview` / `import-register`, `GET /admin/judges/template` — fixed judge schema (§3.5), `profile_type='judge'`, extras → `profile_data`. Email A on creation.
**Frontend:** **Judges** tab in User Management (table, manual add, CSV preview→register, judge template).
**Acceptance:** admin registers judges; judges appear as a distinct pool; sign-in works with temp password.

### ✅ Phase 5 — Organizer: cohort invite (election + polling)
**Backend** ([election-organizer.routes.js](backend/src/routes/election-organizer.routes.js), [polling-organizer.routes.js](backend/src/routes/polling-organizer.routes.js)):
- `GET /events/:eventId/cohorts` — programs & sections (from taxonomy) with pool counts + already-enrolled counts.
- `POST /events/:eventId/invite-cohort` — `{ cohortType:'program'|'year_section', values:[...], notify:bool }`; bulk-enroll matching **students** as the right `participant_type`; idempotent; multi-role guard (D7); respects lifecycle lock; optional Email B (throttled).
- `DELETE /events/:eventId/participants/:userId` — remove (lifecycle-aware).
- **Remove/guard** organizer voter/respondent register, register-existing, import-preview, import-register, send-invitation, send-all routes. Keep list routes.
**Frontend:** replace register/CSV UI in [ElectionVotersPage.jsx](frontend/src/pages/organizer/election/ElectionVotersPage.jsx) & [PollingRespondentsPage.jsx](frontend/src/pages/organizer/polling/PollingRespondentsPage.jsx) with a **cohort picker** (choose Program or Year & Section → multi-select → preview count → confirm). Enrolled list shows profile columns + remove.
**Acceptance:** organizer invites a program/section; matching students enrolled once (idempotent); non-students never enrollable; old register endpoints gone.

### ✅ Phase 6 — Organizer: judge pick (competition)
**Backend** ([competition-organizer.routes.js](backend/src/routes/competition-organizer.routes.js)):
- `GET /events/:eventId/judge-pool` — searchable list of `profile_type='judge'` accounts + enrolled flag.
- `POST /events/:eventId/judges-v2/pick` — enroll selected judges as COMPETITION_JUDGE (idempotent, guard, lifecycle-aware, optional Email B). Keep existing `judges-v2` assignment routes.
- **Remove/guard** the organizer judge register + CSV import routes.
**Frontend:** [CompetitionJudgesPage.jsx](frontend/src/pages/organizer/competition/CompetitionJudgesPage.jsx) → **pick-from-pool** UI (search/select), then the existing judge **assignment** flow runs unchanged.
**Acceptance:** organizer picks judges from pool; assignment still works; old judge register/CSV gone.

### ✅ Phase 7 — Remove the information form (all three modules — D8/D9)
**Backend:** stop reading/writing `information_form_schema` in [election.service.js](backend/src/services/election.service.js), [competition.service.js](backend/src/services/competition.service.js), [polling.service.js](backend/src/services/polling.service.js), [pageant.service.js](backend/src/services/pageant.service.js), [event.service.js](backend/src/services/event.service.js); drop the info-form step from the create-event wizards' server side and [draft.controller.js](backend/src/controllers/draft.controller.js); remove `updateMyParticipantInformation` and info-form fields from `getMyEventRole` in [voter.controller.js](backend/src/controllers/voter.controller.js).
**Frontend:** remove [ParticipantInformationFormBuilder.jsx](frontend/src/components/organizer/ParticipantInformationFormBuilder.jsx), [ParticipantInformationForm.jsx](frontend/src/components/voter/ParticipantInformationForm.jsx), [ParticipantInformationGate.jsx](frontend/src/components/voter/ParticipantInformationGate.jsx); strip info-form from [ElectionEventFormPage.jsx](frontend/src/pages/organizer/election/ElectionEventFormPage.jsx), [CompetitionEventFormPage.jsx](frontend/src/pages/organizer/competition/CompetitionEventFormPage.jsx), [PollingEventFormPage.jsx](frontend/src/pages/organizer/polling/PollingEventFormPage.jsx) and the frontend services; rework [DynamicParticipantTable.jsx](frontend/src/components/organizer/DynamicParticipantTable.jsx) to fixed profile columns (dynamic for judge extras). Voter flow: login → forced password change → dashboard (no gate).
**Data:** one-off export of existing `event_participants.metadata` info-form answers before they go unused.
**Acceptance:** no info-form UI anywhere; voter signs in and goes straight to voting/scoring; judge scoring regression passes.

### ✅ Phase 8 — Anonymity containment + audit (D12 now-tier)
**Backend/Frontend:** ensure no report/export/UI exposes name↔ballot; add audit-log entries for admin registration/import/edit/export and any identity↔vote access; verify [reports.service.js](backend/src/services/reports.service.js)/[export.service.js](backend/src/services/export.service.js) don't leak the link.
**Acceptance:** reviewer confirms no PII-to-ballot linkage is reachable through the app; audit entries present.

### ✅ Phase 9 — Backfill, seeds, tests, cleanup
- Admin backfills legacy profileless accounts (import by email).
- Update seeds/fixtures/tests that assumed organizer-created voters or info forms.
- Remove dead code paths (`register`/`register-existing` branching in [invitation.service.js](backend/src/services/invitation.service.js), etc.).
**Acceptance:** test suite green; no references to removed endpoints; legacy accounts usable.

---

## 6. Files to be Changed

### 6.1 Database / migrations
| File | Change |
|---|---|
| `backend/src/database/migrations/075_participant_profiles.sql` (+ `075_down_*`) | **New** — add `profile_type, first_name, last_name, school_id, program, year_section, profile_data` to `users`; partial-unique + cohort indexes; backfill `profile_type='student'` |
| `backend/src/database/seeds/*` | Seed `participant_taxonomy` into `system_settings`; update voter/judge seed data |

### 6.2 Backend
| File | Change |
|---|---|
| `backend/src/utils/constants.js` | Add `PROFILE_TYPES` (`student`/`judge`); taxonomy settings key |
| `backend/src/services/admin-participant.service.js` | **New** — voter & judge CRUD + fixed-schema imports (or extend `admin.service.js`) |
| `backend/src/services/csv-import.service.js` | Generalize email-only → fixed 6-col student parser; validate program/section vs taxonomy; drop organizer/event scoping |
| `backend/src/services/pageant-csv.service.js` | Generalize → fixed judge schema; store extras in `profile_data`; move to admin scope |
| `backend/src/services/invitation.service.js` | `ensureVoterAccount` persists profile; `sanitizeUser` exposes fields; remove `register`/`register-existing` branching once unused |
| `backend/src/services/user.service.js` | Profile fields on create/read; taxonomy validation helper |
| `backend/src/services/email.service.js` + `templates/email/*` | Email A (account) + Email B (event invite) templates |
| `backend/src/services/participant.service.js` | Cohort query + bulk-enroll + multi-role guard (D7) + lifecycle-lock checks |
| `backend/src/services/reports.service.js`, `export.service.js` | Ensure no name↔ballot linkage; audit access (D12) |
| `backend/src/controllers/admin.controller.js` + `routes/admin.routes.js` | `/admin/voters*`, `/admin/judges*`, `/admin/settings/taxonomy` |
| `backend/src/controllers/election-organizer.controller.js` + `routes/election-organizer.routes.js` | Add `cohorts`, `invite-cohort`, participant delete; **remove** voter register/import/send routes |
| `backend/src/controllers/polling-organizer.controller.js` + `routes/polling-organizer.routes.js` | Same for respondents |
| `backend/src/controllers/competition.controller.js` + `routes/competition-organizer.routes.js` | Add `judge-pool`, `judges-v2/pick`; **remove** judge register/CSV routes; keep assignment routes |
| `backend/src/controllers/voter.controller.js` | Remove `updateMyParticipantInformation`; drop info-form fields from `getMyEventRole` |
| `election.service.js`, `competition.service.js`, `polling.service.js`, `pageant.service.js`, `event.service.js`, `draft.controller.js` | Stop reading/writing `information_form_schema` (all modules) |

### 6.3 Frontend
| File | Change |
|---|---|
| `frontend/src/pages/admin/OrganizerManagementPage.jsx` → **UserManagementPage.jsx** | Tabs: Organizers / Voters / Judges; Voters + Judges tables, manual add, CSV preview→register |
| `frontend/src/components/admin/*` | New voter/judge add + CSV import modals; taxonomy editor |
| `frontend/src/pages/admin/SystemSettingsPage.jsx` | Programs & Sections (taxonomy) management panel |
| `frontend/src/services/admin.service.js` | Voter/judge CRUD + import methods; taxonomy methods; templates |
| `frontend/src/layouts/DashboardLayout.jsx`, `config/searchIndex.js`, `routes/index.jsx` | Rename to "User Management"; route + redirect |
| `frontend/src/pages/organizer/election/ElectionVotersPage.jsx` | Replace register/CSV with cohort picker |
| `frontend/src/pages/organizer/polling/PollingRespondentsPage.jsx` | Same |
| `frontend/src/pages/organizer/competition/CompetitionJudgesPage.jsx` | Pick-from-pool; remove info-form; keep assignment |
| `frontend/src/services/election.service.js`, `polling.service.js`, `pageant.service.js` | Add cohorts/invite/pick; drop info-form + register calls |
| `frontend/src/components/organizer/DynamicParticipantTable.jsx` | Fixed profile columns (students) / dynamic (judge extras) |
| `frontend/src/components/organizer/ParticipantInformationFormBuilder.jsx` | **Remove** |
| `frontend/src/components/voter/ParticipantInformationForm.jsx`, `ParticipantInformationGate.jsx` | **Remove** |
| `frontend/src/pages/organizer/election/ElectionEventFormPage.jsx`, `competition/CompetitionEventFormPage.jsx`, `polling/PollingEventFormPage.jsx` | Remove info-form step |
| `frontend/src/pages/voter/VoterDashboardPage.jsx`, `VoterEventPage.jsx` | Show profile; remove info-form gate; forced password change → straight to event |

*(Judge **sign-in**, **scoring**, and **assignment** flows are otherwise unchanged.)*

---

## 7. Prerequisites & Risks to Resolve First

1. **Vote anonymity (D12).** Contained here; **file the follow-up `voting_nonce` anonymization mini-plan** so it isn't forgotten.
2. **PII access control.** Admin sees full directory; organizers see only their event's participants + aggregate counts; audit-log everything.
3. **Program/Section taxonomy (D13).** Must be seeded before Phase 3 imports, or all imports fail validation.
4. **Legacy backfill.** Export old info-form answers before Phase 7; backfill profiles by email; legacy accounts remain usable meanwhile.
5. **Bulk email volume.** Queue/throttle Email B; enrollment must not fail on email errors.
6. **Lifecycle lock.** Cohort invite & judge pick respect `PARTICIPANT_LOCK_FEATURE_FLAG`.
7. **Endpoint teardown.** Remove + guard old organizer register/CSV routes (not just hide UI); update tests.
8. **Judge pick ↔ assignment.** Ensure pick feeds `judges-v2` assignment.
9. **Drafts & wizards.** Clean `event_drafts` and the 3 EventForm wizards of info-form.
10. **Seeds/fixtures/tests.** Budget a dedicated pass (Phase 9).

---

## 8. Testing & Verification

1. Admin defines programs/sections; import rejects unknown values.
2. Admin CSV-imports students → accounts created, Email A sent, profiles populated; duplicate email/school_id handled; re-import updates profile, never resets password.
3. Admin manually adds one student and one judge.
4. Admin CSV-imports judges → `profile_type='judge'`, extras in `profile_data`, sign-in with temp password works.
5. Organizer invites a program cohort → all matching students enrolled as ELECTION_VOTER; re-invite idempotent; a judge account can never be enrolled as a voter (guard).
6. Organizer invites a section for a poll → enrolled as POLLING_RESPONDENT.
7. Organizer picks judges from pool → enrolled; assignment flow unchanged.
8. Voter logs in → forced password change → **no info-form gate** → can vote/respond; profile visible.
9. Judge scoring end-to-end regression passes.
10. No report/export/UI links a name to a ballot; audit entries recorded (D12).
11. Old organizer register/CSV endpoints return removed/guarded.
12. Existing (profileless) participants still access events they were already in.

---

## 9. Rollback

- Phases are additive and independently revertible; UI switch is behind `ADMIN_PARTICIPANT_REGISTRATION`.
- Migration 075 has a `down` (drops columns/indexes).
- Info-form removal is the only lossy step — keep `information_form_schema` and `event_participants.metadata` columns in place (stop using, don't drop) and export old answers first, so a revert only re-enables UI paths.
- `voting_nonce` anonymization is **not** touched here, so there is nothing to roll back for D12 beyond access-control config.
