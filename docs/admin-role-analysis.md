# VOTRIX Admin Role Analysis

> **Document Version:** 1.0.0  
> **Analysis Date:** 2026-07-04  
> **Scope:** Comprehensive analysis of the VOTRIX system architecture, existing admin capabilities, role boundaries, and recommended enhancements for the System Administrator role.

---

## Table of Contents

1. [Current System Analysis](#1-current-system-analysis)
2. [Existing Admin Capabilities](#2-existing-admin-capabilities)
3. [Responsibility Boundary](#3-responsibility-boundary)
4. [Missing Admin Responsibilities](#4-missing-admin-responsibilities)
5. [Permission Matrix](#5-permission-matrix)
6. [Security Review](#6-security-review)
7. [Recommended Enhancements](#7-recommended-enhancements)
8. [Phased Implementation Plan](#8-phased-implementation-plan)
9. [Summary of Changes](#9-summary-of-changes)

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

| Table                | Purpose                                        | Key Relationships                             |
| -------------------- | ---------------------------------------------- | --------------------------------------------- |
| `users`              | All accounts (admin/organizer/voter)           | Role-based, account_status, token_version     |
| `organizations`      | Tenant container (1:1 with organizer)          | `organizer_id → users.id`                     |
| `events`             | Event instances (election/competition/polling) | `organization_id → organizations.id`          |
| `event_participants` | Event-scoped participant roles                 | `event_id, user_id, participant_type`         |
| `invitations`        | Voter invitation tracking                      | `event_id, voter_id, invitation_sent`         |
| `audit_logs`         | Admin and organizer action audit trail         | `user_id, action, entity, entity_id, details` |
| `system_settings`    | Global system configuration                    | `setting_key, setting_value (JSONB)`          |
| `notifications`      | In-app notification center                     | `user_id, type, title, message`               |

### 1.4 Authentication & Authorization Flow

```
Request → CORS → Rate Limiter → Body Parsing → Cookie Parsing → CSRF Validation
  → Route Match → authenticate (JWT cookie) → authorize(role) → requireActiveAccount
  → requirePasswordChanged → [requireProfileComplete] → Controller → Service → DB
```

**Key Middleware:**

- `authenticate` — Reads `votrix_access` cookie, verifies JWT, loads user, checks `token_version`
- `authorize(role)` — Checks `req.user.role` against allowed roles
- `requireActiveAccount` — Verifies `account_status === 'active'`
- `requirePasswordChanged` — Blocks access if `must_change_password === true`
- `requireProfileComplete` — Organizer-specific: blocks if profile fields are empty
- `requireEventParticipant` — Voter-specific: verifies event enrollment with participant type

### 1.5 Organizer Workflow (Complete)

The organizer has full autonomy within their organization:

1. **Profile Management:** Complete onboarding profile (organization_name, organizer_name, position, organization_type_display)
2. **Event Lifecycle:** Create → Configure → Activate → Complete/Cancel events
3. **Election Management:** Positions, candidates, voter enrollment, CSV import, voting control, analytics
4. **Competition Management:** Contestants, criteria, categories, rounds, judge assignments, scoring config, live control, rankings
5. **Polling Management:** Question builder (8 types), respondent enrollment, analytics
6. **Voter Management:** Invite new voters, invite existing voters, CSV import, resend invitations, send event notifications
7. **Reports:** Per-module reports with export capabilities
8. **Organization Branding:** Logo upload

### 1.6 Voter Workflow (Complete)

1. **Dashboard:** Unified view of assigned events across all modules
2. **Election Participation:** View ballot, cast votes, view results (based on visibility setting)
3. **Competition Participation:** Score contestants per criteria (as judge)
4. **Polling Participation:** Answer survey questions, submit responses
5. **Notifications:** In-app notifications for invitations and event updates

### 1.7 Current Admin Features (Detailed)

The admin module is accessed via `/admin` routes and provides:

#### 1.7.1 Admin Dashboard (`/admin`)

- **Stats Cards:** Total organizers, total events, total voters, active events, votes cast
- **Quick Links:** Organizers, Events, Settings, Audit Logs
- **Recent Activity Feed:** Organizer creations, event creations, invitations sent, CSV imports
- **Charts:** Monthly events (area chart), voter growth (area chart)
- **Real-time Updates:** WebSocket listener for `platform:stats-updated`

#### 1.7.2 Organizer Management (`/admin/organizers`)

- **List View:** Table with organization name, organizer name, email, status, created date
- **Filters:** Search by email/organization, status filter buttons (all/active/suspended/archived)
- **Actions:**
  - Create organizer account (opens modal)
  - Suspend/Reinstate organizer
  - Archive organizer
  - Send onboarding notification email
- **Stats:** Total organizers, active count, suspended count
- **Profile Status:** Shows "Onboarded" badge when profile is complete

#### 1.7.3 Global Events View (`/admin/events`)

- Lists all events across all organizations
- Shows event title, type, status, dates, organization name

#### 1.7.4 System Settings (`/admin/settings`)

- View and update system-wide configuration
- Key-value store with JSONB values
- Audit logged on every update

#### 1.7.5 Audit Logs (`/admin/audit-logs`)

- Paginated, filterable audit trail
- Filters: entity, action, search, date range
- Shows actor (user email/role), action, entity, details, timestamp
- Max 200 rows per page

#### 1.7.6 Admin API Endpoints

| Method | Endpoint                                | Purpose                                                  |
| ------ | --------------------------------------- | -------------------------------------------------------- |
| GET    | `/admin/overview`                       | Placeholder overview                                     |
| GET    | `/admin/dashboard`                      | Dashboard stats + recent activity                        |
| GET    | `/admin/analytics`                      | Chart data (monthly events, voter growth, participation) |
| GET    | `/admin/organizers`                     | List all organizers with profile/org summary             |
| POST   | `/admin/organizers`                     | Create organizer account                                 |
| PATCH  | `/admin/organizers/:id/status`          | Update organizer account status                          |
| POST   | `/admin/organizers/:id/send-onboarding` | Send onboarding email                                    |
| GET    | `/admin/events`                         | List all events globally                                 |
| GET    | `/admin/settings`                       | Get system settings                                      |
| PUT    | `/admin/settings`                       | Update system setting                                    |
| GET    | `/admin/audit-logs`                     | Paginated audit log query                                |

---

## 2. Existing Admin Capabilities

### 2.1 Feature Inventory

| Feature                               | Status      | Assessment                                             |
| ------------------------------------- | ----------- | ------------------------------------------------------ |
| **Dashboard with platform stats**     | ✅ Complete | **Keep** — Provides high-level platform overview       |
| **Organizer account creation**        | ✅ Complete | **Keep** — Core admin responsibility                   |
| **Organizer status management**       | ✅ Complete | **Keep** — Suspend/reinstate/archive                   |
| **Organizer onboarding email**        | ✅ Complete | **Keep** — Useful for profile completion reminders     |
| **Global events view**                | ✅ Complete | **Keep** — Platform-wide event visibility              |
| **System settings management**        | ✅ Complete | **Keep** — Key-value configuration store               |
| **Audit log viewer**                  | ✅ Complete | **Keep** — Essential for security and compliance       |
| **Analytics charts**                  | ✅ Complete | **Keep** — Monthly events, voter growth, participation |
| **Recent activity feed**              | ✅ Complete | **Keep** — Quick visibility into platform activity     |
| **Organizer profile status tracking** | ✅ Complete | **Keep** — Shows onboarding completion state           |

### 2.2 Feature Assessment

#### Keep

All existing admin features are architecturally sound and serve distinct admin purposes. None overlap with organizer functionality.

#### Improve

- **Audit Log Viewer:** Currently limited to 200 rows max. Needs export capability and more advanced filtering.
- **Dashboard:** Stats are aggregated but lack drill-down capability. No organization-level breakdown.
- **Organizer Management:** Lacks bulk operations and detailed activity history per organizer.

#### Move to Organizer

- None identified. All current admin features are platform-level, not organization-level.

#### Remove

- None identified. All features serve a valid admin purpose.

#### Missing

See [Section 4 — Missing Admin Responsibilities](#4-missing-admin-responsibilities).

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
| **Platform health monitoring**      | Ensure system reliability               | Organizers lack system-level visibility                                        |

### 3.2 Organizer Responsibilities

| Responsibility                              | Rationale                         | Why Not Admin                                                 |
| ------------------------------------------- | --------------------------------- | ------------------------------------------------------------- |
| **Manage organization profile**             | Self-service tenant configuration | Admin should not micromanage individual org details           |
| **Create and manage events**                | Core business function            | Admin should not interfere with event operations              |
| **Manage event participants**               | Event-specific enrollment         | Admin lacks context for event-specific participant management |
| **Configure event settings**                | Event-specific customization      | Admin should not set event-level configuration                |
| **Invite voters**                           | Event participation management    | Admin should not manage individual event invitations          |
| **Manage election positions/candidates**    | Election-specific setup           | Admin lacks domain knowledge for individual elections         |
| **Manage competition contestants/criteria** | Competition-specific setup        | Admin lacks domain knowledge for individual competitions      |
| **Manage polling questions**                | Polling-specific setup            | Admin lacks domain knowledge for individual polls             |
| **View event analytics/reports**            | Event performance tracking        | Admin has platform-level analytics; organizer has event-level |
| **Upload organization logo**                | Organization branding             | Admin should not manage individual org branding               |

### 3.3 Voter Responsibilities

| Responsibility                           | Rationale           | Why Not Admin/Organizer                                                       |
| ---------------------------------------- | ------------------- | ----------------------------------------------------------------------------- |
| **Cast votes in elections**              | Core voter function | Admin/organizer should not vote on behalf of voters                           |
| **Score competition contestants**        | Judge function      | Admin/organizer should not score on behalf of judges                          |
| **Respond to polls**                     | Respondent function | Admin/organizer should not respond on behalf of respondents                   |
| **View personal event participation**    | User-specific data  | Admin/organizer should not view individual voter activity without audit trail |
| **Manage own account (change password)** | Account security    | Admin/organizer should not manage voter credentials                           |

### 3.4 Boundary Rules

1. **Admin does NOT create events** — Events are created by organizers within their organization
2. **Admin does NOT manage event participants** — Participant management is event-specific and belongs to organizers
3. **Admin does NOT configure event settings** — Voting rules, scoring config, polling settings are organizer responsibilities
4. **Admin does NOT invite voters** — Voter invitations are event-specific
5. **Admin does NOT manage election/competition/polling content** — Positions, candidates, contestants, criteria, questions are organizer responsibilities
6. **Admin does NOT view organization-specific analytics** — Organizer analytics are scoped to their organization
7. **Admin CAN view all events** — For platform oversight, but cannot modify them
8. **Admin CAN manage organizer lifecycle** — Create, suspend, reinstate, archive
9. **Admin CAN manage system-wide settings** — Configuration that affects all tenants
10. **Admin CAN view audit logs** — For security and compliance monitoring

---

## 4. Missing Admin Responsibilities

### 4.1 Feature: Organization Lifecycle Management

#### Purpose

Enable admins to manage organization status (approve, suspend, archive organizations) independently of organizer account status.

#### Problem Solved

Currently, organization status is set during creation and never managed by the admin. If an organizer violates terms, the admin can only suspend the organizer account but cannot separately manage the organization record. This creates ambiguity when an organization needs to be preserved but the organizer access revoked, or vice versa.

#### Why Admin?

Organization status management is a platform-level governance function. Organizers should not self-manage their organization's approval status.

#### Dependencies

- `organizations` table (already exists)
- `admin.service.js` (already exists)
- `admin.routes.js` (already exists)

#### Required Database Changes

- Add `GET /admin/organizations` endpoint
- Add `PATCH /admin/organizations/:orgId/status` endpoint
- No schema changes needed (organizations already has `status` column)

#### API Changes

```javascript
// New endpoints
GET    /admin/organizations          // List all organizations with organizer details
PATCH  /admin/organizations/:orgId/status  // Update organization status
```

#### UI Changes

- New "Organizations" tab in admin panel
- Table showing all organizations with status, organizer name, event count
- Status change actions (approve, suspend, archive)

#### Permission Changes

- Admin only (existing authorization applies)

#### Impact

Low — Uses existing schema and patterns. No new tables or services needed.

---

### 4.2 Feature: Platform Health Dashboard

#### Purpose

Provide admins with system health metrics: API response times, error rates, active WebSocket connections, database status, external service status (Cloudinary, Resend).

#### Problem Solved

Currently, there is no visibility into system health. If an external service fails or the database has issues, the admin has no dashboard to monitor this. The existing dashboard only shows business metrics (organizers, events, voters).

#### Why Admin?

System health monitoring is exclusively an admin responsibility. Organizers and voters should not have visibility into platform infrastructure.

#### Dependencies

- `backend/src/config/cloudinary.js`
- `backend/src/config/resend.js`
- `backend/src/config/database.js`
- `backend/src/websocket/ws-server.js`

#### Required Database Changes

- New table: `system_health_logs` (optional, for historical tracking)
  ```sql
  CREATE TABLE system_health_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL,  -- 'healthy', 'degraded', 'down'
    response_time_ms INTEGER,
    error_message TEXT,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ```

#### API Changes

```javascript
// New endpoints
GET / admin / health / system; // System health overview
GET / admin / health / logs; // Historical health check logs
```

#### UI Changes

- Health section in admin dashboard
- Status indicators for each service
- Historical uptime chart
- Alert configuration UI

#### Permission Changes

- Admin only

#### Impact

Medium — Requires new service, controller, and database table. Low complexity.

---

### 4.3 Feature: Platform-Wide Search

#### Purpose

Allow admins to search across all entities (organizations, events, users) from a single search interface.

#### Problem Solved

Currently, admins must navigate to separate pages to find organizers, events, or audit logs. There is no unified search that can quickly locate a specific organizer, event, or user across the entire platform.

#### Why Admin?

Unified platform search is an admin productivity feature. Organizers only need to search within their own organization.

#### Dependencies

- `users` table
- `organizations` table
- `events` table
- `event_participants` table

#### Required Database Changes

- Consider adding a GIN index for full-text search on relevant columns:
  ```sql
  CREATE INDEX idx_users_search ON users USING GIN (
    to_tsvector('english', coalesce(email, '') || ' ' || coalesce(organization_name, ''))
  );
  ```

#### API Changes

```javascript
// New endpoint
GET /admin/search?q={query}&type={organizer|event|voter|all}&limit=20
```

#### UI Changes

- Global search bar in admin header
- Search results dropdown with categorized results
- Quick action buttons (view organizer, view event, etc.)

#### Permission Changes

- Admin only

#### Impact

Medium — New search service, controller, and route. Database index addition.

---

### 4.4 Feature: Admin Alert Configuration

#### Purpose

Allow admins to configure system alerts: thresholds for failed email deliveries, new organizer signup notifications, event completion notifications, and suspicious activity alerts.

#### Problem Solved

Currently, `createAdminAlert` exists in `notification.service.js` but is not exposed through any admin UI or configuration. Admins cannot configure what alerts they receive or set thresholds for automated notifications.

#### Why Admin?

Alert configuration is a platform administration function. Organizers should not configure system-wide alerts.

#### Dependencies

- `notification.service.js` (already has `createAdminAlert`)
- `system_settings` table (can store alert configurations)
- WebSocket emitter (for real-time alerts)

#### Required Database Changes

- No schema changes needed. Alert configurations can be stored in `system_settings` with a `setting_key` prefix like `alert.*`.

#### API Changes

```javascript
// New endpoints
GET / admin / alerts / config; // Get alert configuration
PUT / admin / alerts / config; // Update alert configuration
GET / admin / alerts / history; // Alert history
```

#### UI Changes

- Alert configuration page under admin settings
- Toggle switches for each alert type
- Threshold configuration inputs
- Alert history view with acknowledge action

#### Permission Changes

- Admin only

#### Impact

Low — Leverages existing `system_settings` and `notification.service.js`. No new tables.

---

### 4.5 Feature: Data Export and Reporting (Admin Level)

#### Purpose

Provide admins with platform-wide data export capabilities: export organizer list, event list, audit logs, and platform usage reports as CSV/PDF.

#### Problem Solved

Currently, there is no way to export platform data. Admins who need to generate reports for stakeholders must manually copy data from the UI. Audit logs cannot be exported for compliance purposes.

#### Why Admin?

Platform-wide data export is an admin function. Organizers already have per-event report export capabilities.

#### Dependencies

- `admin.service.js` (existing data access methods)
- `audit_logs` table
- `users` table
- `events` table

#### Required Database Changes

- No schema changes needed

#### API Changes

```javascript
// New endpoints
GET /admin/export/organizers?format=csv
GET /admin/export/events?format=csv&status=active
GET /admin/export/audit-logs?format=csv&startDate=...&endDate=...
GET /admin/export/platform-report?format=pdf
```

#### UI Changes

- Export buttons on organizer list, events list, and audit logs pages
- Date range picker for audit log export
- Platform report generation page

#### Permission Changes

- Admin only

#### Impact

Low — New service methods for CSV/PDF generation. Uses existing data access patterns.

---

### 4.6 Feature: Organizer Activity Timeline

#### Purpose

Provide a per-organizer activity timeline showing all actions performed by a specific organizer: events created, voters invited, status changes, login history.

#### Problem Solved

Currently, the audit log shows all actions chronologically but cannot be filtered to show a complete timeline for a single organizer. When investigating an issue with a specific organizer, the admin must manually search through audit logs.

#### Why Admin?

Organizer activity monitoring is an admin oversight function. Organizers should not see other organizers' activity.

#### Dependencies

- `audit_logs` table (already captures organizer actions)
- `users` table

#### Required Database Changes

- No schema changes needed. The `audit_logs` table already has `user_id` and `action` columns.

#### API Changes

```javascript
// New endpoint
GET /admin/organizers/:organizerId/activity?limit=50&offset=0
```

#### UI Changes

- "Activity" tab on organizer detail view
- Timeline UI showing actions with timestamps
- Filter by action type

#### Permission Changes

- Admin only

#### Impact

Low — New query on existing `audit_logs` table. No schema changes.

---

### 4.7 Feature: Event Archival Policy

#### Purpose

Allow admins to configure automatic archival policies for completed events (e.g., auto-archive events completed more than 90 days ago).

#### Problem Solved

Currently, completed events remain in the active view indefinitely. There is no mechanism to clean up old events or enforce data retention policies. This can lead to database bloat and confusing UI for organizers with many historical events.

#### Why Admin?

Data retention policies are platform-level governance. Organizers should not configure archival rules that affect system performance.

#### Dependencies

- `events` table (has `status` and `completed_at`/`end_date`)
- `system_settings` table (for policy configuration)
- Scheduled job infrastructure

#### Required Database Changes

- Add `archived_at` column to `events` table (optional, for tracking when auto-archived)
  ```sql
  ALTER TABLE events ADD COLUMN archived_at TIMESTAMPTZ;
  ```

#### API Changes

```javascript
// New endpoints
GET / admin / policies / archival; // Get archival policy
PUT / admin / policies / archival; // Update archival policy
POST / admin / policies / archival / run - now; // Manually trigger archival
```

#### UI Changes

- Archival policy section under admin settings
- Toggle to enable/disable auto-archival
- Days threshold input
- "Run Now" button for manual trigger

#### Permission Changes

- Admin only

#### Impact

Medium — Requires scheduled job infrastructure (cron or similar). New service for archival logic.

---

## 5. Permission Matrix

### 5.1 Current Permission Matrix

Based on the actual implementation in `backend/src/middleware/auth.js`, `backend/src/routes/`, and `backend/src/services/`:

| Action                      | Admin      | Organizer | Voter         |
| --------------------------- | ---------- | --------- | ------------- |
| **Platform Management**     |            |           |               |
| View admin dashboard        | ✓          | ✗         | ✗             |
| View platform analytics     | ✓          | ✗         | ✗             |
| Manage system settings      | ✓          | ✗         | ✗             |
| View audit logs             | ✓          | ✗         | ✗             |
| **Organizer Management**    |            |           |               |
| Create organizer accounts   | ✓          | ✗         | ✗             |
| List all organizers         | ✓          | ✗         | ✗             |
| Update organizer status     | ✓          | ✗         | ✗             |
| Send onboarding email       | ✓          | ✗         | ✗             |
| View organizer activity     | ✓          | ✗         | ✗             |
| **Organization Management** |            |           |               |
| View all organizations      | ✓          | Own Only  | ✗             |
| Update organization status  | ✓          | ✗         | ✗             |
| Update organization profile | ✗          | ✓         | ✗             |
| Upload organization logo    | ✗          | ✓         | ✗             |
| **Event Management**        |            |           |               |
| View all events (global)    | ✓          | Own Only  | Assigned Only |
| Create events               | ✗          | ✓         | ✗             |
| Update events               | ✗          | ✓         | ✗             |
| Delete events               | ✗          | ✓         | ✗             |
| Change event status         | ✗          | ✓         | ✗             |
| Configure event settings    | ✗          | ✓         | ✗             |
| **Election Module**         |            |           |               |
| Manage positions            | ✗          | ✓         | ✗             |
| Manage candidates           | ✗          | ✓         | ✗             |
| Enroll voters               | ✗          | ✓         | ✗             |
| Cast votes                  | ✗          | ✗         | ✓             |
| View election results       | ✓ (global) | ✓ (own)   | ✓ (if public) |
| **Competition Module**      |            |           |               |
| Manage contestants          | ✗          | ✓         | ✗             |
| Manage criteria             | ✗          | ✓         | ✗             |
| Manage categories/rounds    | ✗          | ✓         | ✗             |
| Assign judges               | ✗          | ✓         | ✗             |
| Submit scores               | ✗          | ✗         | ✓ (if judge)  |
| View rankings               | ✓ (global) | ✓ (own)   | ✓ (if public) |
| **Polling Module**          |            |           |               |
| Manage questions            | ✗          | ✓         | ✗             |
| Enroll respondents          | ✗          | ✓         | ✗             |
| Submit responses            | ✗          | ✗         | ✓             |
| View poll results           | ✓ (global) | ✓ (own)   | ✓ (if public) |
| **Voter Management**        |            |           |               |
| Invite voters to events     | ✗          | ✓         | ✗             |
| Import voters via CSV       | ✗          | ✓         | ✗             |
| Resend invitations          | ✗          | ✓         | ✗             |
| Send event notifications    | ✗          | ✓         | ✗             |
| **Account Management**      |            |           |               |
| Change own password         | ✓          | ✓         | ✓             |
| View own profile            | ✓          | ✓         | ✓             |
| View notifications          | ✓          | ✓         | ✓             |
| **System Administration**   |            |           |               |
| View system health          | ✗          | ✗         | ✗             |
| Configure alerts            | ✗          | ✗         | ✗             |
| Export platform data        | ✗          | ✗         | ✗             |
| Configure archival policy   | ✗          | ✗         | ✗             |
| Platform-wide search        | ✗          | ✗         | ✗             |

### 5.2 Permission Observations

1. **Admin has no event mutation permissions** — Correct by design. Admin is read-only for events.
2. **Admin has no voter management permissions** — Correct by design. Voter management is event-specific.
3. **Admin has no organization profile management** — Correct by design. Organization profile is organizer self-service.
4. **Missing: Organization status management** — Admin can manage organizer accounts but not organization records separately.
5. **Missing: System health monitoring** — No admin visibility into platform health.
6. **Missing: Platform-wide search** — No unified search capability.
7. **Missing: Data export** — No platform-level data export.
8. **Missing: Per-organizer activity timeline** — No filtered view of a single organizer's actions.

---

## 6. Security Review

### 6.1 Current Security Posture

| Area                     | Status    | Assessment                                                                     |
| ------------------------ | --------- | ------------------------------------------------------------------------------ |
| **Authentication**       | ✅ Strong | JWT with HTTP-only cookies, token versioning, CSRF protection                  |
| **Authorization**        | ✅ Strong | Route-level role checks, ownership validation, event-scoped participant checks |
| **Password Storage**     | ✅ Strong | bcrypt hashing, no plaintext storage                                           |
| **Rate Limiting**        | ✅ Good   | Global + per-route limiters, dual IP+user for voting endpoints                 |
| **Input Validation**     | ✅ Good   | Validator files, sanitize utilities, allowlist for setting keys                |
| **CSRF Protection**      | ✅ Strong | Double-submit cookie pattern on all mutating requests                          |
| **Session Management**   | ✅ Good   | Token version invalidation on password change, refresh token rotation          |
| **Audit Logging**        | ✅ Good   | Admin and organizer actions logged with details                                |
| **File Upload Security** | ✅ Good   | MIME type filtering, Cloudinary processing, rate limited                       |
| **Error Handling**       | ✅ Good   | Centralized error handler, no stack traces in production                       |
| **Security Assertions**  | ✅ Good   | `assertProductionSecurity()` on startup                                        |

### 6.2 Admin-Specific Security Concerns

#### 6.2.1 Irreversible Actions

**Current State:** Admin can archive organizers with a single API call. No confirmation dialog or soft-delete mechanism exists.

**Risk:** Accidental archival of an organizer account is irreversible (hard delete cascades).

**Recommendation:**

- Add confirmation dialog for status changes (suspend, archive)
- Implement soft-delete pattern for organizer accounts:
  ```sql
  ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;
  ```
- Add a "recently deleted" view where admins can restore accounts within 30 days
- Log all status changes with before/after state in audit details

#### 6.2.2 Audit Log Integrity

**Current State:** Audit logs are write-only and best-effort. Errors are swallowed to prevent blocking user-facing operations.

**Risk:** If the audit log write fails silently, there is no mechanism to detect missing audit entries.

**Recommendation:**

- Add a health check that verifies audit log write capability
- Consider a dead-letter queue for failed audit writes
- Add an `audit_logs_write_error_count` metric to the health dashboard

#### 6.2.3 Admin Session Management

**Current State:** Admin sessions use the same JWT mechanism as organizers and voters. There is no separate session management UI for admins.

**Risk:** If an admin's session is compromised, there is no way to view or revoke active sessions without changing the password (which invalidates all sessions).

**Recommendation:**

- Add admin session management UI showing active sessions
- Allow admins to revoke specific sessions without password change
- Add IP address and user-agent tracking to session metadata

#### 6.2.4 Rate Limiting for Admin Endpoints

**Current State:** Admin endpoints use `adminActionLimiter` for organizer creation, status updates, and onboarding emails.

**Risk:** The rate limiter configuration is not visible in the analyzed code. If misconfigured, an attacker could brute-force organizer creation or spam onboarding emails.

**Recommendation:**

- Verify `adminActionLimiter` configuration in `rateLimiter.js`
- Add stricter rate limiting for audit log queries (prevent resource exhaustion)
- Add IP-based rate limiting for admin login attempts

#### 6.2.5 Organizer Data Isolation

**Current State:** Admin has global visibility into all organizations and events. The `getOrganizersList` and `getGlobalEvents` functions return all records without filtering.

**Risk:** While this is by design for admin, there is no audit trail for when an admin views a specific organizer's data. Excessive admin access could indicate insider threat.

**Recommendation:**

- Log admin data access events (viewing organizer details, viewing event details)
- Add anomaly detection for unusual admin access patterns
- Consider read-only audit logging for sensitive data access

### 6.3 Recommended Security Enhancements

| Enhancement                                         | Priority | Effort | Impact                        |
| --------------------------------------------------- | -------- | ------ | ----------------------------- |
| Confirmation dialogs for irreversible admin actions | High     | Low    | Prevents accidental data loss |
| Soft-delete for organizer accounts                  | Medium   | Medium | Enables account recovery      |
| Admin session management UI                         | Medium   | Medium | Improves session security     |
| Audit log health monitoring                         | Low      | Low    | Ensures audit trail integrity |
| Admin data access audit logging                     | Medium   | Low    | Detects insider threats       |
| Stricter rate limiting for admin endpoints          | High     | Low    | Prevents abuse                |

---

## 7. Recommended Enhancements

### 7.1 Enhancement Priority Matrix

| Feature                                       | Priority | Effort | Impact | Phase   |
| --------------------------------------------- | -------- | ------ | ------ | ------- |
| Organization Lifecycle Management             | High     | Low    | High   | Phase 1 |
| Organizer Activity Timeline                   | High     | Low    | High   | Phase 1 |
| Confirmation Dialogs for Irreversible Actions | High     | Low    | High   | Phase 1 |
| Data Export and Reporting                     | Medium   | Low    | Medium | Phase 2 |
| Platform Health Dashboard                     | Medium   | Medium | High   | Phase 2 |
| Admin Alert Configuration                     | Medium   | Low    | Medium | Phase 2 |
| Platform-Wide Search                          | Low      | Medium | Medium | Phase 3 |
| Event Archival Policy                         | Low      | Medium | Medium | Phase 3 |
| Admin Session Management                      | Medium   | Medium | Medium | Phase 3 |

### 7.2 Feature: Organization Lifecycle Management

#### Purpose

Enable admins to manage organization status independently of organizer account status.

#### Problem Solved

Currently, organization status is set during creation and never managed. Admin can only suspend organizer accounts, not organizations.

#### Why Admin?

Organization governance is a platform-level function.

#### Dependencies

- `organizations` table (has `status` column)
- `admin.service.js`
- `admin.routes.js`

#### Required Database Changes

None. Uses existing `organizations.status` column.

#### API Changes

```javascript
GET  /admin/organizations
PATCH /admin/organizations/:orgId/status
```

#### UI Changes

- New "Organizations" tab in admin panel
- Table with organization name, status, organizer, event count
- Status change actions

#### Permission Changes

Admin only (existing authorization applies).

#### Impact

Low

---

### 7.3 Feature: Organizer Activity Timeline

#### Purpose

Provide per-organizer activity timeline showing all actions performed by a specific organizer.

#### Problem Solved

Audit logs cannot be filtered to show a complete timeline for a single organizer.

#### Why Admin?

Organizer activity monitoring is an admin oversight function.

#### Dependencies

- `audit_logs` table (has `user_id` and `action` columns)

#### Required Database Changes

None. Add index for efficient querying:

```sql
CREATE INDEX idx_audit_logs_user_id_action ON audit_logs (user_id, created_at DESC);
```

#### API Changes

```javascript
GET /admin/organizers/:organizerId/activity?limit=50&offset=0
```

#### UI Changes

- "Activity" tab on organizer detail view
- Timeline UI with action type, timestamp, details

#### Permission Changes

Admin only.

#### Impact

Low

---

### 7.4 Feature: Confirmation Dialogs for Irreversible Actions

#### Purpose

Require admin confirmation before executing irreversible actions (suspend, archive, delete).

#### Problem Solved

Accidental archival of organizer accounts is irreversible.

#### Why Admin?

Protects against accidental data loss from admin actions.

#### Dependencies

- Frontend UI components
- Admin controller/service (already logs actions)

#### Required Database Changes

None.

#### API Changes

- Add `confirm` parameter to status change endpoints (optional, for API clients)
- Backend: Add confirmation check for destructive actions

#### UI Changes

- Confirmation modal with action details
- "Are you sure?" dialog showing consequences
- Optional "reason for action" text field

#### Permission Changes

None.

#### Impact

Low

---

### 7.5 Feature: Data Export and Reporting (Admin Level)

#### Purpose

Export platform data (organizers, events, audit logs) as CSV/PDF.

#### Problem Solved

No way to export platform data for reporting or compliance.

#### Why Admin?

Platform-wide data export is an admin function.

#### Dependencies

- `admin.service.js` (existing data access)
- CSV/PDF generation library

#### Required Database Changes

None.

#### API Changes

```javascript
GET /admin/export/organizers?format=csv
GET /admin/export/events?format=csv
GET /admin/export/audit-logs?format=csv&startDate=...&endDate=...
```

#### UI Changes

- Export buttons on list pages
- Date range picker for audit log export

#### Permission Changes

Admin only.

#### Impact

Low

---

### 7.6 Feature: Platform Health Dashboard

#### Purpose

Monitor system health: API status, database connectivity, external services, WebSocket connections.

#### Problem Solved

No visibility into system health or external service status.

#### Why Admin?

System health monitoring is exclusively an admin responsibility.

#### Dependencies

- `backend/src/config/cloudinary.js`
- `backend/src/config/resend.js`
- `backend/src/config/database.js`
- `backend/src/websocket/ws-server.js`

#### Required Database Changes

```sql
CREATE TABLE system_health_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL,
  response_time_ms INTEGER,
  error_message TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### API Changes

```javascript
GET / admin / health / system;
GET / admin / health / logs;
```

#### UI Changes

- Health section in admin dashboard
- Service status indicators
- Historical uptime chart

#### Permission Changes

Admin only.

#### Impact

Medium

---

### 7.7 Feature: Admin Alert Configuration

#### Purpose

Configure system alerts for platform events (failed emails, new organizers, suspicious activity).

#### Problem Solved

`createAdminAlert` exists but is not configurable through any UI.

#### Why Admin?

Alert configuration is a platform administration function.

#### Dependencies

- `notification.service.js` (has `createAdminAlert`)
- `system_settings` table

#### Required Database Changes

None. Alert config stored in `system_settings`.

#### API Changes

```javascript
GET / admin / alerts / config;
PUT / admin / alerts / config;
GET / admin / alerts / history;
```

#### UI Changes

- Alert configuration page
- Toggle switches and threshold inputs
- Alert history view

#### Permission Changes

Admin only.

#### Impact

Low

---

### 7.8 Feature: Platform-Wide Search

#### Purpose

Unified search across all platform entities (organizers, events, voters).

#### Problem Solved

No way to quickly find entities across the platform.

#### Why Admin?

Unified search is an admin productivity feature.

#### Dependencies

- `users`, `organizations`, `events` tables

#### Required Database Changes

```sql
CREATE INDEX idx_users_search ON users USING GIN (
  to_tsvector('english', coalesce(email, '') || ' ' || coalesce(organization_name, ''))
);
```

#### API Changes

```javascript
GET /admin/search?q={query}&type={organizer|event|voter|all}
```

#### UI Changes

- Global search bar in admin header
- Categorized search results

#### Permission Changes

Admin only.

#### Impact

Medium

---

### 7.9 Feature: Event Archival Policy

#### Purpose

Auto-archive completed events after configurable period.

#### Problem Solved

No mechanism to clean up old events or enforce data retention.

#### Why Admin?

Data retention policies are platform-level governance.

#### Dependencies

- `events` table
- `system_settings` table
- Scheduled job infrastructure

#### Required Database Changes

```sql
ALTER TABLE events ADD COLUMN archived_at TIMESTAMPTZ;
```

#### API Changes

```javascript
GET / admin / policies / archival;
PUT / admin / policies / archival;
POST / admin / policies / archival / run - now;
```

#### UI Changes

- Archival policy section in admin settings
- Threshold configuration
- Manual trigger button

#### Permission Changes

Admin only.

#### Impact

Medium

---

### 7.10 Feature: Admin Session Management

#### Purpose

View and manage active admin sessions.

#### Problem Solved

No way to view or revoke active sessions without password change.

#### Why Admin?

Session management is an admin security function.

#### Dependencies

- JWT token service
- Session tracking infrastructure

#### Required Database Changes

```sql
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_version INTEGER NOT NULL,
  ip_address INET,
  user_agent TEXT,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### API Changes

```javascript
GET  /admin/sessions
DELETE /admin/sessions/:sessionId
```

#### UI Changes

- Session management page under admin settings
- Table showing active sessions with IP, user-agent, last activity
- "Revoke" button for each session

#### Permission Changes

Admin only.

#### Impact

Medium

---

## 8. Phased Implementation Plan

### Phase 1: Foundation (Week 1-2)

**Objective:** Implement high-priority, low-effort enhancements that provide immediate value.

#### 1.1 Organization Lifecycle Management

**Files Affected:**

- `backend/src/services/admin.service.js` — Add `getOrganizationsList()`, `updateOrganizationStatus()`
- `backend/src/controllers/admin.controller.js` — Add `getOrganizations`, `updateOrganizationStatus`
- `backend/src/routes/admin.routes.js` — Add organization routes
- `frontend/src/services/admin.service.js` — Add organization API methods
- `frontend/src/pages/admin/OrganizationsPage.jsx` — New page
- `frontend/src/routes/index.jsx` — Add organization route

**Database Changes:** None (uses existing `organizations.status`)

**Backend Changes:**

```javascript
// admin.service.js
export async function getOrganizationsList() {
  return db()
    .from(DB_TABLES.ORGANIZATIONS)
    .select(
      `
      *,
      users (id, email, account_status),
      events (id, event_type, status)
    `,
    )
    .order("created_at", { ascending: false });
}

export async function updateOrganizationStatus(orgId, status) {
  // Validate status
  if (!Object.values(ORG_STATUS).includes(status)) {
    throw badRequest("Invalid organization status");
  }
  return db()
    .from(DB_TABLES.ORGANIZATIONS)
    .update({ status })
    .eq("id", orgId)
    .select("*")
    .single();
}
```

**Frontend Changes:**

- New `OrganizationsPage.jsx` with table, status filters, status change actions
- Add route `/admin/organizations` to admin route config

**Migration Considerations:** None. Backward compatible.

**Testing Requirements:**

- Unit tests for `getOrganizationsList` and `updateOrganizationStatus`
- Integration test for organization status change flow
- Frontend component tests for OrganizationsPage

**Rollback Strategy:**

- Remove routes and frontend page
- Revert service/controller changes

#### 1.2 Organizer Activity Timeline

**Files Affected:**

- `backend/src/services/admin.service.js` — Add `getOrganizerActivity()`
- `backend/src/controllers/admin.controller.js` — Add `getOrganizerActivity`
- `backend/src/routes/admin.routes.js` — Add activity route
- `frontend/src/services/admin.service.js` — Add activity API method
- `frontend/src/pages/admin/OrganizerDetailPage.jsx` — New page (or modal)
- `frontend/src/routes/index.jsx` — Add organizer detail route

**Database Changes:**

```sql
CREATE INDEX idx_audit_logs_user_id_action ON audit_logs (user_id, created_at DESC);
```

**Backend Changes:**

```javascript
// admin.service.js
export async function getOrganizerActivity(
  organizerId,
  { limit = 50, offset = 0 } = {},
) {
  const { rows, total } = await listAuditTrail({
    entityId: organizerId,
    limit,
    offset,
  });
  return { logs: rows.map(mapAuditLog), total };
}
```

**Frontend Changes:**

- New `OrganizerDetailPage.jsx` with activity timeline
- Add route `/admin/organizers/:organizerId` to admin route config

**Migration Considerations:** Run migration to add index.

**Testing Requirements:**

- Unit tests for `getOrganizerActivity`
- Integration test for activity timeline query

**Rollback Strategy:**

- Remove index: `DROP INDEX idx_audit_logs_user_id_action`
- Remove routes and frontend page

#### 1.3 Confirmation Dialogs

**Files Affected:**

- `frontend/src/components/admin/ConfirmActionModal.jsx` — New component
- `frontend/src/pages/admin/OrganizerManagementPage.jsx` — Add confirmation before status changes
- `frontend/src/pages/admin/OrganizationsPage.jsx` — Add confirmation before status changes

**Database Changes:** None

**Backend Changes:** None (optional: add `confirm` parameter validation)

**Frontend Changes:**

- New reusable `ConfirmActionModal` component
- Integrate into existing organizer management page
- Add reason field for audit trail

**Migration Considerations:** None

**Testing Requirements:**

- Component tests for ConfirmActionModal
- Integration test for confirmation flow

**Rollback Strategy:** Remove modal integration from pages

---

### Phase 2: Enhancement (Week 3-4)

**Objective:** Implement medium-priority features that improve admin productivity and platform visibility.

#### 2.1 Data Export and Reporting

**Files Affected:**

- `backend/src/services/export.service.js` — New service
- `backend/src/controllers/admin.controller.js` — Add export handlers
- `backend/src/routes/admin.routes.js` — Add export routes
- `frontend/src/services/admin.service.js` — Add export API methods
- `frontend/src/pages/admin/OrganizerManagementPage.jsx` — Add export button
- `frontend/src/pages/admin/GlobalEventsPage.jsx` — Add export button
- `frontend/src/pages/admin/AuditLogsPage.jsx` — Add export button

**Database Changes:** None

**Backend Changes:**

```javascript
// export.service.js
import { stringify } from "csv-stringify/sync";

export function exportToCSV(data, columns) {
  return stringify(data, { header: true, columns });
}

export async function exportOrganizers(format = "csv") {
  const organizers = await getOrganizersList();
  if (format === "csv") {
    return exportToCSV(organizers, [
      "email",
      "organization_name",
      "organizer_name",
      "position",
      "account_status",
      "profile_complete",
      "created_at",
    ]);
  }
  throw badRequest("Unsupported format");
}
```

**Frontend Changes:**

- Add export buttons with format selection
- Download handler for CSV blob

**Migration Considerations:** None

**Testing Requirements:**

- Unit tests for CSV generation
- Integration test for export endpoints

**Rollback Strategy:** Remove export routes and frontend buttons

#### 2.2 Platform Health Dashboard

**Files Affected:**

- `backend/src/services/health.service.js` — New service
- `backend/src/controllers/admin.controller.js` — Add health handlers
- `backend/src/routes/admin.routes.js` — Add health routes
- `backend/src/database/migrations/033_system_health_logs.sql` — New migration
- `frontend/src/pages/admin/HealthDashboardPage.jsx` — New page
- `frontend/src/services/admin.service.js` — Add health API methods
- `frontend/src/routes/index.jsx` — Add health route

**Database Changes:**

```sql
-- Migration 033
CREATE TABLE system_health_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL,
  response_time_ms INTEGER,
  error_message TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_system_health_logs_service ON system_health_logs (service, checked_at DESC);
```

**Backend Changes:**

```javascript
// health.service.js
export async function checkSystemHealth() {
  const checks = await Promise.allSettled([
    checkDatabase(),
    checkCloudinary(),
    checkResend(),
    checkWebSocket(),
  ]);

  const results = checks.map((result, index) => {
    const services = ["database", "cloudinary", "resend", "websocket"];
    return {
      service: services[index],
      status: result.status === "fulfilled" ? "healthy" : "down",
      responseTimeMs: result.value?.responseTimeMs ?? null,
      error: result.reason?.message ?? null,
    };
  });

  // Log health check results
  await logHealthResults(results);

  return {
    overall: results.every((r) => r.status === "healthy")
      ? "healthy"
      : "degraded",
    services: results,
    checkedAt: new Date().toISOString(),
  };
}
```

**Frontend Changes:**

- New `HealthDashboardPage.jsx` with service status cards
- Status indicators (green/yellow/red)
- Historical uptime chart

**Migration Considerations:** Run migration 033

**Testing Requirements:**

- Unit tests for health check service
- Integration test for health endpoints
- Mock external services for testing

**Rollback Strategy:**

- Run down migration
- Remove routes and frontend page

#### 2.3 Admin Alert Configuration

**Files Affected:**

- `backend/src/services/alert.service.js` — New service
- `backend/src/controllers/admin.controller.js` — Add alert handlers
- `backend/src/routes/admin.routes.js` — Add alert routes
- `frontend/src/pages/admin/AlertConfigPage.jsx` — New page
- `frontend/src/services/admin.service.js` — Add alert API methods
- `frontend/src/routes/index.jsx` — Add alert route

**Database Changes:** None (uses `system_settings`)

**Backend Changes:**

```javascript
// alert.service.js
const ALERT_CONFIG_KEY = "admin_alert_config";

const DEFAULT_ALERT_CONFIG = {
  failedEmailDelivery: { enabled: true, threshold: 5 },
  newOrganizerSignup: { enabled: true },
  eventCompletion: { enabled: false },
  suspiciousActivity: { enabled: true, failedLoginThreshold: 10 },
  lowDiskSpace: { enabled: true, thresholdPercent: 90 },
};

export async function getAlertConfig() {
  const settings = await getSystemSettings();
  const alertSetting = settings.find((s) => s.setting_key === ALERT_CONFIG_KEY);
  return alertSetting?.setting_value ?? DEFAULT_ALERT_CONFIG;
}

export async function updateAlertConfig(config) {
  return saveSystemSetting(
    ALERT_CONFIG_KEY,
    config,
    "Admin alert configuration",
  );
}
```

**Frontend Changes:**

- New `AlertConfigPage.jsx` with toggle switches and threshold inputs
- Alert history view

**Migration Considerations:** None

**Testing Requirements:**

- Unit tests for alert config service
- Integration test for alert config endpoints

**Rollback Strategy:** Remove routes and frontend page

---

### Phase 3: Advanced (Week 5-6)

**Objective:** Implement lower-priority but valuable features that require more infrastructure.

#### 3.1 Platform-Wide Search

**Files Affected:**

- `backend/src/services/search.service.js` — New service
- `backend/src/controllers/admin.controller.js` — Add search handler
- `backend/src/routes/admin.routes.js` — Add search route
- `frontend/src/components/admin/GlobalSearch.jsx` — New component
- `frontend/src/layouts/DashboardLayout.jsx` — Add search bar
- `frontend/src/services/admin.service.js` — Add search API method

**Database Changes:**

```sql
CREATE INDEX idx_users_search ON users USING GIN (
  to_tsvector('english', coalesce(email, '') || ' ' || coalesce(organization_name, ''))
);
CREATE INDEX idx_events_search ON events USING GIN (
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
);
CREATE INDEX idx_organizations_search ON organizations USING GIN (
  to_tsvector('english', coalesce(organization_name, ''))
);
```

**Backend Changes:**

```javascript
// search.service.js
export async function platformSearch(query, { type = "all", limit = 20 } = {}) {
  const results = { organizers: [], events: [], voters: [] };
  const searchQuery = query.trim();

  if (!searchQuery) return results;

  if (type === "all" || type === "organizer") {
    results.organizers = await searchOrganizers(searchQuery, limit);
  }
  if (type === "all" || type === "event") {
    results.events = await searchEvents(searchQuery, limit);
  }
  if (type === "all" || type === "voter") {
    results.voters = await searchVoters(searchQuery, limit);
  }

  return results;
}
```

**Frontend Changes:**

- New `GlobalSearch` component with dropdown results
- Categorized results with quick action links
- Keyboard shortcut (Cmd+K or Ctrl+K)

**Migration Considerations:** Run migration to add GIN indexes

**Testing Requirements:**

- Unit tests for search service
- Integration test for search endpoint
- Frontend component tests

**Rollback Strategy:**

- Drop GIN indexes
- Remove search component and route

#### 3.2 Event Archival Policy

**Files Affected:**

- `backend/src/services/archival.service.js` — New service
- `backend/src/controllers/admin.controller.js` — Add archival handlers
- `backend/src/routes/admin.routes.js` — Add archival routes
- `backend/src/database/migrations/034_event_archived_at.sql` — New migration
- `frontend/src/pages/admin/ArchivalPolicyPage.jsx` — New page
- `frontend/src/services/admin.service.js` — Add archival API methods
- `frontend/src/routes/index.jsx` — Add archival route

**Database Changes:**

```sql
-- Migration 034
ALTER TABLE events ADD COLUMN archived_at TIMESTAMPTZ;
CREATE INDEX idx_events_archived_at ON events (archived_at) WHERE archived_at IS NOT NULL;
```

**Backend Changes:**

```javascript
// archival.service.js
const ARCHIVAL_POLICY_KEY = "event_archival_policy";

export async function getArchivalPolicy() {
  const settings = await getSystemSettings();
  const policy = settings.find((s) => s.setting_key === ARCHIVAL_POLICY_KEY);
  return policy?.setting_value ?? { enabled: false, daysAfterCompletion: 90 };
}

export async function runArchival() {
  const policy = await getArchivalPolicy();
  if (!policy.enabled) return { archived: 0, message: "Archival is disabled" };

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - policy.daysAfterCompletion);

  const { data, error } = await db()
    .from(DB_TABLES.EVENTS)
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("status", "completed")
    .lt("end_date", cutoffDate.toISOString())
    .select("id");

  if (error) throw error;
  return { archived: data?.length ?? 0 };
}
```

**Frontend Changes:**

- New `ArchivalPolicyPage.jsx` with toggle and threshold input
- "Run Now" button with result display

**Migration Considerations:** Run migration 034

**Testing Requirements:**

- Unit tests for archival service
- Integration test for archival policy endpoints
- Test with sample completed events

**Rollback Strategy:**

- Run down migration
- Remove routes and frontend page

#### 3.3 Admin Session Management

**Files Affected:**

- `backend/src/services/session.service.js` — New service
- `backend/src/controllers/admin.controller.js` — Add session handlers
- `backend/src/routes/admin.routes.js` — Add session routes
- `backend/src/database/migrations/035_user_sessions.sql` — New migration
- `backend/src/middleware/auth.js` — Track session on authenticate
- `frontend/src/pages/admin/SessionManagementPage.jsx` — New page
- `frontend/src/services/admin.service.js` — Add session API methods
- `frontend/src/routes/index.jsx` — Add session route

**Database Changes:**

```sql
-- Migration 035
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_version INTEGER NOT NULL,
  ip_address INET,
  user_agent TEXT,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions (user_id, last_activity_at DESC);
```

**Backend Changes:**

```javascript
// session.service.js
export async function trackSession(userId, tokenVersion, ipAddress, userAgent) {
  // Upsert or insert new session
  return db()
    .from("user_sessions")
    .insert({
      user_id: userId,
      token_version: tokenVersion,
      ip_address: ipAddress,
      user_agent: userAgent,
    })
    .select("*")
    .single();
}

export async function listActiveSessions(userId) {
  return db()
    .from("user_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("last_activity_at", { ascending: false });
}

export async function revokeSession(sessionId, userId) {
  return db()
    .from("user_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", userId);
}
```

**Frontend Changes:**

- New `SessionManagementPage.jsx` with active sessions table
- "Revoke" button for each session
- Current session indicator

**Migration Considerations:** Run migration 035

**Testing Requirements:**

- Unit tests for session service
- Integration test for session management endpoints
- Test session tracking on authentication

**Rollback Strategy:**

- Run down migration
- Remove routes and frontend page

---

## 9. Summary of Changes

### 9.1 New Files

| File                                                   | Purpose                              | Phase |
| ------------------------------------------------------ | ------------------------------------ | ----- |
| `frontend/src/pages/admin/OrganizationsPage.jsx`       | Organization lifecycle management UI | 1     |
| `frontend/src/pages/admin/OrganizerDetailPage.jsx`     | Organizer activity timeline UI       | 1     |
| `frontend/src/components/admin/ConfirmActionModal.jsx` | Reusable confirmation dialog         | 1     |
| `backend/src/services/export.service.js`               | Data export service                  | 2     |
| `backend/src/services/health.service.js`               | System health check service          | 2     |
| `backend/src/services/alert.service.js`                | Alert configuration service          | 2     |
| `frontend/src/pages/admin/HealthDashboardPage.jsx`     | Health dashboard UI                  | 2     |
| `frontend/src/pages/admin/AlertConfigPage.jsx`         | Alert configuration UI               | 2     |
| `backend/src/services/search.service.js`               | Platform-wide search service         | 3     |
| `frontend/src/components/admin/GlobalSearch.jsx`       | Global search component              | 3     |
| `backend/src/services/archival.service.js`             | Event archival service               | 3     |
| `frontend/src/pages/admin/ArchivalPolicyPage.jsx`      | Archival policy UI                   | 3     |
| `backend/src/services/session.service.js`              | Session management service           | 3     |
| `frontend/src/pages/admin/SessionManagementPage.jsx`   | Session management UI                | 3     |

### 9.2 Modified Files

| File                                                   | Changes                                        | Phase   |
| ------------------------------------------------------ | ---------------------------------------------- | ------- |
| `backend/src/services/admin.service.js`                | Add organization management, activity timeline | 1       |
| `backend/src/controllers/admin.controller.js`          | Add new endpoint handlers                      | 1, 2, 3 |
| `backend/src/routes/admin.routes.js`                   | Add new routes                                 | 1, 2, 3 |
| `frontend/src/services/admin.service.js`               | Add new API methods                            | 1, 2, 3 |
| `frontend/src/routes/index.jsx`                        | Add new admin routes                           | 1, 2, 3 |
| `frontend/src/pages/admin/OrganizerManagementPage.jsx` | Add confirmation dialogs                       | 1       |
| `frontend/src/pages/admin/GlobalEventsPage.jsx`        | Add export button                              | 2       |
| `frontend/src/pages/admin/AuditLogsPage.jsx`           | Add export button                              | 2       |
| `frontend/src/layouts/DashboardLayout.jsx`             | Add global search bar                          | 3       |
| `backend/src/middleware/auth.js`                       | Track sessions on authenticate                 | 3       |

### 9.3 New Database Migrations

| Migration                    | Changes                           | Phase |
| ---------------------------- | --------------------------------- | ----- |
| `033_system_health_logs.sql` | Create `system_health_logs` table | 2     |
| `034_event_archived_at.sql`  | Add `archived_at` to events       | 3     |
| `035_user_sessions.sql`      | Create `user_sessions` table      | 3     |

### 9.4 New Indexes

| Index                           | Table           | Purpose                              | Phase |
| ------------------------------- | --------------- | ------------------------------------ | ----- |
| `idx_audit_logs_user_id_action` | `audit_logs`    | Efficient organizer activity queries | 1     |
| `idx_users_search`              | `users`         | Full-text search for users           | 3     |
| `idx_events_search`             | `events`        | Full-text search for events          | 3     |
| `idx_organizations_search`      | `organizations` | Full-text search for organizations   | 3     |
| `idx_events_archived_at`        | `events`        | Efficient archival queries           | 3     |

### 9.5 Design Principles Maintained

1. **No organizer workflow interference** — All new admin features are platform-level, not organization-level
2. **No voter workflow interference** — Admin does not manage individual voter participation
3. **Existing architecture preserved** — All new features follow the existing routes → controllers → services → foundation pattern
4. **Existing auth middleware reused** — All new endpoints use `authenticate`, `authorize(USER_ROLES.ADMIN)`, `requirePasswordChanged`
5. **Audit logging maintained** — All new admin actions are logged to `audit_logs`
6. **No feature duplication** — New features fill genuine gaps, not duplicate existing organizer functionality
7. **Backward compatibility** — All existing endpoints and behavior remain unchanged

### 9.6 Total Effort Estimate

| Phase     | Features                                                        | Estimated Effort |
| --------- | --------------------------------------------------------------- | ---------------- |
| Phase 1   | Organization lifecycle, activity timeline, confirmation dialogs | 5-7 days         |
| Phase 2   | Data export, health dashboard, alert configuration              | 7-10 days        |
| Phase 3   | Platform search, event archival, session management             | 7-10 days        |
| **Total** | **9 features**                                                  | **19-27 days**   |

---

## Appendix A: Admin Routes Summary (After Implementation)

```
/admin
├── GET  /overview                    [Existing] Placeholder
├── GET  /dashboard                   [Existing] Stats + activity
├── GET  /analytics                   [Existing] Chart data
│
├── GET  /organizers                  [Existing] List organizers
├── POST /organizers                  [Existing] Create organizer
├── PATCH /organizers/:id/status      [Existing] Update status
├── POST /organizers/:id/send-onboarding [Existing] Send email
├── GET  /organizers/:id/activity     [NEW] Activity timeline
│
├── GET  /organizations               [NEW] List organizations
├── PATCH /organizations/:id/status   [NEW] Update org status
│
├── GET  /events                      [Existing] Global events
│
├── GET  /settings                    [Existing] System settings
├── PUT  /settings                    [Existing] Update setting
│
├── GET  /audit-logs                  [Existing] Audit log viewer
│
├── GET  /search                      [NEW] Platform-wide search
│
├── GET  /health/system               [NEW] System health
├── GET  /health/logs                 [NEW] Health history
│
├── GET  /alerts/config               [NEW] Alert config
├── PUT  /alerts/config               [NEW] Update alert config
├── GET  /alerts/history              [NEW] Alert history
│
├── GET  /export/organizers           [NEW] Export organizers
├── GET  /export/events               [NEW] Export events
├── GET  /export/audit-logs           [NEW] Export audit logs
│
├── GET  /policies/archival           [NEW] Archival policy
├── PUT  /policies/archival           [NEW] Update policy
├── POST /policies/archival/run-now   [NEW] Trigger archival
│
├── GET  /sessions                    [NEW] Active sessions
└── DELETE /sessions/:id              [NEW] Revoke session
```

---

## Appendix B: Admin Frontend Pages (After Implementation)

```
/admin
├── DashboardPage         [Existing] Stats, charts, activity
├── OrganizerManagementPage [Existing] Organizer list + actions
├── OrganizerDetailPage   [NEW] Activity timeline
├── OrganizationsPage     [NEW] Organization list + actions
├── GlobalEventsPage      [Existing] Event list
├── SystemSettingsPage    [Existing] Key-value settings
├── AuditLogsPage         [Existing] Audit log viewer
├── HealthDashboardPage   [NEW] System health monitoring
├── AlertConfigPage       [NEW] Alert configuration
├── ArchivalPolicyPage    [NEW] Archival policy config
└── SessionManagementPage [NEW] Active session management
```

---

_This document was generated through comprehensive analysis of the VOTRIX codebase. Every recommendation is grounded in the current implementation and respects the existing architecture, role boundaries, and business rules._
