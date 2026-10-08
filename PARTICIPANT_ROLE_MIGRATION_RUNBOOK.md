# Participant Role Migration Runbook

> **Do not run against production until a backup exists and the migration has been rehearsed on a recent database copy.** The SQL files have been added to the migration directory; this runbook describes their required order. The migrations have not been executed by this implementation.

## Migration Order

1. Pause participant-account and event-enrollment writes for the cutover window. Keep the previous app release available for recovery, but do not run old and new participant-writing app versions simultaneously.
2. Apply [083_add_participant_user_role.sql](backend/src/database/migrations/083_add_participant_user_role.sql) by itself. It adds the enum value and must commit before any later migration uses `participant`.
3. Apply [084_user_participant_type_memberships.sql](backend/src/database/migrations/084_user_participant_type_memberships.sql). It creates the memberships table and backfills it from legacy profiles and event history. It does not change user roles or event rows.
4. Run [participant_type_migration_checks.sql](backend/src/database/scripts/participant_type_migration_checks.sql). Review the event-enrollment coverage and duplicate school-ID output. Resolve any unexplained gaps before continuing.
5. Deploy the compatible backend and frontend together. The new release accepts both `voter` and `participant` accounts, reads the membership table, and uses `/participant` paths. Keep participant writes paused until every backend instance and frontend asset is on the compatible release.
6. Apply [085_convert_voter_role_to_participant.sql](backend/src/database/migrations/085_convert_voter_role_to_participant.sql). This updates existing `users.role` values in place; it does not create users or alter event records.
7. Run the verification script again. Confirm zero legacy `voter` rows and investigate any event enrollment without an active matching membership. Resume account and event operations only after login, event access, and organizer selection checks pass.
8. After a stable observation period, apply [086_drop_legacy_profile_type.sql](backend/src/database/migrations/086_drop_legacy_profile_type.sql). This final cleanup is forward-only because a single old profile value cannot represent accounts with multiple participant-type memberships. Do not apply it until all deployed code is verified to have no `profile_type` dependency.

## Existing-User Data Update

Migration 084 performs the account-to-type backfill:

- Legacy `student` profiles become Election Voter and Polling Respondent memberships.
- Legacy `judge` profiles become Competition Judge memberships.
- Existing event enrollment adds its corresponding type membership, including accounts whose old profile value was incomplete.
- The migration does not create, merge, or delete `users` rows. The normalized email/account remains the same.

Migration 085 changes the global role for existing participant accounts:

```sql
UPDATE users
SET role = 'participant'
WHERE role = 'voter';
```

Run that statement only after compatible application code is deployed. It is already included transactionally in migration 085.

## Verification and Recovery

- Rehearse the full order, including the 086 duplicate-school-ID guard, on a recent database copy.
- Compare membership counts to known voter, judge, and respondent pools before resuming organizer operations.
- Test an account assigned multiple types: it should have one `users` row and multiple `user_participant_types` rows.
- Confirm an account must still be enrolled in `event_participants` to access a specific event.
- Confirm removing one type membership leaves the account, other memberships, and event history intact.
- Never delete or rewrite event enrollments, votes, poll answers, judge assignments, scores, or audit records as part of rollback.

## Rollback Order

Use the down migrations only with participant writes paused and after preparing the old application release. Apply them in reverse order:

1. [086_down_drop_legacy_profile_type.sql](backend/src/database/migrations/086_down_drop_legacy_profile_type.sql) restores `profile_type` and its old indexes from memberships.
2. [085_down_convert_voter_role_to_participant.sql](backend/src/database/migrations/085_down_convert_voter_role_to_participant.sql) converts `participant` roles back to `voter`.
3. [084_down_user_participant_type_memberships.sql](backend/src/database/migrations/084_down_user_participant_type_memberships.sql) checks representability, restores any missing legacy profile values, then removes the membership table.
4. [083_down_add_participant_user_role.sql](backend/src/database/migrations/083_down_add_participant_user_role.sql) rebuilds the PostgreSQL enum without `participant`. It aborts if any participant role rows remain.
5. Deploy the old application release only after all four downs succeed.

The 086 and 084 downs intentionally abort if any account has both Competition Judge and Election Voter/Polling Respondent memberships, because the old exclusive `profile_type` cannot represent that combination. If a guard aborts, do not bypass it or drop the membership table; keep the compatible application and repair forward, or restore a coordinated pre-cutover database-and-application backup. PostgreSQL enum labels cannot be removed directly; 083 down rebuilds the enum and therefore must be the final SQL rollback step.

## Manual Preflight for Final Cleanup

Migration 086 checks this condition and aborts without changing the schema if it fails. To inspect collisions before applying it:

```sql
SELECT lower(school_id) AS normalized_school_id,
       ARRAY_AGG(email ORDER BY email) AS emails,
       COUNT(*) AS account_count
FROM users
WHERE role::text IN ('voter', 'participant')
  AND school_id IS NOT NULL
GROUP BY lower(school_id)
HAVING COUNT(*) > 1;
```

Resolve duplicate IDs by correcting profile data, not by merging accounts. Email remains the canonical account identity.
