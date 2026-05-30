# VOTRIX

Online Voting, Polling, and Competition Scoring System.

**Roles:** Admin · Organizers · Voters  
**Organization types:** Election · Pageant · Polling

## Tech stack

| Layer | Stack |
|-------|--------|
| Frontend | React, Vite, Tailwind CSS, Zustand, React Router, Axios, React Hook Form, Zod, Framer Motion |
| Backend | Node.js, Express |
| Database | Supabase (PostgreSQL) |
| Auth | JWT, bcrypt |
| Uploads | Cloudinary |
| Email | Resend |

## Phase 1 — Project initialization

Scalable folder architecture, Express API shell, React app shell, and integration config stubs.

## Phase 2 — Database design

Relational PostgreSQL schema (UUID primary keys) in `backend/src/database/migrations/001_initial_schema.sql`.

See [backend/src/database/README.md](backend/src/database/README.md).

## Phase 3 — Authentication

JWT **access** + **refresh** tokens, bcrypt passwords, role-based API and frontend routes.

- Admin: `username` + `password` (manual DB insert)
- Organizer: `email` + `password` (admin-created only)
- Voter: `email` + `password` (CSV import in Phase 4)
- First-login **change password** flow for organizer & voter

See [backend/src/database/AUTH.md](backend/src/database/AUTH.md) for API reference.

## Phase 5 — Email system

Automatic emails via **Resend**: organizer invitation, voter invitation, password reset, event notifications.

See [backend/src/database/EMAIL.md](backend/src/database/EMAIL.md). Run migration `003_password_reset_tokens.sql`.

## Phase 6 — Election module

Organizer election dashboard, positions, candidates (Cloudinary photos), CSV voter import, secure voting, and analytics.

See [backend/src/database/ELECTION.md](backend/src/database/ELECTION.md). Run migration `004_election_module.sql`.

Organizer UI: `/organizer/election` · Voter ballot: `/voter/events/:eventId`

## Phase 7 — Pageant module

Contestants, weighted criteria, judge CSV import, score validation, and live rankings.

See [backend/src/database/PAGEANT.md](backend/src/database/PAGEANT.md). Run migration `005_pageant_module.sql`.

Organizer: `/organizer/pageant` · Judges score at `/voter/pageant/events/:eventId/score`

## Phase 8 — Polling module

Dynamic polls and surveys: question builder (multiple choice, checkbox, yes/no, text, rating), organizer settings (anonymous, multiple submissions, expiration), and analytics with charts and percentages.

See [backend/src/database/POLLING.md](backend/src/database/POLLING.md). Run migration `006_polling_module.sql`.

Organizer: `/organizer/polling` · Respondents: `/voter/polling/events/:eventId`

## Phase 9 — Voter system

Unified voter dashboard (assigned, active, completed events) and dedicated experiences per module.

See [backend/src/database/VOTER.md](backend/src/database/VOTER.md).

Voter home: `/voter` · Overview API: `GET /api/voter/overview`

## Phase 10 — File uploads (Cloudinary)

Organization logos, event banners, candidate photos, and contestant photos via multipart upload.

See [backend/src/database/UPLOAD.md](backend/src/database/UPLOAD.md). Run migration `007_organization_logo.sql`. Configure `CLOUDINARY_*` in `backend/.env`.

Upload UI on module dashboards (logo) and event/candidate forms (banner & photos).

## Phase 11 — Security

Platform hardening: bcrypt passwords, JWT + httpOnly cookies, role middleware, rate limits, CSRF, input sanitization, and atomic duplicate-vote prevention.

See [backend/src/database/SECURITY.md](backend/src/database/SECURITY.md). Set `CSRF_SECRET` and strong JWT secrets in production.

## Phase 12 — Analytics & reports

Central reporting hub: turnout, vote summaries, pageant rankings, and polling charts.

See [backend/src/database/ANALYTICS.md](backend/src/database/ANALYTICS.md).

Organizer reports: `/organizer/reports`

## Phase 13 — UI/UX improvements

Responsive app shell, dark/light theme, toast notifications, loading states, and reusable UI components.

See [frontend/UI.md](frontend/UI.md).

## Phase 14 — Deployment

Production targets: **Vercel** (frontend), **Render** (API), **Supabase** (database). Configure env vars only — see [DEPLOYMENT.md](DEPLOYMENT.md).

Quick links: `frontend/vercel.json` · `render.yaml` · `backend/.env.example` · `frontend/.env.example`

### Admin accounts

Admins are **not** registered via the frontend. Create them manually in the database (see `backend/src/database/README.md`). Admin login uses **username + password**. Organizers and voters use **email + password**.

## Complete setup (manual steps)

**Start here:** [SETUP_GUIDE.md](SETUP_GUIDE.md) — full local + production instructions, env vars, migrations, admin user, Resend, Cloudinary, Render, and Vercel.

Shorter production reference: [DEPLOYMENT.md](DEPLOYMENT.md).

## Getting started

### 1. Environment variables

Copy examples and fill in credentials you provide:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

### 2. Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 3. Run development servers

**Backend** (port 5000):

```bash
cd backend
npm run dev
```

**Frontend** (port 5173):

```bash
cd frontend
npm run dev
```

### 4. Verify

- Frontend: http://localhost:5173  
- API root: http://localhost:5000/api  
- Health: http://localhost:5000/api/health  

## Project structure

```
Votrix/
├── frontend/src/
│   ├── app/           # Router bootstrap
│   ├── routes/        # Route config & guards
│   ├── layouts/       # Main, Auth, Dashboard
│   ├── components/    # Shared UI
│   ├── hooks/
│   ├── store/         # Zustand
│   ├── services/      # Axios API clients
│   ├── utils/
│   ├── pages/
│   └── modules/       # admin, election, pageant, polling, voter, shared
└── backend/src/
    ├── config/        # env, database, cloudinary, resend
    ├── controllers/
    ├── middleware/    # auth, errors, rate limit, upload
    ├── routes/
    ├── services/
    ├── utils/         # JWT, bcrypt helpers
    ├── modules/
    ├── templates/
    └── database/
```

## Development phases

| Phase | Status |
|-------|--------|
| 1 — Project initialization | Done |
| 2 — Database design | Done |
| 3 — Authentication | Done |
| 5 — Email (Resend) | Done |
| 6 — Election module | Done |
| 7 — Pageant module | Done |
| 8 — Polling | Done |
| 9 — Voter system | Done |
| 10 — Uploads (Cloudinary) | Done |
| 11 — Security | Done |
| 12 — Analytics & reports | Done |
| 13 — UI/UX | Done |
| 14 — Deployment | Done |

After configuring Supabase in `backend/.env`, run all migrations in the SQL Editor (see [DEPLOYMENT.md](DEPLOYMENT.md)), then create the admin user (see database README).
