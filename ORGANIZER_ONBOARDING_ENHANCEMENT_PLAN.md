# VOTRIX Organizer Onboarding Enhancement — Comprehensive Plan

---

## 1. Current Workflow (Before)

### Admin Creates Organizer

```
Admin clicks "Create organizer" button
  → Modal form: Email + Temporary password
  → Backend creates user with account_status = 'pending'
  → Admin sees: "Pending review" badge, "Approve" action button
  → Success message: "pending approval"
```

### Organizer Signs In (First Time)

```
Organizer enters email + password at /login
  → Unified login succeeds
  → requireActiveAccount middleware checks account_status = 'pending'
  → ERROR 403: "Your account is pending approval"
  → Organizer is STUCK — cannot proceed
```

### Admin Must Approve

```
Admin goes to Organizer Management page
  → Sees organizer with "Pending review" badge
  → Clicks "Approve" button
  → account_status changes to 'active'
```

### Organizer Signs In Again

```
Organizer logs in again
  → requireActiveAccount passes
  → requirePasswordChanged detects must_change_password = true
  → Redirected to /change-password
  → ChangePasswordPage shows:
     - Password change form (CURRENT, NEW, CONFIRM)
     - "Continue with temp password" button — ONLY for voters (hidden for organizers)
  → Organizer must change password (no skip option)
  → After password change → redirects to /organizer dashboard
```

---

## 2. Updated Workflow (After)

### 2.1 Admin Creates Organizer + Admin Can Send Onboarding

```
Admin fills Create Organizer modal (Email + Temp Password)
  → Backend creates user with account_status = 'active' (IMMEDIATELY ACTIVE)
  → Admin sees success message: "Organizer created successfully"
  → Organizer shows up in table with "Active" badge

Admin CAN SEE in the table:
  - Profile status column: "Incomplete" with red ❌ indicator
  - "Send Onboarding" action button for incomplete profiles

Admin clicks "Send Onboarding" → sends email to organizer reminding
them to complete their organization profile
```

### 2.2 Organizer First Login

```
Organizer enters email + password at /login (SAME unified login)
  → requireActiveAccount passes (account is already 'active')
  → requirePasswordChanged detects must_change_password = true
  → Redirected to /change-password
```

### 2.3 Change Password Page (Now with Skip Option for Organizers)

```
┌──────────────────────────────────────┐
│ 🔒  Change your password             │
│                                      │
│ Set a personal password to secure    │
│ your account, or continue with your  │
│ temporary password.                  │
│                                      │
│ Current password  [________________] │
│ New password      [________________] │
│ Confirm password  [________________] │
│                                      │
│ [🛡️  Set new password]               │
│                                      │
│ ──────────────── OR ──────────────── │
│                                      │
│ [⏭️  Continue with temporary pwd]    │
│ You can change your password anytime │
└──────────────────────────────────────┘
```

### 2.4 After Password Decision → Profile Check

```
After password is changed OR skipped:
  → Frontend calls GET /api/organizer/profile/status
  → If profile is incomplete → Redirect to /organizer/onboarding
  → If profile is complete → Redirect to /organizer dashboard
```

### 2.5 Onboarding Profile Form

```
/organizer/onboarding page:
┌──────────────────────────────────────────┐
│  👋  Welcome to VOTRIX!                  │
│  Complete your organization profile      │
│                                          │
│  ┌─ Organization Information ────────┐   │
│  │ Organization Name *               │   │
│  │ [_____________________________]   │   │
│  │                                    │   │
│  │ Organization Type *               │   │
│  │ [_____________________________]   │   │
│  │ (e.g. Student Org, Department)    │   │
│  └────────────────────────────────────┘   │
│                                          │
│  ┌─ Your Information ───────────────┐    │
│  │ Your Full Name *                 │   │
│  │ [_____________________________]  │   │
│  │                                    │   │
│  │ Your Position *                   │   │
│  │ [_____________________________]   │   │
│  │ (e.g. President, Coordinator)     │   │
│  └────────────────────────────────────┘   │
│                                          │
│  [✅  Save & Continue to Dashboard]      │
└──────────────────────────────────────────┘
```

---

## 3. Admin Perspective — Full Visual Walkthrough

### 3.1 Admin Dashboard (Before → After)

**BEFORE** (5 stat cards — includes Pending review):

```
┌─────────────────────────────────────────────────────┐
│ [Total        ] [Pending       ] [Active       ]    │
│ [Organizers 5 ] [review      2] [           3 ]    │
│                                                     │
│ [Suspended    ] [Total         ]                     │
│ [           0 ] [Events      8]                     │
└─────────────────────────────────────────────────────┘
```

**AFTER** (4 stat cards — Pending review removed):

