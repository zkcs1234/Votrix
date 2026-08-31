# Plan: Complete System Audit Logging

Goal: record **every meaningful system action** in `audit_logs` so the Admin → Audit Logs page becomes a full compliance/activity trail — not just sign-in / sign-out and a handful of election actions.

---

## 1. Current State (what IS audited today)

The infrastructure already exists and is solid. The gap is **coverage**, not plumbing.

**Foundation helpers** (already built — reuse these, do not reinvent):
- `recordAudit({ userId, action, entity, entityId, details })` — [backend/src/foundation/audit.js](backend/src/foundation/audit.js). Write-only, best-effort, never throws.
- `recordEventActivity({ eventId, action, userId, details, module })` — [backend/src/foundation/activity.js](backend/src/foundation/activity.js). Event-scoped wrapper around `recordAudit`.
- `createAuditLog(...)` — [backend/src/services/admin.service.js:177](backend/src/services/admin.service.js) — thin alias of `recordAudit`.
- Admin read/UI already works: [getAuditLogs](backend/src/controllers/admin.controller.js:194), [AuditLogsPage.jsx](frontend/src/pages/admin/AuditLogsPage.jsx), CSV export.

**Actions currently written:**

| Area | Actions logged | Location |
|------|----------------|----------|
| Auth | `*_LOGIN_SUCCESS`, `LOGIN_FAILED`, `USER_LOGOUT` | [auth.controller.js](backend/src/controllers/auth.controller.js) |
| Admin | `CREATE_ORGANIZER`, `UPDATE_ORGANIZER_STATUS`, `UPDATE_SYSTEM_SETTING`, `SEND_ONBOARDING_NOTIFICATION`, `REVOKE_SESSION`, `REVOKE_ALL_SESSIONS`, `UPDATE_ARCHIVAL_POLICY`, `RUN_EVENT_ARCHIVAL` | [admin.controller.js](backend/src/controllers/admin.controller.js) |
| Election | `election.event.create/update/duplicate/finalize`, `election.voting.enable/disable`, `election.position.create/delete`, `election.candidate.create/delete` | [election.service.js](backend/src/services/election.service.js) |
| Competition (live) | score submission, elimination decision | [competition-session.service.js](backend/src/services/competition-session.service.js) |

**Two naming styles are in use** — `SCREAMING_SNAKE_CASE` (auth/admin) and `dotted.lower.case` (election/competition). See §3.

---

## 2. Coverage Gaps — Everything NOT audited today

### 🔴 Tier 0 — Security / integrity critical (do first)
These are the actions an admin would most need in an incident review, and their absence is the biggest hole.

| Action | Where to add | Notes |
|--------|--------------|-------|
| **Election vote cast** | `submitBallot` — [election.service.js:815](backend/src/services/election.service.js) | The actual vote is **not logged at all**. Log actor, event, position count — **never the vote choices** (secret ballot). |
| **Poll response submitted** | `submitPollResponse` — [polling.service.js:1082](backend/src/services/polling.service.js) | Same: log submission event, not answer content. |
| Password changed | `changePassword` — [auth.controller.js:161](backend/src/controllers/auth.controller.js) | |
| Password reset requested | `forgotPassword` — [auth.controller.js:149](backend/src/controllers/auth.controller.js) | Log email + IP, best-effort. |
| Password reset completed | `resetPassword` — [auth.controller.js:155](backend/src/controllers/auth.controller.js) | |
| Password change skipped | `skipPasswordChange` — [auth.controller.js:180](backend/src/controllers/auth.controller.js) | |
| Token refresh | `refresh` — [auth.controller.js:88](backend/src/controllers/auth.controller.js) | Optional/high-volume — consider sampling or skip; noisy. |

### 🟠 Tier 1 — Organizer content mutations (create/update/delete)

**Election** ([election.service.js](backend/src/services/election.service.js)) — currently missing:
- `election.position.update`, `election.candidate.update`
- `election.candidate.photo.upload`, `election.event.banner.upload`
- `election.information_form.update`

