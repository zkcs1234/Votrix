# Migration and system-process audit, 001–114

The migration chain is **not entirely correct**. A clean installation fails in four forward files under the documented filename order. The completed schema also permits three competition workflow defects. Migration 028 can delete historical events during organization consolidation. These conclusions come from new PostgreSQL reproductions, not just filename inspection.

No existing migration or application file was changed by this audit. No hosted database was contacted. Only diagnostic scripts, fixtures and this report were added.

## Scope and evidence

The directory contains **145 SQL files: 95 forward files and 50 rollback files**, rather than 114 forward migrations. Every file was inventoried and hashed. Every forward file was executed against a fresh synthetic database in the verified localhost PostgreSQL 18 cluster, with raw filename order attempted first. Four failures were recorded, then repaired only in that disposable database to allow examination of the remaining chain. The separate 038 dependency file was executed before retrying the failed division migration.

The final successful replay used `votrix_migration_audit_1792038295890` on loopback port 55440. The cluster data directory and existing local identity nonce were verified before creating it. It has 73 application tables, 10 views and 152 public-schema functions, including extension functions. The original local application database was not modified.

Evidence is in [replay.json](replay.json). [INVENTORY.md](INVENTORY.md) records every forward and rollback file, checksums and execution coverage. The runner is [audit-migration-chain-local.mjs](../../backend/scripts/audit-migration-chain-local.mjs).

The two existing rollback-only creation and pageant fixtures passed against this independently replayed schema. Six additional diagnostic reproductions confirmed the findings below. Diagnostic success means the defect was reproduced; it does not mean the behavior is acceptable.

The 50 rollback files were inspected and inventoried, but were not all executed. Applying rollback files to the final schema would not be a valid test of each file's intended historical starting point. PostgreSQL 15, a populated production upgrade, every historical data combination, and concurrent stress scenarios were not tested here. No conclusion about the deployed project's actual ACLs or migration ledger is claimed.

## Confirmed installation defects

