# Database

---

## Overview

- **Engine:** PostgreSQL 15+ (Supabase hosted)
- **Client:** `@supabase/supabase-js` with service role key (backend only, bypasses RLS)
- **Primary keys:** UUID via `gen_random_uuid()` on all tables
- **Timestamps:** `created_at TIMESTAMPTZ DEFAULT NOW()` on all tables; `updated_at` managed by `set_updated_at()` trigger on mutable tables
- **Migrations:** 19 files in `backend/src/database/migrations/`, run in numeric order

---

## Enums

| Enum | Values |
|------|--------|
| `user_role` | `admin`, `organizer`, `voter` |
| `organization_type` | `election`, `pageant`, `polling` |
| `organization_status` | `draft`, `active`, `inactive`, `archived` |
| `event_status` | `draft`, `scheduled`, `active`, `completed`, `cancelled` |
| `event_type` | `election`, `pageant`, `polling` |
| `poll_question_type` | `single_choice`, `multiple_choice`, `checkbox`, `yes_no`, `text`, `rating`, `likert_scale`, `open_text`, `ranking` |
| `user_account_status` | `pending`, `active`, `suspended`, `archived` |
| `election_results_visibility` | `real_time`, `hidden`, `public` |
| `competition_assignment_scope` | `event`, `category`, `round` |
| `competition_judge_role` | `judge`, `head_judge`, `score_reviewer` |

---

## Tables

### `users`
All accounts. Admin uses `username`; organizer/voter use `email`.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | `gen_random_uuid()` |
| `username` | VARCHAR(64) | UNIQUE, nullable (admin only) |
| `email` | VARCHAR(255) | UNIQUE, nullable (non-admin must have) |
| `password` | TEXT | NOT NULL (bcrypt hash) |
| `role` | `user_role` | NOT NULL |
| `must_change_password` | BOOLEAN | NOT NULL DEFAULT FALSE |
| `account_status` | `user_account_status` | NOT NULL DEFAULT `active` |
| `token_version` | INTEGER | NOT NULL DEFAULT 0 (added in migration 003) |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

**Indexes:** `idx_users_role`, `idx_users_email` (partial WHERE email IS NOT NULL), `idx_users_username` (partial), `idx_users_account_status`

**Constraints:**
- Admin must have username, non-admin must have email
- Admin cannot have email (username-only login)

**Trigger:** `trg_users_updated_at`

---

### `organizations`
Tenant container owned by an organizer.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | |
| `organization_name` | VARCHAR(255) | NOT NULL |
| `organization_type` | `organization_type` | NOT NULL |
| `organizer_id` | UUID FK → `users.id` | ON DELETE RESTRICT |
| `status` | `organization_status` | NOT NULL DEFAULT `draft` |
| `logo_url` | TEXT | nullable (added in migration 007) |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Indexes:** `idx_organizations_organizer_id`, `idx_organizations_type`, `idx_organizations_status`

**Trigger:** `trg_organizations_updated_at`

---

### `events`
Voting/polling/competition instance under an organization.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | |
| `organization_id` | UUID FK → `organizations.id` | ON DELETE CASCADE |
| `title` | VARCHAR(255) | NOT NULL |
| `description` | TEXT | nullable |
| `banner` | TEXT | nullable (Cloudinary URL) |
| `start_date` | TIMESTAMPTZ | nullable |
| `end_date` | TIMESTAMPTZ | nullable |
| `status` | `event_status` | NOT NULL DEFAULT `draft` |
| `event_type` | `event_type` | NOT NULL |
| `voting_enabled` | BOOLEAN | NOT NULL DEFAULT FALSE (election) |
| `scoring_enabled` | BOOLEAN | NOT NULL DEFAULT FALSE (competition) |
| `polling_enabled` | BOOLEAN | NOT NULL DEFAULT FALSE (polling) |
| `poll_anonymous` | BOOLEAN | NOT NULL DEFAULT FALSE |
| `poll_allow_multiple_submissions` | BOOLEAN | NOT NULL DEFAULT FALSE |
| `poll_expires_at` | TIMESTAMPTZ | nullable |
| `results_visibility` | `election_results_visibility` | NOT NULL DEFAULT `public` |
| `scoring_config` | JSONB | NOT NULL DEFAULT `{scoreType, calculationMethod, decimalPlaces, dropHighest, dropLowest}` |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Constraint:** `end_date >= start_date` (when both set)

