# VOTRIX Contestants & Entries and Advancement

**Subsequent correction:** [Final round progression fix](VOTRIX_FINAL_ROUND_PROGRESSION_FIX.md) separates No Elimination from qualification: a qualification-purpose round with `advancementType='none'` now lets eligible source entries continue without a qualification decision. The corrected navigation and forward migration 099 are documented there. The original implementation record below is retained.

Implemented October 12, 2026. Registration, initial-round assignment, and confirmed advancement now have separate controls and records. Scoring arithmetic in `shared/competition-calculation.js` is unchanged.

## Page and navigation

The page, competition sidebar, event stepper, and workspace continuation now use **Contestants & Entries**. The subtitle is “Register participants, manage competition entries, and prepare round assignments.” Database names, public API paths, and internal contestant IDs remain the same.

Registration sits alongside Round Participation on wide screens and above it on smaller screens. The records use a compact desktop table and readable mobile rows, with entry number, name/type, configured division where enabled, initial assignment, qualification status, assigned rounds, and available Edit/Delete controls.

## Entry types and divisions

| Displayed type | Existing backend value | Name field |
|---|---|---|
| Individual | `individual` | Contestant full name |
| Pair / Duo | `duo` | Entry or group name |
| Team / Group | `group` | Entry or group name |
| Other | `other` | Entry or group name |

Labels and placeholders change with the selected type. Existing entries with no stored type retain that value during editing unless the organizer explicitly chooses a type. Description, division, and photo are preserved when omitted from an update. Unsupported type values are rejected before persistence.

Disabled divisions hide the selector and use neutral rows. Enabled divisions use the actual configured names and require a valid selection. New entries cannot select inactive or foreign-event divisions. An existing inactive division can be retained while editing the same registration; it is not silently reassigned. Changing a registered division must respect saved round scope. Publication checks that enabled divisions have valid registered entry associations.

## Registration and assignment

Registering an entry creates its contestant record and optional photo. It does not assign any round or establish qualification.

**Initial Round Assignment** shows the first saved round, registration count, assignment count, and selection controls. Assign Selected and Remove Selected operate on explicitly selected rows. Division filtering does not automatically assign all visible entries. Existing incompatible ordinary assignments can be removed before adjusting registration.

Single-round competitions support normal initial assignment. Events without rounds use the event-wide field. Other ordinary rounds retain explicit selection when no qualification rule protects them.

There is no existing explicit automatic first-round assignment setting. This change therefore keeps registration and assignment explicit and adds no automatic assignment to either the first round or every round.

## Protected qualification rounds

A later round is protected when a preceding round uses a qualification purpose or an elimination/manual advancement rule and points to it. The existing explicit next-round ID takes precedence; otherwise the saved display order supplies the destination. Publication rejects ambiguous multiple qualification sources and validates future judge coverage against potential qualifiers while allowing the future roster to remain empty.

Before confirmation, the page displays **Awaiting qualification**. Existing planned memberships remain stored and viewable but do not make official finalists. Ordinary assignment/removal controls are absent. View Advancement Rules opens the source round's saved advancement settings.

After confirmation, the roster uses `competition_advancement_decisions.qualifiers` for the current rules version and source round. The page shows Finalist, Qualified / Advanced, or Approved manual qualifier as applicable, alongside the calculation source and rules reference. Eligible initial participants excluded by the decision show Eliminated and retain their registrations and earlier memberships. Approved existing eligibility decisions show Withdrawn / Non-competing without introducing new contestant status values.

The backend and PostgreSQL reject ordinary direct membership changes to protected rounds. Protected round activation, draft saving, criterion locking, and score projection also check confirmed qualification. A registered or formerly planned entry cannot score in Final without inclusion in the approved decision.

## Verified advancement and manual qualification

Advancement requires a current verified round calculation, organizer ownership, current published rules, valid source versions, resolved pending decisions, and the saved next-round destination. Confirmation replaces the destination membership through the existing authorized advancement operation and records an audit.

