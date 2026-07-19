# Votrix Unified Login Migration Plan

## Overview

This document outlines a step-by-step plan to consolidate the three separate login pages (Admin, Organizer, Voter) into a **single unified login page** that uses **email + password** for all roles. The role will be determined from the user data in the database.

---

## Current State Analysis

### Login Flow (Before)

| Role | Login URL | Credentials | Backend Endpoint |
|------|-----------|-------------|------------------|
| Admin | `/login/admin` | username + password | `POST /auth/admin/login` |
| Organizer | `/login/organizer` | email + password | `POST /auth/organizer/login` |
| Voter | `/login/voter` | email + password | `POST /auth/voter/login` |

### Database Schema

The `users` table already has the necessary structure:

```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username        VARCHAR(64),   -- Currently used by admin only
  email           VARCHAR(255),  -- Currently used by organizer/voter
  password        TEXT NOT NULL,
  role            user_role NOT NULL,  -- 'admin' | 'organizer' | 'voter'
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT users_username_unique UNIQUE (username),
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_admin_has_username CHECK (role <> 'admin' OR username IS NOT NULL),
  CONSTRAINT users_non_admin_has_email CHECK (role = 'admin' OR email IS NOT NULL),
  CONSTRAINT users_admin_email_optional CHECK (role = 'admin' OR username IS NULL)
);
```

**Key constraint:** Admin must have `username`, non-admins must have `email`.

### Current Problem

- Admin uses **username** (unique to admin)
- Organizer/Voter uses **email**
- Three separate login pages with separate endpoints
- The database constraints enforce this separation

---

## Target State

| Aspect | Current | Target |
|--------|---------|--------|
| Login pages | 3 separate pages | 1 unified page |
| Admin credentials | username + password | email + password |
| Login endpoint | 3 separate routes | 1 unified route |
| User identification | By username OR email | By email only |
| Role detection | At endpoint level | From user record in DB |
| First page (unauthenticated) | HomePage with login links | Login page directly |
| Root URL redirect | Shows HomePage | Redirects to login |

---

## Files Affected

### Frontend (15 files)

| File | Change |
|------|--------|
| `frontend/src/pages/auth/AdminLoginPage.jsx` | DELETE - merged into unified page |
| `frontend/src/pages/auth/OrganizerLoginPage.jsx` | DELETE - merged into unified page |
| `frontend/src/pages/auth/VoterLoginPage.jsx` | DELETE - merged into unified page |
| `frontend/src/pages/auth/LoginPage.jsx` | **CREATE** - new unified login page |
| `frontend/src/components/auth/LoginForm.jsx` | MODIFY - support both email and username or just email |
| `frontend/src/services/auth.service.js` | MODIFY - single login endpoint |
| `frontend/src/schemas/auth.schemas.js` | MODIFY - unified login schema |
| `frontend/src/hooks/useLogin.js` | Minimal - handle role-based redirect |
| `frontend/src/utils/auth.js` | MODIFY - remove role-specific login paths |
| `frontend/src/routes/index.jsx` | MODIFY - root shows login, single /login route |
| `frontend/src/pages/HomePage.jsx` | DELETE or modify - no longer first page |
| `frontend/src/layouts/MainLayout.jsx` | **MODIFY** - remove 3 login links, use single `/login` |
| `frontend/src/hooks/useAuth.js` | CHECK - auth state handling |
| `frontend/src/routes/GuestRoute.jsx` | MODIFY - redirect auth users to dashboard |
| `frontend/src/components/auth/RootRedirect.jsx` | **CREATE** - redirect based on auth state (if Option A) |

### Backend (7 files)

| File | Change |
|------|--------|
| `backend/src/routes/auth.routes.js` | MODIFY - single `/login` endpoint |
| `backend/src/controllers/auth.controller.js` | MODIFY - single login handler |
| `backend/src/services/auth.service.js` | MODIFY - unified login logic |
| `backend/src/validators/auth.validator.js` | MODIFY - unified validation |
| `backend/src/services/user.service.js` | MODIFY - `findUserByEmail` for admin too |
| `backend/src/database/migrations/*.sql` | **CREATE** - schema migration for admin email |
| `backend/src/database/seeds/001_admin_user.example.sql` | MODIFY - email for admin |

### Database

