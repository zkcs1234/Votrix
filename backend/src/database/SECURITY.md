# Phase 11 — Security

## Overview

| Control | Implementation |
|---------|----------------|
| Password hashing | **bcrypt** (12 rounds) — `utils/password.js` |
| Authentication | **JWT** access + refresh tokens — `utils/jwt.js` |
| Role enforcement | `authenticate`, `authorize(roles)`, `requirePasswordChanged` — `middleware/auth.js` |
| Rate limiting | `express-rate-limit` — global, auth, submit, upload — `middleware/rateLimiter.js` |
| Protected routes | All `/admin`, `/organizer`, `/voter` routes require auth + role; frontend `ProtectedRoute` |
| Input validation | Per-route validators + `utils/sanitize.js` on auth inputs |
| Duplicate voting | `has_voted` / `has_scored` atomic updates + DB unique constraints |
| Secure cookies | httpOnly, `Secure` in production, `SameSite=strict` — `utils/cookies.js` |
| CSRF | Double-submit cookie + `X-CSRF-Token` header — `middleware/csrf.js` |

## Bcrypt

- Passwords are never stored in plaintext.
- `hashPassword()` / `comparePassword()` used on login, registration, and password change.
- Generate admin hashes: `npm run db:hash-password -- "YourPassword"`

## JWT

- **Access token**: short-lived (default 15m), sent as Bearer header and httpOnly cookie.
- **Refresh token**: longer-lived (default 7d), httpOnly cookie only.
- Separate secrets: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`.
- Production startup fails if default/example secrets are still configured.

## Role middleware

```text
authenticate → authorize('organizer') → requirePasswordChanged → handler
```

- **401** if not logged in or token invalid.
- **403** if wrong role or password change required (`MUST_CHANGE_PASSWORD`).

## Rate limits

| Limiter | Window | Max | Applied to |
|---------|--------|-----|------------|
| Global | 15 min | 200 | All `/api` requests |
| Auth | 15 min | 20 | Login, forgot/reset password |
| Submit | 1 min | 15 | Vote, poll submit, judge scores |
| Upload | 15 min | 40 | Cloudinary image uploads |

## CSRF protection

1. `GET /api/auth/csrf` issues a token (cookie + JSON body).
2. Login/refresh rotate the CSRF token.
3. All **POST / PUT / PATCH / DELETE** under `/api` require header `X-CSRF-Token` matching cookie `votrix_csrf`.
4. Frontend stores token in session storage and attaches via Axios interceptor.

Safe methods (GET, HEAD, OPTIONS) and `/api/auth/csrf` are exempt.

## Duplicate vote / submission prevention

### Elections

- `event_voters.has_voted` set with `.eq('has_voted', false)` before inserting votes (prevents race double-submit).
- Rollback `has_voted` if vote insert fails.
- Unique constraint on `election_votes (event_id, voter_id, position_id, candidate_id)`.
- Duplicate candidates in one position rejected in validation.

### Pageants

- `has_scored` atomic lock before inserting judge scores; rollback on failure.

### Polls

- Single-submission polls: same `has_voted` lock pattern.
- Multiple-submission polls: allowed while poll is open; `has_voted` marks “has responded” for dashboard only.

## Secure cookies (auth)

```javascript
httpOnly: true
secure: true        // production only
sameSite: 'strict'
path: '/'
```

## Frontend protected routes

- `ProtectedRoute` checks authentication, role, and forced password change.
- `GuestRoute` redirects authenticated users away from login pages.
- API client: `withCredentials: true` for cookies; auto refresh on 401.

## Production checklist

1. Set strong `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (32+ random bytes each).
2. Set `CSRF_SECRET` (32+ characters).
3. Set `NODE_ENV=production`.
4. Use HTTPS so `Secure` cookies work.
5. Set `FRONTEND_URL` (or `CLIENT_URL`) to your exact frontend origin (CORS).
6. Cross-origin deploys (Vercel + Render) use `SameSite=None` cookies in production by default.

## Environment variables

```env
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
CSRF_SECRET=
CSRF_COOKIE_NAME=votrix_csrf
CSRF_HEADER_NAME=x-csrf-token
NODE_ENV=production
FRONTEND_URL=https://your-app.vercel.app
COOKIE_SAME_SITE=none
```
