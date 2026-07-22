# Plan: Move to HTTP-Only Cookies Only (Option 3)

## Current State Analysis

**Backend already does:**
- ✅ Sets HTTP-only cookies for `accessToken` and `refreshToken`
- ✅ Cookies have `httpOnly: true` (JavaScript cannot read)

**But ALSO:**
- ❌ Returns `accessToken` in JSON response
- ❌ Frontend stores this token in localStorage
- ❌ Frontend sends token via Authorization header

**The problem:** Even though cookies are HTTP-only, the token is ALSO in localStorage, defeating the security purpose.

---

## Implementation Plan

### Phase 1: Backend Changes

#### Step 1.1: Modify sendAuthResponse (backend/src/controllers/auth.controller.js)
**Change:** Don't return accessToken in JSON - only set cookies

```javascript
// BEFORE
function sendAuthResponse(res, { accessToken, refreshToken, user }) {
  setAuthCookies(res, { accessToken, refreshToken })
  const csrfToken = issueCsrfToken(res)

  res.json({
    success: true,
    accessToken,          // ❌ Remove this
    csrfToken,
    user,
  })
}

// AFTER
function sendAuthResponse(res, { accessToken, refreshToken, user }) {
  setAuthCookies(res, { accessToken, refreshToken })
  const csrfToken = issueCsrfToken(res)

  res.json({
    success: true,
    // accessToken now ONLY in HTTP-only cookie
    csrfToken,
    user,
  })
}
```

#### Step 1.2: Modify token refresh (same file)
**Change:** Same - don't return accessToken in refresh response

```javascript
// AFTER refresh
res.json({
  success: true,
  // accessToken ONLY in cookie now
  csrfToken: issueCsrfToken(res),
  user: updated user data,
})
```

#### Step 1.3: Update auth middleware (backend/src/middleware/auth.js)
**Change:** Extract token from cookies ONLY (not from Authorization header)

```javascript
// BEFORE
function extractAccessToken(req) {
  const header = req.headers.authorization  // ⚠️ Still checks header
  if (header?.startsWith('Bearer ')) {
    return header.slice(7)
  }
  return req.cookies?.[env.jwt.accessCookieName] || null
}

// AFTER - Use ONLY cookies
function extractAccessToken(req) {
  return req.cookies?.[env.jwt.accessCookieName] || null
}
```

---

### Phase 2: Frontend Changes

#### Step 2.1: Modify auth.store.js
**Change:** Remove accessToken storage (keep user for display)

```javascript
// BEFORE
setSession({ accessToken, user, csrfToken }) {
  if (accessToken) setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken)
  if (user) setJSON(STORAGE_KEYS.USER, user)
  if (csrfToken) setCsrfToken(csrfToken)
  // ...
}

// AFTER
setSession({ user, csrfToken }) {
  // accessToken stored in HTTP-only cookie - cannot access via JS
  if (user) setJSON(STORAGE_KEYS.USER, user)
  if (csrfToken) setCsrfToken(csrfToken)
  // ...
}
```

#### Step 2.2: Modify API interceptor (frontend/src/services/api.js)
**Change:** Remove Authorization header - use cookies only

```javascript
// BEFORE
api.interceptors.request.use(async (config) => {
  const token = getItem(STORAGE_KEYS.ACCESS_TOKEN)  // ❌ Remove
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  // ...
})

// AFTER
api.interceptors.request.use(async (config) => {
  // No token needed - cookies are sent automatically
  // Just add CSRF for mutating requests
  // ...
})
```

#### Step 2.3: Update useLogin hook
**Change:** Don't expect accessToken from login response

```javascript
// BEFORE
const { data } = await loginFn(values)
setSession({
  accessToken: data.accessToken,  // ❌ Remove
  user: data.user,
  csrfToken: data.csrfToken,
})

// AFTER
const { data } = await loginFn(values)
setSession({
  // accessToken in cookie - no need to store
  user: data.user,
  csrfToken: data.csrfToken,
})
```

---

### Phase 3: Testing & Verification

#### Test Scenarios:
1. ✅ Login as Organizer → token in cookie only, NOT in localStorage
2. ✅ Login as Voter → old token replaced in cookie
3. ✅ Access /organizer/* as organizer → works
4. ✅ Access /voter/* as voter → works
5. ✅ Try to access /organizer/* as voter → blocked
6. ✅ Logout → cookies cleared

---

## Files to Change

| File | Change |
|------|--------|
| `backend/src/controllers/auth.controller.js` | Don't return accessToken in JSON |
| `backend/src/middleware/auth.js` | Use cookies only for token extraction |
| `frontend/src/store/auth.store.js` | Remove accessToken storage |
| `frontend/src/services/api.js` | Remove Authorization header |
| `frontend/src/hooks/useLogin.js` | Remove accessToken from setSession |

---

## Security Improvement

| Before | After |
|--------|-------|
| Token in localStorage + cookies | Token in cookies ONLY |
| XSS can steal token | XSS cannot steal token |
| Authorization: Bearer header | Cookies sent automatically |

---

## Rollback Plan

If issues occur:
1. Revert auth.controller.js - return accessToken in JSON
2. Revert api.js - add back Authorization header
3. Revert auth.store.js - store accessToken

Keep middleware change (cookies-only) - it's backward compatible