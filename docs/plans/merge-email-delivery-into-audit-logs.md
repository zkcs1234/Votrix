# Plan: Merge Email Delivery into Audit Logs

## Overview
Consolidate the Email Delivery page into the Audit Logs page by adding a new tab/filter for email-specific logs. This reduces navigation complexity and creates a unified monitoring interface for admins.

---

## Current State Analysis

### Email Delivery Page Features
- **Location:** `/admin/email-delivery`
- **Data:** Email send/delivery status from provider
- **Filters:**
  - Recipient email search
  - Workflow filter (free text input)
  - Provider status dropdown (11 statuses: queued, sent, delivered, bounced, etc.)
  - Date range (start/end date)
- **Columns:**
  - Time (created_at)
  - Recipient
  - Workflow
  - Subject (or template_name)
  - Status (with color coding)
  - Details (error messages, provider ID)
- **Pagination:** 50 records per page
- **API:** `adminService.getEmailDeliveryLogs(params)`

### Audit Logs Page Features
- **Location:** `/admin/audit-logs`
- **Data:** All system actions (CREATE, UPDATE, DELETE, LOGIN, etc.)
- **Filters:**
  - Search (actions, users, entities)
  - Date range (start/end date)
  - Action dropdown (dynamic from data)
  - Entity dropdown (dynamic from data)
  - Entity ID filter
- **Columns:**
  - Timestamp
  - Action
  - User (email + role)
  - Entity
  - Details (summary)
  - View (button to modal)
- **Pagination:** Configurable (25/50/100 per page)
- **Features:**
  - Sortable timestamp
  - Detail modal with full JSON
  - Export page CSV
  - Export full server CSV
  - Summary stat cards (total, admin, organizer, system actions)
- **API:** `adminService.getAuditLogs(params)`, `adminService.exportAuditLogs(params)`

---

## Design Approach: Tab-Based View

### Option A: Separate Tab (Recommended) ✅
**Implementation:** Add a tab switcher at the top of Audit Logs page
- **Tabs:** "System Logs" | "Email Delivery"
- **Benefit:** Clean separation, preserves both UX patterns
- **Filter Behavior:** Each tab has its own filters (no cross-contamination)
- **URL State:** Use query param `?view=email` or `?view=system`

### Option B: Unified Table with Filter
**Implementation:** Add "Email Delivery" as an entity filter option
- **Benefit:** Single table, unified pagination
- **Drawback:** Email logs have different columns (recipient, workflow, provider status)
- **Verdict:** Not ideal - different data schemas don't fit well in same table

**Decision: Go with Option A (Tab-Based)**

---

## Implementation Plan

### Phase 1: Frontend - Add Tab System to Audit Logs

#### Step 1.1: Add Tab State & URL Sync
**File:** `frontend/src/pages/admin/AuditLogsPage.jsx`

```javascript
// Add after existing imports
const [activeTab, setActiveTab] = useState(() => {
  const params = new URLSearchParams(window.location.search)
  return params.get('view') === 'email' ? 'email' : 'system'
})

// Update URL when tab changes
const handleTabChange = (tab) => {
  setActiveTab(tab)
  const params = new URLSearchParams(window.location.search)
  if (tab === 'email') {
    params.set('view', 'email')
  } else {
    params.delete('view')
  }
  window.history.replaceState({}, '', `${window.location.pathname}?${params}`)
}
```

#### Step 1.2: Add Tab UI Component
Insert after PageHeader, before stat cards:

```javascript
<div className="flex gap-1 rounded-lg bg-v-surface-elevated p-1">
  <button
    className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
      activeTab === 'system'
        ? 'bg-v-surface text-v-text shadow-sm'
        : 'text-v-text-muted hover:text-v-text'
    }`}
    onClick={() => handleTabChange('system')}
  >
    System Logs
  </button>
  <button
    className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
      activeTab === 'email'
        ? 'bg-v-surface text-v-text shadow-sm'
        : 'text-v-text-muted hover:text-v-text'
    }`}
    onClick={() => handleTabChange('email')}
  >
    Email Delivery
  </button>
</div>
```

#### Step 1.3: Extract Email Delivery Component
Copy logic from `EmailDeliveryLogsPage.jsx` into a new component within AuditLogsPage:

```javascript
function EmailDeliveryTab() {
  // Copy state from EmailDeliveryLogsPage
  // Copy filters, table, pagination
  // Keep the same API call: adminService.getEmailDeliveryLogs()
}
```

#### Step 1.4: Conditional Rendering
Replace main content with:

```javascript
{activeTab === 'system' ? (
  <>
    {/* Existing stat cards */}
    {/* Existing filters */}
    {/* Existing table */}
  </>
) : (
  <EmailDeliveryTab />
)}
```

#### Step 1.5: Update Page Header Description
```javascript
description={
  activeTab === 'system'
    ? "Security and compliance trail for all administrative actions."
    : "Provider send and delivery status history for all outbound emails."
}
```

#### Step 1.6: Keep Export Buttons Context-Aware
```javascript
actions={
  <div className="flex flex-wrap items-center gap-2">
    <Button size="sm" variant="secondary" onClick={() => fetchLogs({ silent: true })} disabled={loading}>
      <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
      Refresh
    </Button>
    {activeTab === 'system' ? (
      <>
        <Button size="sm" variant="secondary" onClick={exportCSV} disabled={logs.length === 0}>
          <Download className="h-4 w-4" strokeWidth={1.5} />
          Export page
        </Button>
        <Button size="sm" variant="secondary" onClick={exportServerCSV} loading={serverExporting}>
          <Download className="h-4 w-4" strokeWidth={1.5} />
          Export full
        </Button>
      </>
    ) : (
      <Button size="sm" variant="secondary" onClick={exportEmailCSV} disabled={emailLogs.length === 0}>
        <Download className="h-4 w-4" strokeWidth={1.5} />
        Export CSV
      </Button>
    )}
  </div>
}
```

---

### Phase 2: Update Navigation & Routing

#### Step 2.1: Remove Email Delivery from Sidebar
**File:** `frontend/src/layouts/DashboardLayout.jsx`

```diff
- {
-   label: 'Email Delivery',
-   path: '/admin/email-delivery',
-   icon: Mail,
-   isActive: (loc) => loc.pathname.startsWith('/admin/email-delivery'),
- },
```

#### Step 2.2: Update Audit Logs Sidebar Item
Make it clear it includes email:

```javascript
{
  label: 'Audit Logs',
  path: '/admin/audit-logs',
  icon: ClipboardList,
  isActive: (loc) => loc.pathname.startsWith('/admin/audit-logs'),
}
```

#### Step 2.3: Add Redirect for Old URL
**File:** `frontend/src/routes/index.jsx`

```javascript
// Replace old route
{ path: 'email-delivery', element: <Navigate to="/admin/audit-logs?view=email" replace /> },
```

This ensures any bookmarks or links redirect to the new location.

#### Step 2.4: Remove EmailDeliveryLogsPage Import
**File:** `frontend/src/routes/index.jsx`

```diff
- const EmailDeliveryLogsPage = lazy(() => import('@/pages/admin/EmailDeliveryLogsPage'))
```

---

### Phase 3: Update Cross-References

#### Step 3.1: Search for Email Delivery Links
Files that might link to `/admin/email-delivery`:
- Alert configuration page (if it has links)
- System health page (if it references email monitoring)
- Admin dashboard (if it has quick links)

Update all to: `/admin/audit-logs?view=email`

#### Step 3.2: Update Documentation
If there's admin documentation, update to reflect:
- Email Delivery is now a tab in Audit Logs
- URL is `/admin/audit-logs?view=email`

---

### Phase 4: Cleanup (After Verification)

#### Step 4.1: Delete Old Page File
**File:** `frontend/src/pages/admin/EmailDeliveryLogsPage.jsx`
- Only delete after confirming new implementation works

#### Step 4.2: Delete Old Test File (if exists)
**File:** `frontend/src/pages/admin/EmailDeliveryLogsPage.test.jsx`

---

## Data Flow

### System Logs Tab
```
User → System Logs Tab
  ↓
API: GET /api/admin/audit-logs
  ↓
Filters: search, action, entity, entityId, startDate, endDate
  ↓
Table: Timestamp | Action | User | Entity | Details | View
  ↓
Modal: Full audit log detail with JSON
```