| Change | Description |
|--------|-------------|
| Drop constraints | Remove `users_admin_has_username` and `users_non_admin_has_email` constraints |
| Allow admin email | Admin account can have email (currently NULL) |
| Update admin user | Convert admin from username-based to email-based |

---

## Step-by-Step Implementation Plan

### Phase 0: Pre-Migration (DO FIRST)

**Step 0.1: Backup Database**
- Export current database schema and data
- Create a restore point in Supabase

**Step 0.2: Test Environment Setup**
- Ensure you have a staging/test environment
- Or use feature branches for safe testing

**Step 0.3: Document Current Admin Account**
- Note the current admin username
- Note the current admin password hash
- You'll need to recreate this admin with email

---

### Phase 1: Database Changes

**Step 1.1: Create Migration Script**
Create a new migration file `backend/src/database/migrations/010_unified_login.sql`:

```sql
-- Migration: Unified Login Support
-- Allow admin to have email (relax constraints)

-- 1. Drop old constraints that enforce username for admin, email for others
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_admin_has_username;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_non_admin_has_email;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_admin_email_optional;

-- 2. Add new constraint - email is required for all users
ALTER TABLE users ADD CONSTRAINT users_email_required CHECK (
  role = 'admin' OR email IS NOT NULL
);

-- 3. Make email nullable for admin temporarily (to update)
-- We'll update admin and set email, then add NOT NULL constraint if needed
```

**Step 1.2: Run Migration in Supabase**
- Run the migration in your Supabase SQL Editor
- Verify the constraints are dropped

**Step 1.3: Update Admin Account**
Run this in Supabase SQL Editor to update the admin:

```sql
-- Step 1: Check current admin
SELECT id, username, email, role FROM users WHERE role = 'admin';

-- Step 2: Update admin to use email instead of username
-- Replace 'admin@ votrix.com' with your desired admin email
UPDATE users 
SET email = 'admin@votrix.com', 
    username = NULL 
WHERE role = 'admin';

-- Verify the update
SELECT id, username, email, role FROM users WHERE role = 'admin';
```

**Step 1.4: Verify Data Integrity**
```sql
-- Check all users have either email or username
SELECT id, username, email, role 
FROM users 
WHERE (username IS NULL AND email IS NULL);

-- Should return 0 rows
```

---

### Phase 2: Backend Changes

**Step 2.1: Modify User Service** (`backend/src/services/user.service.js`)

Change `findUserByUsername` to allow finding admin by email:

```javascript
// BEFORE (line 10-18)
export async function findUserByUsername(username) {
  const result = await db()
    .from(DB_TABLES.USERS)
    .select('*')
    .eq('username', username)
    .eq('role', USER_ROLES.ADMIN)
    .maybeSingle()
  return wrap(result, { context: 'user.findUserByUsername' })
}

// AFTER - Allow finding admin by email too
export async function findUserByEmail(email, role = null) {
  let query = db()
    .from(DB_TABLES.USERS)
    .select('*')
    .eq('email', email.toLowerCase())

  if (role) {
    query = query.eq('role', role)
  }

  const result = await query.maybeSingle()
  return wrap(result, { context: 'user.findUserByEmail' })
}
```

**Step 2.2: Create Unified Login Validator** (`backend/src/validators/auth.validator.js`)

Replace role-specific validators with unified one:

```javascript
// BEFORE - separate validators
export function validateAdminLogin(body) { /* ... */ }
export function validateEmailLogin(body) { /* ... */ }

// AFTER - unified validator
export function validateLogin(body) {
  const { email, password, remember } = body ?? {}

  if (!email?.trim() || !password) {
    throw new ApiError(400, 'Email and password are required')
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!EMAIL_RE.test(email.trim())) {
    throw new ApiError(400, 'Invalid email format')
  }

  return { email: sanitizeEmail(email), password, remember: Boolean(remember) }
}
```

**Step 2.3: Modify Auth Service** (`backend/src/services/auth.service.js`)

Replace role-specific login functions with unified logic:

