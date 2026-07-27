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

### Issues

1. **Redundant approval**: Admin creates the account, then must approve it. This is pointless.
2. **Organizers can't skip password change**: Only voters have the "Continue with temp password" option.
3. **No onboarding**: After password change, organizer gets an empty dashboard with no guidance.
4. **No organization profile**: `organization_name` defaults to "My Organization" with no required fields.
5. **Admin UI clutter**: "Pending review" stat card, "Pending" filter button, "Approve" action — all unnecessary.

---

## 2. Updated Workflow (After)

### 2.1 Admin Creates Organizer (Simplified)

```
Admin clicks "Create organizer" button
  → Modal form: Email + Temporary password (SAME AS BEFORE)
  → Backend creates user with account_status = 'active' (CHANGED from 'pending')
  → Admin sees: "Active" badge immediately (no "Pending review")
  → No "Approve" button needed
  → Success message: "Organizer account created" (removed "pending approval")
```

**What changes in admin UI:**

- Admin Dashboard: "Pending review" stat card disappears
- Organizer Management page: "Pending review" badge column changed
- Organizer Management table: "Approve" action button removed for newly created organizers
- Status filter: "Pending" option removed (or shows 0)
- Simplified flow: Create → Active → Done

### 2.2 Organizer First Login (Enhanced)

```
Organizer enters email + password at /login (SAME unified login)
  → requireActiveAccount passes (account is already 'active')
  → requirePasswordChanged detects must_change_password = true
  → Redirected to /change-password (SAME REDIRECT)
```

### 2.3 Change Password Page (Modified)

```
/change-password page now shows for organizers:
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

**What changes:**

- The "Continue with temporary password" button was hidden for organizers → NOW VISIBLE
- Both options now available for organizers (same as voters)
- Text updated to be role-neutral
- Clicking "Set new password" → calls /api/auth/change-password
- Clicking "Continue" → calls /api/auth/skip-password-change (previously only allowed for voters)

### 2.4 After Password Decision → Profile Check (NEW)

```
After password is changed OR skipped:
  → Frontend calls GET /api/organizer/profile/status
  → If profile is incomplete:
       Redirect to /organizer/onboarding (NEW PAGE)
  → If profile is complete:
       Redirect to /organizer dashboard (EXISTING)
```

### 2.5 Onboarding Profile Form (NEW PAGE)

```
/organizer/onboarding page:
  ┌──────────────────────────────────────────┐
  │                                          │
  │  👋  Welcome to VOTRIX                    │
  │                                          │
  │  Complete your organization profile to   │
  │  get started. This only takes a moment.  │
  │                                          │
  │  ┌─────────────────────────────────────┐ │
  │  │ Organization Profile                │ │
  │  │                                     │ │
  │  │ Organization Name  [______________] │ │
  │  │                                     │ │
  │  │ Organization Type [______________]  │ │
  │  │   (e.g. Student Org, Department)    │ │
  │  │                                     │ │
  │  │ Your Name          [______________] │ │
  │  │                                     │ │
  │  │ Your Position      [______________] │ │
  │  │   (e.g. President, Coordinator)     │ │
  │  │                                     │ │
  │  │        [✅  Save & Continue]        │ │
  │  └─────────────────────────────────────┘ │
  │                                          │
  └──────────────────────────────────────────┘
```

**Fields (all required, all text inputs — no dropdowns):**

1. **Organization Name** (`organization_name` on `users` table) — text input
2. **Organization Type** (`organization_type_display` on `users` table) — text input (free text, e.g. "Student Organization", "Department", etc.)
3. **Your Name** (`organizer_name` on `users` table) — text input
4. **Your Position** (`position` on `users` table) — text input (free text, e.g. "President", "Coordinator")

**Why text inputs instead of dropdowns:**

- The VOTRIX system doesn't maintain a list of organization types
- Different institutions have different organization structures
- Let the organizer type what fits their organization
- The `organization_type_display` column stores whatever the organizer enters

### 2.6 Dashboard Access

```
After profile form submission:
  → Saves to users table via PUT /api/organizer/profile
  → Redirects to /organizer dashboard (EXISTING)
  → All subsequent logins → profile complete → direct to dashboard
