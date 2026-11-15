# Plan: Organizer Invitation → Application → Approval, and Student Officers

> **Status:** PROPOSED — nothing implemented. Replaces the earlier pasted "adaptation" answer (see §1 for why).
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
- Candidates = `profile_type = 'student'`, active, not already actively assigned, **filtered with the existing `getOrganizerScope()` + `isStudentInScope()`**. Assign re-validates scope server-side (never trust the picker).
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
- `organizer_invitations`: `id`, `token_hash` (SHA-256; raw token only ever in the email), `email`, `note`, `status` (pending/used/expired/revoked), `expires_at`, `created_by`, `created_at`, `used_at`. Named differently from the existing voter `invitations` table on purpose.
- `organizer_applications`: `id`, `invitation_id` (UNIQUE), `email`, `organizer_name`, `position`, `organization_name`, `organization_type_display`, `requested_scope` (JSONB, same shape as `users.scope`), `certificates` (JSONB array `{url, name, mime, size}`), `status` (pending/approved/declined), `decline_reason`, `reviewed_by`, `reviewed_at`, `organizer_user_id`, `created_at`.

**Admin endpoints** (in `admin.routes.js`, behind existing `adminActionLimiter`): create / list / revoke / resend invitation; list / get / approve / decline application.
**Public endpoints** (new router, rate-limited, CSRF via the existing `/auth/csrf` pattern): `GET /public/organizer-apply/:token` (validates; returns bound email + taxonomy), `POST …/:token` (submit), `POST …/:token/certificate` (upload).

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
| D2 | Keep direct "Add organizer" + CSV? | **Keep** (P5). Removing it strands existing admin workflows. |
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
