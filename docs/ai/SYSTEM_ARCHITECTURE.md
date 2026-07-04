# System Architecture

---

## Overall Architecture

Votrix follows a classic three-tier architecture:

```
┌─────────────────────────────────────┐
│  Client (React SPA — Vercel)        │
│  Port: 5173 (dev) / Vercel (prod)   │
└─────────────────┬───────────────────┘
                  │  HTTPS + HTTP-only cookies
                  │  WebSocket (wss://)
┌─────────────────▼───────────────────┐
│  Backend (Express — Render)         │
│  Port: 5000                         │
│  /api  — REST API                   │
│  /ws   — WebSocket upgrade          │
└─────────────────┬───────────────────┘
                  │  @supabase/supabase-js (service role)
┌─────────────────▼───────────────────┐
│  Database (Supabase PostgreSQL)     │
│  External services: Cloudinary,     │
│  Resend                             │
└─────────────────────────────────────┘
```

Key decisions:
- **No direct Supabase access from frontend** — all DB access goes through the Express API
- **Service role key** is used backend-only, never exposed to the frontend
- **Supabase anonKey** is also not used by the frontend — Supabase is purely a hosted PostgreSQL

---

## Frontend Architecture

- **Framework:** React 19 with Vite 8
- **Routing:** React Router 7 (client-side SPA)
- **State:** Zustand stores for auth, theme, toasts
- **Forms:** React Hook Form + Zod validation schemas
- **HTTP:** Axios with request/response interceptors
- **Styling:** Tailwind CSS 4

### Frontend Layers

```
src/
├── app/           # Bootstrap: router setup, CSRF init, auth hydration
├── routes/        # ProtectedRoute (requires auth + role), GuestRoute (redirects if authed)
├── layouts/       # Shell components wrapping pages
├── pages/         # Leaf page components, organized by role
├── components/    # Reusable UI components
├── modules/       # Feature modules (each exports its views/components/services)
├── services/      # Axios API clients — one per domain
├── store/         # Zustand global state
├── hooks/         # Custom React hooks
├── schemas/       # Zod schemas for form validation
└── utils/         # Pure utility functions
```

### Auth Flow (Frontend)

1. On app start: `Bootstrap.jsx` calls `GET /api/auth/me` with cookies
2. If 200 → `setSession({ user, csrfToken })` in auth store
3. If 401 → try `POST /api/auth/refresh` → if success set session, else clear
4. `ProtectedRoute` checks `isAuthenticated` and `user.role`
5. `GuestRoute` redirects authenticated users to their dashboard
6. On 401 during any request → interceptor auto-refreshes token once

---

## Backend Architecture

- **Framework:** Express 5 (ESM modules)
- **Entry:** `src/server.js` creates HTTP server, attaches WebSocket, starts listening
- **App factory:** `src/app.js` — `createApp()` function wires all middleware and routes

### Middleware Stack (in order)

1. `helmet` — security headers
2. `cors` — allow configured origins + `*.vercel.app` previews
3. `globalLimiter` — rate limit all requests
4. `express.json({ limit: '1mb' })`
5. `express.urlencoded`
6. `cookieParser`
7. `csrfProtection` — double-submit cookie CSRF on `/api`
8. Route handlers
9. `notFoundHandler`
10. `errorHandler`

### Backend Layers

```
routes/       → controllers/     → services/       → foundation/db.js
(Express)       (thin, delegates)   (business logic)   (Supabase client)
```

- **Controllers** call services, handle HTTP request/response
- **Services** contain all business logic, DB queries, email sends
- **Foundation** provides base repository (CRUD), pagination, filtering, error classes
- **Validators** run input validation before controllers execute

---

## Database Architecture

- **Engine:** PostgreSQL 15+ via Supabase
- **UUID primary keys** on all tables using `gen_random_uuid()`
- **`updated_at` trigger** (`set_updated_at()`) on all mutable tables
- **Enums:** `user_role`, `organization_type`, `organization_status`, `event_status`, `event_type`, `poll_question_type`, `user_account_status`, `election_results_visibility`, `competition_assignment_scope`, `competition_judge_role`
- **Schema managed** by 19 sequential migration files; no ORM
- Supabase client used with service role — RLS policies are bypassed intentionally (app enforces auth)