```
┌─────────────────────────────────────────────────────┐
│ [Total        ] [Active        ] [Suspended     ]   │
│ [Organizers 5 ] [            5 ] [           0 ]   │
│                                                     │
│ [Total         ]                                     │
│ [Events      8]                                     │
└─────────────────────────────────────────────────────┘
```

### 3.2 Organizer Management Table (Before → After)

**BEFORE:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Status filter: [All] [Pending] [Active] [Suspended] [Archived]          │
├─────────────────────────────────────────────────────────────────────────┤
│ Email         | Status        | Orgs    | Created   | Actions            │
├─────────────────────────────────────────────────────────────────────────┤
│ org@email.com | ⏳ Pending    | 0 orgs  | Jan 1     | [Approve] [Archv]  │
│ org2@email... | ✅ Active     | 1 org   | Jan 2     | [Suspend] [Archv]  │
└─────────────────────────────────────────────────────────────────────────┘
```

**AFTER:**

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Status filter: [All] [Active] [Suspended] [Archived]                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Email         | Status  | Profile       | Orgs  | Actions                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│ org@email.com | ✅ Active | ❌ Incomplete  | 0 orgs | [Send Onboarding] [Suspend]  │
│ org2@email... | ✅ Active | ✅ Complete    | 1 org  | [Suspend]                    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 "Send Onboarding" Button Details

- **Visible for**: Organizers with `profile_complete = false`
- **Action**: Sends email to organizer reminding them to complete profile
- **Email content**: "Dear [Email], Your VOTRIX organization profile is incomplete. Please log in to complete your profile and start using the dashboard."
- **Frontend UX**: Click → confirmation dialog → send → success toast
- **Backend**: `POST /api/admin/organizers/:id/send-onboarding`

### 3.4 Create Organizer Modal (Before → After)

**BEFORE helper text:**

```
"New organizer accounts start in pending review, and the organizer must change this password on first login."
```

**AFTER helper text:**

```
"Organizer account is immediately active. On first login, they'll be guided to complete their organization profile before accessing the dashboard."
```

---

## 4. New & Modified API Endpoints

### 4.1 `GET /api/admin/organizers` (Modified)

Now returns profile fields:

```json
{
  "id": "uuid",
  "email": "organizer@example.com",
  "account_status": "active",
  "profile_complete": false,
  "organization_name": null,
  "organizer_name": null,
  "position": null,
  "organization_type_display": null,
  "created_at": "2025-01-01T00:00:00Z"
}
```

### 4.2 `POST /api/admin/organizers/:id/send-onboarding` (NEW)

Admin-triggered onboarding email:

```javascript
// Backend: Sends email to organizer
// Subject: "Complete Your VOTRIX Organization Profile"
// Body: Reminds organizer to log in and complete profile
// Returns: { success: true, message: "Onboarding notification sent to [email]" }
```

### 4.3 `GET /api/organizer/profile` (NEW)

Returns organizer's profile:

```json
{
  "success": true,
  "profile": {
    "organizationName": "",
    "organizationType": "",
    "organizerName": "",
    "position": ""
  }
}
```

### 4.4 `PUT /api/organizer/profile` (NEW)

Saves organizer's profile:

```javascript
// Body: { organizationName, organizationType, organizerName, position }
// Validates all 4 fields are non-empty
// Saves to users table
```

### 4.5 `GET /api/organizer/profile/status` (NEW)

Checks if profile is complete:

```json
{ "success": true, "complete": false }
```

---

## 5. Organizer Perspective — Full Walkthroughs

### New Organizer (First Login)

```
1. Admin creates account → organizer receives email with temp password
2. Organizer logs in at /login (UNIFIED LOGIN)
3. must_change_password=true → redirects to /change-password
4. Organizer chooses: [Set new password] or [Continue with temp password]
5. After password decision → frontend checks profile status
6. Profile incomplete → redirects to /organizer/onboarding
7. Organizer fills: Organization Name, Organization Type, Your Name, Position
8. Clicks [Save & Continue to Dashboard]
9. Profile saved → redirects to /organizer dashboard
10. All subsequent logins → go directly to dashboard
```

### Existing Organizer with Incomplete Profile

```
1. Organizer logs in (password may or may not need changing)
2. After auth → frontend checks profile status
3. Profile incomplete (e.g. position is empty) → redirects to /organizer/onboarding
4. Completes the missing fields
5. Redirects to dashboard
```

### Existing Organizer with Complete Profile

```
1. Organizer logs in
2. Frontend checks profile status → returns { complete: true }
3. Direct to /organizer dashboard — NO onboarding shown
```

---

## 6. Database Changes

### Migration: 031_organizer_onboarding_profile.sql

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS organizer_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS position VARCHAR(255),
  ADD COLUMN IF NOT EXISTS organization_type_display VARCHAR(255);

COMMENT ON COLUMN users.organizer_name IS 'Organizer''s display name (required for onboarding)';
COMMENT ON COLUMN users.position IS 'Organizer''s position/role (required for onboarding)';
COMMENT ON COLUMN users.organization_type_display IS 'Free-text organization type (required for onboarding)';

-- Backfill existing organizers with empty strings
UPDATE users
SET
  organizer_name = COALESCE(NULLIF(organizer_name, ''), ''),
  position = COALESCE(NULLIF(position, ''), ''),
  organization_type_display = COALESCE(NULLIF(organization_type_display, ''), '')
WHERE role = 'organizer';

ANALYZE users;
```

