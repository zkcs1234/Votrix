# Production Cleanup and Deprecation Plan

## Objective

Perform a controlled cleanup of the database, duplicate code, and missing or stale files without risking production data integrity. This must follow a strict `Verify -> Backup -> Deprecate -> Remove` lifecycle.

## Critical safety rules

1. Never drop database tables or columns blindly in production.
2. Never remove a file or service until there is proof it is not referenced by the running app.
3. Preserve a manual archive path for anything risky.
4. Make migration changes reversible and testable before deleting legacy structures.
5. Only finalize destructive changes after a backup, verification, and a rollback window.

## Approved cleanup workflow

### 1) Verify

Before any change, verify:

- which table is still in use
- which code paths reference the old table or service
- whether the file is actually imported anywhere
- whether any database rows are still active and must be migrated rather than dropped

### 2) Backup

Create a database backup and an application snapshot before any schema deprecation.

Recommended backup list:

- full Postgres dump of the production database
- schema-only dump for migration review
- user/event enrollment export for reconfirmation
- Git branch/tag checkpoint with the current state

### 3) Deprecate

If a legacy feature is still partially supported, deprecate it first:

- mark it as legacy in comments and docs
- leave it in a non-production archive or ignored folder
- stop active imports and route references
- move code into a safe archive if it is still useful for rollback

### 4) Remove

Only after the deprecation period and validation passes:

- drop unused schema elements
- delete unreferenced files
- clean stale duplicated modules
- confirm no active route or import still points to the removed item

---

## Findings from the current system

### A. Database risks

#### 1. Legacy `event_voters` still exists

The system already migrated toward `event_participants`, but the legacy table is still present historically.

Evidence in the codebase:

- `backend/src/database/migrations/029_event_participant_roles.sql` introduces the canonical `event_participants` table
- `backend/src/utils/constants.js` keeps `EVENT_VOTERS: 'v_event_voters'` but notes it is a backward-compatibility view
- the legacy `event_voters` table remains in earlier migration history and still appears in older migration scripts and docs

This is a risk because some services still reference older naming or rely on compatibility views. It is safe to keep the physical table during the migration window, but it is not safe to drop it until a confirmation pass proves:

- no legacy write path still depends on it
- no enrollment is still being inserted there
- all data was backfilled into `event_participants`
- the app is fully reading from the new canonical table

#### 2. `users.username` is legacy, not the primary identity

The system is currently standardized around email-based login, as expected for the modern flow.

Evidence:

- `backend/src/services/user.service.js` focuses on `findUserByEmail` and account creation with `email`
- `backend/src/validators/auth.validator.js` validates login by email
- `backend/src/services/token.service.js` still includes `username` in the JWT payload, but it is treated as optional
- `backend/src/database/migrations/001_initial_schema.sql` still contains a unique username constraint and username index

This is not automatically a drop candidate because the schema may still support older admin accounts or migration scripts. It is safe to deprecate, not delete, while the system is still verifying all sign-in flows.

Recommended handling:

- stop using `username` in active login flows
- keep it nullable for compatibility
- only remove if all records are confirmed to be email-only and no admin or legacy bootstrap code depends on it

#### 3. Old admin debug scripts are not production app code

These are operational scripts and should not be treated as deployment code:

- `backend/tmp_check_db.mjs`
- `backend/tmp_make_admin.mjs`
- `backend/tmp_verify_admin.mjs`
- `backend/src/scripts/verify_039.mjs`
- `backend/src/database/scripts/*.sql` used for diagnostics and repair

These are useful for maintenance, but they should be archived or moved under a maintenance-only folder instead of being left mixed in the main runtime codebase.

### B. Duplicate or overlapping code paths

#### 1. Pageant/competition split still has a legacy alias

The app still contains both legacy pageant naming and new competition naming.

Examples:

- `frontend/src/services/pageant.service.js`
- `frontend/src/modules/pageant/index.js`
- `frontend/src/layouts/PageantLayout.jsx`
- `frontend/src/routes/index.jsx` still includes Pageant routing
- `frontend/src/modules/competition/index.js` re-exports the same underlying service

