# VOTRIX — Production deployment

> **Full manual checklist and step-by-step setup:** see [SETUP_GUIDE.md](SETUP_GUIDE.md).

Deploy the stack with **only environment variables** after running database migrations.

| Component | Platform | URL example |
|-----------|----------|-------------|
| Frontend | [Vercel](https://vercel.com) | `https://your-app.vercel.app` |
| API | [Render](https://render.com) | `https://votrix-api.onrender.com` |
| Database | [Supabase](https://supabase.com) | PostgreSQL + SQL Editor |

## Architecture

```
Browser → Vercel (React SPA)
              ↓ VITE_API_URL
         Render (Express API)
              ↓ SUPABASE_SERVICE_ROLE_KEY
         Supabase (PostgreSQL)
```

Email (Resend), uploads (Cloudinary), and auth cookies are configured via env vars. The API validates all required secrets on startup when `NODE_ENV=production`.

## 1. Supabase (database)

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run migrations **in order** from `backend/src/database/migrations/`:
   - `001_initial_schema.sql`
   - `003_password_reset_tokens.sql`
   - `004_election_module.sql`
   - `005_pageant_module.sql`
   - `006_polling_module.sql`
   - `007_organization_logo.sql`
3. Create an admin user (see [backend/src/database/README.md](backend/src/database/README.md)).
4. Copy from **Project Settings → API**:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server only — never expose to the frontend)

## 2. Render (backend)

### Option A — Blueprint

1. Push this repo to GitHub.
2. Render → **New** → **Blueprint** → select the repo.
3. Fill in secret env vars when prompted (see table below).

### Option B — Manual Web Service

| Setting | Value |
|---------|--------|
| Root Directory | `backend` |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |

### Backend environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | `production` |
| `PORT` | Auto | Render sets this (e.g. `10000`) |
| `FRONTEND_URL` | Yes | Exact Vercel URL, `https://…` (no trailing slash) |
| `JWT_SECRET` | Yes* | Access token secret (or use `JWT_ACCESS_SECRET`) |
| `JWT_REFRESH_SECRET` | Yes | Refresh token secret |
| `CSRF_SECRET` | Yes | Min 32 random characters |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-side DB access |
| `SUPABASE_ANON_KEY` | Recommended | For future client use |
| `CLOUDINARY_CLOUD_NAME` | Yes | Uploads |
| `CLOUDINARY_API_KEY` | Yes | Uploads |
| `CLOUDINARY_API_SECRET` | Yes | Uploads |
| `RESEND_API_KEY` | Yes | Email workflows |
| `EMAIL_FROM` | Yes | e.g. `VOTRIX <noreply@yourdomain.com>` |

\*Production rejects default/example JWT values.

**Optional**

| Variable | Purpose |
|----------|---------|
| `CLIENT_URLS` | Comma-separated extra CORS origins (Vercel preview URLs) |
| `COOKIE_SAME_SITE` | Default `none` in production (cross-origin cookies) |
| `JWT_ACCESS_EXPIRES_IN` | Default `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Default `7d` |

Generate secrets (local terminal):

```bash
openssl rand -hex 32
```

### Verify API

```bash
curl https://YOUR-API.onrender.com/api/health
```

Expect `"success": true` and `"integrations.database.connected": true` after migrations.

## 3. Vercel (frontend)

1. Import the GitHub repo in Vercel.
2. Set **Root Directory** to `frontend`.
3. Framework preset: **Vite** (or use `frontend/vercel.json`).
4. Add environment variable:

| Variable | Example |
|----------|---------|
| `VITE_API_URL` | `https://YOUR-API.onrender.com/api` |

5. Deploy. Copy the production URL (e.g. `https://your-app.vercel.app`).

**Important:** `VITE_API_URL` must be set to the **Render API origin with the `/api` suffix**, e.g. `https://votrix-api.onrender.com/api`. The frontend calls the API directly (CORS + `withCredentials: true`); there is no Vercel-side proxy. Without this var the production build defaults to `/api`, which will 404 because Vercel's static host does not forward `/api/*`.

## 4. Link frontend ↔ backend

1. In **Render**, set `FRONTEND_URL` to your Vercel production URL (must be `https://`).
2. In **Render**, set `COOKIE_SAME_SITE=none` (the default in production, but explicit is safer).
3. Redeploy the API so CORS and cookies use the new origin.
4. In **Vercel**, confirm `VITE_API_URL` points to the Render API with `/api` suffix.
5. Redeploy the frontend if you changed `VITE_API_URL`.

## 5. Third-party services

### Resend

1. Verify your sending domain.
2. Set `EMAIL_FROM` to an address on that domain.
3. Used for: organizer invites, voter invites, password reset, event notifications.

### Cloudinary

1. Create a cloud at [cloudinary.com](https://cloudinary.com).
2. Set `CLOUDINARY_*` on Render.
3. Used for: logos, banners, candidate/contestant photos.

## Cross-origin auth (Vercel + Render)

The frontend and API run on **different domains**. Production uses:

- CORS with `credentials: true`
- Cookies with `Secure` + `SameSite=None` (default when `NODE_ENV=production`)
- CSRF double-submit (`GET /api/auth/csrf` before login)

Both sites must use **HTTPS**. If login fails after deploy, check in this order:

1. **`VITE_API_URL` is set on Vercel** to `https://<render-host>/api` and the build was redeployed.
2. **`FRONTEND_URL` on Render** matches the browser address exactly (no trailing slash, must be `https://`).
3. **`COOKIE_SAME_SITE=none`** on Render (the default; the API now throws at startup if it is anything else in production).
4. **Render logs** for CORS or CSRF errors. If you see `Invalid or missing CSRF token`, the user agent is being blocked from sending the cookie — almost always `SameSite` or `Secure` mismatches.
5. **`JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are different values.** Identical secrets fail startup in production.

## Local development

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# Use NODE_ENV=development and FRONTEND_URL=http://localhost:5173
```

Frontend proxies `/api` to `localhost:5000` via Vite (see `frontend/vite.config.js`).

## Post-deploy checklist

- [ ] All SQL migrations applied in Supabase
- [ ] Admin user created in database
- [ ] `/api/health` returns database connected
- [ ] Admin login at `https://your-app.vercel.app/login/admin`
- [ ] Organizer invite email sends (Resend domain verified)
- [ ] CSV voter import + invitation email
- [ ] File upload (Cloudinary) on an event form
- [ ] Election / pageant / polling flows on organizer + voter dashboards

## System capabilities (production-ready)

| Area | Status |
|------|--------|
| Modular architecture (election, pageant, polling) | ✅ |
| Role-based dashboards (admin, organizer, voter) | ✅ |
| Email automation (Resend) | ✅ Env: `RESEND_API_KEY`, `EMAIL_FROM` |
| Voter account creation (CSV + invite email) | ✅ |
| Security (JWT, CSRF, rate limits, bcrypt) | ✅ |
| Uploads (Cloudinary) | ✅ |
| Analytics & reports | ✅ |
| UI (responsive, theme, toasts) | ✅ |
| Deployment (Vercel + Render + Supabase) | ✅ This guide |