| Priority | File | Failure and consequence | Correction needed |
| --- | --- | --- | --- |
| High | [011](../../backend/src/database/migrations/011_rename_pageant_to_competition_scoring.sql#L102) | `ALTER TRIGGER IF EXISTS` is invalid PostgreSQL syntax. The transaction aborts before the rename completes. | Use a catalog-guarded trigger rename, or valid unconditional renames for the defined baseline. |
| High | [030 event information schema](../../backend/src/database/migrations/030_event_information_form_schema.sql#L31) | A trailing `</｜ruby\|tool_calls>` fragment is not SQL. With psql the preceding `COMMIT` already succeeded, but the command reports failure. This can leave the schema changed without a successful migration record. | Remove the non-SQL fragment from the reviewed fresh-install source. |
| High | [038 divisions](../../backend/src/database/migrations/038_competition_divisions.sql#L123) | It indexes `competition_scores.event_id` before that column exists. The companion `038_fix_competition_tables_event_id.sql` sorts after it, contradicting the database README's filename-order instructions. | Put the companion dependency before the division migration in an explicit manifest. |
| High | [039](../../backend/src/database/migrations/039_per_division_contestant_number.sql#L29) | It drops the old constraint name, then attempts to drop an index owned by the renamed `competition_contestants_number_unique` constraint. PostgreSQL rejects that operation. | Drop the actual renamed constraint first, then establish the replacement per-division indexes. |

The previous local foundation launcher already used three source overlays and a 038 ordering exception. Its success therefore did not establish that the repository's raw historical files were executable. This audit reproduced those exceptions independently. Removing only the invalid trigger syntax was sufficient for 011 on PostgreSQL 18; no enum-commit error was reproduced in this file. Its comment about enum commits should not be confused with evidence of an additional failure.

## Confirmed data-loss defect

**Migration 028 deletes duplicate organizations without moving their events.** [028, line 58](../../backend/src/database/migrations/028_single_organization_per_organizer.sql#L58) keeps the earliest organization and deletes the others. [001, line 113](../../backend/src/database/migrations/001_initial_schema.sql#L113) defines `events.organization_id` with `ON DELETE CASCADE`.

The replay seeded one organizer with two organizations and an event under the second organization immediately before 028. After executing 028, that event no longer existed. This is particularly relevant to the former organization-per-module design, where multiple organizations for one organizer were legitimate records. Other cascading event data can be lost with those events. The down script restores columns and constraints; it does not restore deleted organizations or events.

An upgrade must consolidate the organizer's events and other organization references onto the retained organization before deleting duplicate containers. Already-deleted data requires a backup or other historical source; a new migration cannot reconstruct it automatically.

## Confirmed competition process defects

### Live Control can precede event-wide Review & Create

[104](../../backend/src/database/migrations/104_competition_scoped_rules.sql#L228) exposes individual child freezing. The HTTP route remains available at `/:competitionId/rules/freeze`. [105](../../backend/src/database/migrations/105_competition_scoped_scoring.sql#L131) permits starting a child session when its own rules are current and the event is draft or active. It does not require the creation-completion marker added by 110.

The [reproduction](live-before-review.sql) configured one child, left a second child unconfigured, froze the first child and started its session. The returned session was active while `competition_created_at` remained NULL. Ownership and scoring scope were still enforced; the failure is enforcement of the requested setup sequence.

The atomic 110 completion RPC correctly rolls back partial freezes when that RPC is used. It does not prevent bypass through the older individual-freeze/live route. New-flow events need a server-side completion requirement on live/scoring operations, with an explicit compatibility policy for events created before 110.

### Parent details changed after review are accepted

[110 completion](../../backend/src/database/migrations/110_competition_creation_flow.sql#L41) compares the reviewed child IDs and their setup/input revisions. It does not compare a reviewed parent revision or parent snapshot. Parent metadata changes do not change each child's revision.

The [reproduction](stale-parent-review.sql) captured valid child review tokens, changed the event title, and completed creation using those same tokens. The changed title was accepted and frozen. Changes made after completion are blocked correctly; changes between loading review and submitting completion are not detected.

Review submission needs a parent revision or fingerprint covering all reviewed fields, including branding, compared inside the same transaction. Simply adding the existing parent revision token is insufficient unless that revision also covers every reviewed field; the existing event revision function does not include banner changes.

### Restoring a suspended judge does not restore operation

[104 dependency triggers](../../backend/src/database/migrations/104_competition_scoped_rules.sql#L88) increment child input revisions when an assigned judge's account/enrollment changes. [105](../../backend/src/database/migrations/105_competition_scoped_scoring.sql#L76) rejects stale frozen revisions. The standard authority used by the freeze function rejects a child with an existing official rule version.

The [reproduction](frozen-account-recovery.sql) completed creation, suspended the assigned judge, then restored the same account to active. The scoring context still failed with `CURRENT_FROZEN_RULES_REQUIRED`; freezing again failed with `CHILD_RULES_FROZEN`.

Invalidating access on suspension is appropriate. The process is incomplete because restoration has no ordinary recovery path. The same dependency design needs review for entrant metadata changes. Recovery should be an explicit audited operation that validates current identities and accounts for existing submissions, calculations and publications. Historical frozen rules and scores must remain immutable.

## Database integrity and access findings

**Polling invariants are implemented chiefly in the HTTP service, not the database RPC.** [060](../../backend/src/database/migrations/060_poll_cast_response_rpc.sql#L38) trusts `p_allow_multiple`, and inserts the supplied question IDs without checking that they belong to the submitted event. The [diagnostic](polling-database-boundaries.sql) accepted a response to a different event's question, accepted multiple submissions for a saved single-submission draft poll when the argument was true, and accepted the draft event itself.

The current polling service checks event availability and builds answers from that event's validated questions. These reproductions called the database boundary directly; they do not prove that a normal HTTP caller can bypass those checks. Moving the saved policy, event-state and question-scope checks into the atomic RPC protects against future callers and changes between service validation and commit.

**Participant foreign keys do not fully establish polling identity.** 062 references only `event_participants.id`; 064 fills that ID only if the caller leaves it NULL; 065 requires non-NULL. The diagnostic inserted a poll submission for event A with an explicit participant ID from event B. It passed. The claimed enrollment protection therefore needs a composite event/participant relationship and a user/type identity check. The native competition tables use substantially stronger scoped keys and relation guards; this polling finding should not be generalized to them.

**ACL coverage remains conditional and incomplete.** The final replay has 38 tables without RLS, including `users`, `password_reset_tokens`, `user_sessions`, event drafts, enrollment and polling/election tables. In this scratch database, anon has no SELECT grant on those tables. Absence of RLS alone does not establish a deployed exposure. However, the migrations do not establish a complete backend-only access policy for them; inherited provider grants must be inventoried.

101 protects private competition base tables and `v_competition_active_session`, but omits the `judge_scores` compatibility view created in 011. That view uses the owner's underlying permissions. The [grant simulation](legacy-view-grant-boundary.sql) granted anon access to the view within a rollback transaction and read a synthetic score despite the base table's RLS and revoked anon access. This demonstrates a gap **if the deployed view retains such a grant**; it is not a claim that the hosted view currently has one. Review legacy views along with tables, then revoke browser-role access consistently or use suitable invoker views and policies.

Native mutation RPCs inspected in the final catalog are not executable by anon/authenticated. The publicly executable SECURITY DEFINER functions remaining in this replay are trigger functions, not ordinary exposed mutation RPCs. They were not classified as an authentication bypass merely because of their ACL entries.

## Ordering, upgrades and rollback

- Both `_down_` and `_down.sql` filename patterns exist. A runner must exclude both. The README mentions only the former pattern. Never execute every SQL file in this directory as a forward chain.
- Forward numbers 030, 031, 038, 059 and 080 have multiple files. A ledger keyed only by numeric prefix would skip legitimate migrations. Use complete filenames and checksums.
- Numbers 024–026, 042–054 and 069–070 have no files. Gaps are not independently a defect and do not justify inventing migrations. Some other numbers identify rollback files only.
- 28 forward files have no explicit BEGIN/COMMIT pair. This does not make their SQL intrinsically invalid, but failure/retry behavior depends on the executor. Do not blindly wrap enum additions and immediate enum use in one transaction; use a reviewed manifest with appropriate boundaries.
- Several CREATE TABLE/CREATE TRIGGER statements are intentionally one-time operations. Replaying the entire chain on an existing database is not a supported upgrade. Historical files can also refer to columns later removed. The local development ledger is not a verified production migration ledger.
- [012 rollback](../../backend/src/database/migrations/012_down_rename_pageant_to_competition_scoring.sql#L45) contains the same invalid `ALTER TRIGGER IF EXISTS` syntax as 011. This is a source-confirmed rollback defect.
- 071 rollback attempts to restore one score per major criterion before collapsing multiple minor scores. A populated minor-scored event can violate that uniqueness. A valid rollback needs a defined conversion policy or an explicit guard; it cannot promise lossless conversion.
- 068 intentionally removes awards tables; its down migration recreates structure, not deleted award records. 086 explicitly guards an ambiguous restoration of exclusive profile types. These require data-aware rollback decisions.
- 087–114 have no matching rollback files in this directory. Prefer tested forward corrections and backup/restore procedures over an assumption that each migration can simply be undone.

## What the tested chain does correctly

After the four scratch-only installation repairs, the entire forward chain executed through 114. The resulting catalog had no unvalidated constraints. Canonical enrollment repairs, participant autofill, scoped child identities, immutable scoring sources, explicit reviewer/finalization records and separate publication records are present.

The existing SQL fixtures confirmed weighted minor configuration, independent memberships, isolated draft removal, all-child completion rollback, unchanged completion retry, named pageant rounds, numeric rank carry configuration, and rejection of incompatible earlier placement carry and rank thresholds. These are valuable protections. They do not resolve the separately reproduced order, recovery and parent-review defects.

The legacy event-wide and native child workflows coexist deliberately. Their coexistence is not itself a schema error. Route selection, feature flags and server-enforced lifecycle boundaries must ensure a new-flow event cannot accidentally use an older operation to bypass its required setup steps.

## Recommended correction order

1. Correct the reviewed fresh-install manifest and the 011/030/039 source defects; document the 038 prerequisite. Preserve the meaning of already-applied production records rather than blindly re-running edited historical files.
2. Replace 028's destructive consolidation for databases that have not applied it. Investigate existing data with read-only counts and backups before any upgrade.
3. Add forward corrections for mandatory native creation completion before live operation and for parent review version checks.
4. Add and test an audited frozen-configuration recovery/amendment workflow, including restored judges and existing score history.
5. Harden the polling RPC and participant identity constraints, and inventory all table/view/function grants on the actual deployment target.
6. Establish a filename/checksum migration ledger and separate fresh-install, populated-upgrade and restore tests.

The deployed database remains unassessed. Passing migration 114 or passing the existing application tests is not sufficient evidence that the complete historical migration chain or every system transition is correct.
