# Plan: Participant Role and Independent Participant-Type Memberships

> **Status:** Application code implemented and verified. Database migrations are staged but have not been executed; production cutover remains pending.
> **Scope:** Rename the global `voter` role to `participant`, allow one account to be in multiple participant-type pools, retain separate admin management for Election Voters, Competition Judges, and Polling Respondents, and preserve event-scoped authorization.
> **Relationship to existing plan:** This plan supersedes the exclusive `student`/`judge` profile model and the disjoint-pool rules (D6/D7) in [VOTER_PROFILE_AND_ADMIN_REGISTRATION_PLAN.md](VOTER_PROFILE_AND_ADMIN_REGISTRATION_PLAN.md). Other implemented decisions in that plan remain unchanged unless called out here.

---

## 1. Agreed Decisions

| Area                           | Decision                                                                                                                                                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global account role            | Use `participant` for the global participant account role; retain `admin` and `organizer`.                                                                                                                                        |
| Event participant types        | Keep the existing types: `ELECTION_VOTER`, `COMPETITION_JUDGE`, and `POLLING_RESPONDENT`.                                                                                                                                         |
| Admin experience               | Keep three distinct participant management areas. Do not merge the types into one list and do not use `Student` as a participant category.                                                                                        |
| Account identity               | One person has one user account. Adding a type to an existing email adds that type membership to the same account.                                                                                                                |
| Multiple types                 | A participant account may belong to any combination of the three type pools. A person's actual role in an event is determined by that event's enrollment.                                                                         |
| Contestants                    | Contestants remain event records, not user accounts or participant types. No account-level contestant role is introduced.                                                                                                         |
| Event access                   | `event_participants` remains the canonical source for event enrollment and event-specific access checks. Pool membership alone never enrolls a person in an event.                                                                |
| Shared profile data            | Name, email, and applicable school/program/year-section fields belong to the shared account profile. Judge-specific qualifications remain available as judge profile data. Do not duplicate the account to store different types. |
| Existing information-form work | This plan does not restore or redesign the information form removed by the existing participant-profile plan.                                                                                                                     |

### Admin terminology

Use separate list headings and filters: **Election Voters**, **Competition Judges**, and **Polling Respondents**. A person who belongs to multiple pools appears in each applicable list, backed by the same account. Use field labels such as **School ID**, **Program**, and **Year & Section** where relevant; do not label the account or a pool as `Student`.

---

## 2. Current-State Findings

- The global `user_role` enum and `USER_ROLES` constant currently use `voter` for participant accounts.
- `event_participants.participant_type` already represents the three event-scoped participant types.
- Migration 075 added a single `users.profile_type` value of `student` or `judge`. That column is mutually exclusive and is used as a pool discriminator.
- Admin user management currently has separate Voters and Judges panels; there is no distinct Polling Respondents account pool.
- Student accounts are used for election and polling cohorts, while the competition judge pool queries judge-profile accounts only. Existing registration/enrollment code contains guards that reject crossing those profile types.
- Participant-facing routes, APIs, page names, and role guards still use `voter` terminology, including judge scoring routes under the voter API namespace.
- `event_participants` has a unique `(event_id, user_id)` constraint. An account is enrolled once per event, with the participant type appropriate to that event.

**Implementation hypothesis:** the single `profile_type` discriminator and the corresponding query/enrollment guards are the root cause of the exclusive voter-versus-judge pools. The current code and migration comments confirm that; the new model should replace pool eligibility with independent user-to-type memberships, not alter event enrollment semantics.

---

## 3. Target Data Model

### 3.1 Global role

Change the participant account role from `voter` to `participant` throughout database-backed role checks, API identity payloads, authentication, route guards, and UI labels. The role answers **what broad class of account this is**; it does not grant access to a particular event action.

During rollout, application code must temporarily recognize both `voter` (legacy) and `participant` as participant accounts. Do not deploy code that rejects old role values while old rows, tokens, or application instances may still contain them.

### 3.2 Independent type memberships