```javascript
// BEFORE - separate login functions
export async function loginAdmin({ username, password }) { /* ... */ }
export async function loginOrganizer({ email, password }) { /* ... */ }
export async function loginVoter({ email, password }) { /* ... */ }

// AFTER - unified login
export async function login({ email, password }) {
  // Find user by email (any role)
  const user = await findUserByEmail(email)
  
  if (!user) {
    throw new ApiError(401, 'Invalid email or password')
  }

  const valid = await comparePassword(password, user.password)
  if (!valid) {
    throw new ApiError(401, 'Invalid email or password')
  }

  assertAccountActive(user)

  return issueTokenPair(user)
}
```

**Step 2.4: Modify Auth Controller** (`backend/src/controllers/auth.controller.js`)

Replace role-specific handlers with unified handler:

```javascript
// BEFORE - separate handlers
export const adminLogin = asyncHandler(async (req, res) => {
  const credentials = validateAdminLogin(req.body)
  // ...
})
export const organizerLogin = asyncHandler(async (req, res) => {
  const credentials = validateEmailLogin(req.body)
  // ...
})
export const voterLogin = asyncHandler(async (req, res) => {
  const credentials = validateEmailLogin(req.body)
  // ...
})

// AFTER - unified handler
export const login = asyncHandler(async (req, res) => {
  const credentials = validateLogin(req.body)
  
  try {
    const tokens = await authService.login(credentials)
    
    await writeAuthAudit({
      action: `${tokens.user.role.toUpperCase()}_LOGIN_SUCCESS`,
      userId: tokens.user?.id ?? null,
      entityId: tokens.user?.id ?? null,
      details: {
        email: tokens.user?.email ?? credentials.email,
        role: tokens.user?.role,
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      },
    })
    
    return sendAuthResponse(res, tokens, { remember: credentials.remember })
  } catch (error) {
    await writeAuthAudit({
      action: 'LOGIN_FAILED',
      details: {
        email: credentials.email,
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
        message: error.message,
      },
    })
    throw error
  }
})
```

**Step 2.5: Modify Auth Routes** (`backend/src/routes/auth.routes.js`)

Replace three login routes with one:

```javascript
// BEFORE
router.post('/admin/login', authLimiter, authController.adminLogin)
router.post('/organizer/login', authLimiter, authController.organizerLogin)
router.post('/voter/login', authLimiter, authController.voterLogin)

// AFTER
router.post('/login', authLimiter, authController.login)
```

---

### Phase 3: Frontend Changes

**Step 3.1: Create Unified Login Schema** (`frontend/src/schemas/auth.schemas.js`)

```javascript
// BEFORE
export const adminLoginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  remember: z.boolean().optional(),
})

export const emailLoginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  remember: z.boolean().optional(),
})

// AFTER - unified schema
export const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  remember: z.boolean().optional(),
})
```

**Step 3.2: Modify Auth Service** (`frontend/src/services/auth.service.js`)

```javascript
// BEFORE
export const authService = {
  adminLogin(credentials) {
    return api.post('/auth/admin/login', credentials)
  },
  organizerLogin(credentials) {
    return api.post('/auth/organizer/login', credentials)
  },
  voterLogin(credentials) {
    return api.post('/auth/voter/login', credentials)
  },
  // ...
}

// AFTER - single login
export const authService = {
  login(credentials) {
    return api.post('/auth/login', credentials)
  },
  // Keep refresh, logout, getMe, changePassword
}
```

**Step 3.3: Create Unified Login Page** (`frontend/src/pages/auth/LoginPage.jsx`)

```jsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema } from '@/schemas/auth.schemas'
import { authService } from '@/services/auth.service'
import { useLogin } from '@/hooks/useLogin'
import LoginForm from '@/components/auth/LoginForm'

export default function LoginPage() {
  const { handleSubmit, error, loading } = useLogin(authService.login)

  const {
    register,
    handleSubmit: onSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', remember: false },
  })

  return (
    <LoginForm
      title="Sign in to VOTRIX"
      description="Enter your email and password to access your account."
      error={error}
      loading={loading}
      onSubmit={onSubmit(handleSubmit)}
      register={register}
      errors={errors}
      showForgot
    />
  )
}
```

**Step 3.4: Modify LoginForm Component** (`frontend/src/components/auth/LoginForm.jsx`)

Simplify to always use email (remove username field option):

