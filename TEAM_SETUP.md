# Votrix — Team Collaboration & Setup Guide

This guide explains how our group works together in **one shared repo**
(`github.com/zkcs1234/Votrix`) without breaking each other's work or ending up
with mismatched environments.

**Our chosen model:**

- **Access:** everyone is a direct collaborator. We push branches and merge
  through Pull Requests (no one pushes straight to `main`).
- **Environment:** everyone uses **one shared dev environment** — the *same*
  `.env` values, pointing at the *same* Supabase database, Cloudinary, and
  Resend. This guarantees "same env for everyone" and prevents drift.

---

## Table of contents

1. [Part A — For the Repo Owner (Zar)](#part-a--for-the-repo-owner-zar)
2. [Part B — For Team Members](#part-b--for-team-members)
3. [Part C — Environment (.env) handling — READ THIS](#part-c--environment-env-handling--the-important-part)
4. [Part D — Daily Git workflow (everyone)](#part-d--daily-git-workflow-everyone)
5. [Part E — Golden rules & troubleshooting](#part-e--golden-rules)

---

## Part A — For the Repo Owner (Zar)

You do these steps **once** to set the team up. ✅ = one-time.

### A1. Add teammates as collaborators ✅

1. Go to **GitHub → `zkcs1234/Votrix` → Settings → Collaborators**.
2. Click **Add people**, enter each teammate's GitHub username/email.
3. They get an email invite and must **accept** it before they can push.
4. Give them **Write** access (default). Do NOT give Admin unless needed.

### A2. Protect the `main` branch ✅ (prevents accidents)

**Settings → Branches → Add branch ruleset** (or "Add rule") for `main`:

- ☑ **Require a pull request before merging** (at least 1 approval).
- ☑ **Require status checks to pass** — select the existing CI checks
  (`backend-ci`, `frontend-ci`, `ci`).
- ☑ **Do not allow bypassing the above settings** (applies to you too — this is
  what actually stops someone force-pushing over `main`).
- Optional: ☑ **Require branches to be up to date before merging.**

> Result: nobody — including you — can push broken or unreviewed code directly
> to `main`. All changes flow through PRs.

### A3. Distribute the shared secrets securely ✅

The real `.env` files are **NOT in git** (correctly gitignored). You must send
the actual values to teammates through a **private channel** — see
[Part C](#part-c--environment-env-handling--the-important-part). Never paste them
into GitHub, a public chat, or commit them.

### A4. Own the "environment contract"

Whenever the app needs a **new** environment variable:

1. Add it to `backend/.env.example` or `frontend/.env.example` (this IS
   committed — it's the template, with blank/placeholder values).
2. Add the real value to the shared secret store.
3. Announce it to the team ("new var `X` added — pull and update your `.env`").

This keeps everyone's `.env` identical to yours.

### A5. Review & merge PRs

- Read the diff, check CI is green, request changes if needed, then **Squash and
  merge**.
- Delete the branch after merging (GitHub offers a button).

---

## Part B — For Team Members

Do this the **first time** you join the project.

### B1. Prerequisites

- **Node.js 20** (the repo pins it in `.nvmrc`). If you use `nvm`: run `nvm use`.
- **Git** installed and configured with your name/email:
  ```bash
  git config --global user.name "Your Name"
  git config --global user.email "you@example.com"
  ```

### B2. Accept the invite & clone

1. Accept the GitHub collaborator invite (check your email).
2. Clone the repo:
   ```bash
   git clone https://github.com/zkcs1234/Votrix.git
   cd Votrix
   ```

### B3. Install dependencies (one command)

From the repo root:

```bash
npm run install:all
```

This installs both `backend` and `frontend` dependencies.

### B4. Set up your `.env` files

⚠️ This is the step that keeps everyone "on the same environment." Follow
[Part C](#part-c--environment-env-handling--the-important-part) exactly.

Short version:
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```
Then paste the **shared values** Zar gave you into those two files.

### B5. Run the app locally

Open **two terminals** from the repo root:

```bash
npm run dev:backend
```
```bash
npm run dev:frontend
```

- Backend runs on **http://localhost:5000**
- Frontend runs on the Vite URL it prints (usually **http://localhost:5173**)

### B6. Run tests before you push

```bash
cd backend && npm test
```
```bash
cd frontend && npm run lint
```

---

## Part C — Environment (.env) handling — THE IMPORTANT PART

Your goal: **everyone runs the exact same environment so the app behaves the
same for everyone and nobody breaks it.** Here's how we guarantee that.

### The two kinds of env files

| File | In git? | Purpose |
|------|---------|---------|
| `backend/.env.example`, `frontend/.env.example` | ✅ **Yes** (committed) | The **template / contract**. Lists every variable name, with blank or placeholder values. No real secrets. |
| `backend/.env`, `frontend/.env` | ❌ **No** (gitignored) | The **real values** — actual secrets. Each person creates this locally; it is never committed. |

> ✅ Already correct in this repo: `.gitignore` ignores `.env`, and `git` is not
> tracking `backend/.env` or `frontend/.env`. **Do not** `git add -f` them.

### Why we do NOT commit `.env`

- It contains secrets (`JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`,
  `CLOUDINARY_API_SECRET`, `RESEND_API_KEY`, `CSRF_SECRET`).
- Anything pushed to GitHub is effectively permanent history, even if deleted
  later. A leaked service-role key = full database access for anyone.

### How we share ONE identical environment (our chosen model)

Because Supabase, Cloudinary, and Resend are **cloud services**, everyone can
literally use the **same values** and point at the **same backing data**. That's
what makes "same env for everyone" real.

**Distribution channel (pick ONE private, non-git channel):**

- A **pinned message in our private group chat** (Messenger/Discord/WhatsApp), or
- A **shared password manager** (Bitwarden/1Password) vault, or
- A private note only the group can see.

**The flow:**

1. Zar keeps the master copy of the real `backend/.env` and `frontend/.env`.
2. Zar posts the full contents in the private channel above.
3. Each member copies the example files and pastes the shared values:
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   # then paste the shared values into each .env
   ```
4. Everyone now has an **identical** environment. Same DB, same uploads, same
   email sender.

### The variables we all share (from `.env.example`)

**`backend/.env`** (real values distributed privately):

```
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:5173
JWT_SECRET=<shared>
JWT_REFRESH_SECRET=<shared>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
CSRF_SECRET=<shared>
SUPABASE_URL=<shared>
SUPABASE_ANON_KEY=<shared>
SUPABASE_SERVICE_ROLE_KEY=<shared>
CLOUDINARY_CLOUD_NAME=<shared>
CLOUDINARY_API_KEY=<shared>
CLOUDINARY_API_SECRET=<shared>
RESEND_API_KEY=<shared>
EMAIL_FROM=VOTRIX <noreply@yourdomain.com>
PASSWORD_RESET_EXPIRY_MINUTES=60
```

> Note: for **local dev**, set `NODE_ENV=development` and
> `FRONTEND_URL=http://localhost:5173` (the `.env.example` shows *production*
> values because it doubles as the deploy template). The **secret** values
> (Supabase, Cloudinary, Resend, JWT, CSRF) are the same everywhere.

**`frontend/.env`**:

```
VITE_API_URL=http://localhost:5000/api
```

### When someone adds or changes a variable (how we avoid drift)

This is the #1 cause of "works on my machine." The rule:

1. **Never** silently add a `process.env.X` in code without updating the template.
2. If you add a new variable:
   - Add its **name** to the matching `.env.example` (committed in your PR).
   - Add its **real value** to the shared private channel.
   - Post in the group: *"New env var `X` added — update your `.env`."*
3. Everyone else: pull, then copy the new line into their local `.env`.

> Because `.env.example` is committed, anyone can `git diff` it after pulling to
> see exactly which variables changed.

### Important shared-database caution

Since we all share ONE Supabase database:

- Running a **destructive migration** or deleting data affects **everyone**.
- Announce migrations before running them. See `MIGRATION_RUNBOOK_061-063.md`.
- Prefer creating test records over deleting shared ones.
- If you need to experiment destructively, ask Zar about a separate Supabase
  branch/project first.

---

## Part D — Daily Git workflow (everyone)

**Never commit directly to `main`.** Always use a branch + PR.

```bash
# 1. Start from an up-to-date main
git checkout main
git pull origin main

# 2. Create a branch for your task
git checkout -b feature/short-description
#   examples: fix/judge-login, feature/export-results

# 3. Do your work, then stage & commit
git add .
git commit -m "Clear message about what changed"

# 4. Push your branch
git push -u origin feature/short-description

# 5. Open a Pull Request on GitHub (base: main <- compare: your branch)
#    Fill out the PR template, wait for CI to pass, get 1 approval.

# 6. After it's merged, clean up
git checkout main
git pull origin main
git branch -d feature/short-description
```

### Avoiding conflicts

- Keep branches **small and short-lived** — merge often.
- Before pushing, sync with main to catch conflicts early:
  ```bash
  git checkout main && git pull
  git checkout feature/your-branch
  git merge main        # resolve any conflicts locally
  ```
- Tell the team which files/areas you're working on so two people don't edit the
  same thing at once.

---

## Part E — Golden rules

1. 🚫 **Never commit `.env`.** Secrets go through the private channel only.
2. 🌿 **Never push to `main` directly.** Branch → PR → review → merge.
3. 📝 **New env var?** Update `.env.example` + tell the team + share the value.
4. 🔄 **Pull `main` before starting** and before opening a PR.
5. 🗄️ **Shared database = shared consequences.** Announce migrations; don't delete
   shared data.
6. ✅ **Run tests/lint before pushing.**
7. 🔑 **If a secret leaks** (accidentally committed/posted publicly), tell Zar
   immediately — the key must be **rotated** (regenerated) in
   Supabase/Cloudinary/Resend, because git history can't be trusted once exposed.

### Quick troubleshooting

| Problem | Fix |
|---------|-----|
| `Missing env var` on backend start | Compare your `backend/.env` against `backend/.env.example`; a variable is missing — get it from the shared channel. |
| Frontend can't reach API | Check `VITE_API_URL=http://localhost:5000/api` in `frontend/.env`, and that the backend is running. |
| "It works for me but not them" | Someone's `.env` drifted. Re-sync all values from the shared channel. |
| Push rejected to `main` | Expected — branch protection is on. Create a branch and open a PR. |
| Merge conflict | `git merge main` on your branch, resolve the marked sections, commit. |
| Wrong Node version errors | `nvm use` (repo pins Node 20 via `.nvmrc`). |