Add a normalized table, tentatively `user_participant_types`, with:

| Column                     | Purpose                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `user_id`                  | FK to `users.id`, cascading on account deletion.                                                            |
| `participant_type`         | One of the existing participant types: `ELECTION_VOTER`, `COMPETITION_JUDGE`, or `POLLING_RESPONDENT`.      |
| `created_at`, `updated_at` | Membership lifecycle timestamps.                                                                            |
| `created_by`               | Optional admin/audit actor reference, subject to existing audit conventions.                                |
| `is_active` or equivalent  | Optional reversible pool eligibility control; decide in Phase 0 whether account status alone is sufficient. |

Use a primary key or unique constraint on `(user_id, participant_type)`. This permits one account to belong to multiple pools while preventing duplicate membership rows. Reuse the existing participant-type vocabulary where practical; do not introduce `STUDENT` as a type.

### 3.3 Shared account profile and judge details

- Keep one `users` row for one login identity. Email remains the canonical account deduplication key.
- Keep common identity and school fields on the shared profile (for example, first name, last name, school ID, program, and year/section). Changes made in one type management area are visible in the other areas because these are shared account facts.
- Keep judge-specific information such as title, affiliation, and expertise in the existing `profile_data` structure or a dedicated judge-profile table if validation/query requirements justify normalization. Do not make judge status mutually exclusive with academic fields.
- Before changing school-ID uniqueness, inspect existing data and confirm whether school IDs are globally unique. Do not silently merge accounts based on school ID; email remains the account key. Flag conflicting school IDs for admin review.
- Deprecate `users.profile_type` only after all readers/writers have moved to membership queries and the membership backfill is reconciled. Retain its data during the compatibility window.

### 3.4 Event enrollment remains separate

`event_participants` continues to record actual event enrollment, completion flags, event metadata, and the event-specific participant type. A participant-type membership means the account is eligible/managed in that admin pool; it does **not** enroll the account in an event.

For the normal event model, each event's kind determines the participant type used at enrollment. Keep the existing `(event_id, user_id)` uniqueness rule unless a later requirement demonstrates that one user must hold multiple participant types within the same event. Membership removal must not silently delete event history or ballots.

---

## 4. Admin and Organizer Behavior

### 4.1 Admin user management

Retain separate areas for **Election Voters**, **Competition Judges**, and **Polling Respondents** (alongside Organizers). Each type area has its own list, search, status controls, import template, and type-appropriate fields/actions.

- A person in two pools is shown in both lists, with the same account identity and account status.
- Creating or importing an email already in `users` updates permitted shared profile fields and adds/updates the requested type membership; it never creates another user or resets the password.
- Imports must have a preview that reports: matched existing accounts, new accounts, memberships to add, shared-field changes, validation failures, and conflicts requiring review.
- Do not silently overwrite conflicting shared profile fields from a second type import. Show the old and proposed values and require an explicit policy/confirmation.
- Account suspension applies to every type and event. Removing one type membership removes that account from the corresponding future selection pool but does not silently remove it from already-enrolled events. Show a warning and make event removal an explicit separate action.
- Preserve account audit logging and account-provisioning email behavior. Send account credentials only when creating a new account, not when adding another type to an existing one.

### 4.2 Organizer selection

- Election events select/invite from accounts with active `ELECTION_VOTER` membership.
- Polling events select/invite from accounts with active `POLLING_RESPONDENT` membership.
- Competition events select from accounts with active `COMPETITION_JUDGE` membership and apply the existing organizer visibility/assignment rules.
- Cohort filtering by program/year-section can be available in the election and polling areas, but it filters the corresponding type pool; it does not imply a `Student` account type.
- Enrolling a selected account writes the appropriate row to `event_participants`. Existing lifecycle locks, idempotency, notification throttling, and event-specific checks remain in force.
- Adding/removing pool membership must not mutate historical event participation, vote/answer/score records, or completion flags.

### 4.3 Participant-facing application

