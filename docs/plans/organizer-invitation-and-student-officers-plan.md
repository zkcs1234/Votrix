# Plan: Organizer Invitation → Application → Approval, and Student Officers

> **Status:** IMPLEMENTED (Phases A–G), **uncommitted** and **not yet exercised in a real environment**. Migrations are verified on a real Postgres engine; the manual QA checklist (§13) is the remaining gate. See §11 for the log and §12 for the rollout runbook. Decisions D1–D6 are proceeding on the recommended defaults (§8) until you say otherwise. See §11 for the implementation log.
> Replaces the earlier pasted "adaptation" answer (see §1 for why).
> **Builds on:** `ORGANIZER_REGISTRATION_AND_SCOPING_PLAN.md` (implemented, migration 076). Same conventions: profile data lives on `users` (+ JSONB), no new table where a column will do, additive migrations with `*_down` files.
> **Hard precondition:** the STUDENT / JUDGE participant-type work (migrations 135–137, currently untracked in the working tree) must be applied and committed first. Officer candidate search depends on `users.profile_type = 'student'`.

---

## 1. Verdict on the pasted plan

**Not good enough as written.** The ideas are sound; the plan is not grounded in this codebase. It was written as if parts of the system were missing, and in several places it contradicts what is already built. Verified against the code:

| Pasted plan says | Reality in this repo | Consequence |
|---|---|---|
| Add `owner_organizer_id` to `organizations` | `organizations.organizer_id` already exists and is `UNIQUE` (migration 028). Org name, logo, type, position all live on `users` (028, 031). | Duplicate column. Its backfill `INSERT … WHERE NOT EXISTS (… owner_organizer_id = u.id)` matches every row (column is NULL) and would hit the `UNIQUE(organizer_id)` constraint and fail. |
| New `access_scope JSON` on applications | `users.scope` JSONB `{scopeType, programs, sections}` already exists (076), validated by `buildScope()` against the managed taxonomy, enforced by `organizer-scope.service.js`. | A second, incompatible scope shape. Must reuse the same shape and validator. |
| Organization type = co-curricular / extra-curricular | Type is deliberately free text (`users.organization_type_display`, migration 031). The `organization_type` enum is deprecated (028). | Needs a decision, not a new enum. §4 stores the two values in the existing column. |
| Approval "creates users row, generates temp password, sends email" | `createOrganizer()` in `user.service.js` already does exactly this (temp password, `must_change_password`, invitation email). `createOrganizerAccount()` in `admin-organizer.service.js` wraps it with validation + scope. | Re-implementing it forks the one working account-creation path. Approval must **call** it. |
| Participant types are `STUDENT` / `COMPETITION_JUDGE` | `COMPETITION_JUDGE` is being renamed to `JUDGE` (migration 137, in your working tree). `ORGANIZER` is already an allowed type. | Plan would target a name that is disappearing. |
| Event endpoints "probably check `req.user.role`"; add `checkEventAccess` middleware and new `/participant/organizations/:id/events` endpoints | Every organizer call flows `req.user.id` → service `organizerId` → `assertOrganizerOwnsEvent` → `organizations.organizer_id`. `req.user.id` appears ~290 times across controllers. WebSocket auth hard-codes `organizer_id === user.id`. | Following the pasted plan means touching or duplicating the entire organizer API (election, competition, polling, reports, drafts, live session, sockets). Its 21-day estimate does not include this. §5 avoids it. |
| Client holds `selectedOrganizationId` | Nothing says how the server learns which org a request is for. | Spoofable if sent as a header and trusted. |
| (silent) | `requireProfileComplete` still runs on every organizer route and 403s with `PROFILE_INCOMPLETE` unless `organization_name`, `organization_type_display`, `organizer_name`, `position` are all non-empty. | **Removing any invitation input without updating this gate locks the new organizer out.** The pasted plan never mentions it. |
| (silent) | Organizer CSV import (`REQUIRED_FIELDS`, aliases, template headers), `CreateOrganizerModal`, `OrganizerDetailPage`, ProfileCard all consume the same fields. | A field change has a fixed list of touch points (§4.3). |
| (silent) | Upload middleware accepts **images only, 5 MB** (`middleware/upload.js`). Certificates are usually PDFs. | New document filter + storage rule needed. |
| (silent) | Data layer is Supabase/PostgREST: no multi-statement transactions. Atomic work in this repo uses single conditional updates or RPCs (migrations 059/060). | "Approve = create 3 things then update status" can half-complete. §6 specifies the claim-then-act order. |

**What the pasted plan gets right (kept):** students stay `participant` (no role split); capability comes from a relationship, not a new role; membership is re-read from the database on every request (so deactivation is immediate); scope is enforced server-side; position is free text.

**Missing entirely:** a field-by-field before/after for the invitation inputs, which is the part you emphasised. It is §4 below.

---

## 2. Locked decisions (proposed — see §8 for the ones that need your yes)