**Competition / Pageant** — ⚠️ [competition.service.js](backend/src/services/competition.service.js) and [pageant.service.js](backend/src/services/pageant.service.js) have **zero audit calls**. Missing:
- Event: `competition.event.create/update`, `competition.scoring.set`, banner upload
- Division: `competition.division.create/update/delete`, `divisions.enabled` toggle
- Category: `competition.category.create/update/delete`
- Round: `competition.round.create/update/delete`
- Round membership: `competition.round.contestant.add/remove`, `competition.round.criteria.add/remove`
- Criteria: `competition.criteria.create/update/delete`
- Contestant: `competition.contestant.create/update/delete`, photo upload
- Scoring config: `competition.scoring_config.update`
- Judge: `competition.judge.invite/register/update/delete`, `judge.assignment.create/delete`
- Awards: `competition.award.create/update/delete`, `award.status.set`, `awards.enabled` toggle
- Info form: `competition.information_form.update`

**Polling** ([polling.service.js](backend/src/services/polling.service.js)) — **zero audit calls**. Missing:
- Event: `polling.event.create/update`, `polling.poll.open/close`, banner/image upload
- Questions: `polling.question.create/update/delete/reorder/duplicate`
- Custom types: `polling.question_type.create/update/delete`
- Info form: `polling.information_form.update`

### 🟠 Tier 1 — Live competition session controls
[competition-session.service.js](backend/src/services/competition-session.service.js) — score & elimination logged; **session lifecycle is not**:
- `competition.session.start/pause/resume/complete`
- `competition.session.set_round/set_division/set_contestant/stage_group`
- `competition.round.finalize`, `competition.session.resync_scores`
- Judge award selection submitted (`award.selection.submit`)

### 🟡 Tier 2 — Participant / invitation management
- Election voter: `register`, `register-existing`, `invite`, `resend-invitation`, `send-invitation`, `send-all`, CSV `import-register` (log count, not every row) — [election-organizer.controller.js](backend/src/controllers/election-organizer.controller.js)
- Competition judge: `register`, `invite`, `send-invitation`, `send-all`, CSV import
- Polling respondent: `register`, `register-existing`, `invite`, `send-all`, CSV import
- Organizer-level voter invite/notify — [organizer.controller.js](backend/src/controllers/organizer.controller.js) `inviteVoter`, `resendInvitation`, `sendEventNotification`
- Participant self-service info update — [voter.controller.js](backend/src/controllers/voter.controller.js) `updateMyParticipantInformation`

### 🟡 Tier 2 — Organizer profile & org
- `organizer.profile.update` — [organizer-profile.controller.js](backend/src/controllers/organizer-profile.controller.js)
- `organizer.org_logo.upload` — [organizer.controller.js](backend/src/controllers/organizer.controller.js)

### 🟢 Tier 3 — Data access / exports (log the access, not the payload)
- Report exports: election/competition/polling `…/export` — [reports-organizer.controller.js](backend/src/controllers/reports-organizer.controller.js)
- Admin CSV exports: `exportOrganizersData`, `exportEventsData`, `exportAuditLogsData` — [admin.controller.js:250](backend/src/controllers/admin.controller.js)
- Alert config update: `updateAlertConfig` — currently **not** logged despite being a settings change.

### ⚪ Skip (intentional non-events — would just be noise)
- All `GET` list/detail/dashboard/analytics reads
- Draft autosave (`PUT /drafts`) — high frequency; log only `drafts.publish` if anything
- `notifications` mark-read / mark-all-read
- CSRF token issuance, health checks

---

## 3. Naming Convention (standardize going forward)

Adopt **`module.entity.verb`, dotted lowercase** as the standard (matches the newer election/competition code and the foundation docstrings). It sorts and filters cleanly in the Admin UI.

- Verbs: `create`, `update`, `delete`, `enable`, `disable`, `invite`, `submit`, `export`, `login`, `logout`.
- Keep existing `SCREAMING_SNAKE` admin/auth actions **as-is** (non-breaking) — the frontend [`actionTone`/`formatDetailsSummary`](frontend/src/pages/admin/AuditLogsPage.jsx:35) already matches on case-insensitive substrings (`create`, `update`, `delete`, `login`), so both styles render correctly. Only migrate old names if a later cleanup pass is desired.
- `entity` field values stay snake_case table-ish nouns: `events`, `users`, `positions`, `candidates`, `divisions`, `questions`, `awards`, etc.

**Details payload rules:**
- Include: human-friendly identifier (`title`/`name`/`email`), counts, before/after status.
- **Never include**: passwords, tokens, secret ballot choices, poll answer content, full CSV rows.

---

## 4. Implementation Approach

Two complementary layers:

### Layer A — Service-level explicit calls (primary; matches existing pattern)
For every mutation in Tiers 0–2, add a fire-and-forget `recordAudit(...)` (or `recordEventActivity(...)` when there's an `eventId`) right after the successful DB write, mirroring how [election.service.js:197](backend/src/services/election.service.js) already does it. This gives rich, entity-specific `details`.

Prefer `recordEventActivity` for anything scoped to an event — it standardizes `entity='events'`, `entity_id=eventId`, and stamps the `module`, which makes per-event and per-module filtering trivial.

### Layer B — Catch-all mutation middleware (safety net, optional but recommended)
Add one middleware mounted after auth that logs any successful mutating request (`POST/PATCH/PUT/DELETE`, 2xx response) not already covered, deriving a coarse action from method + route. This guarantees **nothing slips through** even if a future endpoint forgets Layer A.

- New file: `backend/src/middleware/auditTrail.js`.
- Use an **allowlist/denylist of routes** to suppress noise (drafts autosave, notifications read, exports if double-logged).
- Emit action like `http.<METHOD>.<normalized-path>` with `entity` inferred from the path, `details = { method, path, status }`.
- Mount in the organizer/admin/voter routers (or globally in [app.js](backend/src/app.js) / [routes/index.js](backend/src/routes/index.js)) after `authenticate`.

Recommendation: ship **Layer A for Tier 0 immediately**, then Tier 1–2, and add **Layer B** as the backstop so coverage is provably complete.

---

## 5. Suggested Rollout (phased PRs)

| Phase | Scope | Est. surface |
|-------|-------|--------------|
| **P1** | Tier 0: votes, poll responses, all password/auth events. Add `recordEventActivity` to `submitBallot` + `submitPollResponse`; audit calls in `auth.controller.js`. | 2 files + auth |
| **P2** | Tier 1 Competition: audit every mutation in `competition.service.js`, `pageant.service.js`, and session lifecycle in `competition-session.service.js`. | ~3 services |
| **P3** | Tier 1 Polling: audit every mutation in `polling.service.js`. | 1 service |
| **P4** | Tier 1 Election gaps (`position.update`, `candidate.update`, uploads, info form) + Tier 2 participant/invitation/profile. | election + controllers |
| **P5** | Tier 3 exports & alert config; add **Layer B** catch-all middleware as backstop. | middleware + controllers |
| **P6** | Frontend polish: friendly labels for new dotted actions in [`formatDetailsSummary`](frontend/src/pages/admin/AuditLogsPage.jsx:60), optional module/entity filters, action-tone tuning. | 1 page |

---

## 6. Testing

- Unit: extend [__tests__/foundation/audit.test.js](backend/__tests__/foundation/audit.test.js) — assert each newly instrumented service call writes a row with the expected `action`/`entity`/`entityId` and **no sensitive fields**.
- Integration: extend [__tests__/api/admin.api.test.js](backend/__tests__/api/admin.api.test.js) — perform a representative action per module, then assert it surfaces in `GET /admin/audit-logs`.
- Regression guard: assert `submitBallot`/`submitPollResponse` details contain **no** vote/answer content.
- Verify best-effort behavior: a forced audit-write failure must **not** break the underlying user action (the helper already swallows errors — test the call sites don't `await`-throw).

---

## 7. Key Files

| File | Change |
|------|--------|
| `backend/src/foundation/audit.js` / `activity.js` | No change — reuse. |
| `backend/src/controllers/auth.controller.js` | Add password/reset/skip/refresh audit calls. |
| `backend/src/services/election.service.js` | Add vote + missing update/upload/info-form audits. |
| `backend/src/services/polling.service.js` | Add all mutation + poll-response audits (currently none). |
| `backend/src/services/competition.service.js` / `pageant.service.js` | Add all mutation audits (currently none). |
| `backend/src/services/competition-session.service.js` | Add session-lifecycle audits. |
| `backend/src/controllers/*-organizer.controller.js`, `organizer.controller.js`, `voter.controller.js`, `reports-organizer.controller.js` | Add invitation/import/export/profile audits. |
| `backend/src/middleware/auditTrail.js` (new) | Layer B catch-all backstop. |
| `frontend/src/pages/admin/AuditLogsPage.jsx` | Friendly labels/filters for new actions. |

No DB migration required — `audit_logs` table and its indexes already exist.