```

### 2.7 Existing Organizers

```
Existing organizer logs in:
  → Goes through normal auth flow
  → If must_change_password = true → /change-password first
  → After auth passes → frontend checks GET /api/organizer/profile/status

  If profile incomplete (organizer_name, position, etc. are empty):
    → Redirect to /organizer/onboarding
    → Show profile form (pre-fill organization_name if exists)
    → Must complete to proceed

  If profile complete (all fields filled):
    → Direct to /organizer dashboard (no onboarding)
```

---

## 3. Admin Perspective — What Changes

### Admin Dashboard (Before → After)

| Section        | Before                                                | After                                                         |
| -------------- | ----------------------------------------------------- | ------------------------------------------------------------- |
| Stat cards     | Total organizers, Pending review, Active, Suspended   | Total organizers, Active, Suspended (REMOVED: Pending review) |
| Organizer list | Shows "Pending review" badge, "Approve" action button | Shows "Active" badge, no "Approve" button                     |
| Status filter  | All, Pending, Active, Suspended, Archived             | All, Active, Suspended, Archived (REMOVED: Pending)           |

### Admin Organizer Management Page

**Before:** Each row shows status dropdown with "Approve" as primary action for pending organizers
**After:** New organizers are immediately active. The "Approve" button only appears if an organizer was manually set to "pending" (legacy), but by default organizers skip this step entirely.

### Admin Create Organizer Modal

**Before:**

```
┌─ Create Organizer ─────────────────┐
│ Email: [________________]          │
│ Temp Password: [________________] │
│                                    │
│ [Create account]                   │
│                                    │
│ "New organizer accounts start in   │
│  pending review..."                │
└────────────────────────────────────┘
```

**After:**

```
┌─ Create Organizer ─────────────────┐
│ Email: [________________]          │
│ Temp Password: [________________] │
│                                    │
│ [Create account]                   │
│                                    │
│ "Organizer account is immediately  │
│  active and ready for use."        │  ← UPDATED TEXT
└────────────────────────────────────┘
```

---

## 4. Organizer Perspective — Full Visual Walkthrough

### Step 1: Sign In (UNCHANGED)

```
/login page:
┌──────────────────────────────────────┐
│  🔐  Sign in to VOTRIX               │
│                                      │
│  Enter your email and password to    │
│  access your account.                │
│                                      │
│  Email    [organizer@example.com]    │
│  Password [················]         │
│  ☐ Remember me                       │
│                                      │
│  [Sign in]                           │
│  Forgot password?                    │
└──────────────────────────────────────┘
```

### Step 2: Change Password (MODIFIED — skip option now visible)

```
/change-password page:
┌──────────────────────────────────────┐
│  🔒  Change your password            │
│                                      │
│  Set a personal password to secure   │
│  your account, or continue with your │
│  temporary password.                 │
│                                      │
│  Current password  [··············]  │
│  New password      [··············]  │
│  Confirm password  [··············]  │
│                                      │
│  [🛡️  Set new password]              │
│                                      │
│  ──────────────── OR ──────────────  │
│                                      │
│  [⏭️  Continue with temp password]   │
│  You can change your password anytime│
└──────────────────────────────────────┘
```

### Step 3: Onboarding Profile (NEW)

```
/organizer/onboarding page:
┌──────────────────────────────────────────┐
│  VOTRIX Dashboard          👤 Logout     │
├──────────────────────────────────────────┤
│                                          │
│  👋  Welcome! Let's set up your profile  │
│                                          │
│  ┌─ Organization Information ────────┐   │
│  │                                    │   │
│  │  Organization Name *              │   │
│  │  [College of Engineering        ] │   │
│  │                                    │   │
│  │  Organization Type *              │   │
│  │  [Student Organization          ] │   │
│  │  (e.g. Student Org, Department)   │   │
│  │                                    │   │
│  └────────────────────────────────────┘   │
│                                          │
│  ┌─ Your Information ───────────────┐    │
│  │                                    │   │
│  │  Your Full Name *                 │   │
│  │  [Juan Dela Cruz               ]  │   │
│  │                                    │   │
│  │  Your Position *                  │   │
│  │  [President                    ]  │   │
│  │  (e.g. President, Coordinator)    │   │
│  │                                    │   │
│  └────────────────────────────────────┘   │
│                                          │
│  [✅  Save & Continue to Dashboard]      │
│                                          │
└──────────────────────────────────────────┘
```

### Step 4: Dashboard (UNCHANGED)

```
/organizer dashboard:
┌──────────────────────────────────────────┐
│  VOTRIX Dashboard          👤 Logout     │
├──────────────────────────────────────────┤
│                                          │
│  Organizer dashboard                     │
│  Signed in as organizer@example.com      │
│                                          │
│  [Total] [Active] [Finished] [Voters]    │
│  [Events] [Events] [Events]  [Assigned]  │
│                                          │
│  ┌────────┐ ┌────────┐ ┌────────┐       │
│  │ELECTION│ │COMPET. │ │POLLING │       │
│  │  MODULE │ │ MODULE │ │ MODULE │       │
│  └────────┘ └────────┘ └────────┘       │
│                                          │
│  ...existing dashboard content...        │
└──────────────────────────────────────────┘
```

---

## 5. Database Changes

### New Migration: 031_organizer_onboarding_profile.sql

Only 2 new columns added to `users` table (where `organization_name` already exists from migration 028):

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS organizer_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS position VARCHAR(255),
  ADD COLUMN IF NOT EXISTS organization_type_display VARCHAR(255);

COMMENT ON COLUMN users.organizer_name IS 'Organizer''s display name (required for onboarding)';
COMMENT ON COLUMN users.position IS 'Organizer''s position/role (required for onboarding)';
COMMENT ON COLUMN users.organization_type_display IS 'Free-text organization type label (required for onboarding)';
```

