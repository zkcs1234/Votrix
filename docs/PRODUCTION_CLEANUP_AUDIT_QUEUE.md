# Production Cleanup Audit Queue

## Status

This is the immediate next action in the safe `Verify -> Backup -> Deprecate -> Remove` workflow. No destructive database or code removal has been performed here.

## Scope

We are auditing only the items that are known to be risky or mixed-state in the current system:

- legacy `event_voters` / `v_event_voters` compatibility paths
- legacy `username` compatibility paths
- legacy pageant/competition alias layer
- debug scripts and temp maintenance files
- missing runtime implementation risk in the polling respondent flow

## 1) Safe to keep active

These files are part of the current canonical or required runtime path and should remain in the live app until after full migration verification.

- `backend/src/services/participant.service.js` — canonical event enrollment service
- `backend/src/database/migrations/029_event_participant_roles.sql` — canonical participant migration
- `backend/src/services/user.service.js` — email-based account lookup service
- `backend/src/services/polling.service.js` — active polling service, but still needs verification because respondent flows are partially inconsistent
- `backend/src/services/pageant.service.js` — only keep as compatibility layer while deprecation is in progress

## 2) Safe to archive now

These are operational/debug artifacts and not active app logic.

- `archive/cleanup-archive/README.md`
- `archive/cleanup-archive/temp-scripts/`

This includes the existing temp debug scripts moved out of the backend root area earlier in this cleanup process.

## 3) Do not remove yet

These are migration-risk or compatibility-risk items and cannot be safely removed until staged validation and backup are complete.

- `backend/src/utils/constants.js`
  - still mixes old and new participant models
- `backend/src/database/migrations/001_initial_schema.sql`
  - still defines legacy username constraints and compatibility assumptions
- `backend/src/middleware/auth.js`
  - still carries username compatibility in token payload flow
- `backend/src/controllers/polling-organizer.controller.js`
  - expects respondent-handling functions to exist
- `backend/src/services/polling.service.js`
  - respondent flow must be validated before cleaning or deleting legacy paths
- `frontend/src/routes/index.jsx`
  - still exposes legacy pageant route paths
- `frontend/src/services/pageant.service.js`
  - compatibility alias still loaded through the frontend app
- `frontend/src/modules/pageant/index.js`
  - legacy alias surface still in place
- `frontend/src/layouts/PageantLayout.jsx`
  - old compatibility route container still active

## 4) Production backup gate before any deletion

This must happen before any table or compatibility path is removed.

Required backup list:

1. Full Postgres production dump
2. Schema-only dump for migration review
3. Export current users table
4. Export events table
5. Export event participants data
6. Export invitations and enrollment history
7. Git branch/tag checkpoint

Recommended minimal backup commands (to run in the real deployment environment, not in this repo):

```bash
pg_dump "$DATABASE_URL" > backup_votrix_full.sql
pg_dump --schema-only "$DATABASE_URL" > backup_votrix_schema.sql
```

Then export critical tables:

```sql
COPY users TO '/tmp/users_backup.csv' WITH CSV HEADER;
COPY events TO '/tmp/events_backup.csv' WITH CSV HEADER;
COPY event_participants TO '/tmp/event_participants_backup.csv' WITH CSV HEADER;
COPY invitations TO '/tmp/invitations_backup.csv' WITH CSV HEADER;
```

## 5) Deprecation checklist for next stage

Only after the backup gate has passed:

- mark all legacy pageant alias routes as compatibility-only
- keep legacy username fields nullable and non-primary
- keep `event_voters` and `v_event_voters` compatibility-only until zero-write verification is proven
- move any additional debug scripts into `archive/cleanup-archive/`
- remove only files that are no longer imported by the active app

## 6) Final removal gate

Final database or code deletion should only happen after all of the following are true:

- no active code references the old path
- production backup is verified
- data reconciliation is complete
- dev/staging validation passes
- rollback path exists

## Decision

Current status: archive/compatibility only, no destructive cleanup yet.