| # | Decision | Choice |
|---|---|---|
| P1 | Base system | Keep the current account model: `users` row with role `organizer`, `createOrganizer()` for creation, temp password + forced change on first login (O10 unchanged). |
| P2 | Invitation | Admin creates a **single-use, expiring, email-bound link**. The admin no longer types the organizer's profile. |
| P3 | Application | Invitee fills the profile, requests a scope, uploads certificates. Nothing is created until an admin approves. |
| P4 | Approval | Calls existing `createOrganizerAccount()`; admin may correct any field before approving. |
| P5 | Existing "Add organizer" + CSV import | **Kept** as the admin fast-path. Not removed. |
| P6 | Student officers | A student assigned by an organizer **acts as the owner organizer inside the existing organizer workspace** ("delegate context"). No second organizer API, no per-endpoint permission rewrite. |
| P7 | Roles | `users.role` unchanged. Officer status lives in a new `organization_officers` table. |
| P8 | Officer limit (v1) | One active officership per student. Removes the need for an "which org?" client input. |

---

## 3. Target flow

```
CURRENT                                      TARGET
Admin → Users → Organizers                   Admin → Users → Organizers
  "Add organizer" modal (8 fields)             sub-views: Organizers | Invitations | Applications
  or CSV import                                "Invite organizer" modal (email + expiry)
        │                                            │  emailed link (token)
        ▼                                            ▼
  createOrganizer() ── temp-password email     Public /organizer/apply/:token  (profile, scope request, certificates)
        │                                            │  status: pending
        ▼                                            ▼
  login → change password → dashboard         Admin reviews → Approve ─► createOrganizerAccount()  (UNCHANGED path)
                                                   │                       │
                                                   └─ Decline + reason     ▼
                                                      (email)         login → change password → dashboard

Organizer workspace (all existing /organizer/* pages)
   owner organizer ──────────────► works as today
   student officer (active) ─────► same pages, same APIs, acting as the owner  (§5)
```

---

## 4. Invitation inputs — before / after

### 4.1 Admin side *(confirmed by user)*

| Input | Today (`CreateOrganizerModal`, `createOrganizerAccount`) | Target "Invite organizer" |
|---|---|---|
| Email | required | **kept** (token is bound to it; applicant cannot change it) |
| Organizer name | required | **removed** → applicant fills it |
| Position | required | **removed** → applicant |
| Organization name | required | **removed** → applicant |
| Organization type | required (free text) | **removed** → applicant (select, §4.2) |
| Scope type / programs / sections | required | **removed** → applicant *requests*, admin confirms at review |
| Link expiry | — | **added** (default 7 days) |
| Note to applicant | — | **added, optional** |

The existing direct "Add organizer" modal and CSV import keep all 8 fields (P5). Nothing in that path changes except what §4.3 requires.

### 4.2 Applicant form (new public page)

| Input | Stored in | Notes |
|---|---|---|
| Email | read-only from invitation | not editable |
| Organizer name | `users.organizer_name` on approval | required |
| Position | `users.position` | required |
| Organization name | `users.organization_name` | required |
| Organization type | `users.organization_type_display` | **select: "Co-curricular" / "Extra-curricular"**; saved in the *existing* free-text column. Existing free-text rows stay valid. |
| Requested access scope | `users.scope` on approval | same shape and same `buildScope()` validator as today; options from the managed taxonomy |
| Certificates | new, on the application | ≥1 required (count/format/size: §8 D5) |

### 4.3 Field-change checklist (use for every input added/removed)

Applies to the direct-add path and anywhere a profile field is consumed. Do **not** drop DB columns in the same release; stop reading them first.

1. `backend/src/middleware/auth.js` → `requireProfileComplete` (field list in the select and the `complete` check). **Missing this = 403 `PROFILE_INCOMPLETE` for every new organizer.**
2. `backend/src/services/admin-organizer.service.js` → `REQUIRED_FIELDS`, `COLUMN_ALIASES`, `ORGANIZER_CSV_TEMPLATE_HEADERS`, `createOrganizerAccount` / `updateOrganizer` validation.
3. `backend/src/services/user.service.js` → `createOrganizer` insert row.
4. `backend/src/utils/userMapper.js` (`sanitizeUser`) and `organizer-profile.service.js`.
5. Frontend: `CreateOrganizerModal.jsx`, `OrganizerDetailPage.jsx`, `OrganizerManagementPage.jsx` list columns, organizer ProfileCard, `utils/organizerProfile.js`.
6. Tests: `OrganizerDashboardPage.test.jsx`, `auth.store.test.js`, any organizer-service tests.

---

## 5. Student officers: the delegate-context design

**Core idea.** Today the whole organizer API is one router (`routes/organizer.routes.js`: `router.use(authenticate, authorize(ORGANIZER), requireActiveAccount)`), and every service is keyed by `organizerId`. So instead of teaching ~290 call sites about officers, we let an active officer **act as the owner organizer** for requests on that one router. Controllers, services, ownership checks, scope filtering, drafts, reports and analytics all keep working unchanged, and an officer automatically inherits the owner's `scope`.

### 5.1 New middleware: `resolveOrganizerContext`
Mounted on the `/organizer` router **after** `authenticate` and **before** `authorize(ORGANIZER)`:

1. `req.user.role === 'organizer'` → no-op. Existing organizers see zero change.
2. `req.user.role` is participant → query `organization_officers` for an **active** row for this user (every request, no cache).
   - none → `403`.
   - found → load the owner. Require owner `account_status = 'active'` (suspending an organizer therefore suspends their officers) and the officer's own account active and password changed.