**Backfill for existing organizers:**

```sql
UPDATE users
SET
  organization_name       = COALESCE(NULLIF(organization_name, ''), 'My Organization'),
  organizer_name          = COALESCE(NULLIF(organizer_name, ''), ''),
  position                = COALESCE(NULLIF(position, ''), ''),
  organization_type_display = COALESCE(NULLIF(organization_type_display, ''), '')
WHERE role = 'organizer';
```

**Profile is "complete" when all 4 fields are non-empty:**

- `organization_name` IS NOT NULL AND != ''
- `organizer_name` IS NOT NULL AND != ''
- `position` IS NOT NULL AND != ''
- `organization_type_display` IS NOT NULL AND != ''

---

## 6. Backend Changes

### 6.1 Modified: `backend/src/services/user.service.js`

In `createOrganizer` function:

```javascript
// CHANGE:
account_status: 'active',   // WAS: 'pending'
// KEEP everything else the same
```

### 6.2 Modified: `backend/src/services/auth.service.js`

In `skipPasswordChange` function:

```javascript
// CHANGE: Remove voter-only restriction
// BEFORE:
if (user.role !== USER_ROLES.VOTER) {
  throw new ApiError(403, "Password change is required for your account type");
}

// AFTER:
// Allow any role (voter AND organizer) to skip password change
// Admin is excluded because admin uses username, not email
```

### 6.3 Modified: `backend/src/controllers/admin.controller.js`

In `createOrganizerAccount`:

```javascript
// BEFORE:
message: 'Organizer account created and pending approval',
// + createAdminAlert for pending approval

// AFTER:
message: 'Organizer account created and ready for use',
// REMOVE createAdminAlert for pending approval
```

### 6.4 NEW FILE: `backend/src/services/organizer-profile.service.js`