```jsx
// Remove usernameField prop and always show email field
export default function LoginForm({
  title,
  description,
  error,
  loading,
  onSubmit,
  register,
  errors,
  showForgot = false,
  showHomeLink = true,
}) {
  return (
    // ... same as current but always email, no username option
    <AuthFormField label="Email" id="email" error={errors.email?.message}>
      <div className="relative">
        <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-v-text-subtle" strokeWidth={1.5} aria-hidden />
        <Input id="email" type="email" autoComplete="email" className="pl-9" {...register('email')} />
      </div>
    </AuthFormField>
    // ...
  )
}
```

**Step 3.5: Update useLogin Hook** (`frontend/src/hooks/useLogin.js`)

No major changes needed - it already handles role-based redirect via `data.user.role`.

**Step 3.6: Modify Auth Utils** (`frontend/src/utils/auth.js`)

Remove role-specific login paths:

```javascript
// BEFORE
export function getRoleLoginPath(role) {
  switch (role) {
    case USER_ROLES.ADMIN:
      return '/login/admin'
    case USER_ROLES.ORGANIZER:
      return '/login/organizer'
    case USER_ROLES.VOTER:
      return '/login/voter'
    default:
      return '/'
  }
}

// AFTER - single login
export function getRoleLoginPath(role) {
  return '/login'
}
```

**Step 3.7: Update Routes** (`frontend/src/routes/index.jsx`)

```jsx
// BEFORE
{
  path: '/login',
  element: (
    <GuestRoute>
      <AuthLayout />
    </GuestRoute>
  ),
  children: [
    { path: 'admin', element: <AdminLoginPage /> },
    { path: 'organizer', element: <OrganizerLoginPage /> },
    { path: 'voter', element: <VoterLoginPage /> },
  ],
}

// AFTER
{
  path: '/login',
  element: (
    <GuestRoute>
      <AuthLayout />
    </GuestRoute>
  ),
  children: [
    { index: true, element: <LoginPage /> },
  ],
},
```

Also update ProtectedRoute to redirect to unified login:

```jsx
// In ProtectedRoute.jsx
if (!isAuthenticated) {
  const loginPath = '/login'  // Always unified
  return <Navigate to={loginPath} state={{ from: location }} replace />
}
```

**Step 3.8b: Update MainLayout** (`frontend/src/layouts/MainLayout.jsx`)

Remove the three separate login links and replace with single unified login:

```jsx
// BEFORE (lines 14, 19, 24)
<Link to="/login/organizer" className="hidden sm:inline-flex">
  Organizer
</Link>
<Link to="/login/voter" className="hidden sm:inline-flex">
  Voter
</Link>
<Link to="/login/admin"></Link>

// AFTER - Single login link
<Link to="/login" className="hidden sm:inline-flex">
  Sign in
</Link>
```

**Step 3.8: Update Home Page** (`frontend/src/pages/HomePage.jsx`)

Change login links to single unified login:

```jsx
// BEFORE
<Link to="/login/organizer">
  <Button size="lg">Organizer login</Button>
</Link>
<Link to="/login/voter">
  <Button variant="secondary" size="lg">Voter login</Button>
</Link>

// AFTER
<Link to="/login">
  <Button size="lg">Sign in</Button>
</Link>
```

---

**Step 3.9: Make Login the First Page (CRITICAL)**

This step ensures that when users access the root URL `/`, they see the login page directly instead of the HomePage with navigation links.

**Option A: Redirect Unauthenticated Users to Login** (Recommended)

Modify `frontend/src/routes/index.jsx` to make `/` redirect to login for unauthenticated users:

```jsx
// BEFORE
{
  path: '/',
  element: <MainLayout />,
  children: [
    { index: true, element: <HomePage /> },
    { path: '*', element: <NotFoundPage /> },
  ],
},

// AFTER - Redirect root to login for guests
{
  path: '/',
  element: <RootRedirect />,  // NEW component
},

// Then keep the login route
{
  path: '/login',
  element: (
    <GuestRoute>
      <AuthLayout />
    </GuestRoute>
  ),
  children: [
    { index: true, element: <LoginPage /> },
  ],
},
```

Create a new component `frontend/src/components/auth/RootRedirect.jsx`:

```jsx
import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export default function RootRedirect() {
  const { isAuthenticated, isBootstrapping } = useAuth()

  // While bootstrapping auth state, show nothing or loading
  if (isBootstrapping) {
    return null // Or a loading spinner
  }

  // If authenticated, go to role-specific dashboard
  if (isAuthenticated) {
    const role = useAuth?.()?.role
    switch (role) {
      case 'admin':
        return <Navigate to="/admin" replace />
      case 'organizer':
        return <Navigate to="/organizer" replace />
      case 'voter':
        return <Navigate to="/voter" replace />
      default:
        return <Navigate to="/login" replace />
    }
  }

  // If not authenticated, go to login
  return <Navigate to="/login" replace />
}
```

**Option B: Replace HomePage with Login (Simpler)**

If you want the root URL to directly show the login page without any redirect:

```jsx
// In routes/index.jsx
{
  path: '/',
  element: (
    <GuestRoute>
      <AuthLayout />
    </GuestRoute>
  ),
  children: [
    { index: true, element: <LoginPage /> },  // Login as default
  ],
},
{
  path: '/login',
  element: (
    <GuestRoute>
      <AuthLayout />
    </GuestRoute>
  ),
  children: [
    { index: true, element: <LoginPage /> },
  ],
},
// Then protect /home separately
{
  path: '/home',
  element: <MainLayout />,
  children: [
    { index: true, element: <HomePage /> },
  ],
},
```

**Option C: GuestRoute Redirect (Cleanest)**

Modify the existing `GuestRoute` component to automatically redirect to login:

```jsx
// frontend/src/routes/GuestRoute.jsx
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export default function GuestRoute({ children }) {
  const { isAuthenticated, isBootstrapping } = useAuth()
  const location = useLocation()

  if (isBootstrapping) {
    return null // Or loading spinner
  }

  // If already authenticated, redirect to dashboard
  if (isAuthenticated) {
    // Get the role and redirect to appropriate dashboard
    return <Navigate to="/admin" replace /> // Or use auth store to get role
  }

  return children
}
```

Then update routes:

```jsx
{
  path: '/',
  element: (
    <GuestRoute>
      <AuthLayout />
    </GuestRoute>
  ),
  children: [
    { index: true, element: <LoginPage /> },
  ],
},
```

**Recommended Approach: Option C with Role-Based Redirect**

1. Update `GuestRoute` to redirect authenticated users to their dashboard
2. Set root `/` to show LoginPage directly
3. Remove or hide HomePage from unauthenticated access

```jsx
// FINAL routes/index.jsx structure
export const routeConfig = [
  // ROOT - Shows login for unauthenticated users
  {
    path: '/',
    element: (
      <GuestRoute>
        <AuthLayout />
      </GuestRoute>
    ),
    children: [
      { index: true, element: <LoginPage /> },
    ],
  },
  
  // LOGIN - Same as root (backward compatibility)
  {
    path: '/login',
    element: (
      <GuestRoute>
        <AuthLayout />
      </GuestRoute>
    ),
    children: [
      { index: true, element: <LoginPage /> },
    ],
  },
  
  // PROTECTED ROUTES
  {
    path: '/admin',
    element: (
      <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
        <DashboardLayout title="Admin" />
      </ProtectedRoute>
    ),
    children: [ /* ... */ ],
  },
  // ... other protected routes
]
```

**Additional Changes Required:**

1. **Remove login buttons from MainLayout** - Check if MainLayout has login links in the header/navigation

2. **Update ProtectedRoute** - Make sure it redirects to `/login` (not `/`)

```jsx
// In ProtectedRoute.jsx
if (!isAuthenticated) {
  return <Navigate to="/login" state={{ from: location }} replace />
}
```

3. **Consider keeping HomePage accessible** - Optionally, you can keep HomePage at `/about` or `/home` for public access, but hide the login buttons

---

### Phase 4: Cleanup & Testing

**Step 4.1: Delete Old Login Pages**

After confirming everything works, delete:
- `frontend/src/pages/auth/AdminLoginPage.jsx`
- `frontend/src/pages/auth/OrganizerLoginPage.jsx`
- `frontend/src/pages/auth/VoterLoginPage.jsx`

**Step 4.2: Test All Scenarios**

| Test | Expected |
|------|----------|
| Login as Admin | Redirects to `/admin` dashboard |
| Login as Organizer | Redirects to `/organizer` dashboard |
| Login as Voter | Redirects to `/voter` or assigned event |
| Invalid credentials | Shows error "Invalid email or password" |
| Non-existent email | Shows error "Invalid email or password" |
| Remember me | Extended cookie expiry |