**Indexes:** `idx_events_organization_id`, `idx_events_status`, `idx_events_event_type`, `idx_events_dates`, `idx_events_results_visibility`, `idx_events_scoring_config_gin`

**Trigger:** `trg_events_updated_at`

---

### `event_voters`
Voters enrolled in an event.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | |
| `event_id` | UUID FK → `events.id` | ON DELETE CASCADE |
| `voter_id` | UUID FK → `users.id` | ON DELETE CASCADE |
| `has_voted` | BOOLEAN | NOT NULL DEFAULT FALSE |
| `first_name` | VARCHAR(255) | nullable |
| `last_name` | VARCHAR(255) | nullable |
| `is_judge` | BOOLEAN | NOT NULL DEFAULT FALSE (competition legacy) |
| `has_scored` | BOOLEAN | NOT NULL DEFAULT FALSE (competition legacy) |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Unique:** `(event_id, voter_id)`

**Indexes:** `idx_event_voters_event_id`, `idx_event_voters_voter_id`, `idx_event_voters_has_voted`, `idx_event_voters_judge`, `idx_event_voters_has_scored`

**Trigger:** `trg_event_voters_updated_at`

---

### `invitations`
Voter invite with optional temporary password.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | |
| `event_id` | UUID FK → `events.id` | ON DELETE CASCADE |
| `voter_id` | UUID FK → `users.id` | ON DELETE CASCADE |
| `temp_password` | TEXT | nullable |
| `invitation_sent` | BOOLEAN | NOT NULL DEFAULT FALSE |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Unique:** `(event_id, voter_id)`

---

### `positions`
Election ballot positions.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | |
| `event_id` | UUID FK → `events.id` | ON DELETE CASCADE |
| `name` | VARCHAR(255) | NOT NULL |
| `min_vote` | INTEGER | NOT NULL DEFAULT 1 |
| `max_vote` | INTEGER | NOT NULL DEFAULT 1 |
| `allow_skip` | BOOLEAN | NOT NULL DEFAULT FALSE |
| `description` | TEXT | nullable |
| `number_of_winners` | INTEGER | NOT NULL DEFAULT 1, CHECK ≥ 1 |
| `display_order` | INTEGER | NOT NULL DEFAULT 0 |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Constraint:** `min_vote >= 0 AND max_vote >= min_vote`

**Indexes:** `idx_positions_event_id`, `idx_positions_event_id_display_order`

---

### `candidates`
Election candidates per position.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | |
| `position_id` | UUID FK → `positions.id` | ON DELETE CASCADE |
| `name` | VARCHAR(255) | NOT NULL |
| `photo` | TEXT | nullable (Cloudinary URL) |
| `description` | TEXT | nullable |
| `partylist` | VARCHAR(255) | nullable |
| `biography` | TEXT | nullable |
| `platform` | TEXT | nullable |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Indexes:** `idx_candidates_position_id`

---

### `election_votes`
One row per candidate selected per voter per position.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | |
| `event_id` | UUID FK → `events.id` | ON DELETE CASCADE |
| `voter_id` | UUID FK → `users.id` | ON DELETE CASCADE |
| `position_id` | UUID FK → `positions.id` | ON DELETE CASCADE |
| `candidate_id` | UUID FK → `candidates.id` | ON DELETE CASCADE |
| `created_at` | TIMESTAMPTZ | |

**Unique:** `(event_id, voter_id, position_id, candidate_id)`