```javascript
/**
 * Organizer Profile Service
 *
 * Manages the organizer's organization profile stored on the users table.
 * Fields: organization_name, organization_type_display, organizer_name, position
 */

import { db, wrap } from "../foundation/db.js";
import { DB_TABLES, USER_ROLES } from "../utils/constants.js";
import { badRequest, notFound } from "../foundation/errors.js";

/**
 * Get the organizer's profile from the users table.
 */
export async function getOrganizerProfile(organizerId) {
  const result = await db()
    .from(DB_TABLES.USERS)
    .select(
      "id, email, organization_name, organization_type_display, organizer_name, position, organization_logo",
    )
    .eq("id", organizerId)
    .eq("role", USER_ROLES.ORGANIZER)
    .single();

  const user = await wrap(result, { context: "organizerProfile.getProfile" });
  if (!user) throw notFound("Organizer not found");

  return {
    id: user.id,
    email: user.email,
    organizationName: user.organization_name || "",
    organizationType: user.organization_type_display || "",
    organizerName: user.organizer_name || "",
    position: user.position || "",
    logo: user.organization_logo || null,
  };
}

/**
 * Update the organizer's profile.
 */
export async function updateOrganizerProfile(
  organizerId,
  { organizationName, organizationType, organizerName, position },
) {
  const updates = {};

  if (organizationName !== undefined)
    updates.organization_name = organizationName.trim();
  if (organizationType !== undefined)
    updates.organization_type_display = organizationType.trim();
  if (organizerName !== undefined)
    updates.organizer_name = organizerName.trim();
  if (position !== undefined) updates.position = position.trim();

  if (Object.keys(updates).length === 0) {
    throw badRequest("No fields to update");
  }

  const result = await db()
    .from(DB_TABLES.USERS)
    .update(updates)
    .eq("id", organizerId)
    .eq("role", USER_ROLES.ORGANIZER)
    .select(
      "id, email, organization_name, organization_type_display, organizer_name, position, organization_logo",
    )
    .single();

  const user = await wrap(result, {
    context: "organizerProfile.updateProfile",
  });
  if (!user) throw notFound("Organizer not found");

  return {
    id: user.id,
    email: user.email,
    organizationName: user.organization_name || "",
    organizationType: user.organization_type_display || "",
    organizerName: user.organizer_name || "",
    position: user.position || "",
  };
}

/**
 * Check if the organizer's profile is complete (all fields filled).
 */
export async function isOrganizerProfileComplete(organizerId) {
  const result = await db()
    .from(DB_TABLES.USERS)
    .select(
      "organization_name, organization_type_display, organizer_name, position",
    )
    .eq("id", organizerId)
    .eq("role", USER_ROLES.ORGANIZER)
    .single();

  const user = await wrap(result, { context: "organizerProfile.isComplete" });
  if (!user) throw notFound("Organizer not found");

  const complete = Boolean(
    user.organization_name?.trim() &&
    user.organization_type_display?.trim() &&
    user.organizer_name?.trim() &&
    user.position?.trim(),
  );

  return { complete, profile: user };
}
```

### 6.5 NEW FILE: `backend/src/controllers/organizer-profile.controller.js`

