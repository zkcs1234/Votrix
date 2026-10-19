# Competition release recovery runbook

Status: local rehearsal passed; **production recovery BLOCKED**. This runbook grants no permission to restore or migrate production.

## Required inventory and ownership

The database/operations owner must record the real provider/project, backup mechanism and backup ID/time, encryption/access controls, retention/PITR horizon, restore destination, operator and approval. Supply numeric **RPO** (maximum accepted loss of acknowledged work) and **RTO** (maximum outage including validation/application recovery), with explicit signoff. None is currently established; local restore seconds are not production targets.

Cover every deployed schema and module: election votes/eligibility/results, polling questions/responses, events/enrollments/accounts/sessions, legacy score/lock/submission/deduction/calculation/rule/result history, native identities/memberships/rules/sessions/drafts/submissions/current heads/decisions/calculations/transitions/qualifications/publications/audit, migration ledger, indexes/constraints/triggers/functions/RLS/grants. Inventory database roles/provider-managed auth/storage separately. A database dump alone does not recover Cloudinary/storage images, signing/configuration secrets or roles into another cluster.

## Safe rehearsal before release

1. Obtain an explicitly approved **isolated** restore environment and a consistent, protected backup. Verify the resolved host/project/database/directory differs from production. No destructive production restore.
2. Keep application workers, schedulers, outgoing mail, uploads and public publishing disabled. Synthetic accounts only until the recovery operator approves sensitive data access.
3. Restore using the provider-supported procedure or reviewed PostgreSQL tools. Establish required roles/extensions through the approved platform procedure; do not blindly replay global-role/password SQL into a hosted cluster.
4. Compare lossless per-table row hashes/counts and critical historical IDs/values/locks/timestamps against the backup manifest, including election/polling. Verify exact catalog definitions, FK validation, indexes, triggers, SECURITY DEFINER ownership/search paths, RLS/ACLs and private helper denial. Verify native head→submission and publication lineage relationships.
5. Run real isolated-account acceptance against the restored application: cookie/session/CSRF authorization, complete/partial sheets, corrected head absence despite historical rows, stale calculation/deduction/qualification rejection, independent review, immutable result/publication versions, export/privacy rules and legacy/election/polling regressions. Never recompute history to make reconciliation match.
6. Record backup snapshot time, loss horizon, dump/restore/validation/application recovery durations, discrepancies, assets/roles scope and signatures. Accept only when approved RPO/RTO and all reconciliation criteria are met.

## Incident / rollback boundaries

For a UI/API problem, disable the affected native feature gates and pause the operational workflow through approved controls. Retain child ambiguity protection, qualified-roster/current-source guards and all additive/immutable data. Do not replay 103/104/105 over later definitions or execute destructive down migrations. A previous published snapshot remains unchanged until its owner explicitly withdraws/replaces it under the normal audited policy.

For suspected data loss/corruption, preserve incident evidence, stop separately authorized writes, identify the last consistent backup/WAL point and any acknowledged work after it, and restore to isolation first. Release/database owners must approve recovery/cutover and reconcile newer submissions/audit/publication records. Do not fabricate current heads, overwrite a frozen rule, rerun historical calculations, automatically merge conflicting snapshots or silently replace results.

## Local proof and limits

`test-competition-phase7-recovery.mjs` restores the forward-chain local fixture. `test-competition-phase7-populated-restore.mjs` restores the populated Phase 6 workspace fixture into a fresh localhost database and matches all 49 public-table hashes and inspected competition definitions/ACLs. Both verify the workspace cluster data directory before writing; neither loads `.env` or uses Supabase.

These local fixtures lack election/polling tables and full deployed account/provider schemas. Global roles/external assets are not backed up. Production mechanism, retention, RPO/RTO and complete recovery remain unresolved.