---

## Authentication Flow

```
Client                     Backend                    DB
  │                            │                       │
  │  POST /api/auth/*/login    │                       │
  │  { email/username, pwd }   │                       │
  │──────────────────────────► │                       │
  │                            │  SELECT user WHERE    │
  │                            │  email/username       │
  │                            │──────────────────────►│
  │                            │◄──────────────────────│
  │                            │  bcrypt.compare()     │
  │                            │  sign accessToken     │
  │                            │  sign refreshToken    │
  │  Set-Cookie: votrix_access  │                       │
  │  Set-Cookie: votrix_refresh │                       │
  │  Set-Cookie: votrix_csrf    │                       │
  │◄──────────────────────────  │                       │
  │  { user, csrfToken }        │                       │
```

**Token refresh flow:**
- On 401: interceptor calls `POST /api/auth/refresh`
- Backend reads `votrix_refresh` cookie, validates, issues new access token cookie
- If refresh fails → clear session, redirect to login

**CSRF:**
- `GET /api/auth/csrf` issues a CSRF token (cookie + JSON response)
- All `POST/PUT/PATCH/DELETE` must include `x-csrf-token` header matching the cookie
- Mismatch → 403 response; frontend retries once by re-fetching CSRF token

---

## Request Lifecycle

```
Request
  │
  ├─ CORS check (origin allowlist)
  ├─ Rate limiter (global + per-route)
  ├─ Body parsing (JSON / urlencoded)
  ├─ Cookie parsing
  ├─ CSRF validation (mutating methods only)
  ├─ Route match
  │   ├─ authenticate (read cookie → verify JWT → load user)
  │   ├─ authorize(role) (check req.user.role)
  │   ├─ requireActiveAccount (check account_status + token_version)
  │   ├─ requirePasswordChanged (check must_change_password flag)
  │   └─ Controller handler
  │       └─ Service call → Supabase query → response
  │
  ├─ notFoundHandler (no match → 404)
  └─ errorHandler (catches all thrown ApiErrors)
```

---

## Realtime Lifecycle

```
Client                    Backend WebSocket
  │                             │
  │  WS upgrade to /ws          │
  │─────────────────────────────►
  │  (cookie read: votrix_access)│
  │                             │  verifyAccessToken()
  │  ◄──── connection open ─────│
  │                             │  setupRooms(user):
  │                             │    joinRoom user:{id}
  │                             │    joinRoom role:{role}
  │                             │    joinRoom event:{id} (assigned events)
  │                             │
  │  { type: 'subscribe',       │
  │    room: 'event:abc:org' }  │
  │─────────────────────────────►
  │                             │  joinRoom event:abc:organizer
  │                             │
  │  ◄── { type: 'vote_cast',  │  (from service layer via emitToEvent())
  │        data: {...} } ───────│
```

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| HTTP-only cookies for JWT | Prevents XSS token theft; SameSite=None for cross-origin Vercel↔Render |
| No Supabase RLS | App-layer auth is sufficient; service role bypasses RLS intentionally |
| Custom WebSocket (not Supabase Realtime) | Lower latency, full control over rooms and auth |
| ESM modules throughout backend | Modern Node.js standard; avoids CommonJS interop issues |
| Express 5 | Async error handling built-in; no need for `express-async-errors` |
| Zustand over Redux | Minimal boilerplate for the 3 stores needed |
| No ORMs | Direct Supabase client queries for simplicity and type safety |

---

## Scalability Considerations

- WebSocket rooms are in-memory — not suitable for multi-instance deployment without a Redis pub/sub layer
- Rate limiters are also in-memory — same limitation for horizontal scaling
- Single Supabase project handles all tenants (organizations)
- Cloudinary and Resend are external services with their own scaling
- The foundation repository pattern makes it easy to swap out Supabase for another DB client

---

**Last Updated:** 2026-07-04  
**Documentation Version:** 1.0.0  
**Related Files:** `backend/src/app.js`, `backend/src/server.js`, `backend/src/middleware/auth.js`, `backend/src/websocket/ws-server.js`  
**Related Documentation:** `docs/ai/AI_CONTEXT.md`, `docs/ai/REALTIME.md`, `docs/ai/DATABASE.md`
