# Security, authorization and database validation

Updated October13,2026. **The configured Supabase project was not mutated or inspected for SQL grants.** Database acceptance used only a runner that fixes127.0.0.1:55439, checks the workspace data directory, and permits named disposable test databases. Tests do not read `.env` or send mail/media.

## Implemented boundaries

- Organizer parent ownership plus nested event checks for round/criterion/category/division/contestant/next-round references; mutation/removal cannot target another draft event.
-100 same-event relation preflight and direct SQL guards include setup memberships, score/participant/session/rules/calculation links. Existing inconsistencies abort rather than rewriting history.
- Cookie-only authentication and CSRF retained; exact HTTP/WS Origin allowlist rejects unrelated provider tenants. Explicit application/preview origins must be configured through primary and additional origin lists.
- Authorized room admission remains event/actor scoped. Progress and unpublished result hints go only to owner/appointed reviewer; no raw values or totals are trusted from messages.
- Required account/enrollment/assignment/qualification/context/gate validation remains on the scoring RPC. Real SQL tests deny stale/closed/unqualified writes and preserve transactional rollback.
- Setup and scoring input revisions serialize mutation/freeze/approval/publication. Immutable rule/source-history/calculation payloads and source identity remain protected.
-102 owner-scoped stable UUID Create returns its original event on retries, rejects changed details/foreign ownership, and keeps request records private. Missing migration reports503; authorization/conflict/validation statuses are explicit.
- Safe CSV text literals and allowlisted ordinary judge **published overall only** results prevent accidental unpublished/private worksheet exposure.

## Additive migrations and rollout dependencies

| File | Purpose | Verified local evidence | Deployment requirement |
|---|---|---|---|
| [100_competition_atomic_integrity.sql](../../../backend/src/database/migrations/100_competition_atomic_integrity.sql) | Full governing setup/input revisions, locked publication/advancement comparison, immutable source identity, cross-event checks and atomic division order | Installed after099 on a clone with existing history; stale/race/relationship tests and unchanged payload checks | Review existing-link preflight and apply in a controlled isolated rollout first. Required by new freeze/calculation paths. |
| [101_competition_private_access.sql](../../../backend/src/database/migrations/101_competition_private_access.sql) | RLS and direct public/anon/authenticated restrictions for12 private tables plus active-session view; service-role API retained | Actual local grants inventory before/after; API roles denied, service role readable | **Inspect actual deployed grants, policies, role inheritance and view/function exposure first.** Migration was not applied to Supabase. |
| [102_competition_creation_idempotency.sql](../../../backend/src/database/migrations/102_competition_creation_idempotency.sql) | Atomic retry-safe competition creation and private request identity/payload | Identical retry returned original; changed/foreign create denied; request table direct access denied | Required by current create wizard; review metadata/ownership fields. No silent unsafe fallback if missing. |

Already-applied087–099 were not edited/replayed in production. New100 wrappers leave older implementations private; callers cannot use them through service-role EXECUTE grants to bypass current checks. Historical unpublished snapshots without revision metadata are retained but must be recalculated/reverified before transition. Published snapshots are not rewritten or automatically recalculated.

Before release run the parent test plan's read-only pg_class/pg_policies/table grants/function grants/constraint diagnostics on the intended project. Check sensitive score/JSON/result/decision/history tables, views, privileged function search_path/EXECUTE and actual service-role bypass behavior; role memberships can grant access beyond direct ACLs. Repository/local restrictions do not prove deployed direct PostgREST isolation.

## Limits and approved policy

Ordinary judges may see published final results only, explicitly approved by the user. They remain unable to obtain reviewer APIs or other judges' private/unpublished data through the new endpoint; enrollment validation precedes published read and response uses an allowlist. Head-judge metadata does not become organizer ownership. Independent reviewer approval is not bypassed for manual results.

No new recusal/no-show/special rules, public spectator route or general structural revision policy was guessed. Deployment topology is unknown. Real cookies, two-account IDOR/direct REST checks and actual instance/WS ingress must be tested before production readiness can be claimed.