**Step 4.3: Test Protected Routes**

| Test | Expected |
|------|----------|
| Access `/admin` as Organizer | Redirected to `/organizer` |
| Access `/organizer` as Voter | Redirected to `/voter` |
| Access `/voter` as Admin | Redirected to `/admin` |
| Access `/admin` as Voter | Redirected to `/voter` |

**Step 4.4: Test First Page Behavior** (CRITICAL)

| Test | Expected |
|------|----------|
| Access `/` (not logged in) | Redirects to `/login` or shows login directly |
| Access `/` (as admin) | Redirects to `/admin` |
| Access `/` (as organizer) | Redirects to `/organizer` |
| Access `/` (as voter) | Redirects to `/voter` |
| Access `/login` (not logged in) | Shows login page |
| Access `/login` (logged in) | Redirects to role dashboard |
| Refresh page while logged in | Stays on dashboard, not redirected to login |

---

## Rollback Plan

If issues occur, follow these steps to rollback:

### Option 1: Quick Rollback (Frontend Only)

1. Revert routes to old login pages
2. Revert auth.service.js to role-specific endpoints
3. Backend remains unchanged (still accepts both old and new)

### Option 2: Full Rollback

1. **Database**: Restore from backup
2. **Backend**: Revert auth.routes.js, auth.controller.js, auth.service.js
3. **Frontend**: Restore deleted login pages

---

## Security Considerations

| Aspect | Before | After |
|--------|--------|-------|
| Admin identification | username | email |
| Login endpoint | 3 separate | 1 unified |
| User enumeration risk | Lower (username unknown) | Same as before |

**Note:** The unified login doesn't increase security risk since the system already uses email for organizer/voter login.

---

## Summary Checklist

- [ ] **Phase 0:** Backup database
- [ ] **Phase 1.1:** Create and run migration
- [ ] **Phase 1.2:** Update admin account with email
- [x] **Phase 2.1:** Modify user.service.js
- [x] **Phase 2.2:** Modify auth.validator.js
- [x] **Phase 2.3:** Modify auth.service.js
- [x] **Phase 2.4:** Modify auth.controller.js
- [x] **Phase 2.5:** Modify auth.routes.js
- [x] **Phase 3.1:** Modify auth.schemas.js
- [x] **Phase 3.2:** Modify auth.service.js (frontend)
- [x] **Phase 3.3:** Create LoginPage.jsx
- [x] **Phase 3.4:** Modify LoginForm.jsx
- [x] **Phase 3.5:** Modify auth.js utils (getRoleLoginPath → always /login)
- [x] **Phase 3.6:** Modify routes/index.jsx (root / = login, /login alias)
- [x] **Phase 3.7:** Modify HomePage.jsx (single Sign in button → /login)
- [x] **Phase 3.8:** Check/remove login links from MainLayout (unified Sign in button)
- [x] **Phase 3.9:** Make login the first page:
  - [x] Option C used: root `/` wrapped in GuestRoute → LoginPage
  - [x] Update ProtectedRoute to redirect to /login
  - [x] ForgotPasswordPage updated → /login
  - [x] ResetPasswordPage updated → /login
- [x] **Phase 4.1:** Delete old login pages (AdminLoginPage, OrganizerLoginPage, VoterLoginPage)
- [ ] **Phase 4.2:** Test all scenarios
- [ ] **Phase 4.3:** Verify login is first page for all scenarios

---

## Estimated Time

| Phase | Time |
|-------|------|
| Database changes | 15 min |
| Backend changes | 30 min |
| Frontend changes | 60 min |
| Testing | 45 min |
| **Total** | ~2.5 hours |

> **NOTE:** This plan includes making the login page the **first/default page** when accessing the system. Unauthenticated users will see the login page immediately when visiting `/` instead of the HomePage.

---

## Questions to Answer Before Starting

1. What email address should the admin use? (e.g., `admin@votrix.com`)
2. Do you want to keep the old login URLs as redirects? (e.g., `/login/admin` → `/login`)
3. Should the old login pages be kept as redirect wrappers temporarily?
4. Do you have access to Supabase dashboard to run migrations?
5. Do you have a database backup before making schema changes?