```javascript
import { asyncHandler } from "../utils/asyncHandler.js";
import * as organizerProfileService from "../services/organizer-profile.service.js";
import { ApiError } from "../utils/ApiError.js";

const VALID_ORGANIZATION_TYPES = [
  "Student Organization",
  "Academic Department",
  "College Office",
  "University Office",
  "Student Council",
  "Committee",
  "Others",
];

function validateProfilePayload(body) {
  const { organizationName, organizationType, organizerName, position } =
    body ?? {};
  const errors = [];

  if (!organizationName?.trim()) errors.push("Organization name is required");
  if (!organizationType?.trim()) errors.push("Organization type is required");
  if (!organizerName?.trim()) errors.push("Organizer name is required");
  if (!position?.trim()) errors.push("Position is required");

  if (errors.length > 0) {
    throw new ApiError(400, errors.join("; "));
  }

  return {
    organizationName: organizationName.trim(),
    organizationType: organizationType.trim(),
    organizerName: organizerName.trim(),
    position: position.trim(),
  };
}

export const getProfile = asyncHandler(async (req, res) => {
  const profile = await organizerProfileService.getOrganizerProfile(
    req.user.id,
  );
  res.json({ success: true, profile });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const payload = validateProfilePayload(req.body);
  const profile = await organizerProfileService.updateOrganizerProfile(
    req.user.id,
    payload,
  );

  res.json({
    success: true,
    message: "Organization profile saved",
    profile,
  });
});

export const getProfileStatus = asyncHandler(async (req, res) => {
  const { complete, profile } =
    await organizerProfileService.isOrganizerProfileComplete(req.user.id);
  res.json({ success: true, complete, profile });
});
```

### 6.6 NEW MIDDLEWARE: Add to `backend/src/middleware/auth.js`

```javascript
/**
 * Block dashboard/API access until the organizer profile is complete.
 */
export function requireProfileComplete(req, _res, next) {
  // Only applies to organizers
  if (req.user?.role !== "organizer") {
    return next();
  }

  // Import here to avoid circular dependency
  import("../services/organizer-profile.service.js")
    .then(({ isOrganizerProfileComplete }) => {
      isOrganizerProfileComplete(req.user.id)
        .then(({ complete }) => {
          if (!complete) {
            return next(
              new ApiError(
                403,
                "Complete your organization profile before continuing",
                {
                  code: "PROFILE_INCOMPLETE",
                },
              ),
            );
          }
          next();
        })
        .catch(next);
    })
    .catch(next);
}
```

### 6.7 Modified: `backend/src/routes/organizer.routes.js`

```javascript
import * as organizerProfileController from "../controllers/organizer-profile.controller.js";
import { requireProfileComplete } from "../middleware/auth.js";

const router = Router();

router.use(authenticate, authorize(USER_ROLES.ORGANIZER), requireActiveAccount);

// Profile routes — BEFORE requirePasswordChanged so organizers can access
// even if they haven't changed their password yet
router.get("/profile", organizerProfileController.getProfile);
router.put("/profile", organizerProfileController.updateProfile);
router.get("/profile/status", organizerProfileController.getProfileStatus);

// Password check comes after profile routes
router.use(requirePasswordChanged);

// Dashboard/module routes — require profile complete
router.use("/election", requireProfileComplete, electionOrganizerRoutes);
router.use("/competition", requireProfileComplete, pageantOrganizerRoutes);
router.use("/polling", requireProfileComplete, pollingOrganizerRoutes);
router.use("/reports", requireProfileComplete, reportsOrganizerRoutes);

router.get(
  "/overview",
  requireProfileComplete,
  organizerController.getOrganizerOverview,
);
router.get(
  "/dashboard",
  requireProfileComplete,
  organizerController.getDashboard,
);
router.get(
  "/analytics",
  requireProfileComplete,
  organizerController.getAnalytics,
);
router.post(
  "/organization/logo",
  requireProfileComplete,
  uploadLimiter,
  uploadImage("logo"),
  organizerController.uploadOrganizationLogo,
);
router.post(
  "/events/:eventId/voters/invite",
  requireProfileComplete,
  emailLimiter,
  organizerController.inviteVoter,
);
// ... rest of routes
```

---

## 7. Frontend Changes

### 7.1 Modified: `frontend/src/pages/auth/ChangePasswordPage.jsx`

**Changes:**

- Remove the `isVoter` check that hides "Continue with temporary password" for organizers
- Let all roles (except admin) see the skip option
- Update text to be role-neutral

**Key change area:**

```javascript
// BEFORE:
const isVoter = role === "voter";

// AFTER:
const canSkip = role !== "admin"; // Both organizer and voter can skip
```

### 7.2 NEW FILE: `frontend/src/services/organizer-profile.service.js`