Top N retains the existing cutoff-tie policy. For ranks `1, 2, 3, 4, 5, 5, 7`, Top 5 approves six entries. The database rejects a supplied qualifier set that removes that tie or adds an exception to an automatic rule.

Manual selection uses the existing published `advancementType='manual'` rule. It requires eligible entries from a verified source, a recorded reason, and organizer confirmation. With manual official scoring, an appointed independent reviewer verifies the recorded placement snapshot before the organizer confirms the qualifiers. New decisions record `selection_basis='manual'` and their automatic qualifier set separately, distinguishing them from automatic qualifiers.

Arbitrary pre-result seeding is unavailable: registration and ordinary membership endpoints cannot seed a protected Final. Numeric automatic rules do not grant an implicit exception permission. The supported manual route is the explicitly published manual qualification procedure using verified results, including independently approved manual placements.

Score corrections retain the existing requirement for an authorized advancement amendment once a decision is confirmed. This change does not silently revise a decision, erase submission history, or rewrite calculated, finalized, or published snapshots.

## Backend and migration changes

Public routes remain unchanged. Existing membership POST/DELETE handlers now call the atomic, owner-checked `competition_set_round_membership` RPC. Missing migration support returns an error instead of falling back to unchecked table writes.

Foundation reads include mapped entry types/descriptions and advancement/eligibility history. Contestant and membership reads gather complete pages. Publication includes a canonical registration/round source, checked under the event lock so a concurrent roster or advancement-rule change cannot pass stale validation.

New migration: [096_competition_participation_guards.sql](backend/src/database/migrations/096_competition_participation_guards.sql).

It adds nullable advancement provenance columns, qualification helpers, atomic membership writes, registration/history triggers, protected score/session triggers, guarded publication/scoring wrappers, and stricter advancement confirmation. Previous wrapped functions lose direct service-role execute permission. The migration retains existing rows and leaves old provenance unknown rather than inventing historical approvals.

**Supabase rollout is still required.** Ensure forward migrations through 095 are present, then run the complete 096 file once in the Supabase SQL Editor. Restart the backend and refresh the frontend afterward. No connected Supabase changes were made during this task. The migration was applied and exercised only in newly created databases on the isolated local PostgreSQL test cluster.

## Validation

- Backend suite: **439 passed, 3 skipped**.
- Frontend suite: **148 passed**. The full run set `VITE_LOCK_PARTICIPANTS_ON_ACTIVE=true` for the existing lifecycle tests; the saved environment file was unchanged.
- Frontend production build passed. The existing bundle-size warning remains.
- Frontend lint passed with three existing unused-disable warnings in `useDelayedLoading.js`.
- PostgreSQL integration checks passed for historical planned memberships, owner authorization, direct protected membership rejection, stale publication, unqualified score rejection, approved Top 5 with a cutoff tie, eligible Final scoring, correction restrictions, historical record preservation, actual division eligibility, and manual qualification through the independent verification RPC.
- Browser fixtures rendered the actual organizer layout at 1536, 1280, 1024, 768, and 390 pixels. Initial, awaiting, and confirmed rosters, group/no-division labels, and manual provenance passed checks for page overflow and nested vertical scrolling. No live API requests or runtime exceptions occurred. The existing collapsed-sidebar nested-link warning remains.

New and updated tests cover all four entry types, custom/disabled divisions, single-round assignment, registration without automatic assignment, selected-row operations, protected planned rosters, confirmed qualifiers and eliminated records, failure recovery, deep links to advancement settings, future-roster publication, allowed manual selection, and rejected automatic-rule exceptions.

Run unit/UI checks from their package directories with `npm test`. The separate PostgreSQL check is `node backend/scripts/test-competition-participation.mjs` from the repository root; it requires a local PostgreSQL server, defaults to localhost port 55439, and creates an isolated test database. Its fixture SQL must never be pasted into Supabase.