- Change global-facing role labels and participant portal navigation from **Voter** to **Participant**.
- The participant dashboard lists enrolled events and renders actions by event type: vote, score, or respond.
- Route and API renaming must preserve compatibility during rollout. Keep old URLs as redirects or aliases until old links, bookmarks, deployed clients, and integrations have been checked.
- Internal component/file names may be migrated incrementally; a user-facing rename does not require a risky all-at-once filesystem rename.

---

## 5. Phased Implementation Plan

Each phase must be separately reviewable, deployable where possible, and have an explicit rollback/forward-recovery decision. Do not combine schema migration, user-facing route changes, and data cleanup in one release.

### Phase 0 — Confirm invariants and inventory (no code)

1. Approve the decisions in §1, including whether type membership needs its own active/inactive state in addition to `users.account_status`.
2. Confirm whether school ID is unique across all participant accounts and how duplicate/conflicting IDs should be reviewed.
3. Inventory all uses of `USER_ROLES.VOTER`, database role enum `voter`, `profile_type`, voter-facing URLs/API prefixes, role dashboards, invitation flows, imports, and auth tokens.
4. Count current user rows by role/profile type and compare them with existing `event_participants` types, judge data, account statuses, and academic fields. Produce a dry-run reconciliation report.
5. Decide migration deployment ordering for the production database and all backend/frontend instances. Confirm backups and a tested restore procedure.

**Exit gate:** reviewed inventory and reconciliation counts; no unresolved decision that would cause account merging or loss of type eligibility.

### Phase 1 — Additive database foundation

1. Add `participant` as a supported global role value without immediately removing `voter`.
2. Add `user_participant_types`, constraints, indexes, timestamps, and optional audit/status fields.
3. Keep existing `profile_type` and indexes intact. Do not drop or reinterpret the column yet.
4. Add a dry-run/backfill migration or script that proposes memberships from current profiles and event history:
   - `profile_type='judge'` proposes `COMPETITION_JUDGE` membership.
   - Existing student-pool accounts propose `ELECTION_VOTER` and `POLLING_RESPONDENT` memberships, preserving the existing ability to be selected for either pool. Report accounts with no profile or contradictory history for review.
   - Do not manufacture duplicate user rows. Preserve all `event_participants` rows unchanged.
5. Keep the migration additive and restart-safe. Add explicit validation queries for row counts, unique memberships, orphan rows, and type coverage.

**Exit gate:** migration applies on a production-like copy; backfill preview reconciles; repeat execution is safe; no existing event enrollment or ballot/score/answer changes.

### Phase 2 — Backend compatibility and membership services

1. Add a centralized participant-type membership service for add, remove, list, eligibility, and account lookup. Enforce `(user_id, participant_type)` idempotently.
2. Update account creation/import to deduplicate by normalized email and add requested memberships to existing accounts. Never reset an existing password as an import side effect.
3. Make backend auth and authorization accept both legacy `voter` and new `participant` during transition. Centralize the compatibility mapping rather than adding scattered string checks.
4. Update admin endpoints to return separate type-specific lists backed by memberships. Add a Polling Respondent pool/list API if none exists. Preserve old endpoints as aliases while clients migrate.
5. Update organizer pool queries and enrollment guards to check the requested membership and event type, not exclusive `profile_type`.
6. Keep event authorization checks based on `req.participant.participant_type`; never authorize scoring/voting/responding merely because an account has a global pool membership.
7. Add audit events for adding/removing memberships, profile changes, imports, account status changes, and administrative exports, following existing audit conventions.

**Exit gate:** backend contract tests prove multi-type membership, idempotent registration, event-scoped access, account suspension, and legacy-role compatibility.

### Phase 3 — Admin UI: three independent type areas

