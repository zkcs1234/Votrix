# GitHub Actions CI

This directory contains the continuous-integration workflows for VOTRIX.

## Workflows

| File | Purpose | Triggered by |
|---|---|---|
| `ci.yml` | Top-level orchestrator. Runs both `backend-ci` and `frontend-ci` in parallel and reports a single status. | Every push and PR to `main`. |
| `backend-ci.yml` | Reusable workflow: `npm ci` + `npm test` in `backend/`. | Called by `ci.yml`; also runnable on its own. |
| `frontend-ci.yml` | Reusable workflow: `npm ci` + `npm run lint` + `npm run build` in `frontend/`, then uploads `dist/` as a build artifact. | Called by `ci.yml`; also runnable on its own. |

## Required checks

The required status check on `main` is **`CI / All checks`**. The `all-green` job only succeeds when both `backend` and `frontend` jobs succeed.

## Local equivalents

You can run the same checks locally before pushing:

```bash
# Backend
cd backend
npm ci
npm test

# Frontend
cd ../frontend
npm ci
npm run lint
npm run build
```

## Secrets

The current workflows do **not** require any secrets.

- The backend test suite is fully self-contained: tests stub the Supabase client via `vi.mock`, so no `SUPABASE_URL` / `SUPABASE_KEY` is needed in CI.
- The frontend build only needs `VITE_API_BASE_URL` if the application code references it at build time. Currently the build succeeds without it; if you add an env var later, add it to the workflow's `env:` block.

## Adding a new workflow

1. Create a new `.yml` file under `.github/workflows/`.
2. Add it as a job in `ci.yml` so it participates in the required status check.
3. Document it in the table above.

## Future improvements

- Add an `npm audit --audit-level=high` step to catch dependency vulnerabilities.
- Add a codeql analysis workflow for static security scanning.
- Add a release workflow that publishes Docker images on tag push.
