# Deploying VOTRIX — Backend (Render) then Frontend (Vercel)

This document explains step-by-step how to deploy the backend to Render first, then the frontend to Vercel. It assumes the repository is pushed to GitHub and you have accounts on Render and Vercel.

---

## Prerequisites

- A GitHub repository containing this project (push your code to `main` or a deploy branch).
- Render account (https://render.com) connected to GitHub.
- Vercel account (https://vercel.com) connected to GitHub.
- Supabase project (PostgreSQL) with migrations applied (see step below).
- Node >= 20 locally (for testing) and Git installed.
- Secrets for Cloudinary, Resend (email), and JWT secrets.

## Quick file references

- Backend root: [backend](backend)
- Frontend root: [frontend](frontend)
- Backend env loader: [backend/src/config/env.js](backend/src/config/env.js)

## 0 — Prepare the database (Supabase)

1. Create a Supabase project at https://supabase.com.
2. Open **SQL Editor** and run the SQL migration files in `backend/src/database/migrations/` in order (the repo README lists the order).
3. Create an admin user as described in `backend/src/database/README.md`.
4. Copy these items from Project Settings → API and keep them secret:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` (optional for future client use)
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only! never expose to frontend)

---

## 1 — Deploy the Backend to Render (do this first)

Why first: the frontend needs a stable API URL (`VITE_API_URL`) to call during build/runtime, and the API needs environment variables configured.

### A. Push code to GitHub

1. Ensure your repo is up-to-date and pushed:

```bash
git add -A
git commit -m "deploy: prepare for render/vercel"
git push origin main
```

### B. Create a new Render Web Service

1. In Render → New → Web Service.
2. Connect to the repository and pick the branch (e.g. `main`).
3. Configure the service:
   - **Name**: `votrix-api` (or your preferred name)
   - **Environment**: `Node` / `Node 20+`
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/api/health`

Render will set `PORT` automatically; the app reads `process.env.PORT`.

### C. Add Environment Variables on Render

Open Render service → Environment → Environment Variables and add the values below. Replace example values with your real secrets.

- `NODE_ENV` = `production`
- `FRONTEND_URL` = (temporarily) `https://your-vercel-app.vercel.app` or leave as a placeholder and update later after frontend deploy
- `JWT_ACCESS_SECRET` = (generate a strong random hex)
- `JWT_REFRESH_SECRET` = (generate a strong random hex)
- `CSRF_SECRET` = (>=32 chars)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY` (recommended)
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM` = e.g. `VOTRIX <noreply@yourdomain.com>`

Optional / tuning variables:

- `CLIENT_URLS` (comma-separated extra origins)
- `ALLOW_VERCEL_PREVIEWS` = `true` (default) to allow `https://*.vercel.app` preview URLs during testing
- `COOKIE_SAME_SITE` (default `none` in production)
- `JWT_ACCESS_EXPIRES_IN` (default `15m`)
- `JWT_REFRESH_EXPIRES_IN` (default `7d`)

Notes:

- You can generate secrets locally with `openssl rand -hex 32` or any secure generator.
- The API asserts required env vars at startup (see `backend/src/config/env.js`).
- Email links and login URLs are built from `FRONTEND_URL` in `backend/src/utils/urls.js`, so redeploy Render after updating it.

### D. Deploy and verify

1. Trigger the initial deploy on Render.
2. Check logs for successful start.
3. Verify health:

```bash
curl https://<your-render-service>.onrender.com/api/health
```

Expect `"success": true` and `"integrations.database.connected": true` in the JSON.

If migrations were not applied, you will see database errors in logs; re-run migrations in Supabase.

---

## 2 — Deploy Frontend to Vercel (after backend is live)

Why second: the frontend build needs `VITE_API_URL` pointing to the live API.

### A. Build & env var prerequisites

1. Copy your Render API URL, e.g. `https://votrix-api.onrender.com`.
2. The frontend expects `VITE_API_URL` to include the `/api` suffix, e.g. `https://votrix-api.onrender.com/api`.

### B. Create a new Vercel project

1. In Vercel → New Project → Import Git Repository.
2. Select the repo and set the **Root Directory** to `frontend`.
3. Framework preset: Vite (should be auto-detected).
4. Build Command: `npm run build` (Vercel will use `npm install` automatically).
5. Output Directory: use default (Vite handles it) or `.vercel/output` if you have custom settings.

### C. Set Vercel Environment Variables

In Vercel Project → Settings → Environment Variables, add:

- `VITE_API_URL` = `https://<your-render-service>.onrender.com/api`

This is the **only** required frontend env var. The frontend calls the API directly via this URL using CORS + `withCredentials: true`; there is no Vercel-side proxy.

Optional preview environment:

- Set the same `VITE_API_URL` for Preview and Production or use a preview-specific API host.

### D. Deploy and verify

1. Deploy the project on Vercel.
2. Visit the Vercel URL (e.g. `https://your-app.vercel.app`).
3. Try login and flows that call the API.

If auth/cookies fail:

- Ensure `VITE_API_URL` on Vercel is set to `https://<render-service>.onrender.com/api` (with the `/api` suffix) and the frontend was redeployed after the change.
- Ensure `FRONTEND_URL` on Render exactly matches the Vercel production URL (including `https://` and no trailing slash).
- Ensure `COOKIE_SAME_SITE=none` on Render (the API throws at startup in production otherwise).
- Ensure `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are different values (the API throws at startup in production otherwise).

---

## 3 — Link frontend ↔ backend (finalize)

1. On Render, update `FRONTEND_URL` to the Vercel production URL.
2. Redeploy the Render service so CORS/cookie origins update.
3. On Vercel, if needed, update `VITE_API_URL` and redeploy the frontend.

## 4 — Required environment variables checklist

Backend (Render) required:

- `NODE_ENV` = `production`
- `JWT_ACCESS_SECRET` (or `JWT_SECRET` alias)
- `JWT_REFRESH_SECRET`
- `CSRF_SECRET` (>=32 chars)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`

Frontend (Vercel):

- `VITE_API_URL` = `https://<your-render-service>.onrender.com/api`

---

## 5 — Verification & smoke tests

1. `curl https://<render-service>/api/health` → expects `success: true` and DB connected.
2. Visit `https://<vercel-app>/login/admin` and attempt an admin login.
3. Create an organizer and invite voters — ensure emails send and uploads work.

## 6 — Troubleshooting

- CORS errors: confirm `FRONTEND_URL` matches the site origin and `CLIENT_URLS` contains preview URLs.
- CORS errors from a Vercel preview URL: either add that exact preview URL to `CLIENT_URLS` or leave `ALLOW_VERCEL_PREVIEWS=true` so `https://*.vercel.app` is accepted.
- Cookies not sent: check `SameSite=None` and `Secure=true` in production; verify `FRONTEND_URL` and `VITE_API_URL` usage.
- If `POST /api/admin/organizers` returns `403 Invalid or missing CSRF token`, reload the admin page after deploy so the organizer form fetches a fresh CSRF token before submit.
- Missing env var: API will throw at startup; add the missing var in Render and redeploy.
- Migrations not applied: run SQL in Supabase SQL Editor and ensure the admin user exists.
- If you need to delete an organizer user for a fresh test, delete their `organizations` row(s) first, then delete the `users` row, because `organizations.organizer_id` is `ON DELETE RESTRICT`.

---

## Appendix — Helpful commands

Generate secrets:

```bash
openssl rand -hex 32
```

Trigger redeploy from local (push a no-op commit):

```bash
git commit --allow-empty -m "chore: trigger deploy"
git push origin main
```

---

If you'd like, I can add Render and Vercel environment variable templates (example `.env.render` and `.env.vercel`) to the repo, or help you push the repo and complete the Render/Vercel setup interactively.
