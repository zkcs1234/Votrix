# VOTRIX Admin Role Analysis

> **Document Version:** 2.0.0 (Updated)
> **Analysis Date:** Current
> **Scope:** Re-analysis of the VOTRIX System Administrator role against the **current** codebase. Supersedes v1.0.0, which described a pre-onboarding, "pending approval" model. This document corrects outdated assumptions (organizer account activation lifecycle, existing indexes, duplicate search/export/health capabilities) and provides an accurate baseline for the accompanying implementation plan.
> **Source File:** `backend/src/routes/admin.routes.js`, `backend/src/controllers/admin.controller.js`, `backend/src/services/admin.service.js`, `backend/src/services/dashboard.service.js`, `frontend/src/pages/admin/*`

---

## Table of Contents

1. [Current System Analysis](#1-current-system-analysis)
2. [Existing Admin Capabilities](#2-existing-admin-capabilities)
3. [Responsibility Boundary](#3-responsibility-boundary)
4. [Verified Admin API Surface](#4-verified-admin-api-surface)
5. [Gaps & Missing Admin Responsibilities](#5-gaps--missing-admin-responsibilities)
6. [Corrections to the Previous Analysis](#6-corrections-to-the-previous-analysis)
7. [Recommended Enhancements](#7-recommended-enhancements)
8. [Permission Matrix](#8-permission-matrix)
9. [Security Review](#9-security-review)
10. [Summary of Changes](#10-summary-of-changes)

---

## 1. Current System Analysis

### 1.1 System Overview

VOTRIX is an event management platform with three distinct user roles:

| Role          | Purpose                                 | Created By       | Login Identifier |
| ------------- | --------------------------------------- | ---------------- | ---------------- |
| **Admin**     | Platform administration                 | Manual DB insert | `username`       |
| **Organizer** | Organization & event management         | Admin            | `email`          |
| **Voter**     | Event participation (vote, score, poll) | Organizer        | `email`          |

The platform supports three event types:

- **Election** — Positions, candidates, ballot voting
- **Competition** (formerly Pageant) — Contestants, criteria, judge scoring, categories, rounds
- **Polling** — Dynamic surveys with registry-driven question types

### 1.2 Architecture

```
Client (React SPA — Vercel) → Backend (Express 5 — Render) → Database (Supabase PostgreSQL)
```

- **Frontend:** React 19, Vite 8, React Router 7, Zustand, Tailwind CSS 4
- **Backend:** Express 5 (ESM), JWT auth via HTTP-only cookies, CSRF double-submit pattern
- **Database:** PostgreSQL 15+ via Supabase (service role — no RLS, app-layer auth)
- **Realtime:** Custom WebSocket server (in-memory rooms)
- **External Services:** Cloudinary (images), Resend (email)

### 1.3 Database Schema (Core Tables)

| Table                | Purpose                                        | Key Relationships                                                   |
| -------------------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| `users`              | All accounts (admin/organizer/voter)           | Role-based, account_status, token_version, organizer profile fields |
| `organizations`      | Tenant container (1:1 with organizer)          | `organizer_id → users.id`                                           |
| `events`             | Event instances (election/competition/polling) | `organization_id → organizations.id`                                |
| `event_participants` | Event-scoped participant roles                 | `event_id, user_id, participant_type`                               |
| `invitations`        | Voter invitation tracking                      | `event_id, voter_id, invitation_sent`                               |
| `audit_logs`         | Admin and organizer action audit trail         | `user_id, action, entity, entity_id, details`                       |
| `system_settings`    | Global system configuration                    | `setting_key, setting_value (JSONB)`                                |
| `notifications`      | In-app notification center                     | `user_id, type, title, message`                                     |

> **Important (v2.0):** Since the previous analysis, migration `031_organizer_onboarding_profile.sql` added `organizer_name`, `position`, and `organization_type_display` directly on the `users` table and **flipped all organizers to `account_status = 'active'` on creation**. There is **no longer a `pending` status** for organizers — new organizer accounts are created active immediately.

### 1.4 Authentication & Authorization Flow

```
Request → CORS → Rate Limiter → Body Parsing → Cookie Parsing → CSRF Validation
  → Route Match → authenticate (JWT cookie) → authorize(role) → requireActiveAccount
  → requirePasswordChanged → [requireProfileComplete] → Controller → Service → DB
```

**Key Middleware (`backend/src/middleware/auth.js`):**

- `authenticate` — Reads `votrix_access` cookie, verifies JWT, loads user, checks `token_version` (constant-time comparison)
- `authorize(role)` — Checks `req.user.role` against allowed roles
- `requireActiveAccount` — Verifies `account_status === 'active'`
- `requirePasswordChanged` — Blocks access if `must_change_password === true`
- `requireProfileComplete` — Organizer-specific: blocks if profile fields are empty
- `requireEventParticipant` — Voter-specific: verifies event enrollment with participant type

---

## 2. Existing Admin Capabilities

All of the following are **verified as implemented** in the current codebase.

### 2.1 Feature Inventory

| Feature                                       | Status      | Files (verified)                                                                       |
| --------------------------------------------- | ----------- | -------------------------------------------------------------------------------------- |
| **Admin Dashboard + platform stats**          | ✅ Complete | `AdminDashboardPage.jsx`, `dashboard.service.js` (`getAdminDashboardStats`)            |
| **Analytics charts**                          | ✅ Complete | `AdminDashboardPage.jsx`, `dashboard.service.js` (`getAdminAnalytics`)                 |
| **Recent activity feed**                      | ✅ Complete | `dashboard.service.js` (`loadRecentActivity`)                                          |
| **Real-time dashboard updates**               | ✅ Complete | `useSocketEvent('platform:stats-updated')`                                             |
| **Organizer account creation**                | ✅ Complete | `user.service.js` (`createOrganizer`), `CreateOrganizerModal.jsx`                      |
| **Organizer status management**               | ✅ Complete | `admin.service.js` (`updateOrganizerAccountStatus`)                                    |
| **Organizer onboarding email**                | ✅ Complete | `admin.service.js` (`sendOnboardingNotification`)                                      |
| **Global events view (read-only)**            | ✅ Complete | `admin.service.js` (`getGlobalEvents`), `GlobalEventsPage.jsx`                         |
| **System settings management**                | ✅ Complete | `admin.service.js` (`getSystemSettings`/`saveSystemSetting`), `SystemSettingsPage.jsx` |
| **Audit log viewer (filterable + paginated)** | ✅ Complete | `foundation/audit.js` (`listAuditTrail`), `AuditLogsPage.jsx`                          |
| **Audit log CSV export (client-side)**        | ✅ Complete | `AuditLogsPage.jsx` (`exportCSV`)                                                      |
| **Organizer profile status tracking**         | ✅ Complete | `admin.service.js` (`getOrganizersList`), `OrganizerManagementPage.jsx`                |

### 2.2 Current Admin Feature Detail

#### 2.2.1 Admin Dashboard (`/admin`)

- **Stats Cards:** Total organizers, total events, total voters, active events, votes cast
- **Quick Links:** Organizers, Events, Settings, Audit Logs
- **Recent Activity Feed:** Organizer creations, event creations, invitations sent, CSV imports
- **Charts:** Monthly events (area chart), voter growth (area chart)
- **Real-time Updates:** WebSocket listener for `platform:stats-updated`

#### 2.2.2 Organizer Management (`/admin/organizers`)

- **List View:** Table with organization name, organizer name, email, status, created date
- **Filters:** Search by email/organization, status filter buttons (all/active/suspended/archived)
- **Actions:**
  - Create organizer account (opens inline modal)
  - Suspend / Reinstate organizer
  - Archive organizer
  - Send onboarding notification email (shown when profile incomplete)
- **Stats:** Total organizers, active count, suspended count
- **Profile Status:** Shows "Onboarded" badge when profile is complete

#### 2.2.3 Global Events View (`/admin/events`)

- Lists all events across all organizations (read-only)
- Shows event title, type, status, dates, organization name
- Client-side filters: search, type, status

#### 2.2.4 System Settings (`/admin/settings`)

- View and update system-wide configuration
- Key-value store with JSONB values (`system_settings`)
- Audit logged on every update (`UPDATE_SYSTEM_SETTING`)
- Inline editing for string/number/boolean/JSON values

#### 2.2.5 Audit Logs (`/admin/audit-logs`)

- Paginated, filterable audit trail
- Filters: search, action, entity, date range, sort direction
- Shows actor (user email/role), action, entity, details, timestamp
- Detail modal with JSON copy
- **Client-side CSV export** of current page
- Backend caps at 200 rows/page; `v_audit_log_with_user` view exists for joins

---

## 3. Responsibility Boundary

### 3.1 Admin Responsibilities

| Responsibility                      | Rationale                               | Why Not Organizer/Voter                                                        |
| ----------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| **Create organizer accounts**       | Platform onboarding gatekeeper          | Organizers cannot self-register; prevents unauthorized platform access         |
| **Manage organizer account status** | Platform security and compliance        | Organizers should not control each other's access                              |
| **View all events globally**        | Platform oversight and monitoring       | Organizers should only see their own events (data isolation)                   |
| **Manage system settings**          | Global configuration authority          | Settings affect all tenants; organizers should not change platform-wide config |
| **View audit logs**                 | Security auditing and compliance        | Organizers should not see other organizations' audit trails                    |
| **Send onboarding reminders**       | Facilitate organizer profile completion | Organizer cannot self-trigger admin emails                                     |
| **Monitor platform analytics**      | Capacity planning and growth tracking   | Organizer analytics are scoped to their organization                           |
| **Monitor platform health**         | Ensure system reliability               | Organizers lack system-level visibility                                        |

### 3.2 Organizer Responsibilities

| Responsibility                                  | Rationale                         | Why Not Admin                                                 |
| ----------------------------------------------- | --------------------------------- | ------------------------------------------------------------- |
| **Manage organization profile**                 | Self-service tenant configuration | Admin should not micromanage individual org details           |
| **Create and manage events**                    | Core business function            | Admin should not interfere with event operations              |
| **Manage event participants**                   | Event-specific enrollment         | Admin lacks context for event-specific participant management |
| **Configure event settings**                    | Event-specific customization      | Admin should not set event-level configuration                |
| **Invite voters**                               | Event participation management    | Admin should not manage individual event invitations          |
| **Manage election/competition/polling content** | Module-specific setup             | Admin lacks domain knowledge for individual events            |
| **View event analytics/reports**                | Event performance tracking        | Admin has platform-level analytics; organizer has event-level |

### 3.3 Voter Responsibilities

| Responsibility                           | Rationale           | Why Not Admin/Organizer                                     |
| ---------------------------------------- | ------------------- | ----------------------------------------------------------- |
| **Cast votes in elections**              | Core voter function | Admin/organizer should not vote on behalf of voters         |
| **Score competition contestants**        | Judge function      | Admin/organizer should not score on behalf of judges        |
| **Respond to polls**                     | Respondent function | Admin/organizer should not respond on behalf of respondents |
| **Manage own account (change password)** | Account security    | Admin/organizer should not manage voter credentials         |

### 3.4 Boundary Rules

1. **Admin does NOT create events** — Events are created by organizers within their organization
2. **Admin does NOT manage event participants** — Participant management is event-specific
3. **Admin does NOT configure event settings** — Module-specific settings are organizer responsibilities
4. **Admin does NOT invite voters** — Voter invitations are event-specific
5. **Admin does NOT manage module content** — Positions, candidates, contestants, criteria, questions are organizer responsibilities
6. **Admin CAN view all events** — For platform oversight, but cannot modify them
7. **Admin CAN manage organizer lifecycle** — Create, suspend, reinstate, archive
8. **Admin CAN manage system-wide settings** — Configuration that affects all tenants
9. **Admin CAN view audit logs** — For security and compliance monitoring

---

## 4. Verified Admin API Surface

**Source:** `backend/src/routes/admin.routes.js`

| Method | Endpoint                                | Purpose                                                  |
| ------ | --------------------------------------- | -------------------------------------------------------- |
| GET    | `/admin/overview`                       | Placeholder overview                                     |
| GET    | `/admin/dashboard`                      | Dashboard stats + recent activity (WebSocket-broadcast)  |
| GET    | `/admin/analytics`                      | Chart data (monthly events, voter growth, participation) |
| GET    | `/admin/organizers`                     | List all organizers with profile summary                 |
| POST   | `/admin/organizers`                     | Create organizer account (`adminActionLimiter`)          |
| PATCH  | `/admin/organizers/:id/status`          | Update organizer account status (`adminActionLimiter`)   |
| POST   | `/admin/organizers/:id/send-onboarding` | Send onboarding email (`adminActionLimiter`)             |
| GET    | `/admin/events`                         | List all events globally (read-only)                     |
| GET    | `/admin/settings`                       | Get system settings                                      |
| PUT    | `/admin/settings`                       | Update system setting (audit-logged)                     |
| GET    | `/admin/audit-logs`                     | Paginated audit log query                                |

**Route guards:** All admin routes are wrapped with `authenticate → authorize(USER_ROLES.ADMIN) → requirePasswordChanged`, preceded by `validateRouteUUIDParams`.

**Related public/infrastructure endpoints:**

| Method | Endpoint  | Purpose                                          | Admin-scoped? |
| ------ | --------- | ------------------------------------------------ | ------------- |
| GET    | `/health` | Public health: DB + Cloudinary + Resend booleans | ❌ No         |

---

## 5. Gaps & Missing Admin Responsibilities

The following responsibilities are **genuinely missing** and serve distinct admin purposes (verified against current code):

### 5.1 Organizer Activity Timeline

- **Gap:** Audit logs capture organizer actions (`user_id` = actor) but there is **no per-organizer view**. Auditors must manually filter the global trail.
- **Root cause:** `foundation/audit.js` `listAuditTrail()` filters by `entity_id` (the row the action affected), **not** the actor's `user_id`. A `userId` filter is needed.
- **Admin-only:** Organizer activity monitoring is an oversight function.

### 5.2 Confirmation Dialogs for Irreversible Actions

- **Gap:** Suspend/archive currently execute on a single click with **no confirmation** and **no reason capture**. Accidental archival has no safety net.
- **Root cause:** `OrganizerManagementPage.jsx` calls `handleStatusChange()` directly. `PATCH /status` accepts only `{ accountStatus }` — no `reason` field.

### 5.3 Backend Data Export (platform-level)

- **Gap:** Audit log export is **client-side only** (current page). There is no server-side export for organizers/events, no full audit export, and no date-range-limited CSV/PDF generation.
- **Admin-only:** Platform-wide data export for compliance is an admin function.

### 5.4 Admin Platform Health Dashboard

- **Gap:** A public `/health` endpoint exists (DB + Cloudinary + Resend booleans), but there is **no admin-scoped health endpoint** and **no admin UI** showing service status, response times, or WebSocket health.
- **Admin-only:** System health monitoring is exclusively admin responsibility.

### 5.5 Admin Alert Configuration & History

- **Gap:** `createAdminAlert` exists in `notification.service.js` (sends admin notifications via `createNotificationsForRole`), but there is **no configuration UI**, **no threshold management**, and **no alert history view**.
- **Admin-only:** Alert configuration is platform administration.

### 5.6 Platform-Wide Live Search

- **Gap:** A `GlobalSearch` component exists in the app header (Cmd+K), but it searches only the **static navigation index** (`frontend/src/config/searchIndex.js`). It does **not** search live platform entities (organizers, events, users).
- **Admin-only:** Unified **data** search across all tenants is an admin productivity feature.

### 5.7 Admin Session Management

- **Gap:** Sessions are JWT HTTP-only cookies with `token_version` invalidation. There is **no per-session view or revocation UI**; the only way to invalidate sessions is a password change (bumps `token_version`). No `user_sessions` table exists.
- **Admin-only:** Session security oversight is an admin function (and valuable for all roles).

### 5.8 Event Archival Policy

- **Gap:** `EVENT_STATUS.ARCHIVED` exists in constants, but there is **no policy** to auto-archive completed events, no `archived_at` column, and no scheduled/retention mechanism. Section 7.9 of the old analysis remains unaddressed.

> **Note on "Organization Lifecycle Management":** The previous analysis proposed a separate organization approval workflow. Given the current model (admin creates organizers as **active**, organization is 1:1 with organizer), managing organization `status` independently is low-value and remains **excluded** in the implementation plan (see plan §1).

---

## 6. Corrections to the Previous Analysis

| #   | Previous claim (v1.0)                               | Verified reality (current)                                                                                                                                                     |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Organizers created as `pending`, admin must approve | Migration `031` flips all organizers to `active` on creation. No `pending` status in `ACCOUNT_STATUS`. `CreateOrganizerModal` & UI copy about "pending approval" is now stale. |
| 2   | Need new index `idx_audit_logs_user_id_action`      | Migration `019` already provides `idx_audit_logs_user_created (user_id, created_at DESC)` and `idx_audit_logs_entity_created`. No new index required for per-user activity.    |
| 3   | Organizer activity filters by `entityId`            | Wrong. The actor is `user_id`. Requires a new `userId` filter in `foundation/audit.js` `listAuditTrail()`.                                                                     |
| 4   | Reusable `@/components/ui/Modal` exists             | No `Modal.jsx` in `frontend/src/components/ui/`. Modals (e.g. `CreateOrganizerModal`) use inline fixed-overlay markup.                                                         |
| 5   | No data export anywhere                             | `AuditLogsPage.jsx` already has a **client-side** CSV export of the current page. Backend export is missing.                                                                   |
| 6   | No search capability                                | `GlobalSearch` exists (Cmd+K) but is **static-index only**; live entity search is the gap.                                                                                     |
| 7   | No health monitoring                                | Public `/health` exists but not admin-scoped and no admin UI / history.                                                                                                        |
| 8   | Health/service infrastructure unknown               | `checkDatabaseConnection()`, `getCloudinary()`, `getResend()` confirmed in `health.controller.js`.                                                                             |
| 9   | New migrations would be `033+`                      | Migrations currently go up to `034`; new migrations must be `035+`.                                                                                                            |

---

## 7. Recommended Enhancements

### 7.1 Enhancement Priority Matrix

| Feature                                       | Priority | Effort | Impact | Phase (plan) |
| --------------------------------------------- | -------- | ------ | ------ | ------------ |
| Organizer Activity Timeline                   | High     | Low    | High   | Phase 1      |
| Confirmation Dialogs for Irreversible Actions | High     | Low    | High   | Phase 1      |
| Backend Data Export & Reporting               | Medium   | Low    | Medium | Phase 2      |
| Admin Platform Health Dashboard               | Medium   | Medium | High   | Phase 2      |
| Admin Alert Configuration & History           | Medium   | Low    | Medium | Phase 2      |
| Platform-Wide Live Search                     | Low      | Medium | Medium | Phase 3      |
| Event Archival Policy                         | Low      | Medium | Medium | Phase 3      |
| Admin Session Management                      | Medium   | Medium | Medium | Phase 3      |

Each enhancement is elaborated (dependencies, API changes, file impact) in `docs/admin-enhancement-implementation-plan.md`.

---

## 8. Permission Matrix

### 8.1 Current Permission Matrix (verified)

| Action                        | Admin | Organizer | Voter         |
| ----------------------------- | ----- | --------- | ------------- |
| **Platform Management**       |       |           |               |
| View admin dashboard          | ✓     | ✗         | ✗             |
| View platform analytics       | ✓     | ✗         | ✗             |
| Manage system settings        | ✓     | ✗         | ✗             |
| View audit logs               | ✓     | ✗         | ✗             |
| **Organizer Management**      |       |           |               |
| Create organizer accounts     | ✓     | ✗         | ✗             |
| List all organizers           | ✓     | ✗         | ✗             |
| Update organizer status       | ✓     | ✗         | ✗             |
| Send onboarding email         | ✓     | ✗         | ✗             |
| **Event Management**          |       |           |               |
| View all events (global)      | ✓     | Own Only  | Assigned Only |
| Create / mutate events        | ✗     | ✓         | ✗             |
| **System Administration**     |       |           |               |
| View system health            | ✗ \*  | ✗         | ✗             |
| Configure alerts              | ✗     | ✗         | ✗             |
| Export platform data (server) | ✗     | ✗         | ✗             |
| Configure archival policy     | ✗     | ✗         | ✗             |
| Platform-wide live search     | ✗     | ✗         | ✗             |
| Per-organizer activity        | ✗     | ✗         | ✗             |

\* A _public_ `/health` endpoint exists for all; a dedicated admin-scoped health dashboard does not.

### 8.2 Permission Observations

1. Admin has **no event mutation permissions** — correct by design.
2. Admin has **no voter management permissions** — correct; voter management is event-specific.
3. Admin **can** manage organizer account status and send onboarding reminders.
4. Genuinely missing admin-only capabilities: health dashboard (admin-scoped), alert config, server-side export, archival policy, live search, per-organizer activity, confirmation safety nets.

---

## 9. Security Review

### 9.1 Current Security Posture (verified)

| Area                     | Status    | Assessment                                                                       |
| ------------------------ | --------- | -------------------------------------------------------------------------------- |
| **Authentication**       | ✅ Strong | JWT + HTTP-only cookies, token versioning (constant-time), CSRF double-submit    |
| **Authorization**        | ✅ Strong | Route-level role checks, ownership validation, participant-scoped checks         |
| **Password Storage**     | ✅ Strong | bcrypt hashing, no plaintext storage                                             |
| **Rate Limiting**        | ✅ Strong | `adminActionLimiter` (20/hr) on mutating admin routes; per-route limiters        |
| **Input Validation**     | ✅ Good   | Validators, `sanitize.js`, allowlist for setting keys, `validateRouteUUIDParams` |
| **CSRF Protection**      | ✅ Strong | Double-submit cookie on all mutating requests                                    |
| **Session Management**   | ✅ Good   | Token-version invalidation on password change; **no per-session UI**             |
| **Audit Logging**        | ✅ Good   | Admin + organizer actions logged via `foundation/audit.js`                       |
| **File Upload Security** | ✅ Good   | MIME filtering, Cloudinary, rate limited                                         |
| **Error Handling**       | ✅ Good   | Centralized handler; no stack traces in production                               |

### 9.2 Admin-Specific Security Concerns

#### 9.2.1 Irreversible Actions (no confirmation)

- `Patch /status` accepts `{ accountStatus }` only; no `reason`, no confirmation. **Enhancement:** confirmation dialog + optional reason captured in audit `details`.

#### 9.2.2 Organizer Activity / Audit Integrity

- Audit writes are best-effort (swallowed errors). No per-user filtering today. **Enhancement:** add `userId` filter; consider a health metric for audit write failures.

#### 9.2.3 Admin Session Visibility

- No session list or revocation beyond password change / token-version bump. **Enhancement (Phase 3):** `user_sessions` table + admin session management.

#### 9.2.4 Stricter Admin Rate Limiting

- `adminActionLimiter` verified at 20/hr. Audit-log queries use the global limiter; consider a dedicated read limiter for heavy export/search queries.

### 9.3 Recommended Security Enhancements

| Enhancement                                          | Priority | Effort | Impact                        |
| ---------------------------------------------------- | -------- | ------ | ----------------------------- |
| Confirmation + reason for irreversible admin actions | High     | Low    | Prevents accidental data loss |
| Per-organizer activity audit (userId filter)         | High     | Low    | Improves oversight            |
| Admin session management UI                          | Medium   | Medium | Improves session security     |
| Server-side export with rate limiting                | Medium   | Low    | Controlled data compliance    |
| Admin-scoped health dashboard                        | Medium   | Medium | Ensures oversight             |

---

## 10. Summary of Changes (vs. v1.0)

| Area                     | Change                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| Organizer activation     | Corrected: organizers created **active**, not pending (migration 031)                    |
| Existing indexes         | Corrected: `idx_audit_logs_user_created` / `idx_audit_logs_entity_created` already exist |
| Activity filter          | Corrected: filter by actor `user_id`, not `entity_id`                                    |
| Modals                   | Corrected: no shared `Modal` component — use inline overlay pattern                      |
| Export / search / health | Clarified partial state (client export, static search, public health)                    |
| Migration numbering      | Updated: new migrations must be `035+`                                                   |
| Excluded feature         | Organization Lifecycle Management remains excluded (1:1 org, active-on-create)           |
| Enhancements             | Re-scoped to 8 verified gaps across 3 phases                                             |

---

_This document was regenerated by re-analysis of the current VOTRIX codebase. Recommendations are grounded in the current implementation and respect existing architecture, role boundaries, and business rules. It supersedes the outdated v1.0 analysis._