3. Set `req.actor = { id, email, position }` (the real student) and replace `req.user` with the owner's claims (`id`, `role: 'organizer'`, owner `tokenVersion` so `requireActiveAccount` passes).
4. No client-supplied header participates (P8). Nothing to spoof.

### 5.2 Owner-only guard
New `requireOwnerOrganizer` (`!req.actor`) on routes an officer must **not** reach:
- `PUT /organizer/profile` (editing the owner's profile)
- `POST /organizer/organization/logo` *(confirm, D4)*
- all `/organizer/officers/*` (officers cannot appoint officers)

### 5.3 Audit trail
`recordAudit` has no request access and there is no request-context utility in the repo. Add a tiny `foundation/requestContext.js` (AsyncLocalStorage) set by the middleware; `recordAudit` merges `actingUserId` / `actingUserEmail` into `details`. `audit_logs.user_id` stays the owner, so the owner and admin see everything done in the org, with the real person recorded. Avoids editing every `recordAudit` call.

### 5.4 WebSockets
`websocket/ws-authorization.js` (`canSubscribeToRoom`) and `ws-server.js` (organizer branches at ~144, 188, 207) check `role === 'organizer'` and `organizer_id === user.id`. Run the same resolver in the socket auth path so an active officer gets the owner's room access. Re-checked at subscribe time; deactivation takes effect on the next subscribe/reconnect (optionally force-close the officer's sockets on deactivate).

### 5.5 `organization_officers` table (migration)
```
id, organizer_id (FK users, owner), student_id (FK users),
position text, status ('active'|'inactive'),
assigned_by, assigned_at, deactivated_by, deactivated_at
UNIQUE (organizer_id, student_id)
UNIQUE (student_id) WHERE status = 'active'        -- P8
```
Keyed by `organizer_id`, not `organizations.id`, because the `organizations` row is created lazily (`getOrCreateOrganization`) and is already 1:1 with the organizer. A table (not JSONB) is justified here: many-to-many shape, status history, and a uniqueness rule. It does **not** reuse `user_participant_types.ORGANIZER`: that type is an event-eligibility label and cannot carry owner, position, or status.

### 5.6 Owner endpoints (all owner-only)
`GET /organizer/officers?status=active|inactive|all`, `GET /organizer/officers/candidates?search=`, `POST /organizer/officers`, `PATCH /organizer/officers/:id` (position), `POST /organizer/officers/:id/deactivate`, `POST /organizer/officers/:id/activate`.
- Candidates = an account with an **active `STUDENT` membership in `user_participant_types`** (the same rule the admin student list uses), role participant, `account_status = 'active'`, not already actively assigned, **filtered with the existing `getOrganizerScope()` + `isStudentInScope()`**. Assign re-validates scope server-side (never trust the picker). *(Corrected during Phase E: an earlier draft said `profile_type = 'student'`, but admin student registration never sets `profile_type`, so it would have missed newly registered students.)*
- Admin gets read + deactivate on `OrganizerDetailPage` (override, audited).

### 5.7 `/auth/me` and the frontend
- `/auth/me` (`authService.getCurrentUser`) adds `officership: { organizerId, organizationName, position } | null` for participants.
- `ProtectedRoute` for `/organizer/*`: allow role organizer **or** participant with an officership. Existing `allowedRoles` check otherwise unchanged.
- `DashboardLayout` computes `isOrganizer` from role; derive it from "role organizer OR officership on an `/organizer` path" so every existing organizer sidebar/page renders as-is.
- Participant sidebar: "Organizer workspace" entry shown only with an officership; organizer view shows the existing "← back" pattern to return to `/participant`.
- New page `/organizer/officers` ("Account Manager"): candidate search, position input, Active / Inactive / All tabs, deactivate/activate. Reuse existing table/Modal/INPUT_CLASS patterns.
- `auth.store` carries `officership`; cookies-only auth (per CLAUDE.md plan) is unaffected.

---

## 6. Invitation / application backend

**Tables** (migrations continue after 137; use next free numbers — numbering has collided before, e.g. two 136s, three 030s):
- `organizer_invitations`: `id`, `token_hash` (SHA-256; raw token only ever in the email), `email`, `note`, `status` (pending/used/revoked; **"expired" is derived from `expires_at`, not stored**), `expires_at`, `created_by`, `created_at`, `used_at`, `revoked_at`. Named differently from the existing voter `invitations` table on purpose.
- `organizer_applications`: `id`, `invitation_id` (UNIQUE), `email`, `organizer_name`, `position`, `organization_name`, `organization_type_display`, `requested_scope` (JSONB, same shape as `users.scope`), `certificates` (JSONB array `{url, name, mime, size}`), `status` (pending/approved/declined), `decline_reason`, `reviewed_by`, `reviewed_at`, `organizer_user_id`, `created_at`.

**Admin endpoints** (in `admin.routes.js`, behind existing `adminActionLimiter`): create / list / revoke / resend invitation; list / get / approve / decline application.
**Public endpoints** (new router, rate-limited, CSRF via the existing `/auth/csrf` pattern): `GET /public/organizer-apply/:token` (validates; returns bound email + taxonomy), `POST …/:token` (**one multipart request**: fields + `certificates` files). A separate certificate-upload endpoint was dropped: a single request cannot leave orphaned uploads behind and needs no extra "which upload belongs to which token" bookkeeping.

