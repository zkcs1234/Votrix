# Foundation (Phase 9)

The `foundation/` directory is a **shared, module-agnostic infrastructure
layer** that removes cross-cutting duplication without merging the
Election, Competition Scoring, and Polling modules.

## Boundaries

* Foundation never imports from `services/*.js` (other than the existing
  utility files in `utils/`).
* Foundation never reaches into another module's tables. It only knows
  about the cross-cutting tables: `organizations`, `events`,
  `audit_logs`, `notifications`, `users`.
* Each module service remains the source of truth for its own domain
  entities and business rules.

## What foundation owns

| Concern            | Helper                                  |
|--------------------|-----------------------------------------|
| DB access          | `db()`, `wrap()`                        |
| HTTP errors        | `errors.{badRequest,forbidden,...}`     |
| Pagination         | `parsePagination`, `buildRange`         |
| Filtering          | `applyTextSearch`, `applyIn`, `applyEq` |
| Audit log          | `recordAudit`, `listAuditTrail`         |
| Event activity     | `recordEventActivity`                   |
| Mappers            | `mapOrganization`, `mapEvent`, ...      |
| Generic CRUD       | `BaseRepository`                        |
| Response envelope  | `ok`, `created`, `asyncHandler`         |

## What foundation does NOT do

* It does not replace the existing `event.service.js`, `election.service.js`,
  `pageant.service.js` or `polling.service.js`. Those still own their
  domain logic.
* It does not introduce a shared `Event` table that mixes module data.
  `events` stays a single metadata container, and module-specific fields
  (e.g. `election_votes`, `competition_scores`, `poll_submissions`) stay
  in their own tables.
* It does not change API contracts, route paths, or migration history.

## Adoption strategy

* New code uses foundation helpers by default.
* Existing module services can migrate to `db()` / `wrap()` / `map*`
  helpers opportunistically; behaviour is preserved.
* The audit-log helper unifies the existing `createAuditLog` in
  `admin.service.js`. Both entry points keep working; new code uses
  `recordAudit`.
