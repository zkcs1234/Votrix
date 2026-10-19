# Isolated native localhost application

The stack is running. Open http://localhost:5173/login and use the synthetic organizer credentials in [accounts.json](../../.tmp/votrix-native-dev/accounts.json). Passwords are intentionally excluded from reports. Then open http://localhost:5173/organizer/competition.

Select **Manage competitions**, select the acceptance parent event **Native real application 1791955857479**, and open its workspace. Its event ID is `8c50d3f0-8f59-4eaa-b802-4390eed02f58`. Six single-phase children have finalized/published results. The newest multi-round child also has a corrected, newly finalized Final. Earlier failed attempts and an earlier corrected/paused child are retained as synthetic evidence.

## Running services

| Service | Address | Target |
| --- | --- | --- |
| Normal Vite application | http://localhost:5173 | Actual frontend/main/router, isolated environment directory |
| Actual Express backend | http://localhost:5000 | Verified local API only; background synchronization/archival included |
| Supabase REST prefix gateway | http://127.0.0.1:5059/rest/v1/ | Transparent forwarding to real local PostgREST |
| Real PostgREST 16.4 | http://127.0.0.1:5058 | Dedicated local PostgreSQL database |
| PostgreSQL 18 | 127.0.0.1:55440 | `votrix_dev_1791952165826` |

Data, generated credentials, executable, configuration and signing keys live in ignored `.tmp/votrix-native-dev`. The older Phase 1–9 cluster on 55439 remains stopped and was not used or modified. No hosted records or credentials were copied.

## Restarting the existing isolated stack

Stop each launcher with Ctrl+C in its own terminal before restarting; do not run competing servers on these ports. Run these commands from `C:\Github\Votrix`, in separate terminals and in this order:

```powershell
& 'C:/Program Files/PostgreSQL/18/bin/pg_ctl.exe' -D 'C:/Github/Votrix/.tmp/votrix-native-dev/pgdata' -l 'C:/Github/Votrix/.tmp/votrix-native-dev/postgres.log' -o '-p 55440 -h 127.0.0.1' start
```

```powershell
node backend/scripts/local-native-api.mjs
```

```powershell
node backend/scripts/local-native-dev.mjs verify
node backend/scripts/local-native-dev.mjs backend
```

```powershell
node backend/scripts/local-native-dev.mjs frontend
```

If PostgreSQL is already running, skip its start command. Equivalent app commands are `npm run dev:native` from backend/frontend. The launcher verifies database name, cluster directory, port and random identity against the real API before importing the backend. It replaces inherited database/provider/signing settings, uses generated local keys and changes the working directory so production `.env` files cannot load. The backend independently verifies the target **before** starting its writing jobs and binds loopback only. Browser harnesses also require the backend's matching local identity header before any writes.

**Ordinary `npm run dev` was not repointed.** Existing `backend/.env` still identifies shared production-sensitive Supabase. Use these isolated launchers for this workflow; do not start the original backend alongside them. Production configuration and default feature gates remain unchanged.

To stop the stack, stop frontend, backend and API launcher first, then:

```powershell
& 'C:/Program Files/PostgreSQL/18/bin/pg_ctl.exe' -D 'C:/Github/Votrix/.tmp/votrix-native-dev/pgdata' stop -m fast
```

This stops the dedicated cluster without deleting records. Do not delete its directory or rerun initdb over it.

## Reproduction and tests

The initial cluster used a fresh `initdb` directory and `local-native-foundation.mjs`, then `local-native-seed.mjs`. Foundation has an applied checksum ledger; it refuses unapplied foundation migrations once users exist. The seed refuses overwriting its accounts file. `local-native-compatibility.mjs` installs the documented 109 correction and local-only archived enum label. Original migrations are retained. A populated database is never reset automatically.

PostgREST was downloaded from the official v16.4 Windows release. ZIP SHA-256: `29a5b56e5a09b7168bb552ef14aa7ade40bf0a81dd0687cffa86610187b89d78`, verified against the release asset digest. PostgreSQL DLLs are provided by the existing PostgreSQL installation. No Docker, WSL, paid service or hosted Supabase project is required for this stack.

From the repository root:

```powershell
node backend/scripts/local-native-dev.mjs checks
node backend/scripts/local-native-dev.mjs build
node backend/scripts/verify-native-local-evidence.mjs
```

Real Chromium acceptance scripts are `test-native-real-app.mjs`, `test-native-real-app-extended.mjs` and `test-native-public-browser.mjs`. They use normal password login, actual routes and real PostgREST. They create additional synthetic records; they never clean up history. Run suites sequentially. Repeated runs can exhaust normal login/shared-IP quotas; wait for the window or restart only the isolated backend between completed suites. Do not loosen production quotas. The extended suite creates a unique child name to avoid replaying an existing identity.

Cloudinary and email credentials are absent: uploads and real mail delivery are disabled safe substitutes. Synthetic accounts have complete local profiles. No invitation, external storage upload or provider authentication test is claimed. Local authentication uses the application's real bcrypt/users/session/JWT-cookie flow.

Production release remains **NO-GO**. Hosted catalog/ledger, backup/restore, authentication, transport topology and representative capacity requirements are unchanged.