**Indexes:** `idx_election_votes_event_id`, `idx_election_votes_position_id`, `idx_election_votes_candidate_id`, `idx_election_votes_voter_event`

---

### `contestants`
Competition/pageant contestants.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | |
| `event_id` | UUID FK → `events.id` | ON DELETE CASCADE |
| `name` | VARCHAR(255) | NOT NULL |
| `photo` | TEXT | nullable |
| `contestant_number` | INTEGER | NOT NULL, CHECK > 0 |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Unique:** `(event_id, contestant_number)`

> Note: competition module may use `competition_contestants` as alias — verify with migration 011.

---

### `criteria`
Pageant/competition scoring rubric per event.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | |
| `event_id` | UUID FK → `events.id` | ON DELETE CASCADE |
| `name` | VARCHAR(255) | NOT NULL |
| `percentage` | NUMERIC(5,2) | NOT NULL DEFAULT 0, CHECK 0–100 |
| `min_score` | NUMERIC(10,2) | NOT NULL DEFAULT 0 |
| `max_score` | NUMERIC(10,2) | NOT NULL DEFAULT 100 |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

> Note: competition module may use `competition_criteria` as alias — verify with migration 011.

---

### `judge_scores`
Legacy per-judge scores (pre Phase 4).

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | |
| `judge_id` | UUID FK → `users.id` | ON DELETE CASCADE |
| `contestant_id` | UUID FK → `contestants.id` | ON DELETE CASCADE |
| `criteria_id` | UUID FK → `criteria.id` | ON DELETE CASCADE |
| `score` | NUMERIC(10,2) | NOT NULL |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

**Unique:** `(judge_id, contestant_id, criteria_id)`

---

### `competition_categories`
Optional grouping layer for criteria/rounds.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | |
| `event_id` | UUID FK → `events.id` | ON DELETE CASCADE |
| `name` | VARCHAR(255) | NOT NULL |
| `description` | TEXT | nullable |
| `display_order` | INTEGER | NOT NULL DEFAULT 0 |
| `weight` | NUMERIC(5,2) | NOT NULL DEFAULT 0, CHECK 0–100 |
| `is_active` | BOOLEAN | NOT NULL DEFAULT TRUE |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

---

### `competition_rounds`
Stages of a competition event.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | |
| `event_id` | UUID FK → `events.id` | ON DELETE CASCADE |
| `category_id` | UUID FK → `competition_categories.id` | ON DELETE CASCADE, nullable |
| `name` | VARCHAR(255) | NOT NULL |
| `display_order` | INTEGER | NOT NULL DEFAULT 0 |
| `weight` | NUMERIC(5,2) | NOT NULL DEFAULT 0, CHECK 0–100 |
| `is_open` | BOOLEAN | NOT NULL DEFAULT FALSE |
| `starts_at` / `ends_at` | TIMESTAMPTZ | nullable |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

---

### `competition_judges`
First-class judge model (Phase 4+).

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | |
| `event_id` | UUID FK → `events.id` | ON DELETE CASCADE |
| `user_id` | UUID FK → `users.id` | ON DELETE CASCADE |
| `role` | `competition_judge_role` | NOT NULL DEFAULT `judge` |
| `display_name` | VARCHAR(255) | nullable |
| `is_active` | BOOLEAN | NOT NULL DEFAULT TRUE |
| `has_submitted` | BOOLEAN | NOT NULL DEFAULT FALSE |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

**Unique:** `(event_id, user_id)`

---

### `competition_judge_assignments`
Flexible scope assignments for judges.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | |
| `judge_id` | UUID FK → `competition_judges.id` | ON DELETE CASCADE |
| `scope` | `competition_assignment_scope` | NOT NULL |
| `scope_id` | UUID | NOT NULL (event/category/round id) |
| `created_at` | TIMESTAMPTZ | |

**Unique:** `(judge_id, scope, scope_id)`

---