Profile is complete when all 4 are non-empty:

- `organization_name`, `organizer_name`, `position`, `organization_type_display`

---

## 7. Backend Changes (Detailed)

| #   | File                                          | Change                                                                                     |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | `services/user.service.js`                    | `createOrganizer`: Set `account_status = 'active'` instead of `'pending'`                  |
| 2   | `services/auth.service.js`                    | `skipPasswordChange`: Remove voter-only restriction, allow organizers                      |
| 3   | `services/organizer-profile.service.js`       | **NEW**: `getProfile()`, `updateProfile()`, `isProfileComplete()`                          |
| 4   | `services/admin.service.js`                   | `getOrganizersList()`: Add profile fields to response; NEW: `sendOnboardingNotification()` |
| 5   | `controllers/admin.controller.js`             | `createOrganizerAccount`: Update message; NEW: `sendOrganizerOnboarding()`                 |
| 6   | `controllers/organizer-profile.controller.js` | **NEW**: `getProfile()`, `updateProfile()`, `getProfileStatus()`                           |
| 7   | `routes/admin.routes.js`                      | Add `POST /organizers/:id/send-onboarding`                                                 |
| 8   | `routes/organizer.routes.js`                  | Add profile routes before password check; add requireProfileComplete to sub-routes         |
| 9   | `middleware/auth.js`                          | Add `requireProfileComplete` middleware                                                    |

---

## 8. Frontend Changes (Detailed)

| #   | File                                          | Change                                                             |
| --- | --------------------------------------------- | ------------------------------------------------------------------ |
| 1   | `pages/auth/ChangePasswordPage.jsx`           | Show "Continue with temp password" for organizers too              |
| 2   | `pages/organizer/OrganizerOnboardingPage.jsx` | **NEW**: 4-field profile form page                                 |
| 3   | `services/organizer-profile.service.js`       | **NEW**: API client for profile endpoints                          |
| 4   | `routes/index.jsx`                            | Add `/organizer/onboarding` route                                  |
| 5   | `routes/ProtectedRoute.jsx`                   | Add profile completion redirect for organizers                     |
| 6   | `hooks/useLogin.js`                           | Add profile check after password decision                          |
| 7   | `admin/OrganizerManagementPage.jsx`           | Add Profile column + Send Onboarding action; remove Pending filter |
| 8   | `admin/AdminDashboardPage.jsx`                | Remove "Pending review" stat card                                  |

---

## 9. Files That Remain UNCHANGED

- All module-specific backend: election, competition, polling controllers/services/routes
- All module-specific frontend: ElectionDashboardPage, CompetitionDashboardPage, etc.
- All layouts: DashboardLayout, ElectionLayout, PageantLayout, PollingLayout, ReportsLayout
- All UI components: Button, Card, Badge, StatCard, Skeleton, etc.
- All existing hooks: useAuth, useToast, useSocketEvent, etc.
- All existing services: auth.service.js, organizer.service.js, admin.service.js
- All other database migrations (001-030)

---

## 10. Rollback Strategy

### Database

```sql
ALTER TABLE users DROP COLUMN IF EXISTS organizer_name;
ALTER TABLE users DROP COLUMN IF EXISTS position;
ALTER TABLE users DROP COLUMN IF EXISTS organization_type_display;
```

### Backend

1. Revert `user.service.js`: `account_status: 'pending'`
2. Revert `auth.service.js`: voter-only skip
3. Delete `organizer-profile.service.js`, `organizer-profile.controller.js`
4. Revert `admin.service.js`, `admin.controller.js`, `admin.routes.js`
5. Revert `organizer.routes.js`, `auth.js`

### Frontend

1. Delete `OrganizerOnboardingPage.jsx`, `organizer-profile.service.js`
2. Revert `ChangePasswordPage.jsx`, `routes/index.jsx`, `ProtectedRoute.jsx`, `useLogin.js`
3. Revert `OrganizerManagementPage.jsx`, `AdminDashboardPage.jsx`
