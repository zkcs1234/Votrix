# Admin Enhancement — Implementation Plan

> **Document Version:** 1.0.0
> **Based on:** `docs/admin-role-analysis.md`
> **Scope:** Focused implementation plan for admin module enhancements. Excludes "Organization Lifecycle Management" feature (admin creates organizer accounts directly, so an approval workflow is redundant).

---

## Table of Contents

1. [Overview](#1-overview)
2. [Phase 1: Foundation](#2-phase-1-foundation)
3. [Phase 2: Enhancement](#3-phase-2-enhancement)
4. [Phase 3: Advanced](#4-phase-3-advanced)
5. [New Files Summary](#5-new-files-summary)
6. [Modified Files Summary](#6-modified-files-summary)
7. [Database Migrations](#7-database-migrations)
8. [Effort Estimate](#8-effort-estimate)

---

## 1. Overview

This plan covers **8 admin enhancements** across 3 phases. Each feature is:

- **Genuinely missing** — not duplicating existing functionality
- **Platform-level** — does not interfere with organizer or voter workflows
- **Grounded** — based on analysis of the current codebase

### Feature Summary

| #   | Feature                                       | Priority | Effort | Phase   |
| --- | --------------------------------------------- | -------- | ------ | ------- |
| 1   | Organizer Activity Timeline                   | High     | Low    | Phase 1 |
| 2   | Confirmation Dialogs for Irreversible Actions | High     | Low    | Phase 1 |
| 3   | Data Export & Reporting                       | Medium   | Low    | Phase 2 |
| 4   | Platform Health Dashboard                     | Medium   | Medium | Phase 2 |
| 5   | Admin Alert Configuration                     | Medium   | Low    | Phase 2 |
| 6   | Admin Session Management                      | Medium   | Medium | Phase 3 |
| 7   | Platform-Wide Search                          | Low      | Medium | Phase 3 |
| 8   | Event Archival Policy                         | Low      | Medium | Phase 3 |

### Excluded Features (with reason)

| Feature                           | Reason for Exclusion                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Organization Lifecycle Management | Redundant — admin creates organizer accounts directly, so an "approve your own creation" workflow doesn't make sense |

---

## 2. Phase 1: Foundation

**Objective:** Quick wins that provide immediate value with minimal effort.

---

### 2.1 Organizer Activity Timeline

#### Purpose

View a per-organizer audit trail showing all actions performed by a specific organizer (events created, voters invited, status changes, login attempts, etc.).

#### Problem Solved

The current audit log shows all actions chronologically but cannot be filtered to show activity for a single organizer. Investigating an organizer requires manual searching through the entire log.

#### Why Admin?

Organizer activity monitoring is an admin oversight function. Organizers should not see other organizers' activity.

#### Dependencies

- `audit_logs` table (already has `user_id`, `action`, `entity`, `entity_id`, `details`)
- `foundation/audit.js` — `listAuditTrail()` already supports `entityId` filter

#### Files Affected

| File                                               | Change                                      |
| -------------------------------------------------- | ------------------------------------------- |
| `backend/src/services/admin.service.js`            | Add `getOrganizerActivity()`                |
| `backend/src/controllers/admin.controller.js`      | Add `getOrganizerActivity` handler          |
| `backend/src/routes/admin.routes.js`               | Add `GET /organizers/:organizerId/activity` |
| `frontend/src/services/admin.service.js`           | Add `getOrganizerActivity()` method         |
| `frontend/src/pages/admin/OrganizerDetailPage.jsx` | **New** — Activity timeline UI              |
| `frontend/src/routes/index.jsx`                    | Add route `/admin/organizers/:id`           |

#### Database Changes

```sql
-- Add composite index for efficient organizer activity queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user_id_action
ON audit_logs (user_id, created_at DESC);
```

#### Backend Implementation

```javascript
// admin.service.js
export async function getOrganizerActivity(organizerId, options = {}) {
  const { limit = 50, offset = 0, action, entity } = options;
  const { rows, total } = await listAuditTrail({
    entityId: organizerId,
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

#### UI Implementation

- Clicking an organizer row navigates to `/admin/organizers/:id`
- Timeline view showing chronological action cards
- Each card displays: action type icon, description, timestamp, entity type
- Filter dropdown by action type
- Pagination controls for large result sets
- Empty state: "No activity recorded for this organizer"

#### Rollback

- Drop index: `DROP INDEX IF EXISTS idx_audit_logs_user_id_action`
- Remove route and controller handler
- Remove frontend page and route

---

### 2.2 Confirmation Dialogs for Irreversible Actions

#### Purpose

Require explicit confirmation before executing destructive admin actions (suspend/archive organizer accounts).

#### Problem Solved

Currently, admin can suspend or archive an organizer with a single click. Accidental archival has no undo mechanism. There is no safety net.

#### Why Admin?

Protects against accidental data loss from admin actions. This is a UX safety measure, not a permission boundary.

#### Files Affected

| File                                                   | Change                                 |
| ------------------------------------------------------ | -------------------------------------- |
| `frontend/src/components/admin/ConfirmActionModal.jsx` | **New** — Reusable confirmation dialog |
| `frontend/src/pages/admin/OrganizerManagementPage.jsx` | Add confirmation before status changes |

#### Database Changes

None.

#### Frontend Implementation

```jsx
// ConfirmActionModal.jsx
import { Modal } from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

export default function ConfirmActionModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  variant = 'danger',
  loading = false,
  children,
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="space-y-4 p-4">
        <h2 className="text-lg font-semibold text-v-text">{title}</h2>
        <p className="text-sm text-v-text-subtle">{message}</p>
        {children && <div className="py-2">{children}</div>}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
    </Modal>
  )
}
```

#### Integration Points in OrganizerManagementPage.jsx

```jsx
// State
const [confirmAction, setConfirmAction] = useState(null);
const [actionReason, setActionReason] = useState("");

// Before status change, show confirmation
const handleStatusChangeClick = (organizer, newStatus) => {
  setConfirmAction({ organizer, newStatus });
};

// On confirm, execute the status change
const handleConfirmStatusChange = async () => {
  if (!confirmAction) return;
  await handleStatusChange(
    confirmAction.organizer.id,
    confirmAction.newStatus,
    actionReason,
  );
  setConfirmAction(null);
  setActionReason("");
};

// Render modal
<ConfirmActionModal
  isOpen={!!confirmAction}
  onClose={() => {
    setConfirmAction(null);
    setActionReason("");
  }}
  onConfirm={handleConfirmStatusChange}
  title={getConfirmTitle(confirmAction?.newStatus)}
  message={getConfirmMessage(confirmAction)}
  confirmLabel={getConfirmLabel(confirmAction?.newStatus)}
  variant={confirmAction?.newStatus === "active" ? "secondary" : "danger"}
  loading={savingKey !== null}
>
  <textarea
    className="v-input w-full"
    placeholder="Reason for this action (optional, will be logged in audit trail)"
    value={actionReason}
    onChange={(e) => setActionReason(e.target.value)}
    rows={2}
  />
</ConfirmActionModal>;
```

#### Confirmation Messages

| Action    | Title                | Message                                                                                                            |
| --------- | -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Suspend   | Suspend organizer?   | "{name} will lose access to the platform until an admin reinstates them. Their events and data will be preserved." |
| Reinstate | Reinstate organizer? | "{name} will regain access to the platform and their organization dashboard."                                      |
| Archive   | Archive organizer?   | "{name} will be permanently disabled. This action can be reversed by an admin from the archived accounts view."    |

#### Backend Changes (Optional Enhancement)

- Add optional `reason` field to `PATCH /admin/organizers/:organizerId/status` body
- Store reason in audit log `details` field for traceability
  // Similar pattern
  }

````

```javascript
// admin.controller.js
export const exportOrganizersData = asyncHandler(async (req, res) => {
  const csv = await exportOrganizers('csv')
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="organizers.csv"')
  res.send(csv)
})
````

```javascript
// admin.routes.js
router.get("/export/organizers", adminController.exportOrganizersData);
router.get("/export/events", adminController.exportEventsData);
router.get("/export/audit-logs", adminController.exportAuditLogsData);
```

#### UI Implementation

- CSV download button on each list page
- Date range picker for audit log export
- Loading state during generation

#### Dependency

Add `csv-stringify` to `backend/package.json`

#### Rollback

- Remove routes, service, and frontend buttons

---

### 3.2 Platform Health Dashboard

#### Purpose

Monitor system health: database connectivity, external services (Cloudinary, Resend), WebSocket server status.

#### Problem Solved

No visibility into system health. If an external service fails, the admin has no dashboard to detect it.

#### Why Admin?

System health monitoring is exclusively an admin responsibility.

#### Files Affected

| File                                          | Change                       |
| --------------------------------------------- | ---------------------------- |
| `backend/src/services/health.service.js`      | **New** — Health check logic |
| `backend/src/controllers/admin.controller.js` | Add health handlers          |
| `backend/src/routes/admin.routes.js`          | Add health routes            |
