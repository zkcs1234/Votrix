# AI Context — Votrix Master Summary

> Always read this file before any other documentation file.

---

## Project Overview

**Votrix** is a multi-tenant online platform supporting three types of managed events:

- **Elections** — position-based candidate voting with ballot management
- **Competition Scoring** (formerly Pageant) — contestant scoring by judges with weighted criteria, categories, and rounds
- **Polling** — dynamic surveys with registry-driven question types

---

## Purpose

Votrix allows organizations to run elections, competitions, and surveys. An admin creates organizer accounts; organizers manage their events; voters/judges/respondents participate in those events. The system enforces strict role separation, per-event access control, and audit logging.

---

## Tech Stack

| Layer      | Technology                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| Frontend   | React 19, Vite 8, Tailwind CSS 4, Zustand 5, React Router 7, Axios, React Hook Form, Zod, Framer Motion |
| Backend    | Node.js ≥20, Express 5 (ESM)                                                                            |
| Database   | Supabase (PostgreSQL 15+)                                                                               |
| Auth       | JWT (access + refresh tokens) in HTTP-only cookies, bcrypt passwords                                    |
| Uploads    | Cloudinary (logos, banners, photos)                                                                     |
| Email      | Resend                                                                                                  |
| Realtime   | Native WebSocket (`ws` library) — custom room-based server                                              |
| Deployment | Vercel (frontend), Render (backend), Supabase (database)                                                |
| Testing    | Vitest (backend unit tests)                                                                             |

---

## Deployment

- **Frontend:** Vercel — `frontend/vercel.json` config
- **Backend:** Render — `render.yaml` config
- **Database:** Supabase hosted PostgreSQL
- **Migrations:** Run SQL files in `backend/src/database/migrations/` in numeric order via Supabase SQL Editor
- **Env vars:** Copy `backend/.env.example` and `frontend/.env.example`

See `docs/DEPLOYMENT.md` for full production instructions.

---

## Architecture Summary

```
Vercel (React SPA)
       │  HTTPS + cookies
       ▼
Render (Express API :5000)
       │  @supabase/supabase-js (service role)
       ▼
Supabase (PostgreSQL)
       │
       ├── REST via Supabase client (backend only)
       └── Native WebSocket upgrade (/ws endpoint)
```

- Frontend is a pure SPA (React Router client-side routing)
- Backend is a monolithic Express app with route-grouped modules
- No frontend talks directly to Supabase — all DB access is via the backend API
- WebSocket server shares the same HTTP server as Express

---

## Folder Structure Summary

```
Votrix/
├── frontend/src/
│   ├── app/           # Router bootstrap, App, suspense config
│   ├── routes/        # Route guards (ProtectedRoute, GuestRoute)
│   ├── layouts/       # AppShell, AuthLayout, DashboardLayout, module layouts
│   ├── components/    # Shared UI components (ui/, analytics/, auth/, etc.)
│   ├── hooks/         # useAuth, useLogin, useSocketEvent, useToast, etc.
│   ├── store/         # Zustand stores (auth, theme, toast)
│   ├── services/      # Axios API clients per domain
│   ├── utils/         # constants, csrf, storage, auth helpers
│   ├── schemas/       # Zod validation schemas
│   ├── modules/       # Feature modules (election, pageant, polling, etc.)
│   └── pages/         # Page components grouped by role
│
└── backend/src/
    ├── config/        # env, database, cloudinary, resend, security, cookies
    ├── controllers/   # Route handlers (14 controllers)
    ├── middleware/     # auth, csrf, errorHandler, rateLimiter, upload
    ├── routes/        # Express routers (15 route files)
    ├── services/      # Business logic layer (22 services)
    ├── utils/         # JWT, bcrypt, ApiError, asyncHandler, sanitize, etc.
    ├── validators/    # Input validation schemas
    ├── modules/       # scoring-engine, poll-question-types
    ├── foundation/    # Base repository, controller, db, pagination, filtering
    ├── templates/     # Email HTML templates
    ├── websocket/     # ws-server, ws-rooms, ws-emitter
    └── database/
        ├── migrations/  # 019 SQL migration files (run in order)
        ├── scripts/     # hash-password utility
        └── seeds/       # Seed data
```

---

## Main Modules