### `competition_round_contestants`
Many-to-many: contestants appearing in a round.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | |
| `round_id` | UUID FK → `competition_rounds.id` | ON DELETE CASCADE |
| `contestant_id` | UUID FK → `competition_contestants.id` | ON DELETE CASCADE |
| `created_at` | TIMESTAMPTZ | |

**Unique:** `(round_id, contestant_id)`

---

### `competition_round_criteria`
Many-to-many: criteria scored in a round.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | |
| `round_id` | UUID FK → `competition_rounds.id` | ON DELETE CASCADE |
| `criteria_id` | UUID FK → `competition_criteria.id` | ON DELETE CASCADE |
| `created_at` | TIMESTAMPTZ | |

**Unique:** `(round_id, criteria_id)`

---

### `poll_questions`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | |
| `event_id` | UUID FK → `events.id` | ON DELETE CASCADE |
| `question` | TEXT | NOT NULL |
| `type` | `poll_question_type` | NOT NULL DEFAULT `single_choice` |
| `sort_order` | INTEGER | NOT NULL DEFAULT 0 |
| `required` | BOOLEAN | NOT NULL DEFAULT TRUE |
| `type_config` | JSONB | NOT NULL DEFAULT `{}` |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

---

### `poll_options`
Choices for choice-type questions.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | |
| `question_id` | UUID FK → `poll_questions.id` | ON DELETE CASCADE |
| `label` | VARCHAR(255) | NOT NULL |
| `sort_order` | INTEGER | NOT NULL DEFAULT 0 |
| `created_at` | TIMESTAMPTZ | |

---

### `poll_submissions`
One record per voter poll submission.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | |
| `event_id` | UUID FK → `events.id` | ON DELETE CASCADE |
| `voter_id` | UUID FK → `users.id` | ON DELETE CASCADE |
| `created_at` | TIMESTAMPTZ | |

---

### `poll_answers`
Voter responses to poll questions.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | |
| `question_id` | UUID FK → `poll_questions.id` | ON DELETE CASCADE |
| `voter_id` | UUID FK → `users.id` | ON DELETE CASCADE |
| `answer` | TEXT | NOT NULL |
| `submission_id` | UUID FK → `poll_submissions.id` | ON DELETE CASCADE, nullable |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

**Unique:** `(submission_id, question_id)` WHERE submission_id IS NOT NULL

---

### `system_poll_question_types`
Built-in global question type registry.

| Column | Type | Constraints |
|--------|------|-------------|
| `key` | VARCHAR(64) PK | NOT NULL, length > 0 |
| `label` | VARCHAR(255) | NOT NULL |
| `description` | TEXT | nullable |
| `answer_format` | JSONB | NOT NULL |
| `config_schema` | JSONB | NOT NULL DEFAULT `{}` |
| `ui` | JSONB | NOT NULL DEFAULT `{}` |
| `is_active` | BOOLEAN | NOT NULL DEFAULT TRUE |
| `sort_order` | INTEGER | NOT NULL DEFAULT 0 |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

---

### `poll_question_types`
Per-organization overrides / custom types.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | |
| `organization_id` | UUID FK → `organizations.id` | ON DELETE CASCADE, nullable |
| `key` | VARCHAR(64) | NOT NULL |
| `label` / `description` / `answer_format` / `config_schema` / `ui` | various | same as system table |
| `is_active` | BOOLEAN | NOT NULL DEFAULT TRUE |
| `sort_order` | INTEGER | NOT NULL DEFAULT 0 |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

**Unique:** `(organization_id, key)`

---

### `notifications`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | |
| `user_id` | UUID FK → `users.id` | ON DELETE CASCADE |
| `type` | VARCHAR(64) | NOT NULL |
| `title` | VARCHAR(255) | NOT NULL |
| `message` | TEXT | NOT NULL |
| `action_url` | TEXT | nullable |
| `entity` / `entity_id` | VARCHAR(255) / UUID | nullable |
| `metadata` | JSONB | nullable |
| `is_read` | BOOLEAN | NOT NULL DEFAULT FALSE |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