This is not necessarily wrong if a backward-compatibility layer is intentionally kept, but it is a duplicate surface area and must be treated as a deprecation target rather than a production cleanup candidate until the compatibility layer is fully retired.

#### 2. Frontend dist artifacts are build output, not source

`frontend/dist` contains compiled JavaScript bundles and should not be treated as source-of-truth code.

These files are safe to keep in the workspace for rollback or debugging, but they should not be used as the basis for functionality decisions. They are not the clean code path to edit.

### C. Missing or incomplete file issues

#### 1. Missing runtime API implementations in polling service

The controller imports polling respondent functions that need to exist and be tested. The current code shows the service is partly implemented but there are legacy/unfinished functions that need auditing.

This is a real missing-file/implementation risk because the route layer expects certain functions to exist.

#### 2. Admin/user account inconsistency

The system appears to have mixed identity patterns between `username` and `email`, and some legacy data still exists. This is a missing-data and migration-risk area, not just a code cleanup task.

#### 3. Safe archive folder needed before code removal

This repo should not directly delete old modules. Instead, archive them under a branch-local ignored folder that is excluded from deployment.

---

## Recommended risk classification

### Safe to keep for now

- `event_participants` as the canonical table
- `v_event_voters` compatibility view while migration is verified
- `users.username` column as nullable compatibility field until all flows are proven email-only
- pageant alias layer while legacy routes are still accepted

### Safe to archive, not immediately delete

- maintenance SQL scripts used for repair diagnosis
- temp verification scripts under `backend/tmp_*` or `backend/src/scripts/*verify*`
- legacy pageant compatibility wrappers if they are not imported by active routes
- old build artifacts that are not part of source control and not used at runtime

### Not safe to drop until after verification

- physical `event_voters` table
- `users.username` unique constraints and any code paths that still rely on them
- any compatibility view that active code still queries in read-only flow
- legacy pageant route support if the app still accepts older URLs

---

## Safe archive strategy

Create an archive folder at the repo root:

```text
archive/
  cleanup-archive/
    database-legacy/
    duplicate-code/
    missing-files/
    temp-scripts/
```

Add the archive directory to `.gitignore` so it is not pushed to production.

This allows the team to:

- move risky files out of active paths
- preserve rollback capability
- keep production deployment clean
- avoid accidental deletion of critical data or working code

---

## Concrete action plan

### Phase 1 — Inventory and tagging

- list all DB tables and columns used by active flows
- identify legacy/table aliasing (`event_voters`, `v_event_voters`, `username`)
- tag each file as: `active`, `legacy`, `temporary`, `duplicate`, `missing-dependency`

### Phase 2 — Backup and validation

- perform full DB backup
- export user, event, and participant data
- verify no scheduled deployment or user activity is active during cleanup
- run a dry-run migration check in staging or a clone of production

### Phase 3 — Archive risky items

- move duplicate or legacy code into `archive/cleanup-archive/`
- move utility scripts used only for manual verification into the archive
- keep `.gitignore` active so the item is never deployed

### Phase 4 — Deprecate remaining paths

- remove active imports of archived modules
- document the deprecation in release notes
- keep compatibility wrappers for a short, controlled period

### Phase 5 — Delete only after sign-off

- drop dead schema objects only after two checks:
  - no active code references them
  - migration data was reconciled and backed up

---

## Recommended production decision

This should be managed as a controlled maintenance task, not a direct destructive cleanup.

The correct order is:

1. verify actual runtime usage
2. back up production data
3. archive legacy files and DB utilities instead of deleting them
4. deprecate old paths such as pageant compatibility and legacy username usage
5. remove only after all migration checks pass in staging

---

## Final recommendation

The current system is already in a migration state:

- new canonical event model: `event_participants`
- legacy compatibility model: `event_voters` + `v_event_voters`
- email-first auth model with remaining username compatibility fields
- duplicate pageant/competition compatibility aliases still present

This means the safe path is to preserve, archive, and verify, not to immediately delete. The repo should be cleaned up by archiving risky legacy items to `archive/cleanup-archive/` and letting Git ignore that folder until the production cleanup is approved and validated.