| Module                          | Backend Routes Prefix                        | Frontend Pages                     |
| ------------------------------- | -------------------------------------------- | ---------------------------------- |
| Auth                            | `/api/auth/`                                 | `pages/auth/`                      |
| Admin                           | `/api/admin/`                                | `pages/admin/`                     |
| Organizer (general)             | `/api/organizer/`                            | `pages/organizer/`                 |
| Election (organizer)            | `/api/organizer/election/`                   | `pages/organizer/election/`        |
| Election (voter)                | `/api/voter/election/`                       | `pages/voter/VoterEventPage`       |
| Competition/Pageant (organizer) | `/api/organizer/pageant/` or `/competition/` | `pages/organizer/pageant/`         |
| Competition (judge)             | `/api/voter/pageant/` or `/competition/`     | `pages/voter/JudgeScoringPage`     |
| Polling (organizer)             | `/api/organizer/polling/`                    | `pages/organizer/polling/`         |
| Polling (voter)                 | `/api/voter/polling/`                        | `pages/voter/VoterPollPage`        |
| Notifications                   | `/api/notifications/`                        | `components/ui/NotificationsModal` |
| Reports                         | `/api/organizer/reports/`                    | `pages/organizer/reports/`         |

---

## Authentication

- **Admin:** username + password → JWT in HTTP-only cookie
- **Organizer:** email + password → JWT in HTTP-only cookie
- **Voter:** email + password → JWT in HTTP-only cookie
- Token transport: HTTP-only cookies only (`votrix_access`, `votrix_refresh`)
- No Authorization header — cookies are sent automatically via `withCredentials: true`
- CSRF protection: double-submit cookie pattern (`votrix_csrf` cookie + `x-csrf-token` header)
- First login: `must_change_password` flag forces password change before dashboard access
- Token refresh: automatic via interceptor on 401 response

---

## Authorization

Three roles: `admin`, `organizer`, `voter`

- Middleware chain: `authenticate` → `authorize(role)` → `requireActiveAccount` → `requirePasswordChanged`
- Account statuses: `pending`, `active`, `suspended`, `archived`
- Organizers and voters must have `active` account status
- Token version on user record invalidates all sessions on password change

---

## Database Summary

- **Hosted:** Supabase PostgreSQL
- **Client:** `@supabase/supabase-js` with service role key (backend only)
- **19 migrations** from `001_initial_schema.sql` to `019_phase9_indexes_and_optimizations.sql`
- Key tables: `users`, `organizations`, `events`, `event_voters`, `invitations`, `positions`, `candidates`, `election_votes`, `contestants`, `criteria`, `judge_scores`, `competition_categories`, `competition_rounds`, `competition_judges`, `competition_judge_assignments`, `competition_scores`, `poll_questions`, `poll_options`, `poll_answers`, `poll_submissions`, `system_poll_question_types`, `poll_question_types`, `notifications`, `audit_logs`, `system_settings`, `password_reset_tokens`

See `docs/ai/DATABASE.md` for the full schema.

---

## API Summary

- Base URL: `/api`
- All routes under `/api/auth/`, `/api/admin/`, `/api/organizer/`, `/api/voter/`, `/api/notifications/`, `/api/health/`
- Rate limiting on all routes; stricter limits on auth, uploads, voting, scoring
- CSRF required on all mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`)

See `docs/ai/API.md` for all endpoints.

---

## Realtime Summary

- Native WebSocket server attached to the Express HTTP server at `/ws`
- Room-based broadcast: `user:{id}`, `role:{role}`, `event:{id}`, `event:{id}:organizer`, `event:{id}:voters`
- Auth via cookie on upgrade; unauthenticated sockets have 10s to authenticate or are closed
- Heartbeat every 25s; max 10 connections per IP
- Frontend uses `socket.service.js` with exponential backoff reconnect (1s–30s)

See `docs/ai/REALTIME.md` for full details.

---

## Current Version

- **Backend version:** 1.0.0 (package.json)
- **API phase:** Phase 12 (reported in `/api` root response)
- **Development status:** Production-ready, all 14 phases complete
- **Documentation note:** Known issues and technical debt are tracked in `docs/ai/KNOWN_ISSUES.md` and kept aligned with the current implementation.

---

## Last Updated

2026-07-04

## Documentation Version

1.0.1

---

## Related Documentation

- `docs/ai/SYSTEM_ARCHITECTURE.md`
- `docs/ai/DATABASE.md`
- `docs/ai/API.md`
- `docs/ai/REALTIME.md`
- `docs/ai/FEATURES.md`
- `docs/ai/BUSINESS_RULES.md`