1. Preserve distinct **Election Voters**, **Competition Judges**, and **Polling Respondents** admin areas; do not build one combined participant roster and do not display `Student` as a type.
2. Use shared account identity fields with type-specific views/actions. Display a clear indication when the account also appears in another type pool, without duplicating account state.
3. Implement add/edit/import flows that add type membership to an existing email and report shared-field conflicts in preview.
4. Give each list the relevant search and filters: name/email, account status, school ID, program, and year/section where applicable; judge filters include qualification fields as useful.
5. Add the Polling Respondents admin management area and its import template if the current product lacks it.
6. Keep organizer management separate. Rename the broader nav area only if it remains an accurate umbrella label such as **User Management**.
7. Gate the new UI behind a feature flag until backend endpoints and backfilled memberships are verified.

**Exit gate:** create/import/update in each type area results in one account; adding the second/third membership does not duplicate identity or reset credentials; shared-field conflicts are visible and deliberate.

### Phase 4 — Organizer pool and enrollment updates

1. Update election cohort lists/invitations to use `ELECTION_VOTER` membership.
2. Update polling respondent selection/invitations to use `POLLING_RESPONDENT` membership, independent of election voter membership.
3. Update competition judge pool and pick endpoints to use `COMPETITION_JUDGE` membership, retaining organizer scoping and judge assignment behavior.
4. Keep pool eligibility separate from event enrollment; only explicit organizer selection/enrollment creates `event_participants` rows.
5. Keep current lifecycle locks, removal flows, notifications, and idempotency. Make membership removal's effect on already-enrolled events explicit in the UI.
6. Add integration tests that one account can be invited to election and polling events and selected as a judge in competition events, with distinct event participant types.

**Exit gate:** organizer flows use the correct pool; no profile-type restriction blocks valid multi-type accounts; wrong event-type participant access still receives 403.

### Phase 5 — Global role and participant portal naming

1. Update shared role constants, route guards, login/session handling, dashboard selection, admin metrics, and API user serialization to treat `participant` as the canonical global role.
2. Update voter-facing labels and participant portal navigation/dashboard to **Participant**. Keep event actions labeled by their actual function.
3. Add redirects/aliases for existing `/voter` frontend paths and compatibility for existing voter API paths. Update links in email templates, notifications, and help/documentation.
4. Deploy code that accepts both roles and paths first. Only after all relevant backend/frontend instances are compatible, backfill `users.role='voter'` to `participant`.
5. Verify temporary-password flows, account lock/suspension, CSRF/auth cookies, JWT/session claims, and deep links for both legacy and new accounts.

**Exit gate:** all participant accounts can sign in and reach the same event-specific functionality; no old role/path causes lockout; organizer/admin role behavior is unchanged.

### Phase 6 — Production reconciliation and cutover

1. Run the reviewed membership backfill with row counts and a durable audit log.
2. Reconcile each old profile cohort against memberships and event enrollments; report accounts lacking expected memberships or having conflicting shared data.
3. Have an admin review ambiguous records before enabling the new selection pools.
4. Enable the new admin and organizer interfaces gradually; monitor import failures, enrollment denials, duplicate account attempts, and auth errors.
5. Compare old and new pool counts and event enrollment totals before removing compatibility reads.

**Exit gate:** expected eligible account counts match approved reconciliation; all existing event participants retain access; no unexpected duplicate accounts or enrollment loss.

### Phase 7 — Retire legacy model and compatibility paths

1. After a defined observation window, remove backend reads/writes of `users.profile_type` and the old exclusive-pool guards.
2. Remove old route aliases only after telemetry/support checks confirm no remaining clients or bookmarks require them.
3. Retire the `voter` enum value only through a separately tested, forward-safe database migration after all app instances and stored role claims are compatible. It is acceptable to leave an unused legacy enum label if removing it adds deployment risk without product value.
4. Remove old voter/judge import branches and dead services only after tests show no callers remain.
5. Update `VOTER_PROFILE_AND_ADMIN_REGISTRATION_PLAN.md` with a clear superseded-decision note and mark this plan's completed phases; do not rewrite its historical record as though D6/D7 had always been different.

**Exit gate:** no active code path depends on exclusive `profile_type`; legacy support can be removed without changing event records or participant access.

---

## 6. Verification Matrix

### Database and account integrity