**Atomicity (no transactions available):**
- Submit: one conditional update `invitation pending & not expired → used`, then insert application. If insert fails, revert the invitation.
- Approve: conditional flip `application pending → approved` first (the claim), then call `createOrganizerAccount()`. On error, flip back to `pending` and surface the message. Two admins cannot double-approve.
- Decline: conditional flip, then email.

**Email:** reuse `layout.js` / `mailer.service.js` / `recordAudit`. New templates: `organizerInviteLink`, `organizerApplicationDeclined`. Approval email is the existing `organizerInvitation` (temp password) unchanged.

**Certificates:** add a document filter to `middleware/upload.js` (PDF + the existing image types, validated by magic bytes, not only MIME). Stored via the existing `upload.service` / `image_assets` path. Visible to admins only (authenticated access), not public URLs.

---

## 7. Phases

| Phase | Work | Acceptance |
|---|---|---|
| **0** | Land 135–137. Confirm §8 decisions. | Student/judge migrations applied; decisions recorded. |
| **A** | Three additive migrations (+ down): invitations, applications, officers. No code reads them. | Up/down clean; existing behavior identical. |
| **B** | Invitation + application backend, public router, certificate upload, email templates, approve/decline via `createOrganizerAccount()`. | Token is single-use, expiring, hashed; double-approve impossible; approval yields a working organizer who logs in and changes password exactly as today. |
| **C** | Admin UI: Organizers tab gains Invitations and Applications sub-views; "Invite organizer" modal (email + expiry + note); review drawer with editable fields, certificate viewer, approve/decline. Direct add and CSV import untouched. | Admin can invite, review, approve, decline end to end. |
| **D** | Public apply page `/organizer/apply/:token` (route outside `ProtectedRoute`), confirmation screen, expired/used/invalid token states. | Applicant cannot change email; bad token reveals nothing. |
| **E** | Officers backend: table service + owner routes; `resolveOrganizerContext`; `requireOwnerOrganizer`; request-context audit; WS branch; `/auth/me` officership. | Existing organizers unchanged (regression suite); active officer reaches `/organizer/*` and is scoped to the owner's data. |
| **F** | Officers frontend: Account Manager page; `ProtectedRoute` / `DashboardLayout` / auth.store changes; workspace switch. | Officer sees full organizer workspace for the owner org only; deactivated officer is rejected on the next request. |
| **G** | Tests, security pass, docs (`docs/AUTH.md`, `docs/ai/BUSINESS_RULES.md`), rollout. | §9 passes. |

**Relative size:** A small · B large · C medium · D small–medium · E medium (small code, high care) · F medium · G medium. This is *smaller* than the pasted plan's backend permission refactor and participant event-management UI, which §5 replaces with one middleware, but larger on security testing.

---

## 8. Decisions needed from you

| # | Question | Recommendation |
|---|---|---|
| D1 | Who sets scope? | Applicant **requests**, admin **confirms/edits** at review. |
| D2 | Keep direct "Add organizer" + CSV? | **Settled later:** the "Add organizer" button was removed; **CSV import was kept** (see the update before §12). |
| D3 | Can a student be an officer of more than one org? | **No in v1** (P8). Adding it later needs an "acting org" input and server validation. |
| D4 | What can an officer *not* do? | Edit owner profile/logo, manage officers. Everything else (events in all modules, reports, voter invites within scope) allowed. |
| D5 | Certificates: min count, formats, max size, retention after approval? | ≥1, PDF/JPG/PNG, 5–10 MB each, kept for admin audit. |
| D6 | Invitation bound to an email or open link? | **Email-bound**. |
| D7 | Which admin inputs are really being removed? | **CONFIRMED by user:** §4.1 table is correct (admin keeps email + expiry + optional note; the other 7 inputs move to the applicant). |

---

## 9. Testing

1. Existing organizer (pre-change): login, create event in each module, WS live session, reports — all unchanged.
2. Invitation: expired, used, revoked, wrong-email, replayed token all rejected; raw token never stored.
3. Application: concurrent double-approve → exactly one organizer created; approve failure rolls the claim back.
4. New organizer from approval passes `requireProfileComplete` and lands on the dashboard after forced password change.
5. Officer: assigned in-scope student works; out-of-scope student rejected even via crafted request; officer cannot hit `/organizer/officers/*` or `PUT /organizer/profile`.
6. Deactivate officer → next request `403`; socket re-subscribe denied.
7. Suspend owner organizer → officers lose access.
8. Audit rows show the real actor for officer actions.
9. A student with no officership gets `403` on `/organizer/*`.

---

## 10. Rollback

- Migrations are additive with down files; nothing reads the new tables until Phase B/E.
- `resolveOrganizerContext` is a no-op for organizers; removing it (and the `ProtectedRoute`/layout allowance) disables officers without touching organizer data.
- The direct-add path is never modified beyond §4.3, so reverting the invitation flow leaves account creation intact.

---

## 11. Implementation log

