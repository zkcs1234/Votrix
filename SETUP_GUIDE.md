# VOTRIX — Complete setup guide (manual steps + instructions)

This document lists **everything you must do yourself** and walks through **local development** and **production deployment** from zero.

**Stack**

| Part | Technology | Where you host it |
|------|------------|-------------------|
| Frontend | React + Vite | [Vercel](https://vercel.com) |
| Backend API | Node.js + Express | [Render](https://render.com) |
| Database | PostgreSQL | [Supabase](https://supabase.com) |
| Email | Resend | [resend.com](https://resend.com) |
| File uploads | Cloudinary | [cloudinary.com](https://cloudinary.com) |

---

## Table of contents

1. [Prerequisites (install on your PC)](#1-prerequisites-install-on-your-pc)
2. [Accounts you must create manually](#2-accounts-you-must-create-manually)
3. [Secrets you must generate manually](#3-secrets-you-must-generate-manually)
4. [Part A — Local development setup](#part-a--local-development-setup)
5. [Part B — Production deployment](#part-b--production-deployment)
6. [Environment variable reference](#environment-variable-reference)
7. [Database migrations (manual, in order)](#database-migrations-manual-in-order)
8. [Create the first admin user (manual)](#create-the-first-admin-user-manual)
9. [Resend email setup (manual)](#resend-email-setup-manual)
10. [Cloudinary setup (manual)](#cloudinary-setup-manual)
11. [GitHub (manual)](#github-manual)
12. [Render backend (manual)](#render-backend-manual)
13. [Vercel frontend (manual)](#vercel-frontend-manual)
14. [Connect frontend and backend (manual)](#connect-frontend-and-backend-manual)
15. [Post-setup verification checklist](#post-setup-verification-checklist)
16. [What the app does NOT do for you](#what-the-app-does-not-do-for-you)
17. [Troubleshooting](#troubleshooting)

---

## 1. Prerequisites (install on your PC)

Do this once on your computer:

- [ ] **Node.js 20+** — [https://nodejs.org](https://nodejs.org) (check: `node -v`)
- [ ] **npm** — comes with Node (check: `npm -v`)
- [ ] **Git** — [https://git-scm.com](https://git-scm.com) (check: `git -v`)
- [ ] A code editor (e.g. VS Code / Cursor)
- [ ] Terminal (PowerShell or Command Prompt on Windows)

Optional but useful:

- [ ] **OpenSSL** (to generate secrets) — or use an online random string generator for JWT/CSRF secrets

---

## 2. Accounts you must create manually

Sign up and keep login details safe. You will copy API keys from each dashboard.

| # | Service | URL | What you need from it |
|---|---------|-----|------------------------|
| 1 | **Supabase** | https://supabase.com | Project URL, anon key, **service role key** |
| 2 | **Resend** | https://resend.com | API key, verified domain, sender email |
| 3 | **Cloudinary** | https://cloudinary.com | Cloud name, API key, API secret |
| 4 | **GitHub** | https://github.com | Repo to push this project |
| 5 | **Render** | https://render.com | Host the backend API |
| 6 | **Vercel** | https://vercel.com | Host the frontend |

You do **not** create admin users through the website UI — only in the database (see [section 8](#create-the-first-admin-user-manual)).

---

## 3. Secrets you must generate manually

Run these **on your machine** (or use three separate long random strings from a password manager).

**Windows (PowerShell):**

```powershell
# Run three times — use each output for a different secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Mac / Linux:**

```bash
openssl rand -hex 32
```

Save the results somewhere safe:

| Secret | Used for | Env variable |
|--------|----------|--------------|
| Random string #1 | Access JWT | `JWT_SECRET` (or `JWT_ACCESS_SECRET`) |
| Random string #2 | Refresh JWT | `JWT_REFRESH_SECRET` |
| Random string #3 | CSRF protection | `CSRF_SECRET` (min 32 characters) |

Never commit these to Git. Only paste them into `.env` (local) or Render/Vercel dashboards (production).

---

## Part A — Local development setup

Use this to run VOTRIX on your PC before deploying.

### A1. Get the project on your machine

If the code is already on your Desktop, open a terminal in the project folder:

```text
C:\Users\...\Desktop\HTML\Votrix
```

If using Git clone:

```bash
git clone <your-repo-url>
cd Votrix
```

### A2. Install dependencies (manual)

```bash
cd backend
npm install
cd ../frontend
npm install
```

### A3. Create local environment files (manual)

**Backend** — copy the example and edit:

```bash
cd backend
copy .env.example .env
```

(On Mac/Linux: `cp .env.example .env`)

Open `backend/.env` and set at least:

```env
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:5173

JWT_SECRET=<your-random-hex-1>
JWT_REFRESH_SECRET=<your-random-hex-2>
CSRF_SECRET=<your-random-hex-3>

SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

CLOUDINARY_CLOUD_NAME=your_cloud
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

RESEND_API_KEY=re_...
EMAIL_FROM=VOTRIX <onboarding@resend.dev>

PASSWORD_RESET_EXPIRY_MINUTES=60
```

> For local testing, Resend allows `onboarding@resend.dev` until you verify your own domain.

**Frontend** — copy and edit:

```bash
cd frontend
copy .env.example .env
```

Use the Vite proxy (recommended for local dev):

```env
VITE_API_URL=/api
```

Or point directly at the API:

```env
VITE_API_URL=http://localhost:5000/api
```

### A4. Supabase — run all migrations (manual)

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. Open **SQL Editor** → **New query**.
3. For **each file below**, open the file in your editor, copy **all** SQL, paste into Supabase, click **Run**.
4. Run in **this exact order** (paths relative to project root):

| Order | File |
|-------|------|
| 1 | `backend/src/database/migrations/001_initial_schema.sql` |
| 2 | `backend/src/database/migrations/003_password_reset_tokens.sql` |
| 3 | `backend/src/database/migrations/004_election_module.sql` |
| 4 | `backend/src/database/migrations/005_pageant_module.sql` |
| 5 | `backend/src/database/migrations/006_polling_module.sql` |
| 6 | `backend/src/database/migrations/007_organization_logo.sql` |

Do **not** run `002_down_initial_schema.sql` unless you intend to wipe the schema.

### A5. Create admin user (manual)

See [section 8](#create-the-first-admin-user-manual) — required before admin login works.

### A6. Start the servers (manual)

**Terminal 1 — API:**

```bash
cd backend
npm run dev
```

You should see: `API listening on port 5000`.

**Terminal 2 — Frontend:**

```bash
cd frontend
npm run dev
```

### A7. Verify locally (manual)

Open in browser:

| URL | Expected |
|-----|----------|
| http://localhost:5173 | Home page |
| http://localhost:5000/api/health | JSON with `"success": true` |
| http://localhost:5173/login/admin | Admin login (after admin insert) |

**Login URLs (local)**

| Role | URL |
|------|-----|
| Admin | http://localhost:5173/login/admin |
| Organizer | http://localhost:5173/login/organizer |
| Voter | http://localhost:5173/login/voter |

---

## Part B — Production deployment

Deploy in this order: **Supabase → Render → Vercel → link URLs**.

### B1. Supabase (production database)

- [ ] Same as [A4](#a4-supabase--run-all-migrations-manual) — all 6 migrations on your **production** Supabase project.
- [ ] Create admin user ([section 8](#create-the-first-admin-user-manual)).
- [ ] Copy API keys: **Settings → API** → `Project URL`, `anon`, `service_role`.

### B2. Push code to GitHub (manual)

See [section 11](#github-manual).

### B3. Deploy API on Render (manual)

See [section 12](#render-backend-manual).

### B4. Deploy frontend on Vercel (manual)

See [section 13](#vercel-frontend-manual).

### B5. Link URLs (manual)

See [section 14](#connect-frontend-and-backend-manual).

### B6. Final checks

See [section 15](#post-setup-verification-checklist).

---

## Environment variable reference

### Frontend (Vercel + local `frontend/.env`)

| Variable | Required | Example (production) | Example (local) |
|----------|----------|----------------------|-----------------|
| `VITE_API_URL` | Yes | `https://votrix-api.onrender.com/api` | `/api` or `http://localhost:5000/api` |

### Backend (Render + local `backend/.env`)

| Variable | Required in production | Description |
|----------|------------------------|-------------|
| `NODE_ENV` | Yes | `production` on Render; `development` locally |
| `PORT` | Auto on Render | `5000` locally; Render sets automatically |
| `FRONTEND_URL` | Yes | Exact Vercel URL, e.g. `https://your-app.vercel.app` (no trailing `/`) |
| `JWT_SECRET` | Yes | Access token secret (long random string) |
| `JWT_REFRESH_SECRET` | Yes | Refresh token secret (different random string) |
| `CSRF_SECRET` | Yes | Min 32 characters |
| `SUPABASE_URL` | Yes | From Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | **Server only** — never put in frontend |
| `SUPABASE_ANON_KEY` | Recommended | From Supabase |
| `CLOUDINARY_CLOUD_NAME` | Yes | Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | Yes | Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | Yes | Cloudinary dashboard |
| `RESEND_API_KEY` | Yes | Resend → API Keys |
| `EMAIL_FROM` | Yes | e.g. `VOTRIX <noreply@yourdomain.com>` |

**Optional**

| Variable | Purpose |
|----------|---------|
| `CLIENT_URL` | Same as `FRONTEND_URL` (legacy alias) |
| `CLIENT_URLS` | Extra CORS origins, comma-separated (Vercel preview URLs) |
| `COOKIE_SAME_SITE` | Default `none` in production for Vercel + Render |
| `JWT_ACCESS_EXPIRES_IN` | Default `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Default `7d` |
| `PASSWORD_RESET_EXPIRY_MINUTES` | Default `60` |

### Copy-paste template — Render (production backend)

Replace every `YOUR_...` value:

```env
NODE_ENV=production
FRONTEND_URL=https://YOUR_APP.vercel.app

JWT_SECRET=YOUR_HEX_1
JWT_REFRESH_SECRET=YOUR_HEX_2
CSRF_SECRET=YOUR_HEX_3

SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY

CLOUDINARY_CLOUD_NAME=YOUR_CLOUD
CLOUDINARY_API_KEY=YOUR_KEY
CLOUDINARY_API_SECRET=YOUR_SECRET

RESEND_API_KEY=re_YOUR_KEY
EMAIL_FROM=VOTRIX <noreply@yourdomain.com>
```

### Copy-paste template — Vercel (production frontend)

```env
VITE_API_URL=https://YOUR_API.onrender.com/api
```

---

## Database migrations (manual, in order)

**Where:** Supabase → SQL Editor → New query → paste → Run.

**Files (in order):**

1. `backend/src/database/migrations/001_initial_schema.sql`
2. `backend/src/database/migrations/003_password_reset_tokens.sql`
3. `backend/src/database/migrations/004_election_module.sql`
4. `backend/src/database/migrations/005_pageant_module.sql`
5. `backend/src/database/migrations/006_polling_module.sql`
6. `backend/src/database/migrations/007_organization_logo.sql`

**After migrations:** run the admin insert SQL ([next section](#create-the-first-admin-user-manual)).

---

## Create the first admin user (manual)

Admins are **never** registered through the UI. You insert them in Supabase.

### Step 1 — Hash a password

In terminal, from the `backend` folder:

```bash
cd backend
npm run db:hash-password -- "YourSecurePassword123!"
```

Copy the long string that prints (starts with `$2`).

### Step 2 — Insert in Supabase SQL Editor

Paste and edit this SQL (replace `YOUR_BCRYPT_HASH` and optionally change username):

```sql
INSERT INTO users (
  username,
  email,
  password,
  role,
  must_change_password
) VALUES (
  'admin',
  NULL,
  'YOUR_BCRYPT_HASH',
  'admin',
  TRUE
);
```

Click **Run**.

### Step 3 — Log in

- **Local:** http://localhost:5173/login/admin  
- **Production:** `https://YOUR_APP.vercel.app/login/admin  

- **Username:** `admin` (or what you set)  
- **Password:** the plain password you hashed in step 1  

You will be asked to **change password** on first login if `must_change_password` is `TRUE`.

### Create more admins later

Repeat steps 1–2 with a different `username`.

---

## Resend email setup (manual)

Emails are used for: organizer invitations, voter invitations, password reset, event notifications.

1. [ ] Sign up at https://resend.com  
2. [ ] **API Keys** → Create API Key → copy → `RESEND_API_KEY` in Render / `backend/.env`  
3. [ ] **Domains** → Add your domain  
4. [ ] Add the DNS records Resend shows (TXT, etc.) at your domain registrar  
5. [ ] Wait until domain status is **Verified**  
6. [ ] Set `EMAIL_FROM` to an address on that domain, e.g. `VOTRIX <noreply@yourdomain.com>`  

**Local testing only:** you may use Resend’s test sender:

```env
EMAIL_FROM=VOTRIX <onboarding@resend.dev>
```

**Production:** you must use a verified domain.

---

## Cloudinary setup (manual)

Used for organization logos, event banners, candidate/contestant photos.

1. [ ] Sign up at https://cloudinary.com  
2. [ ] Open **Dashboard** (or **Programmable Media** settings)  
3. [ ] Copy:
   - Cloud name → `CLOUDINARY_CLOUD_NAME`
   - API Key → `CLOUDINARY_API_KEY`
   - API Secret → `CLOUDINARY_API_SECRET`
4. [ ] Paste into `backend/.env` (local) and Render environment (production)

---

## GitHub (manual)

1. [ ] Create a new repository on GitHub (private recommended).  
2. [ ] In your project folder, initialize and push (if not already):

```bash
cd Votrix
git init
git add .
git commit -m "Initial VOTRIX commit"
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

3. [ ] Confirm `.env` files are **not** committed (they should be in `.gitignore`).

---

## Render backend (manual)

### Option 1 — Blueprint (uses `render.yaml` in repo root)

1. [ ] Render → **New** → **Blueprint**  
2. [ ] Connect GitHub → select your repo  
3. [ ] When prompted, enter all secret environment variables ([template above](#copy-paste-template--render-production-backend))  
4. [ ] Wait for deploy to finish  

### Option 2 — Web Service (manual settings)

1. [ ] Render → **New** → **Web Service**  
2. [ ] Connect repository  
3. [ ] Settings:

| Field | Value |
|-------|--------|
| Name | `votrix-api` (or any name) |
| Root Directory | `backend` |
| Runtime | Node |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |

4. [ ] **Environment** → add every variable from [backend template](#copy-paste-template--render-production-backend)  
5. [ ] **Create Web Service** → wait for **Live**  
6. [ ] Copy your API URL, e.g. `https://votrix-api.onrender.com`  

### Verify Render API (manual)

In browser or terminal:

```text
https://YOUR_API.onrender.com/api/health
```

Expected JSON includes:

- `"success": true`
- `"integrations.database.connected": true` (after migrations + Supabase keys)

---

## Vercel frontend (manual)

1. [ ] Go to https://vercel.com → **Add New** → **Project**  
2. [ ] Import your GitHub repository  
3. [ ] **Configure Project:**

| Field | Value |
|-------|--------|
| Framework Preset | Vite |
| Root Directory | `frontend` |
| Build Command | `npm run build` (default) |
| Output Directory | `dist` (default) |

4. [ ] **Environment Variables** → add:

| Name | Value |
|------|--------|
| `VITE_API_URL` | `https://YOUR_API.onrender.com/api` |

5. [ ] Click **Deploy**  
6. [ ] When finished, copy production URL, e.g. `https://your-app.vercel.app`  

---

## Connect frontend and backend (manual)

Do this **after** both are deployed once.

1. [ ] **Render** → your service → **Environment**  
2. [ ] Set `FRONTEND_URL` = your Vercel URL exactly, e.g. `https://your-app.vercel.app`  
   - Must be `https://`  
   - No trailing slash  
3. [ ] **Save** → **Manual Deploy** (or wait for auto-redeploy)  
4. [ ] **Vercel** → Project → **Settings** → **Environment Variables**  
5. [ ] Confirm `VITE_API_URL` = `https://YOUR_API.onrender.com/api` (must end with `/api`)  
6. [ ] **Redeploy** frontend if you changed `VITE_API_URL`  

### Optional — Vercel preview deployments

If preview URLs fail login (CORS), add them on Render:

```env
CLIENT_URLS=https://your-app-git-branch.vercel.app
```

Comma-separate multiple URLs.

---

## Post-setup verification checklist

### Database & API

- [ ] All 6 SQL migrations ran without errors  
- [ ] Admin user inserted in `users` table  
- [ ] `GET /api/health` shows database connected  
- [ ] Render service status is **Live**  

### Authentication

- [ ] Admin login works on production URL  
- [ ] Password change flow works (first login)  
- [ ] Organizer login works (after admin creates organizer)  
- [ ] Voter login works (after CSV import + invite)  

### Features (smoke test)

- [ ] Admin: create organizer  
- [ ] Organizer: create organization + election event  
- [ ] Organizer: upload logo/banner (Cloudinary)  
- [ ] Organizer: import voters CSV → invitation email sends (Resend)  
- [ ] Voter: vote in election  
- [ ] Pageant: judge scoring + rankings  
- [ ] Polling: create poll → voter submits answers  
- [ ] Reports: `/organizer/reports` loads  

### Production URLs to bookmark

| Page | URL pattern |
|------|-------------|
| Home | `https://YOUR_APP.vercel.app` |
| Admin login | `https://YOUR_APP.vercel.app/login/admin` |
| Organizer login | `https://YOUR_APP.vercel.app/login/organizer` |
| Voter login | `https://YOUR_APP.vercel.app/login/voter` |
| API health | `https://YOUR_API.onrender.com/api/health` |

---

## What the app does NOT do for you

These steps are **always manual**:

| Task | Why |
|------|-----|
| Create Supabase project | External account |
| Run SQL migrations | You paste SQL in Supabase SQL Editor |
| Create first admin user | Security — no public admin registration |
| Sign up for Resend / Cloudinary | External accounts |
| Verify email domain (Resend) | DNS at your registrar |
| Generate JWT / CSRF secrets | Security |
| Push code to GitHub | Your repository |
| Enter env vars on Render & Vercel | Hosting dashboards |
| Set `FRONTEND_URL` after Vercel deploy | CORS must match exact URL |
| Create organizers | Admin does this in the app (after admin exists) |
| Import voters (CSV) | Organizer does this per event |

The codebase **does** automate after setup: invite emails, voter account creation from CSV, password reset emails, module dashboards, voting/scoring/polling logic, CSRF, rate limits, reports.

---

## Troubleshooting

### `Production missing required environment variables` on Render

- Open Render logs → add every variable from the [backend template](#copy-paste-template--render-production-backend).  
- Redeploy.

### Login works locally but not on Vercel

- `FRONTEND_URL` on Render must **exactly** match the browser URL (including `https`, no trailing `/`).  
- `VITE_API_URL` must end with `/api`.  
- Redeploy **both** Render and Vercel after changes.  
- Use browser DevTools → Network → check API calls are not blocked by CORS.

### `/api/health` shows database not connected

- Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on Render.  
- Run all migrations in Supabase.  
- In Supabase, confirm `users` table exists.

### Emails not sending

- Check `RESEND_API_KEY` and `EMAIL_FROM`.  
- Production requires a **verified domain** in Resend.  
- Check Render logs for Resend errors.

### Uploads fail

- Verify all three `CLOUDINARY_*` variables.  
- Check file size limits in the UI.

### Render free tier sleeps

- First request after idle may take 30–60 seconds.  
- Upgrade plan or use a keep-alive ping service if needed.

### `Route not found: GET /api/auth/csrf`

The API is running but an **old backend process** is still active (common after pulling updates).

1. Stop every terminal running the API (**Ctrl+C**).
2. Restart from the `backend` folder:

```bash
cd backend
npm run dev
```

3. In the browser, open: http://localhost:5000/api/auth/csrf  
   - You should see JSON with `"csrfToken": "..."`.  
4. If `/api/health` still shows `"phase": 1`, the old server is still bound to port 5000 — close that process or reboot the terminal, then start again.

### CSRF / 403 on POST requests

- Frontend must call `GET /api/auth/csrf` before login (app does this automatically).  
- Ensure `withCredentials` / cookies work (HTTPS required in production).

---

## Quick reference — file locations

| What | Path |
|------|------|
| Backend env example | `backend/.env.example` |
| Frontend env example | `frontend/.env.example` |
| SQL migrations | `backend/src/database/migrations/` |
| Admin seed example | `backend/src/database/seeds/001_admin_user.example.sql` |
| Render blueprint | `render.yaml` |
| Vercel config | `frontend/vercel.json` |
| Deployment summary | `DEPLOYMENT.md` |

---

## Suggested setup order (summary)

```
1. Install Node + Git
2. Create Supabase, Resend, Cloudinary accounts
3. Generate JWT + CSRF secrets
4. Run migrations in Supabase
5. Create admin user in Supabase
6. Configure backend/.env + frontend/.env
7. npm install + npm run dev (test locally)
8. Push to GitHub
9. Deploy backend on Render (env vars)
10. Deploy frontend on Vercel (VITE_API_URL)
11. Set FRONTEND_URL on Render → redeploy both
12. Run verification checklist
```

When all checkboxes are done, VOTRIX is live.