### Email Delivery Tab
```
User → Email Delivery Tab
  ↓
API: GET /api/admin/email-delivery-logs
  ↓
Filters: search (recipient), workflow, providerStatus, startDate, endDate
  ↓
Table: Time | Recipient | Workflow | Subject | Status | Details
```

---

## UI/UX Considerations

### Tab Design
- Use same tab style as Competition module (rounds, sessions, etc.)
- Active tab has solid background, inactive is transparent
- Tabs should be keyboard navigable (Arrow keys)

### Filter Persistence
- Each tab maintains its own filter state
- Switching tabs doesn't clear filters (localStorage?)
- URL only reflects active tab, not filters

### Stat Cards
- **System Logs:** Show total, admin, organizer, system actions (existing)
- **Email Delivery:** Show total sent, delivered, failed, pending
  - Need to add stat calculation to EmailDeliveryTab

### Mobile Responsive
- Tabs stack horizontally (existing behavior in other pages)
- Tables scroll horizontally (existing behavior)

---

## Backend Considerations

### No Backend Changes Required ✅
- Keep both API endpoints:
  - `/api/admin/audit-logs` (for system logs)
  - `/api/admin/email-delivery-logs` (for email logs)
- These serve different data schemas, so separate endpoints make sense
- Frontend handles the unified view

### Future Enhancement (Optional)
If we want a unified API in the future:
- Add `?type=email` to audit-logs endpoint
- Backend returns email logs in audit log format
- Requires schema alignment (email → audit log format)
- Not necessary for MVP

---

## Testing Checklist

### Functional Tests
- [ ] System Logs tab displays existing audit logs
- [ ] Email Delivery tab displays email logs
- [ ] Switching tabs updates URL (`?view=email`)
- [ ] Direct URL access works (`/admin/audit-logs?view=email`)
- [ ] Filters work independently per tab
- [ ] Pagination works per tab
- [ ] Export works for both tabs
- [ ] Refresh works for both tabs
- [ ] Detail modal works (system logs)
- [ ] Empty states work for both tabs
- [ ] Error states work for both tabs

### Navigation Tests
- [ ] Sidebar shows only "Audit Logs" (no Email Delivery)
- [ ] Old URL `/admin/email-delivery` redirects to new location
- [ ] Clicking "Audit Logs" in sidebar goes to system tab by default
- [ ] Breadcrumbs/page title update correctly

### Responsive Tests
- [ ] Tabs render correctly on mobile
- [ ] Tables scroll on mobile
- [ ] Filters stack properly on mobile

### Browser Tests
- [ ] Chrome/Edge (primary)
- [ ] Firefox
- [ ] Safari (if available)

---

## Rollback Plan

If issues occur:
1. Keep old `EmailDeliveryLogsPage.jsx` in a backup folder first
2. Restore the file from backup
3. Revert sidebar changes in `DashboardLayout.jsx`
4. Revert route changes in `routes/index.jsx`
5. Remove tab code from `AuditLogsPage.jsx`

---

## Files to Modify

| File | Change |
|------|--------|
| `frontend/src/pages/admin/AuditLogsPage.jsx` | Add tab switcher, embed email delivery logic |
| `frontend/src/layouts/DashboardLayout.jsx` | Remove "Email Delivery" nav item |
| `frontend/src/routes/index.jsx` | Redirect old email-delivery route, remove import |
| `frontend/src/pages/admin/EmailDeliveryLogsPage.jsx` | **DELETE** (after verification) |

---

## Timeline Estimate

- **Phase 1 (Frontend Tab System):** 2-3 hours
- **Phase 2 (Navigation & Routing):** 30 minutes
- **Phase 3 (Cross-References):** 30 minutes
- **Phase 4 (Cleanup):** 15 minutes
- **Testing:** 1-2 hours

**Total:** ~5 hours

---

## Success Criteria

✅ Email Delivery page is removed from navigation
✅ All email delivery functionality accessible via Audit Logs tab
✅ No broken links or 404 errors
✅ Both tabs work independently with correct data
✅ URL state syncs with active tab
✅ Existing audit logs functionality unchanged
✅ Old URLs redirect to new location