### Done — Phase A (schema) and Phase B (backend), uncommitted
- **Migrations** `138_organizer_invitations`, `139_organizer_applications`, `140_organization_officers` (+ `*_down_*`). Additive; nothing reads the officers table yet. **Not yet applied to any database.**
- **Services:** `organizer-invitation.service.js`, `organizer-application.service.js`, `certificate-storage.service.js`; validator `organizer-application.validator.js`.
- **Reuse, not rebuild:** approval calls the existing `createOrganizerAccount()`; scope uses the existing `buildScope()` / taxonomy matchers (now exported from `admin-organizer.service.js`); tokens use the existing `generateSecureToken` / `hashToken`.
- **Routes:** admin `GET/POST /admin/organizer-invitations`, `POST …/:id/revoke|resend`, `GET /admin/organizer-applications[/:id]`, `POST …/:id/approve|decline`; public `GET|POST /public/organizer-apply/:token` (new `organizerApplyLimiter`, CSRF applies to the POST).
- **Emails:** `organizerInviteLink`, `organizerApplicationDeclined` templates; approval still sends the existing temporary-password email.
- **Certificates:** PDF/JPEG/PNG verified by magic bytes, ≤5 files, ≤8 MB each, stored with Cloudinary `authenticated` delivery (not the shared `image_assets` registry); admins get signed links, the storage reference is never returned.
- **Tests:** 50 new tests (validator, certificate storage, full invitation → application → approve/decline lifecycle incl. replay, concurrency, rollback). A mutation check (removing the atomic-claim guard) makes the concurrency test fail, as it should.

