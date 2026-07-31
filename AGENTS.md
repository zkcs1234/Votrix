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

---

# Plan: Date Field, CalendarCard, and Multi-Step Event Wizard (Implemented)

## What Was Fixed

### Date field errors across all three modules
- **Root cause:** Polling's `DateTimeInput` was missing the `required` and `hasError` props (election and competition already had them). All three modules also passed no `min`/`max` cross-field constraint, so the only validation was on submit, leaving the calendar picker free to accept any range.
- **Backend contract:** `startDate` and `endDate` are **required** on create for all three modules (election/competition/pageant/polling). They are **optional** on update. Format is any ISO-8601 string parseable by `new Date()`. Cross-field check: `endDate >= startDate`.

### Calendar card not functioning
- **Root cause:** `DateTimeInput` wrapped the browser's native `<input type="datetime-local">`. The visible Calendar icon called `inputRef.current?.showPicker()` which only works in Chromium. Firefox/Safari did nothing — the icon looked dead.
- **Fix:** Replaced with a fully custom `CalendarCard` component (`frontend/src/components/ui/CalendarCard.jsx`). It renders a month grid (Mon-Sun, prev/next navigation), a time picker (hour + minute inputs), a "Now" shortcut, and a clear button. Works in every modern browser. Supports `min`/`max` constraints. Uses design tokens (`--v-primary`, `--v-surface`, etc.) so it adapts to light/dark themes.

### Start/end date alignment
- All three forms now use the **same grid layout** (`grid gap-4 sm:grid-cols-2`) and the **same container width** (`max-w-3xl`). Polling was previously on `max-w-lg`, which made its date pickers visibly cramped — fixed.
- The new `CalendarCard` inputs have identical height and padding regardless of which module renders them.

### Multi-step wizard flow
- The shared `EventStepper` + `StageFooter` infrastructure already existed. Election and competition were wired up to it; **polling was lagging behind** with a hand-rolled inline stepper and bare `Button`s.
- **Polling now uses the shared `EventStepper` and `StageFooter`** with the same 4-stage flow as the other modules:
  1. Details (title, description, start, end)
  2. Branding (banner upload)
  3. Settings (anonymous flag, multiple-submissions flag, pollExpiresAt)
  4. Information Form (the `ParticipantInformationFormBuilder`)
- After step 4 the user is routed to `/builder` (via `nextPath` prop on `StageFooter`).

### Cross-field validation for pollExpiresAt
- The polling schema (`pollingEventSchemaEdit`, `pollingEventSchemaStep3`) now enforces: `startDate <= pollExpiresAt <= endDate`. Error message: "Expiration date must be between start and end dates", attached to the `pollExpiresAt` path.
- The `CalendarCard` for `pollExpiresAt` also receives `min={startDateValue}` and `max={endDateValue}` so invalid dates are disabled in the picker itself.

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/components/ui/CalendarCard.jsx` | **New.** Custom calendar + time picker component, cross-browser. |
| `frontend/src/components/ui/DateTimeInput.jsx` | **Deleted** (was a thin wrapper around native datetime-local). |
| `frontend/src/components/ui/StageFooter.jsx` | Added `nextPath` prop to allow custom next URL after terminal stages. |
| `frontend/src/index.css` | Added ~190 lines of `.v-cal*` styles using the same design tokens. |
| `frontend/src/schemas/event.schemas.js` | Added `isoToLocalInput`/`localInputToIso` helpers; added `pollExpiresAt` cross-field refinement via `assertPollDateWindow`. |
| `frontend/src/pages/organizer/election/ElectionEventFormPage.jsx` | Replaced `DateTimeInput` with `CalendarCard`; added `min={startDate}` on end-date; centralized date conversion via helpers. |
| `frontend/src/pages/organizer/competition/CompetitionEventFormPage.jsx` | Same as election. |
| `frontend/src/pages/organizer/polling/PollingEventFormPage.jsx` | **Migrated** to `EventStepper`/`StageFooter`; added `required`/`hasError`/`min`/`max` to all date inputs; added `pollExpiresAt` field with cross-field validation; widened container to `max-w-3xl`. |

## Wizard Flow Per Module

All three modules now follow the same UX pattern:

1. User opens `/organizer/<module>/events/new` (or `/edit` for existing)
2. Fills in **Details** step (title, description, start, end date)
3. Clicks "Next: Branding" → on success moves to Branding step
4. Fills in **Branding** (banner upload)
5. Clicks "Next: Settings" (election → "Next: Information Form") → API save happens here
6. After API save, user is navigated to `/events/:id/form` → **Information Form** step
7. From here, the sidebar (scoped items now enabled) takes over — user can jump to Positions/Candidates (election), Contestants/Criteria/Judges (competition), or Builder/Respondents (polling) at will.

The `EventStepper` at the top of every step shows progress. Completed steps are clickable shortcuts. The sidebar remains the always-on navigator (no behaviour change).

## Rollback

If the new calendar picker causes issues:
1. `git revert` the commit on this branch — all changes are isolated to frontend.
2. If only the CalendarCard is broken but the date logic is fine, restore `DateTimeInput.jsx` and update the 3 page imports back.