# Admin Enhancement — Implementation Plan

> **Document Version:** 2.1.0 (Updated)
> **Based on:** `docs/admin-role-analysis.md` v2.0.0
> **Scope:** Focused, verified implementation plan for admin module enhancements. Excludes "Organization Lifecycle Management" (organizers are created **active**; organization is 1:1 with organizer, so a separate approval workflow is redundant). Also **excludes** any change to the admin organizer-management/onboarding flow (how the admin creates or manages organizer accounts is intentionally left untouched).
> **Basis:** Re-analysis of the **current** codebase (`admin.routes.js`, `admin.controller.js`, `admin.service.js`, `dashboard.service.js`, `foundation/audit.js`, `frontend/src/pages/admin/*`).

---

## Table of Contents

1. [Overview](#1-overview)
2. [Current State vs. Plan](#2-current-state-vs-plan)
3. [Phase 1: Foundation](#3-phase-1-foundation)
4. [Phase 2: Enhancement](#4-phase-2-enhancement)
5. [Phase 3: Advanced](#5-phase-3-advanced)
6. [New Files Summary](#6-new-files-summary)
7. [Modified Files Summary](#7-modified-files-summary)
8. [Database Migrations](#8-database-migrations)
9. [Effort Estimate](#9-effort-estimate)

---

## 1. Overview

This plan covers **7 verified admin enhancements** across 3 phases. Each feature is:

- **Genuinely missing** — not duplicating existing functionality (verified against the current code)
- **Platform-level** — does not interfere with organizer or voter workflows
- **Grounded** — based on analysis of the current codebase (see role analysis v2.0)

### Feature Summary

| #   | Feature                             | Priority | Effort | Phase   |
| --- | ----------------------------------- | -------- | ------ | ------- |
| 1   | Organizer Activity Timeline         | High     | Low    | Phase 1 |
| 2   | Backend Data Export & Reporting     | Medium   | Low    | Phase 2 |
| 3   | Admin Platform Health Dashboard     | Medium   | Medium | Phase 2 |
| 4   | Admin Alert Configuration & History | Medium   | Low    | Phase 2 |
| 5   | Admin Session Management            | Medium   | Medium | Phase 3 |
| 6   | Platform-Wide Live Search           | Low      | Medium | Phase 3 |
| 7   | Event Archival Policy               | Low      | Medium | Phase 3 |

### Excluded Features (with reason)

| Feature                           | Reason for Exclusion                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organization Lifecycle Management | Redundant — organizers are created **active** (migration 031), organization is 1:1 with organizer, so a separate "approve your own creation" workflow doesn't apply |

---

## 2. Current State vs. Plan

**Verified already implemented** — do **not** re-plan these:

| Capability                               | Where it lives today                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Admin dashboard + stats + charts         | `AdminDashboardPage.jsx`, `dashboard.service.js` (`getAdminDashboardStats`, `getAdminAnalytics`) |
| Recent activity feed + WebSocket updates | `dashboard.service.js` (`loadRecentActivity`), `useSocketEvent('platform:stats-updated')`        |
| Organizer create / suspend / archive     | `admin.service.js`, `OrganizerManagementPage.jsx`, `CreateOrganizerModal.jsx`                    |
| Organizer onboarding email               | `admin.service.js` (`sendOnboardingNotification`)                                                |
| Global events view (read-only)           | `admin.service.js` (`getGlobalEvents`), `GlobalEventsPage.jsx`                                   |
| System settings (JSONB key-value)        | `SystemSettingsPage.jsx`, `admin.service.js`                                                     |
| Audit log viewer (filter + paginate)     | `foundation/audit.js` (`listAuditTrail`), `AuditLogsPage.jsx`                                    |
| Audit log **client-side** CSV export     | `AuditLogsPage.jsx` (`exportCSV`) — exports the current page only                                |
| Static header `GlobalSearch` (Cmd+K)     | `GlobalSearch.jsx` + `config/searchIndex.js` — **static index only**, no live entity search      |
| Public `/health` endpoint                | `health.controller.js` — DB + Cloudinary + Resend booleans, **not admin-scoped**, no UI          |
| Audit indexes                            | `idx_audit_logs_user_created`, `idx_audit_logs_entity_created` (migration 019)                   |
| `createAdminAlert`                       | `notification.service.js` — exists but **no config UI / history**                                |

**Key corrections applied from role analysis v2.0:**

- Organizers are created **active** (no `pending` status). UI copy in `CreateOrganizerModal.jsx` about "pending review" is stale.
- Per-organizer activity must filter by actor **`user_id`**, not `entity_id`. Add a `userId` filter to `foundation/audit.js`.
- New migrations must be numbered **`035+`** (current max is `034`).

---

## 3. Phase 1: Foundation

**Objective:** Quick wins that provide immediate value with minimal effort.

---

### 3.1 Organizer Activity Timeline

#### Purpose

View a per-organizer audit trail showing all actions **performed by** a specific organizer (events created, voters invited, status changes, login attempts, etc.).

#### Problem Solved

The current audit log shows all actions chronologically but cannot be filtered to a single organizer's **actions** (actor = `user_id`). Investigating an organizer requires manual searching through the entire log.

#### Why Admin?

Organizer activity monitoring is an admin oversight function. Organizers should not see other organizers' activity.

#### Dependencies

- `audit_logs` table (has `user_id` = **actor**, `action`, `entity`, `entity_id`, `details`)
- `foundation/audit.js` — `listAuditTrail()` currently filters by `entityId`; **needs a new `userId` filter** for actor-based queries
- Index `idx_audit_logs_user_created (user_id, created_at DESC)` already exists (migration 019) — **no new index required**

#### Files Affected

| File                                                   | Change                                      |
| ------------------------------------------------------ | ------------------------------------------- |
| `backend/src/foundation/audit.js`                      | Add `userId` filter to `listAuditTrail()`   |
| `backend/src/services/admin.service.js`                | Add `getOrganizerActivity()`                |
| `backend/src/controllers/admin.controller.js`          | Add `getOrganizerActivity` handler          |
| `backend/src/routes/admin.routes.js`                   | Add `GET /organizers/:organizerId/activity` |
| `frontend/src/services/admin.service.js`               | Add `getOrganizerActivity()` method         |
| `frontend/src/pages/admin/OrganizerDetailPage.jsx`     | **New** — Activity timeline UI              |
| `frontend/src/routes/index.jsx`                        | Add route `/admin/organizers/:id`           |
| `frontend/src/pages/admin/OrganizerManagementPage.jsx` | Make organizer rows navigate to detail      |

#### Database Changes

None — the existing `idx_audit_logs_user_created` index already serves this query.

#### Backend Implementation

```javascript
// foundation/audit.js — add a userId (actor) filter alongside the existing entityId filter
export async function listAuditTrail({
  entity, // entity type
  entityId, // entity row id (the thing being acted upon)
  userId, // NEW: actor id (the user who performed the action)
  action,
  search,
  startDate,
  endDate,
  limit = 50,
  offset = 0,
} = {}) {
  // ... existing setup ...
  if (entity) query = query.eq("entity", entity);
  if (entityId) query = query.eq("entity_id", entityId);
  if (userId) query = query.eq("user_id", userId); // NEW
  if (action) query = query.eq("action", action);
  // ... existing date/search/pagination ...
}
```

```javascript
// admin.service.js
export async function getOrganizerActivity(organizerId, options = {}) {
  const { limit = 50, offset = 0, action, entity } = options;
  const { rows, total } = await listAuditTrail({
    userId: organizerId, // filter by ACTOR, not entityId
    action: action || undefined,
    entity: entity || undefined,
    limit,
    offset,
  });
  return { logs: (rows ?? []).map(mapAuditLog), total };
}
```

```javascript
// admin.controller.js
export const getOrganizerActivity = asyncHandler(async (req, res) => {
  const { organizerId } = req.params;
  const { limit = "50", page = "1", action, entity } = req.query;

  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 50), 200);
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const offset = (safePage - 1) * safeLimit;

  const { logs, total } = await fetchOrganizerActivity(organizerId, {
    limit: safeLimit,
    offset,
    action: action || undefined,
    entity: entity || undefined,
  });

  res.json({
    success: true,
    logs,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    },
  });
});
```

```javascript
// admin.routes.js
router.get(
  "/organizers/:organizerId/activity",
  adminController.getOrganizerActivity,
);
```

> Place `:organizerId/activity` **before** any catch-all organizer routes to avoid path conflicts. `validateRouteUUIDParams` already guards `:organizerId` as a UUID.

#### UI Implementation

- Clicking an organizer row navigates to `/admin/organizers/:id`
- Timeline view showing chronological action cards
- Each card displays: action type icon, description, timestamp, entity type
- Filter dropdown by action type
- Pagination controls for large result sets
- Empty state: "No activity recorded for this organizer"

#### Rollback

- Remove the `userId` filter from `foundation/audit.js`
- Remove route and controller handler
- Remove frontend page and route

---

## 4. Phase 2: Enhancement

**Objective:** Medium-priority features that improve admin productivity and platform visibility.

---

### 4.1 Backend Data Export & Reporting

#### Purpose

Provide server-side export of platform data (organizers, events, audit logs) as CSV, with date-range support for audit logs.

#### Problem Solved

Only the audit log has a **client-side** export of the current page. There is no platform-level export for organizers/events and no full/date-range-limited audit export for compliance.

#### Why Admin?

Platform-wide data export is an admin function. Organizers already have per-event report export capabilities.

#### Files Affected

| File                                                   | Change                             |
| ------------------------------------------------------ | ---------------------------------- |
| `backend/src/services/export.service.js`               | **New** — CSV generation + queries |
| `backend/src/controllers/admin.controller.js`          | Add export handlers                |
| `backend/src/routes/admin.routes.js`                   | Add export routes                  |
| `frontend/src/services/admin.service.js`               | Add export methods                 |
| `frontend/src/pages/admin/OrganizerManagementPage.jsx` | Add export button                  |
| `frontend/src/pages/admin/GlobalEventsPage.jsx`        | Add export button                  |
| `frontend/src/pages/admin/AuditLogsPage.jsx`           | Add/augment server-side export     |

#### Database Changes

None.

#### Backend Implementation

```javascript
// export.service.js
import { stringify } from "csv-stringify/sync";

export function toCSV(rows, columns) {
  return stringify(rows, { header: true, columns });
}

export async function exportOrganizersCSV() {
  const organizers = await getOrganizersList();
  return toCSV(organizers, [
    "email",
    "organization_name",
    "organizer_name",
    "position",
    "account_status",
    "profile_complete",
    "created_at",
  ]);
}

export async function exportEventsCSV({ status } = {}) {
  const events = await getGlobalEvents();
  const filtered = status ? events.filter((e) => e.status === status) : events;
  return toCSV(filtered, [
    "title",
    "event_type",
    "status",
    "start_date",
    "end_date",
    "created_at",
  ]);
}

export async function exportAuditLogsCSV({
  startDate,
  endDate,
  limit = 10000,
} = {}) {
  const { rows } = await listAuditTrail({
    startDate,
    endDate,
    limit: Math.min(Math.max(1, limit), 10000),
    offset: 0,
  });
  return toCSV(rows, [
    "created_at",
    "action",
    "entity",
    "entity_id",
    "user_id",
    "details",
  ]);
}
```

```javascript
// admin.controller.js
export const exportOrganizersData = asyncHandler(async (_req, res) => {
  const csv = await exportOrganizersCSV();
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="organizers.csv"');
  res.send(csv);
});

export const exportEventsData = asyncHandler(async (req, res) => {
  const csv = await exportEventsCSV({ status: req.query.status });
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="events.csv"');
  res.send(csv);
});

export const exportAuditLogsData = asyncHandler(async (req, res) => {
  const csv = await exportAuditLogsCSV({
    startDate: req.query.startDate,
    endDate: req.query.endDate,
  });
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="audit-logs.csv"');
  res.send(csv);
});
```

```javascript
// admin.routes.js
router.get(
  "/export/organizers",
  adminActionLimiter,
  adminController.exportOrganizersData,
);
router.get(
  "/export/events",
  adminActionLimiter,
  adminController.exportEventsData,
);
router.get(
  "/export/audit-logs",
  adminActionLimiter,
  adminController.exportAuditLogsData,
);
```

#### UI Implementation

- CSV download button on organizer and events list pages
- Date range picker for audit log export (reuse the existing start/end date inputs)
- Loading state during generation

#### Dependency

Add `csv-stringify` to `backend/package.json`.

#### Rollback

- Remove routes, service, and frontend buttons

---

### 4.2 Admin Platform Health Dashboard

#### Purpose

Provide an admin-scoped dashboard monitoring system health: database connectivity, external services (Cloudinary, Resend), and WebSocket server status.

#### Problem Solved

A public `/health` endpoint returns basic booleans but is **not admin-scoped** and has **no admin UI** or historical tracking. If an external service fails, the admin has no dashboard to detect it.

#### Why Admin?

System health monitoring is exclusively an admin responsibility.

#### Files Affected

| File                                               | Change                                 |
| -------------------------------------------------- | -------------------------------------- |
| `backend/src/services/health.service.js`           | **New** — aggregator of service checks |
| `backend/src/controllers/admin.controller.js`      | Add `getSystemHealth` handler          |
| `backend/src/routes/admin.routes.js`               | Add `GET /admin/health` route          |
| `frontend/src/services/admin.service.js`           | Add `getSystemHealth()` method         |
| `frontend/src/pages/admin/HealthDashboardPage.jsx` | **New** — health status UI             |
| `frontend/src/routes/index.jsx`                    | Add route `/admin/health`              |
| `frontend/src/layouts/DashboardLayout.jsx`         | Add "Health" nav item (admin only)     |

#### Database Changes (Optional — historical tracking)

```sql
-- Migration 035 (optional) — historical health checks
CREATE TABLE IF NOT EXISTS system_health_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service           VARCHAR(64) NOT NULL,
  status            VARCHAR(16) NOT NULL,   -- 'healthy' | 'degraded' | 'down'
  response_time_ms  INTEGER,
  error_message     TEXT,
  checked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_system_health_logs_service
  ON system_health_logs (service, checked_at DESC);
```

> If historical logging is out of scope initially, the dashboard can perform **live** checks only (no table). Mark `system_health_logs` as optional.

#### Backend Implementation

```javascript
// health.service.js
import { checkDatabaseConnection } from "../config/database.js";
import { getCloudinary } from "../config/cloudinary.js";
import { getResend } from "../config/resend.js";

export async function checkSystemHealth() {
  const checks = await Promise.allSettled([
    checkDatabaseConnection(),
    Promise.resolve(
      getCloudinary() ? { connected: true } : { connected: false },
    ),
    Promise.resolve(getResend() ? { connected: true } : { connected: false }),
  ]);

  const [dbResult, cloudinaryResult, resendResult] = checks;
  const services = [
    {
      service: "database",
      status:
        dbResult.status === "fulfilled" && dbResult.value?.connected
          ? "healthy"
          : "down",
      message: dbResult.value?.message ?? null,
      schemaReady: dbResult.value?.schemaReady ?? null,
    },
    {
      service: "cloudinary",
      status:
        cloudinaryResult.status === "fulfilled" &&
        cloudinaryResult.value?.connected
          ? "healthy"
          : "down",
    },
    {
      service: "resend",
      status:
        resendResult.status === "fulfilled" && resendResult.value?.connected
          ? "healthy"
          : "down",
    },
  ];

  return {
    success: true,
    overall: services.every((s) => s.status === "healthy")
      ? "healthy"
      : "degraded",
    services,
    checkedAt: new Date().toISOString(),
  };
}
```

#### UI Implementation

- New `HealthDashboardPage.jsx` with service status cards
- Status indicators (green = healthy, red = down, yellow = degraded)
- Live refresh / on-load check
- (Optional) historical uptime chart if `system_health_logs` is adopted

#### Rollback

- (Optional) run down migration for `system_health_logs`
- Remove routes, service, and frontend page/nav

---

### 4.3 Admin Alert Configuration & History

#### Purpose

Let admins configure system alerts (failed email deliveries, new organizer signups, event completion, suspicious activity) and review alert history.

#### Problem Solved

`createAdminAlert` exists in `notification.service.js` but is not exposed through any admin UI or configuration. Admins cannot configure what alerts they receive or set thresholds.

#### Why Admin?

Alert configuration is a platform administration function. Organizers should not configure system-wide alerts.

#### Dependencies

- `notification.service.js` (already exports `createAdminAlert`)
- `system_settings` table — store config under a `setting_key` prefix (e.g. `admin_alert_config`)
- WebSocket emitter (real-time alerts already supported)

#### Files Affected

| File                                           | Change                             |
| ---------------------------------------------- | ---------------------------------- |
| `backend/src/services/alert.service.js`        | **New** — config CRUD helpers      |
| `backend/src/controllers/admin.controller.js`  | Add alert config handlers          |
| `backend/src/routes/admin.routes.js`           | Add alert routes                   |
| `frontend/src/services/admin.service.js`       | Add alert methods                  |
| `frontend/src/pages/admin/AlertConfigPage.jsx` | **New** — alert config UI          |
| `frontend/src/routes/index.jsx`                | Add route `/admin/alerts`          |
| `frontend/src/layouts/DashboardLayout.jsx`     | Add "Alerts" nav item (admin only) |

#### Database Changes

None — config stored in `system_settings`.

#### Backend Implementation

```javascript
// alert.service.js
import { getSystemSettings, saveSystemSetting } from "./admin.service.js";

const ALERT_CONFIG_KEY = "admin_alert_config";

export const DEFAULT_ALERT_CONFIG = {
  failedEmailDelivery: { enabled: true, threshold: 5 },
  newOrganizerSignup: { enabled: true },
  eventCompletion: { enabled: false },
  suspiciousActivity: { enabled: true, failedLoginThreshold: 10 },
  lowDiskSpace: { enabled: true, thresholdPercent: 90 },
};

export async function getAlertConfig() {
  const settings = await getSystemSettings();
  const setting = settings.find((s) => s.setting_key === ALERT_CONFIG_KEY);
  return setting?.setting_value ?? DEFAULT_ALERT_CONFIG;
}

export async function updateAlertConfig(config) {
  const merged = { ...DEFAULT_ALERT_CONFIG, ...(config ?? {}) };
  return saveSystemSetting(
    ALERT_CONFIG_KEY,
    merged,
    "Admin alert configuration",
  );
}
```

```javascript
// admin.routes.js
router.get("/alerts/config", adminController.getAlertConfig);
router.put(
  "/alerts/config",
  adminActionLimiter,
  adminController.updateAlertConfig,
);
```

> **Alert history** can be surfaced from the existing audit log (filter `entity = 'notifications'` + action containing `ALERT`) or by adding a dedicated `alert` type query on `audit_logs`.

#### UI Implementation

- `AlertConfigPage.jsx` with toggle switches per alert type
- Threshold configuration inputs (e.g. failed-login threshold)
- Save button that PATCHes the merged config
- (Optional) alert history table using `getAuditLogs({ entity: 'notifications' })`

#### Impact

Low — leverages existing `system_settings` and `notification.service.js`.

#### Rollback

- Remove routes and frontend page/nav

---

## 5. Phase 3: Advanced

**Objective:** Lower-priority but valuable features requiring more infrastructure.

---

### 5.1 Admin Session Management

#### Purpose

Let admins (and eventually all roles) view and revoke active sessions individually.

#### Problem Solved

Sessions are JWT HTTP-only cookies with `token_version` invalidation. The only way to revoke is a password change (bumps `token_version`, killing **all** sessions). There is no per-session view or revocation, no `user_sessions` table.

#### Why Admin?

Session security oversight is an admin function. Useful for all roles, but admin is the gatekeeper.

#### Dependencies

- JWT `token_version` mechanism in `user.service.js` / `auth.js`
- New `user_sessions` table

#### Files Affected

| File                                                    | Change                       |
| ------------------------------------------------------- | ---------------------------- |
| `backend/src/database/migrations/035_user_sessions.sql` | **New** — table              |
| `backend/src/services/session.service.js`               | **New** — CRUD               |
| `backend/src/controllers/admin.controller.js`           | Add session handlers         |
| `backend/src/routes/admin.routes.js`                    | Add `/admin/sessions` routes |
| `frontend/src/services/admin.service.js`                | Add session methods          |
| `frontend/src/pages/admin/SessionManagementPage.jsx`    | **New** — session UI         |
| `frontend/src/routes/index.jsx`                         | Add route `/admin/sessions`  |

#### Database Changes

```sql
-- Migration 035: user_sessions
CREATE TABLE user_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_version     INTEGER NOT NULL,
  ip_address        INET,
  user_agent        TEXT,
  refresh_token_id  UUID,
  last_activity_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_user_sessions_user_id
  ON user_sessions (user_id, last_activity_at DESC);
```

#### Backend Implementation

```javascript
// session.service.js
export async function listActiveSessions(userId) {
  return wrap(
    await db()
      .from("user_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("last_activity_at", { ascending: false }),
  );
}

export async function revokeSession(sessionId, userId) {
  return wrap(
    await db()
      .from("user_sessions")
      .delete()
      .eq("id", sessionId)
      .eq("user_id", userId)
      .select("*")
      .single(),
  );
}
```

```javascript
// admin.routes.js
router.get("/sessions", adminController.listAdminSessions);
router.delete(
  "/sessions/:sessionId",
  adminActionLimiter,
  adminController.revokeSession,
);
```

#### UI Implementation

- `SessionManagementPage.jsx` with active sessions table (IP, user-agent, last activity)
- "Revoke" button per session
- Current session indicator
- (Optional) "Revoke all other sessions"

#### Migration Considerations

Run migration `035`. Optionally add session tracking to the login flow.

#### Rollback

- Run down migration (drop `user_sessions`)
- Remove routes and frontend page

---

### 5.2 Platform-Wide Live Search

#### Purpose

Extend the existing header `GlobalSearch` (currently **static-index only**) to search live platform entities (organizers, events, and optionally voters).

#### Problem Solved

Admins must navigate to separate pages to find organizers/events/users. The current `GlobalSearch` searches only `config/searchIndex.js` navigation entries — not actual data.

#### Why Admin?

Unified data search across all tenants is an admin productivity feature (navigational search stays available to all roles).

#### Dependencies

- `users`, `organizations`, `events` tables
- Existing `GlobalSearch.jsx` component (extend with a backend-backed mode)

#### Files Affected

| File                                          | Change                                  |
| --------------------------------------------- | --------------------------------------- |
| `backend/src/services/search.service.js`      | **New** — live entity search            |
| `backend/src/controllers/admin.controller.js` | Add search handler                      |
| `backend/src/routes/admin.routes.js`          | Add `GET /admin/search` route           |
| `frontend/src/services/admin.service.js`      | Add `platformSearch()` method           |
| `frontend/src/components/ui/GlobalSearch.jsx` | Add backend-backed results (admin only) |

#### Database Changes (Optional — indexes for performance)

```sql
-- Migration 036 (optional)
CREATE INDEX idx_users_search ON users USING GIN (
  to_tsvector('english', coalesce(email, '') || ' ' || coalesce(organization_name, ''))
);
CREATE INDEX idx_events_search ON events USING GIN (
  to_tsvector('english', coalesce(title, ''))
);
CREATE INDEX idx_organizations_search ON organizations USING GIN (
  to_tsvector('english', coalesce(organization_name, ''))
);
```

> A simpler first cut uses `ilike` filters (matching the audit log search pattern in `foundation/audit.js`) with a result `limit` — no new indexes strictly required.

#### Backend Implementation

```javascript
// search.service.js
export async function platformSearch(query, { type = "all", limit = 20 } = {}) {
  const q = query.trim();
  if (!q) return { organizers: [], events: [] };

  const results = { organizers: [], events: [] };
  if (type === "all" || type === "organizer") {
    results.organizers = await searchOrganizers(q, limit);
  }
  if (type === "all" || type === "event") {
    results.events = await searchEvents(q, limit);
  }
  return results;
}
```

#### UI Implementation

- Extend `GlobalSearch` so **admin** sees a "Search platform" section backed by `platformSearch()`
- Categorized results with quick links (view organizer → `/admin/organizers/:id`, view event → events page)
- Respects the existing Cmd+K keyboard shortcut

#### Rollback

- Drop optional indexes (if added)
- Remove backend search route from admin

---

### 5.3 Event Archival Policy

#### Purpose

Let admins configure an automatic archival policy for completed events (e.g., auto-archive events completed more than N days ago) and trigger it manually.

#### Problem Solved

`EVENT_STATUS.ARCHIVED` exists in constants, but there is no policy to auto-archive old completed events, no `archived_at` column, and no retention enforcement. This can lead to DB bloat and cluttered organizer lists.

#### Why Admin?

Data retention policies are platform-level governance. Organizers should not configure archival rules that affect system performance.

#### Dependencies

- `events` table (has `status` and `end_date`)
- `system_settings` table (store policy)
- Scheduled job infrastructure (or manual trigger + future cron)

#### Files Affected

| File                                                        | Change                          |
| ----------------------------------------------------------- | ------------------------------- |
| `backend/src/services/archival.service.js`                  | **New** — policy CRUD + run-now |
| `backend/src/controllers/admin.controller.js`               | Add archival handlers           |
| `backend/src/routes/admin.routes.js`                        | Add archival routes             |
| `backend/src/database/migrations/036_event_archived_at.sql` | **New** — `archived_at`         |
| `frontend/src/services/admin.service.js`                    | Add archival methods            |
| `frontend/src/pages/admin/ArchivalPolicyPage.jsx`           | **New** — policy UI             |
| `frontend/src/routes/index.jsx`                             | Add route `/admin/archival`     |

#### Database Changes

```sql
-- Migration 036
ALTER TABLE events ADD COLUMN archived_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_events_archived_at ON events (archived_at) WHERE archived_at IS NOT NULL;
```

> Also add a matching down migration `036_down_event_archived_at.sql`.

#### Backend Implementation

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
    .update({
      status: EVENT_STATUS.ARCHIVED,
      archived_at: new Date().toISOString(),
    })
    .eq("status", EVENT_STATUS.COMPLETED)
    .lt("end_date", cutoffDate.toISOString())
    .select("id");

  if (error) throw new ApiError(500, error.message);
  return { archived: data?.length ?? 0 };
}
```

```javascript
// admin.routes.js
router.get("/policies/archival", adminController.getArchivalPolicy);
router.put(
  "/policies/archival",
  adminActionLimiter,
  adminController.updateArchivalPolicy,
);
router.post(
  "/policies/archival/run-now",
  adminActionLimiter,
  adminController.runArchivalNow,
);
```

#### UI Implementation

- `ArchivalPolicyPage.jsx` with enable toggle + days threshold input
- "Run Now" button with result count
- (Optional) scheduled job note for cron integration

#### Migration Considerations

Run migration `036`; add down migration.

#### Rollback

- Run down migration
- Remove routes and frontend page

---

## 6. New Files Summary

| File                                                 | Purpose                           | Phase |
| ---------------------------------------------------- | --------------------------------- | ----- |
| `frontend/src/pages/admin/OrganizerDetailPage.jsx`   | Organizer activity timeline UI    | 1     |
| `backend/src/services/export.service.js`             | Server-side CSV export service    | 2     |
| `backend/src/services/health.service.js`             | Admin-scoped system health check  | 2     |
| `backend/src/services/alert.service.js`              | Alert configuration service       | 2     |
| `frontend/src/pages/admin/HealthDashboardPage.jsx`   | Health dashboard UI               | 2     |
| `frontend/src/pages/admin/AlertConfigPage.jsx`       | Alert configuration UI            | 2     |
| `backend/src/services/session.service.js`            | Session management service        | 3     |
| `frontend/src/pages/admin/SessionManagementPage.jsx` | Session management UI             | 3     |
| `backend/src/services/search.service.js`             | Platform-wide live search service | 3     |
| `backend/src/services/archival.service.js`           | Event archival policy service     | 3     |
| `frontend/src/pages/admin/ArchivalPolicyPage.jsx`    | Archival policy UI                | 3     |

---

## 7. Modified Files Summary

| File                                                   | Changes                                       | Phase   |
| ------------------------------------------------------ | --------------------------------------------- | ------- |
| `backend/src/foundation/audit.js`                      | Add `userId` (actor) filter                   | 1       |
| `backend/src/services/admin.service.js`                | Add activity timeline                         | 1, 2    |
| `backend/src/controllers/admin.controller.js`          | Add new endpoint handlers                     | 1, 2, 3 |
| `backend/src/routes/admin.routes.js`                   | Add new routes                                | 1, 2, 3 |
| `frontend/src/services/admin.service.js`               | Add new API methods                           | 1, 2, 3 |
| `frontend/src/routes/index.jsx`                        | Add admin routes                              | 1, 2, 3 |
| `frontend/src/pages/admin/OrganizerManagementPage.jsx` | Activity navigation to detail                 | 1       |
| `frontend/src/pages/admin/GlobalEventsPage.jsx`        | Add export button                             | 2       |
| `frontend/src/pages/admin/AuditLogsPage.jsx`           | Add/augment server-side export                | 2       |
| `frontend/src/layouts/DashboardLayout.jsx`             | Add Health / Alerts / Sessions / Archival nav | 2, 3    |
| `frontend/src/components/ui/GlobalSearch.jsx`          | Add backend-backed live results (admin only)  | 3       |
| `backend/src/middleware/auth.js`                       | (Optional) track sessions on authenticate     | 3       |

---

## 8. Database Migrations

> **Numbering:** Current max is `034`. New migrations start at `035`.

| Migration                                 | Changes                              | Feature            | Phase |
| ----------------------------------------- | ------------------------------------ | ------------------ | ----- |
| `035_user_sessions.sql` (+ down)          | Create `user_sessions` table         | Session management | 3     |
| `035_system_health_logs.sql` (optional)   | Create `system_health_logs` table    | Health dashboard   | 2     |
| `036_event_archived_at.sql` (+ down)      | Add `events.archived_at` + index     | Archival policy    | 3     |
| `036_search_query_indexes.sql` (optional) | GIN tsv indexes on users/events/orgs | Live search        | 3     |

> No migration is required for: Organizer Activity Timeline (index exists from `019`), Backend Export, or Alert Config (uses `system_settings`).

### Reindex advice

- `idx_audit_logs_user_created` and `idx_audit_logs_entity_created` (migration `019`) already serve the activity timeline and entity-scoped audit queries. Run a fresh `ANALYZE audit_logs;` after heavy usage.

---

## 9. Effort Estimate

| Phase     | Features                                        | Estimated Effort |
| --------- | ----------------------------------------------- | ---------------- |
| Phase 1   | Activity timeline                               | 2-3 days         |
| Phase 2   | Backend export, health dashboard, alert config  | 6-9 days         |
| Phase 3   | Session management, live search, event archival | 7-10 days        |
| **Total** | **7 features**                                  | **15-22 days**   |

---

## Appendix A: Admin Routes Summary (After Implementation)

```
/admin
├── GET   /overview                         [Existing] Placeholder
├── GET   /dashboard                        [Existing] Stats + activity
├── GET   /analytics                        [Existing] Chart data
│
├── GET   /organizers                       [Existing] List organizers
├── POST  /organizers                       [Existing] Create organizer
├── PATCH /organizers/:id/status            [Existing] Update status (+ optional reason)
├── POST  /organizers/:id/send-onboarding   [Existing] Send email
├── GET   /organizers/:id/activity          [NEW] Activity timeline (actor user_id)
│
├── GET   /events                           [Existing] Global events
│
├── GET   /settings                         [Existing] System settings
├── PUT   /settings                         [Existing] Update setting
│
├── GET   /audit-logs                       [Existing] Audit log viewer
│
├── GET   /health                           [NEW] Admin-scoped system health
│
├── GET   /alerts/config                    [NEW] Alert config
├── PUT   /alerts/config                    [NEW] Update alert config
│
├── GET   /export/organizers                [NEW] Export organizers (CSV)
├── GET   /export/events                    [NEW] Export events (CSV)
├── GET   /export/audit-logs                [NEW] Export audit logs (CSV)
│
├── GET   /search                           [NEW] Platform-wide live search
│
├── GET   /policies/archival                [NEW] Archival policy
├── PUT   /policies/archival                [NEW] Update policy
├── POST  /policies/archival/run-now        [NEW] Trigger archival
│
├── GET   /sessions                         [NEW] Active sessions
└── DELETE /sessions/:id                    [NEW] Revoke session
```

## Appendix B: Admin Frontend Pages (After Implementation)

```
/admin
├── DashboardPage            [Existing] Stats, charts, activity
├── OrganizerManagementPage  [Existing] Organizer list + actions
├── OrganizerDetailPage      [NEW] Activity timeline
├── GlobalEventsPage         [Existing] Event list
├── SystemSettingsPage       [Existing] Key-value settings
├── AuditLogsPage            [Existing] Audit log viewer + export
├── HealthDashboardPage      [NEW] System health monitoring
├── AlertConfigPage          [NEW] Alert configuration
├── SessionManagementPage    [NEW] Active session management
└── ArchivalPolicyPage       [NEW] Archival policy config
```

---

_This document was regenerated from a re-analysis of the current VOTRIX codebase (role analysis v2.0). It corrects the outdated v1.0 plan (indexes already exist, actor-based activity filter, active-on-create organizers, migration numbering `035+`) and is ready to drive implementation._