```javascript
import api from "@/services/api";

const base = "/organizer";

export const organizerProfileService = {
  getProfile() {
    return api.get(`${base}/profile`);
  },

  updateProfile(payload) {
    return api.put(`${base}/profile`, payload);
  },

  getProfileStatus() {
    return api.get(`${base}/profile/status`);
  },
};
```

### 7.3 NEW FILE: `frontend/src/pages/organizer/OrganizerOnboardingPage.jsx`

A new page that shows:

- Welcome heading
- 4 text input fields (Organization Name, Organization Type, Your Name, Position)
- Submit button → Save & Continue to Dashboard

This page uses:

- `react-hook-form` + `zod` for validation (consistent with existing pattern)
- Existing `Button` and UI components
- Same `AuthLayout` wrapper for consistent styling

### 7.4 Modified: `frontend/src/hooks/useLogin.js`

After successful login and password decision, check profile status:

```javascript
// AFTER password decision (change or skip):
if (data.user.role === USER_ROLES.ORGANIZER) {
  // Check profile completion status
  const { data: statusData } = await organizerProfileService.getProfileStatus();
  if (!statusData.complete) {
    navigate("/organizer/onboarding", { replace: true });
  } else {
    navigate("/organizer", { replace: true });
  }
}
```

### 7.5 Modified: `frontend/src/routes/ProtectedRoute.jsx`

Add profile completion check for organizers:

```javascript
// After mustChangePassword check:
if (
  role === USER_ROLES.ORGANIZER &&
  !allowPasswordChange &&
  location.pathname !== "/organizer/onboarding"
) {
  // Check profile status — if incomplete, redirect to onboarding
  const checkProfile = async () => {
    try {
      const { data } = await organizerProfileService.getProfileStatus();
      if (!data.complete) {
        return <Navigate to="/organizer/onboarding" replace />;
      }
    } catch {
      // On error, allow access (profile check is not critical)
    }
    return children;
  };
  // Use a state-based approach or inline check
}
```

### 7.6 Modified: `frontend/src/routes/index.jsx`

Add the onboarding route:

```javascript
const OrganizerOnboardingPage = lazy(() => import('@/pages/organizer/OrganizerOnboardingPage'))

// Add to routeConfig:
{
  path: '/organizer/onboarding',
  element: (
    <ProtectedRoute allowedRoles={[USER_ROLES.ORGANIZER]} allowPasswordChange>
      <AuthLayout />
    </ProtectedRoute>
  ),
  children: [{ index: true, element: <OrganizerOnboardingPage /> }],
},
```

Note: `allowPasswordChange` is set to `true` so organizers with `mustChangePassword=true` can still access this page.

---

## 8. Admin UI Changes (Summary)

### OrganizerManagementPage.jsx

| Change                                 | Description                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Remove "Pending review" stat card      | The stat cards show: Total organizers, Active, Suspended (was: Total, Pending, Active, Suspended)       |
| Remove "pending" from status filter    | Filter buttons: All, Active, Suspended, Archived (was: All, Pending, Active, Suspended, Archived)       |
| No "Approve" action for new organizers | Table rows for active organizers show "Suspend" as primary action                                       |
| Update description text                | "Create organizers and manage their accounts" (was: "Review organizer accounts, approve new access...") |

### CreateOrganizerModal.jsx

| Change                 | Description                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Update helper text     | "Organizer account is immediately active and ready for use." (was: "New organizer accounts start in pending review...") |
| Update success message | "Organizer created successfully" (was: "pending approval")                                                              |

### AdminDashboardPage.jsx

| Change                                  | Description          |
| --------------------------------------- | -------------------- |
| Remove "Pending review" from stat cards | 4 cards instead of 5 |

---

## 9. Files Summary

### New Files (7)