- A new email creates one participant account and one requested membership.
- An existing email in another participant pool gains the new membership without a second account or password reset.
- Repeating an import does not duplicate accounts or memberships.
- Shared profile conflicts are previewed and not silently overwritten.
- School-ID collisions are reported according to the Phase 0 policy.
- Existing event enrollment rows, ballot rows, poll answers, judge assignments, scores, and completion flags remain unchanged by backfill.

### Participant-type membership

- One account can hold Election Voter, Competition Judge, and Polling Respondent memberships simultaneously.
- Removing one membership does not remove other memberships or event history.
- Suspended/archived accounts cannot access any participant event even if memberships remain.
- A pool membership alone does not grant access to an event or its data.

### Event authorization and organizer workflows

- Election invitations create `ELECTION_VOTER` enrollment only.
- Competition judge selection creates `COMPETITION_JUDGE` enrollment and preserves judge assignment/scoring behavior.
- Polling invitations create `POLLING_RESPONDENT` enrollment only.
- Non-enrolled accounts and enrolled accounts of the wrong event participant type are denied.
- Lifecycle locks, event ownership checks, removal semantics, notification throttling, and audit logs remain effective.

### UI and auth compatibility

- Admin has three separate type management areas and never requires a `Student` participant category.
- Existing user shared data is consistent across type areas.
- Old `voter` accounts and URLs remain usable during rollout; `participant` accounts and new paths work after cutover.
- Organizer and admin login, routes, permissions, dashboards, and metrics do not regress.

---

## 7. Rollback and Recovery

- **Before cutover:** turn off feature flags; old `profile_type` and role values remain available, so old pool behavior can be restored while the new memberships remain stored.
- **After membership changes:** guarded down migrations are available, but they abort if any account has a valid multi-type combination the old single `profile_type` cannot express. Never bypass those guards or drop membership data manually; repair forward or restore a coordinated database-and-application backup.
- **Role migration:** down migrations must run in reverse order (086, 085, 084, 083) with participant writes paused. Migration 083 rebuilds the PostgreSQL enum and must be last; see [PARTICIPANT_ROLE_MIGRATION_RUNBOOK.md](PARTICIPANT_ROLE_MIGRATION_RUNBOOK.md).
- **URL/API migration:** retain aliases until the rollout is stable; aliases can be removed independently of the database model.
- Never delete or rewrite `event_participants`, votes, poll answers, judge assignments, scores, or audit records as part of rollback.

---

## 8. Main Risks and Mitigations

| Risk                                                                | Mitigation                                                                                                                                    |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing account profile does not reveal intended pool membership   | Generate a dry-run reconciliation report; preserve prior eligibility for existing student-pool accounts and send ambiguous records to review. |
| Same email import overwrites shared details unexpectedly            | Preview old/new values, define field ownership, require confirmation for conflicts, and audit changes.                                        |
| Role rename locks users out during mixed deployments                | Expand first, accept old and new role values, convert rows only after compatible code is deployed, and retain URL/API aliases.                |
| Pool eligibility is confused with event enrollment                  | Keep separate tables/services and require explicit event enrollment for all event access.                                                     |
| Removing pool membership breaks an existing event assignment        | Do not cascade pool membership deletion to event enrollment; warn and require explicit event-level removal.                                   |
| Old single `profile_type` cannot represent newly valid combinations | Keep it as a deprecated compatibility field until cutover; never use it to reverse-map multi-type accounts after cutover.                     |
| Duplicate school IDs block imports or cause incorrect merges        | Email is canonical identity; validate school IDs under an approved uniqueness rule and route conflicts to review.                             |

---

## 9. Suggested First Implementation Slice

Start with **Phase 0 and Phase 1 only**: inventory role/profile-type usage, collect counts, produce a dry-run membership backfill, then add the membership table without changing runtime behavior. This validates data shape and account overlap safely before modifying authorization or user-facing flows.

Do not begin by renaming every `/voter` route or deleting `profile_type`; those are later cutover/cleanup steps after multi-type memberships and compatibility behavior are proven.