### Verification status
- New tests: 50/50 pass. Full backend suite: 853 pass, **3 fail — all 3 fail identically on a clean checkout of `main`** (`participant-enrollment-membership`, `user-participant-type.service` — both tied to the STUDENT participant-type work; `competition-native-context-discovery`). Not caused by this work; not fixed here.
- **Not verified:** the Cloudinary `authenticated` upload and signed-URL delivery (needs real credentials); behavior against a real Postgres (the fake client models the conditional-UPDATE claim, the real guarantee is Postgres's single-statement atomicity); migrations 138–140 have not been run.

### Done — Phase C (admin UI) and Phase D (public apply page), uncommitted
- **Admin:** Users → Organizers now has a segmented control: **Accounts** (existing list, untouched) · **Invitations** · **Applications** (live pending count). Deep-linkable via `?tab=organizers&section=…`.
- **"Invite organizer" modal** asks only for email, expiry and an optional note (the confirmed §4.1 table). After sending it shows the one-time link with a Copy button and warns when the email was not delivered. Resend shows the new link the same way.
- **Review modal:** every field and the scope can be corrected before **Approve & create account**; **Decline…** requires a reason; certificates open through signed links; reviewed applications are read-only.
- **Public page** `/organizer/apply/:token` (no guest/protected wrapper, wider `AuthLayout size="lg"`): bound email read-only, type select (Co-curricular / Extra-curricular), scope picker, certificate picker with client-side rules mirroring the server, one multipart submit, confirmation screen, one generic screen for any unusable link.
- **Shared:** `AccessScopeFields` (scope picker used by the review modal and the public form). `CreateOrganizerModal` still has its own copy and was deliberately **not** refactored: it is the fast path and is untouched by this work.
- **Tests:** 37 new frontend tests (apply page, invite modal, review modal, file rules, Users-page sections, and a route test proving `/organizer/apply/:token` is not captured by the protected `/organizer` route). ESLint clean on all changed files; `vite build` succeeds.
- **Pre-existing failures (unrelated, unchanged):** 9 frontend test files / 26 tests fail identically on a clean checkout (competition tabulation/handoff/forms, `DateTimeInput`, and a stale `UserManagementPage.test.jsx` that still expects the removed "Election voters / Polling Respondents" tabs). Left alone.
- **Not verified:** nothing has been exercised in a real browser against a running backend and database. The emailed link, certificate upload/viewing and the approval email need a live environment.

### Done — Phase E (student officers backend), uncommitted
- **`middleware/organizerContext.js`:** `resolveOrganizerContext` is mounted on the `/organizer` router before `authorize(ORGANIZER)`. For an active officer it swaps `req.user` to the owner (id, role, owner's `tokenVersion`) and sets `req.actor` to the real student, so every existing controller, ownership check and scope filter works unchanged. Organizers/admins pass through untouched; a student with no officership falls through to the usual 403. It reads the officership from the DB **on every request** (no cache), fails closed on DB errors, and refuses when the owner is suspended/archived, the officer's own account is inactive, or the officer still has a temporary password. No client-supplied header or id participates.
- **`requireOwnerOrganizer`** blocks officers from `PUT /organizer/profile`, `POST /organizer/organization/logo` and everything under `/organizer/officers`.
- **`foundation/requestContext.js`** (AsyncLocalStorage) + a 6-line change in `recordAudit`: `user_id` stays the owner and `details.actingUserId/actingUserEmail` record the real person, with no edits to the existing `recordAudit` call sites.
- **`services/organization-officer.service.js`:** list / candidates / assign / update position / deactivate / activate, plus admin list and deactivate-override. Assignment requires an eligible active student, inside the owner's scope, with no active officership anywhere (the partial unique index is the final arbiter; 23505 → 409). Reactivation re-checks eligibility, scope and uniqueness. Every query is scoped to the owner.
- **Routes:** owner `GET/POST /organizer/officers`, `GET …/candidates`, `PATCH …/:id`, `POST …/:id/deactivate|activate` (new `officerActionLimiter`); admin `GET /admin/organizers/:id/officers`, `POST …/officers/:officerId/deactivate`.
- **`/auth/me`, login, refresh and password-change responses** now include `officership` (`{organizerId, organizationName, organizerName, position}` or `null`) for participants; it is hidden if the owner is not active. It only drives the UI; the backend re-checks every request.
- **WebSocket:** `canSubscribeToRoom` lets an active officer follow the owner's events (general + organizer channels); the voters channel stays participant-only; organizers' behaviour is unchanged. Deactivation applies on the next subscribe, and the heartbeat already drops event-room membership each interval.
- **Tests:** +80 backend tests in 5 files (service 35, middleware/audit 18, WebSocket 9, and an **end-to-end test through the real Express app with signed cookies + CSRF** — 18 tests, including "officer creates an election event → it lands in the owner's organization and the audit row records the student"). Mutation checks: removing the owner-only guard (routes and profile), the owner-active check, the audit actor, or the delegation itself each makes tests fail.
- **Full backend suite:** 933 pass; the same 3 pre-existing failures as before (STUDENT-type tests ×2, competition navigation ×1). One run also timed out the `submission-flow.e2e` suite's 10 s `beforeAll` under full-suite load; it passes 12/12 on three solo runs and did not recur on a second full run, so it is treated as load flakiness, not a regression.
- **Not verified:** no real database (the in-memory fake models the queries; real Postgres behavior of the partial unique index and the embedded `user_participant_types` join is as used by the existing admin student list); migration 140 has not been applied; no browser.
- **Known gaps for later phases:** no email to a student when they are made an officer; the owner's own dashboard/notification flows have not been audited for places that use `req.user.email` as the *person* (it is now the owner's, by design); officers cannot yet be seen on `OrganizerDetailPage` (admin API exists, UI is Phase F).

### Done — Phase F (student officers frontend), uncommitted
- **Where the data comes from:** the session is restored by `POST /auth/refresh` (`useAuthBootstrap`), login and `/auth/me`; all three now carry `user.officership` (Phase E), so no store change was needed.
- **`utils/workspace.js`:** `isOfficer`, `getOfficership`, `effectiveWorkspaceRole`, … An officer is a `participant` everywhere except inside `/organizer`, where the existing organizer layouts apply unchanged. A stray `officership` on a non-participant account is ignored.
- **`ProtectedRoute`:** an active officer is admitted to the five organizer route groups; plain students, admins and officers whose officership was removed are not (they land on their own dashboard).
- **`AppShell` / `DashboardLayout` / `GlobalSearch`:** inside `/organizer` an officer gets the organizer navigation, the organization name as caption, an **"Officer" account chip**, the organizer search index, and a persistent **banner** ("You're working as *President* for *Org*. Actions you take are recorded under your name." + *Back to student view*). Officers get a "Student view" link; **only the real organizer** gets the "Account Manager" entry. The `ProfileCard` (owner's organization profile) is deliberately not used for officers.
- **Student side:** the student pages hide the sidebar, so a nav item alone would never be seen; the student dashboard shows an **`OfficerWorkspaceCard`** ("Open organizer workspace") for officers and renders nothing for anyone else.
- **`useOfficershipSync`:** while an officer is in the workspace it re-checks `/auth/me` on mount, tab focus and every 60 s. If the officership changed or ended, the store is updated and `ProtectedRoute` moves them back to the student view (with a toast), instead of leaving them on pages whose requests now return 403. The backend stays authoritative.
- **Account Manager** (`/organizer/officers`, owner-only — an officer is redirected to `/organizer`): Active / Inactive / All filter, table with student, program, position, assigned date, status; **Add officer** (debounced search of eligible, in-scope, unassigned students; position required), **Edit position**, **Deactivate** (confirmation; explains access ends immediately and they remain a student) and **Activate**.
- **Admin:** `OrganizerDetailPage` has a "Student officers" card with a deactivate override (confirmation notes it is recorded as an administrator action).
- **Tests:** 64 new frontend tests across 9 files (workspace helpers, route guard, the real `DashboardLayout`+`AppShell` for officer / owner / plain student, sync hook incl. timers and cleanup, add-officer modal, Account Manager page, admin card, student card). Mutation checks: removing the officer admission, loosening it to "any participant", letting officers see Account Manager, dropping the effective-role switch, removing the owner-only redirect, or removing the banner each makes tests fail. ESLint clean on all changed files; `vite build` succeeds.
- **Full frontend suite:** 726 pass. The same 9 pre-existing failing files fail as before (competition tabulation/handoff/forms, `DateTimeInput`, stale `UserManagementPage.test.jsx`, …). Each full run also failed **one different, unrelated heavy UI test** (`NativeSetupWorkspace`, then `ElectionPositionsPage`); both pass solo 2×, so this is load flakiness in the existing suite, not a regression.
- **Not verified:** nothing has been exercised in a real browser against a running backend and database. The whole officer path (assign → officer signs in → "Open organizer workspace" → works → deactivate → bounced) is covered piecewise by unit/integration tests but not end to end in a live environment.
- **Known gaps:** the Audit Logs / organizer activity screens still show `details.actingUserId/Email` only as raw JSON (no "by student X" column yet); there is no search-index entry for Account Manager; no email to a student when they are made an officer; the owner's own `ProfileCard` does not list officers.

### Done — Phase G (hardening, docs, verification), uncommitted
- **Row Level Security added to 138–140** (found while preparing to apply them): each new table is deny-all for Supabase's public API roles (RLS on, no policies, access revoked from `PUBLIC`/`anon`/`authenticated`, the same convention as migration 101); the backend's service-role key bypasses RLS. A control experiment shows that without this a table in `public` is readable by the `anon` role by default, and these tables hold token hashes, applicant details and certificate references. Verified with simulated Supabase roles: `anon`/`authenticated` are refused read/insert/update/delete on all three tables, and `service_role` keeps full access.
- **Migrations verified on a real Postgres engine** (PGlite, in a scratch directory outside the project; your database was never touched): **80/80 checks pass** (53 constraint/idempotency/rollback checks plus the access-control checks above). Forward files apply cleanly and are idempotent; token-hash uniqueness, status/email CHECKs, one-application-per-invitation, FKs and cascades behave; the **partial unique index enforces one active officership per student** and raises `23505` (what the service maps to `409`); the atomic claim `UPDATE … WHERE status='pending' AND expires_at > now()` succeeds once and never for an expired row; down scripts work in the documented reverse order (running `138` down first is refused by the FK), are idempotent, remove only the three tables, and the forward files re-apply afterwards. Caveats: PGlite is Postgres 17 (Supabase is usually 15, nothing used is version-specific), and PostgREST-specific behavior (the embedded `user_participant_types` join, `.or()`) is not exercised there.
- **Delegation review (no code change needed):** no organizer controller reads `req.user.email`/`username`, so the identity swap changes nothing about who a message "comes from"; the WebSocket `handleSubscribe` is dead code, so `canSubscribeToRoom` is the only room gate; the global rate limiter keys by the token's subject (the student) so officers do not drain the owner's bucket, while route-specific limiters (email, upload, officer changes) key by the owner and are therefore shared per organization on purpose.
- **Gaps from Phase E/F closed:** officer actions are shown as **"by <student> (officer)"** in the admin Audit Logs and the organizer activity table; the student is **emailed when assigned or reactivated** (best-effort; a failed send never fails the assignment and the organizer is warned); **Account Manager is searchable** for the owner and hidden from officers.
- **Test safety:** because the backend loads a real `.env`, every test that can assign an officer mocks the mailer. Template tests check HTML-escaping of all three new emails (names, notes and reasons are user-supplied).
- **Test-runner change:** `backend/vitest.config.js` now sets `hookTimeout: 30000`. The existing `submission-flow.e2e` suite spends ~9 s in its `beforeAll` even when run alone, against a 10 s default, so it failed whenever the machine was busy. This only widens the allowance; no assertion changed.
- **Final regression:** backend **945 pass**, with only the 3 pre-existing failures (STUDENT-type ×2, competition navigation ×1). One of two full runs also failed a different heavy app-booting test (`competition-rate-policy`) that passes 5/5 solo three times; frontend **732 pass**, the 9 known failing files plus up to two rotating load flakes (`NativeSetupWorkspace`, `RoundsScoringConfiguration`, `ElectionPositionsPage`) that pass solo. ESLint is clean on everything I changed; the 2 remaining `no-unused-vars` errors in `AuditLogsPage.jsx` (`toastError`, `navigate`) exist at `HEAD` and were left alone. `vite build` succeeds.
- **Docs updated:** `docs/AUTH.md`, `docs/ai/BUSINESS_RULES.md` (Organizer Application Rules, Student Officer Rules, audit attribution), `docs/ai/API.md` (limiters and endpoints), `docs/ai/DATABASE.md`, `backend/src/database/README.md` (apply/rollback order), `docs/ai/CHANGELOG_AI.md`.

---

### Update — "Add organizer" removed, "Template" renamed "Form" (decision D2 settled)
- **Removed** the one-by-one **Add organizer** button from Users → Organizers → Accounts. Organizers now join by invitation, or in bulk by CSV import. The admin dashboard's "Add organizer" quick action became **Invite organizer**, deep-linked to `?tab=organizers&section=invitations` (otherwise it would have led to a page with no add button).
- **Kept on purpose:** the organizer form component (it is also the **Edit** form), `createOrganizerAccount()` (approval calls it), the CSV tools, and the `POST /api/admin/organizers` endpoint (now unused by the UI). Its create mode inside `CreateOrganizerModal` is therefore unreachable dead code; deleting it, and the endpoint if a certificates-always policy is wanted, are optional follow-ups.
- **Renamed** the **Template** button to **Form** on every user-management list: Organizers, Students, Judges (and the unused legacy Voters panel). It still downloads the same CSV import file; the matching error messages say "form".
- No database change is needed for this.

---

## 12. Rollout runbook

### Before you deploy
0. **Pre-flight check for 135–137** (run in the Supabase SQL editor; read-only):
   ```sql
   -- Students must have a STUDENT row; legacy student types should be gone.
   select participant_type, is_active, count(*) from user_participant_types group by 1, 2 order by 1, 2;
   -- Expected after 135–137: STUDENT (and JUDGE) rows; no ELECTION_VOTER, POLLING_RESPONDENT or COMPETITION_JUDGE.
   select pg_get_constraintdef(oid) from pg_constraint where conname = 'user_participant_types_participant_type_check';
   -- Expected to allow STUDENT, JUDGE and ORGANIZER.
   ```
   If students still show `ELECTION_VOTER`/`POLLING_RESPONDENT`, migration 136 has not fully applied. Fix that first; until then no student appears in the officer search (the admin student list has the same dependency).
1. **Prerequisites:** the STUDENT/JUDGE migrations 135–137 are applied (officer eligibility uses `user_participant_types`). `FRONTEND_URL` (or `CLIENT_URL`) is the real public origin, since it builds the emailed application link; `RESEND_API_KEY` / `RESEND_FROM_EMAIL` are set (without them invitations still work, but the admin must copy the link by hand, and officer/decline emails are skipped); `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` are set (certificate upload returns `503` without them).
2. **Back up** the database (or confirm point-in-time recovery).

### Deploy order
1. Apply migrations **138 → 139 → 140** in the Supabase SQL editor. They are additive and idempotent; nothing reads them yet, so this is safe to do first.
2. Deploy the **backend**. Existing organizers are unaffected (`resolveOrganizerContext` is a no-op for them). Public routes `/api/public/organizer-apply/:token` go live.
3. Deploy the **frontend**.
4. Smoke test (§13).

### Rollback
- **Fastest, no data loss:** redeploy the previous backend/frontend. The new tables are simply unused. Existing organizers, students and events are unaffected either way.
- **Disable officers only:** remove `resolveOrganizerContext` from `routes/organizer.routes.js` (officers then get the normal `403`); nothing else needs to change.
- **Remove the data:** run `140_down`, then `139_down`, then `138_down` (this order; `139` references `138`). This deletes invitations, applications and officer assignments only. Organizer accounts already created from approved applications stay as ordinary organizers.

### Operational notes
- An application link cannot be re-displayed (only its hash is stored). If an admin loses it, **Resend** issues a new link and kills the old one.
- Declined applications' certificates are **kept** (decision D5 is still open). Add a retention/cleanup job if you want them deleted after a period.
- Certificate links shown to admins are signed Cloudinary URLs; they do not expire on their own. Treat them as sensitive and do not paste them into tickets.
- Email sending uses the existing quota/dedupe guard; a blocked or failed send never blocks the underlying action and is surfaced in the admin/organizer UI.

---

## 13. Manual QA checklist (run once in a real environment)

**Invitation → application → approval**
1. Admin → Users → Organizers → Invitations → *Invite organizer* with a real mailbox. The invite email arrives; the link opens `/organizer/apply/<token>` (also while signed in as an admin).
2. Submit with a bad program, a `.exe` renamed to `.pdf`, and no certificate: each is refused with a clear message and the link still works.
3. Submit properly with a PDF and a PNG. The confirmation screen shows; reopening the same link shows the generic "can't be used" screen.
4. Admin → Applications shows it as pending (tab badge = 1). Open it: certificates open through signed links; change the scope; **Approve**. The applicant receives the temporary-password email, signs in, is forced to change the password and lands on the dashboard (no `PROFILE_INCOMPLETE`).
5. Repeat with **Decline** (reason required): the applicant receives the reason.
6. Revoke an unused invitation: its link now shows the generic screen. Resend works and the old link is dead.

**Student officers**
7. As the organizer: Account Manager → *Add officer* shows only in-scope students; assign one with a position. The student receives the email.
8. Sign in as that student: the dashboard shows the *Open organizer workspace* card; the workspace has the officer banner, the organizer navigation, and **no** Account Manager. Create an event; confirm it appears for the organizer and that Admin → Audit Logs shows it under the organizer "by <student> (officer)".
9. As the officer, open `/organizer/officers` directly: you are redirected. Try editing the organization profile or logo: refused.
10. As the organizer, **Deactivate** the officer: within a minute (or on next click) the officer is moved back to their student view with a message, and their organizer URLs return 403. They can still vote as a student.
11. Suspend the organizer account: an active officer loses access; reinstate and it returns.
12. Open an organizer live page in two browsers (organizer + officer) and confirm live updates reach both; deactivate and confirm the officer stops receiving them after the next reconnect.
13. Admin → Organizer detail → *Student officers* lists them and the deactivate override works.

---

### Status of the original decisions (§8)
All six (D1–D6) are implemented on the **recommended defaults** and D7 was confirmed. If you want any changed, the touch points are small: scope source (D1: `organizer-application.service.js` approve/merge), keep direct add (D2: untouched), multi-org officers (D3: drop `uq_organization_officers_one_active_per_student` and add an acting-organization input — a design change, not a flag), officer permissions (D4: `requireOwnerOrganizer` placement), certificate rules (D5: `certificate-storage.service.js` constants + retention), email-bound links (D6: `organizer-invitation.service.js`).

### Remaining risks (honest list)
- Not exercised end to end against the real Supabase/PostgREST, Resend and Cloudinary; §13 is the gate for that.
- Cloudinary `authenticated` upload and signed-URL delivery are untested without credentials.
- Certificate signed URLs do not expire; declined-application certificates are retained.
- Some frontend/back-end test files already fail on `main` (competition and STUDENT-type tests) and a few heavy UI tests are load-flaky; none are related to this work, but a CI run should not be trusted as "green" until those are fixed.