| File                                                                        | Purpose                               |
| --------------------------------------------------------------------------- | ------------------------------------- |
| `backend/src/database/migrations/031_organizer_onboarding_profile.sql`      | Add profile columns to users table    |
| `backend/src/database/migrations/031_down_organizer_onboarding_profile.sql` | Rollback migration                    |
| `backend/src/services/organizer-profile.service.js`                         | Profile CRUD + completion check logic |
| `backend/src/controllers/organizer-profile.controller.js`                   | Profile API endpoints                 |
| `frontend/src/services/organizer-profile.service.js`                        | Frontend API client for profile       |
| `frontend/src/pages/organizer/OrganizerOnboardingPage.jsx`                  | Onboarding profile form page          |

### Modified Files (9)

| File                                             | Change                                                 |
| ------------------------------------------------ | ------------------------------------------------------ |
| `backend/src/services/user.service.js`           | Set `account_status='active'` on organizer creation    |
| `backend/src/services/auth.service.js`           | Allow organizers to skip password change               |
| `backend/src/controllers/admin.controller.js`    | Remove pending approval alert & message                |
| `backend/src/routes/organizer.routes.js`         | Add profile routes + requireProfileComplete middleware |
| `backend/src/middleware/auth.js`                 | Add `requireProfileComplete` middleware                |
| `frontend/src/pages/auth/ChangePasswordPage.jsx` | Show skip option for organizers                        |
| `frontend/src/routes/index.jsx`                  | Add `/organizer/onboarding` route                      |
| `frontend/src/routes/ProtectedRoute.jsx`         | Add profile completion check                           |
| `frontend/src/hooks/useLogin.js`                 | Add profile check after login                          |

### Unchanged Files (All Others)

- **All module-specific code**: Election, Competition, Polling — backend controllers, services, routes, and frontend pages remain untouched.
- **All existing layouts**: DashboardLayout, ElectionLayout, PageantLayout, PollingLayout, ReportsLayout — unchanged.
- **All existing UI components**: Button, Card, Badge, StatCard, etc. — unchanged.
- **All existing services**: auth.service.js, organizer.service.js, election.service.js — unchanged.
- **All existing hooks**: useAuth, useToast, useSocketEvent — unchanged.
- **All existing middleware**: authenticate, authorize, requireActiveAccount, requirePasswordChanged — unchanged.
- **All database migrations** except the new 031 — unchanged.

---

## 10. Security Considerations

| Requirement       | Status                                              |
| ----------------- | --------------------------------------------------- |
| Authentication    | Preserved — unified login unchanged                 |
| Authorization     | Preserved — role-based middleware unchanged         |
| Password security | Preserved — bcrypt hashing, token version increment |
| Session handling  | Preserved — JWT cookies, refresh mechanism          |
| CSRF protection   | Preserved — existing pattern                        |
| Rate limiting     | Preserved — existing rate limiters                  |
| Audit logging     | Enhanced — profile updates will be logged           |
| Validation        | Enhanced — profile fields validated on backend      |

---

## 11. Rollback Strategy

### Database

```sql
-- Run 031_down migration
ALTER TABLE users DROP COLUMN IF EXISTS organizer_name;
ALTER TABLE users DROP COLUMN IF EXISTS position;
ALTER TABLE users DROP COLUMN IF EXISTS organization_type_display;
```

### Backend

1. Revert `auth.service.js` — restore voter-only skip
2. Revert `user.service.js` — restore `account_status: 'pending'`
3. Revert `admin.controller.js` — restore approval message
4. Delete `organizer-profile.service.js` and `organizer-profile.controller.js`
5. Revert `organizer.routes.js` — remove profile routes and middleware
6. Revert `auth.js` — remove `requireProfileComplete`

### Frontend

1. Delete `OrganizerOnboardingPage.jsx` and `organizer-profile.service.js`
2. Revert `ChangePasswordPage.jsx` — restore voter-only skip
3. Revert `routes/index.jsx` — remove onboarding route
4. Revert `ProtectedRoute.jsx` — remove profile check
5. Revert `useLogin.js` — remove profile check redirect