**Indexes:** `idx_notifications_user_id`, `idx_notifications_user_read`, `idx_notifications_created_at DESC`

---

### `audit_logs`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | |
| `user_id` | UUID FK → `users.id` | ON DELETE SET NULL |
| `action` | VARCHAR(255) | NOT NULL |
| `entity` | VARCHAR(255) | nullable |
| `entity_id` | UUID | nullable |
| `details` | JSONB | nullable |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

**Indexes:** `idx_audit_logs_user_id`, `idx_audit_logs_action`, `idx_audit_logs_created_at DESC`

---

### `system_settings`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | |
| `setting_key` | VARCHAR(255) | NOT NULL UNIQUE |
| `setting_value` | JSONB | NOT NULL |
| `description` | TEXT | nullable |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

---

### `password_reset_tokens`
(Added in migration 003)

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | |
| `user_id` | UUID FK → `users.id` | ON DELETE CASCADE |
| `token_hash` | TEXT | NOT NULL |
| `expires_at` | TIMESTAMPTZ | NOT NULL |
| `used_at` | TIMESTAMPTZ | nullable |
| `created_at` | TIMESTAMPTZ | |

---

## Views

| View | Purpose |
|------|---------|
| `v_legacy_competition_judges` | Backward-compat — exposes `event_voters.is_judge` rows as competition_judges shape |
| `v_poll_question_types` | Merges `system_poll_question_types` + `poll_question_types`; per-org overrides shadow built-ins |

---

## Triggers

`set_updated_at()` trigger applied to: `users`, `organizations`, `events`, `event_voters`, `invitations`, `positions`, `candidates`, `contestants`, `criteria`, `judge_scores`, `poll_questions`, `poll_answers`, `notifications`, `system_settings`, `system_poll_question_types`, `poll_question_types`, `competition_categories`, `competition_rounds`, `competition_judges`

---

## Migration Files (in order)

| File | Description |
|------|-------------|
| `001_initial_schema.sql` | Base schema: users, organizations, events, event_voters, invitations, positions, candidates, contestants, criteria, judge_scores, poll_questions, poll_answers |
| `002_down_initial_schema.sql` | Rollback for 001 |
| `003_password_reset_tokens.sql` | password_reset_tokens table + token_version on users |
| `004_election_module.sql` | election_votes table, voting_enabled column, first/last name on event_voters |
| `005_pageant_module.sql` | scoring_enabled, is_judge, has_scored on event_voters |
| `006_polling_module.sql` | poll_options, poll_submissions tables; polling columns on events |
| `007_organization_logo.sql` | logo_url on organizations |
| `008_admin_dashboard.sql` | system_settings, audit_logs tables |
| `009_user_account_status.sql` | account_status on users |
| `010_notifications.sql` | notifications table |
| `011_rename_pageant_to_competition_scoring.sql` | Renames pageant tables to competition_* |
| `012_down_rename_*.sql` | Rollback for 011 |
| `013_election_enhancements.sql` | Position/candidate detail fields, election_results_visibility |
| `014_down_election_enhancements.sql` | Rollback for 013 |
| `015_competition_scoring_foundation.sql` | competition_categories, competition_rounds, competition_judges, competition_judge_assignments, competition_round_contestants, competition_round_criteria; extends competition_scores with round_id/category_id |
| `016_competition_scoring_foundation_down.sql` | Rollback for 015 |
| `017_polling_question_type_registry.sql` | system_poll_question_types, poll_question_types; type_config on poll_questions; v_poll_question_types view |
| `018_polling_question_type_registry_down.sql` | Rollback for 017 |
| `019_phase9_indexes_and_optimizations.sql` | Additional performance indexes |

---

**Last Updated:** 2026-07-04
**Documentation Version:** 1.0.0
**Related Files:** `backend/src/database/migrations/`, `backend/src/config/database.js`
**Related Documentation:** `docs/ai/AI_CONTEXT.md`, `docs/ai/BUSINESS_RULES.md`
