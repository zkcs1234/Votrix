# VOTRIX AES-256 Encryption — Analysis Report

## 1. Executive Summary

This report analyzes every table, column, service, and module in the VOTRIX system to determine which database fields contain **sensitive Personally Identifiable Information (PII)** that should be protected with AES-256-GCM encryption, and which fields must **NOT** be encrypted to preserve system functionality.

**Recommendation**: Apply **application-layer AES-256-GCM encryption** only to specific sensitive columns, not to entire tables or rows. Encryption/decryption happens exclusively in the backend service layer — never in the frontend.

---

## 2. Database Schema Analysis

### 2.1 Table: `users`

| Column                      | Type             | Sensitive?     | Encrypt? | Reason                                                        | Impact if Encrypted                        |
| --------------------------- | ---------------- | -------------- | -------- | ------------------------------------------------------------- | ------------------------------------------ |
| `id`                        | UUID (PK)        | No             | **NO**   | Primary key, used in joins across ~20 tables                  | Breaks all foreign key relationships       |
| `username`                  | VARCHAR(64)      | Partially      | **NO**   | Admin identifier, unique constraint, indexed                  | Breaks admin login by username             |
| `email`                     | VARCHAR(255)     | **YES**        | **YES**  | Personal email — primary PII                                  | Login flow must decrypt before auth lookup |
| `password`                  | TEXT             | Already hashed | **NO**   | Already bcrypt-hashed; encryption would add unnecessary layer | None (but adds complexity for no benefit)  |
| `role`                      | user_role (enum) | No             | **NO**   | Used for authorization middleware                             | Breaks all role-based access control       |
| `must_change_password`      | BOOLEAN          | No             | **NO**   | Boolean flag                                                  | Breaks password-change enforcement         |
| `account_status`            | VARCHAR          | No             | **NO**   | Used in auth middleware queries                               | Breaks account activation/suspension       |
| `token_version`             | INTEGER          | No             | **NO**   | Used for session revocation                                   | Breaks JWT token version checking          |
| `organization_name`         | VARCHAR(255)     | Partially      | **NO**   | Organization display name, used in profiles                   | Would break admin organizer listings       |
| `organization_logo`         | TEXT             | No             | **NO**   | Cloudinary URL, not PII                                       | Unnecessary overhead                       |
| `organizer_name`            | VARCHAR(255)     | **YES**        | **YES**  | Personal name of organizer                                    | Admin list must decrypt before display     |
| `position`                  | VARCHAR(255)     | **YES**        | **YES**  | Organizer's position/role                                     | Admin list must decrypt before display     |
| `organization_type_display` | VARCHAR(255)     | Partially      | **NO**   | Free-text org type label, not personal                        | Unnecessary overhead                       |
| `created_at`                | TIMESTAMPTZ      | No             | **NO**   | Timestamp, used for sorting/filtering                         | Breaks sorting and date-range queries      |
| `updated_at`                | TIMESTAMPTZ      | No             | **NO**   | Timestamp                                                     | Breaks sorting                             |

### 2.2 Table: `organizations`

| Column                      | Type                       | Sensitive? | Encrypt? | Reason                             | Impact if Encrypted               |
| --------------------------- | -------------------------- | ---------- | -------- | ---------------------------------- | --------------------------------- |
| `id`                        | UUID (PK)                  | No         | **NO**   | Primary key, foreign key in events | Breaks all event-to-org joins     |
| `organization_name`         | VARCHAR(255)               | Partially  | **NO**   | Display name, not PII              | Breaks admin organizer listing    |
| `organization_type`         | organization_type (enum)   | No         | **NO**   | Deprecated but still present       | Breaks any remaining type queries |
| `organizer_id`              | UUID (FK → users)          | No         | **NO**   | Foreign key, unique constraint     | Breaks all organizer lookups      |
| `status`                    | organization_status (enum) | No         | **NO**   | Used in WHERE filters              | Breaks status-based filtering     |
| `created_at` / `updated_at` | TIMESTAMPTZ                | No         | **NO**   | Timestamps                         | Breaks sorting                    |

### 2.3 Table: `events`

| Column                            | Type                               | Sensitive? | Encrypt? | Reason                           | Impact if Encrypted                |
| --------------------------------- | ---------------------------------- | ---------- | -------- | -------------------------------- | ---------------------------------- |
| `id`                              | UUID (PK)                          | No         | **NO**   | Primary key, FK in ~10 tables    | Breaks all relationships           |
| `organization_id`                 | UUID (FK)                          | No         | **NO**   | Foreign key                      | Breaks org-to-events joins         |
| `title`                           | VARCHAR(255)                       | No         | **NO**   | Event title, public-facing       | Breaks search and listing          |
| `description`                     | TEXT                               | No         | **NO**   | Event description, not PII       | Breaks event display               |
| `banner`                          | TEXT                               | No         | **NO**   | Cloudinary URL                   | Unnecessary                        |
| `start_date` / `end_date`         | TIMESTAMPTZ                        | No         | **NO**   | Used for scheduling logic        | Breaks date comparison, scheduling |
| `status`                          | event_status (enum)                | No         | **NO**   | Used for filtering/state machine | Breaks status transitions          |
| `event_type`                      | event_type (enum)                  | No         | **NO**   | Used for routing and logic       | Breaks module routing              |
| `voting_enabled`                  | BOOLEAN                            | No         | **NO**   | Boolean flag                     | Breaks voting toggle               |
| `scoring_enabled`                 | BOOLEAN                            | No         | **NO**   | Boolean flag                     | Breaks scoring toggle              |
| `polling_enabled`                 | BOOLEAN                            | No         | **NO**   | Boolean flag                     | Breaks polling toggle              |
| `poll_anonymous`                  | BOOLEAN                            | No         | **NO**   | Boolean flag                     | Breaks poll config                 |
| `poll_allow_multiple_submissions` | BOOLEAN                            | No         | **NO**   | Boolean flag                     | Breaks poll config                 |
| `poll_expires_at`                 | TIMESTAMPTZ                        | No         | **NO**   | Date used in expiration logic    | Breaks poll expiry check           |
| `results_visibility`              | election_results_visibility (enum) | No         | **NO**   | Used in results display logic    | Breaks results visibility          |
| `scoring_config`                  | JSONB                              | No         | **NO**   | GIN-indexed config               | Breaks GIN index queries           |
| `election_status`                 | VARCHAR(20)                        | No         | **NO**   | Filtered in queries              | Breaks election status lifecycle   |
| `information_form_schema`         | JSONB                              | No         | **NO**   | Form field definitions, not PII  | Breaks dynamic form rendering      |
| `created_at` / `updated_at`       | TIMESTAMPTZ                        | No         | **NO**   | Timestamps                       | Breaks sorting/recent listings     |

### 2.4 Table: `event_voters` → `v_event_voters` (view) / `event_participants`

| Column                      | Type                    | Sensitive? | Encrypt? | Reason                                  | Impact if Encrypted                      |
| --------------------------- | ----------------------- | ---------- | -------- | --------------------------------------- | ---------------------------------------- |
| `id`                        | UUID (PK)               | No         | **NO**   | Primary key                             | Breaks relationships                     |
| `event_id`                  | UUID (FK)               | No         | **NO**   | Foreign key                             | Breaks event-to-participant joins        |
| `user_id` (voter_id)        | UUID (FK)               | No         | **NO**   | Foreign key                             | Breaks user-to-event joins               |
| `participant_type`          | participant_type (enum) | No         | **NO**   | Used for role-based filtering           | Breaks participant type filtering        |
| `has_voted`                 | BOOLEAN                 | No         | **NO**   | Boolean flag                            | Breaks voted/completion tracking         |
| `has_scored`                | BOOLEAN                 | No         | **NO**   | Boolean flag                            | Breaks scoring completion                |
| `has_responded`             | BOOLEAN                 | No         | **NO**   | Boolean flag                            | Breaks poll response tracking            |
| `is_judge`                  | BOOLEAN                 | No         | **NO**   | Boolean flag                            | Breaks judge identification              |
| `first_name`                | VARCHAR(255)            | **YES**    | **YES**  | Personal name                           | Display in organizer lists; must decrypt |
| `last_name`                 | VARCHAR(255)            | **YES**    | **YES**  | Personal name                           | Display in organizer lists; must decrypt |
| `metadata`                  | JSONB                   | **YES**    | **YES**  | Custom form responses (potentially PII) | Information form builder must decrypt    |
| `voting_nonce`              | UUID                    | No         | **NO**   | Used for replay protection              | Breaks nonce verification                |
| `created_at` / `updated_at` | TIMESTAMPTZ             | No         | **NO**   | Timestamps                              | Breaks sorting                           |

### 2.5 Table: `invitations`

| Column                      | Type        | Sensitive? | Encrypt? | Reason                            | Impact if Encrypted                    |
| --------------------------- | ----------- | ---------- | -------- | --------------------------------- | -------------------------------------- |
| `id`                        | UUID (PK)   | No         | **NO**   | Primary key                       | Breaks relationships                   |
| `event_id`                  | UUID (FK)   | No         | **NO**   | Foreign key                       | Breaks event-to-invitation joins       |
| `voter_id`                  | UUID (FK)   | No         | **NO**   | Foreign key                       | Breaks user-to-invitation joins        |
| `temp_password`             | TEXT        | **YES**    | **YES**  | Temporary password (one-time use) | Must decrypt when resending invitation |
| `invitation_sent`           | BOOLEAN     | No         | **NO**   | Boolean flag                      | Breaks invitation status display       |
| `is_new_account`            | BOOLEAN     | No         | **NO**   | Boolean flag                      | Breaks new-vs-existing detection       |
| `email_status`              | VARCHAR(20) | No         | **NO**   | Delivery tracking status          | Breaks email status display            |
| `email_delivered_at`        | TIMESTAMPTZ | No         | **NO**   | Timestamp                         | Breaks analytics                       |
| `email_bounced_at`          | TIMESTAMPTZ | No         | **NO**   | Timestamp                         | Breaks analytics                       |
| `created_at` / `updated_at` | TIMESTAMPTZ | No         | **NO**   | Timestamps                        | Breaks sorting                         |

### 2.6 Table: `password_reset_tokens`

| Column       | Type        | Sensitive?     | Encrypt? | Reason                | Impact if Encrypted             |
| ------------ | ----------- | -------------- | -------- | --------------------- | ------------------------------- |
| `id`         | UUID (PK)   | No             | **NO**   | Primary key           | Breaks integrity                |
| `user_id`    | UUID (FK)   | No             | **NO**   | Foreign key           | Breaks user-to-token join       |
| `token_hash` | TEXT        | Already hashed | **NO**   | SHA-256 hash of token | Breaks token lookup             |
| `expires_at` | TIMESTAMPTZ | No             | **NO**   | Expiry comparison     | Breaks expiration check         |
| `used_at`    | TIMESTAMPTZ | No             | **NO**   | Single-use tracking   | Breaks one-time use enforcement |
| `created_at` | TIMESTAMPTZ | No             | **NO**   | Timestamp             | Breaks sorting                  |

### 2.7 Table: `election_votes`

| Column      | Type                    | Sensitive? | Encrypt? | Reason                                    | Impact if Encrypted                                         |
| ----------- | ----------------------- | ---------- | -------- | ----------------------------------------- | ----------------------------------------------------------- |
| All columns | UUID/Numeric/Timestamps | No         | **NO**   | Contains only foreign keys and timestamps | Breaks vote counting, candidate results, timeline analytics |

### 2.8 Table: `positions`, `candidates`

| Column                   | Type         | Sensitive? | Encrypt? | Reason                                   | Impact if Encrypted             |
| ------------------------ | ------------ | ---------- | -------- | ---------------------------------------- | ------------------------------- |
| `name` (positions)       | VARCHAR(255) | No         | **NO**   | Position name (e.g., "President")        | Breaks ballot display           |
| `name` (candidates)      | VARCHAR(255) | Partially  | **NO**   | Candidate name — public-facing by design | Breaks ballot, results, reports |
| `biography` (candidates) | TEXT         | **YES**    | **YES**  | Personal biography text                  | Reports/exports must decrypt    |
| `platform` (candidates)  | TEXT         | **YES**    | **YES**  | Campaign platform                        | Reports/exports must decrypt    |
| `description`            | TEXT         | Partially  | **NO**   | Generic description                      | Low sensitivity                 |
| `photo`                  | TEXT         | No         | **NO**   | Cloudinary URL                           | Unnecessary                     |
| `partylist`              | VARCHAR(255) | Partially  | **NO**   | Party name, not PII                      | Breaks party-based filtering    |

### 2.9 Table: `contestants` (competition)

| Column              | Type         | Sensitive? | Encrypt? | Reason                        | Impact if Encrypted                |
| ------------------- | ------------ | ---------- | -------- | ----------------------------- | ---------------------------------- |
| `name`              | VARCHAR(255) | Partially  | **NO**   | Public-facing contestant name | Breaks all contestant display      |
| `photo`             | TEXT         | No         | **NO**   | Cloudinary URL                | Unnecessary                        |
| `contestant_number` | INTEGER      | No         | **NO**   | Unique constraint per event   | Breaks ordering and identification |

### 2.10 Tables: Scoring (`judge_scores`, `competition_scores`, `competition_categories`, `competition_rounds`, `competition_criteria`)

| Columns                                | Assessment          | Encrypt? |
| -------------------------------------- | ------------------- | -------- |
| All score values (NUMERIC)             | Not PII             | **NO**   |
| All percentage/weight values (NUMERIC) | Not PII             | **NO**   |
| All names (VARCHAR)                    | Public rubric names | **NO**   |
| All foreign keys (UUID)                | Not PII             | **NO**   |
| All booleans/timestamps                | Not PII             | **NO**   |

### 2.11 Tables: Polling (`poll_questions`, `poll_options`, `poll_answers`, `poll_submissions`)

| Column                      | Type         | Sensitive? | Encrypt? | Reason                            | Impact if Encrypted                       |
| --------------------------- | ------------ | ---------- | -------- | --------------------------------- | ----------------------------------------- |
| `question` (poll_questions) | TEXT         | No         | **NO**   | Question text, not PII            | Breaks poll display                       |
| `answer` (poll_answers)     | TEXT         | **YES**    | **YES**  | Free-text answers may contain PII | Analytics/exports must decrypt            |
| `label` (poll_options)      | VARCHAR(255) | No         | **NO**   | Option labels                     | Breaks option display                     |
| `voter_id` (poll_answers)   | UUID (FK)    | No         | **NO**   | Foreign key                       | Breeds anonymity if encrypted (but is FK) |

### 2.12 Table: `audit_logs`

| Column       | Type         | Sensitive? | Encrypt?        | Reason                                 | Impact if Encrypted           |
| ------------ | ------------ | ---------- | --------------- | -------------------------------------- | ----------------------------- |
| `id`         | UUID (PK)    | No         | **NO**          | Primary key                            | Breaks integrity              |
| `user_id`    | UUID (FK)    | No         | **NO**          | Foreign key, nullable                  | Breaks audit trail joins      |
| `action`     | VARCHAR(255) | No         | **NO**          | Action identifier                      | Breaks action-based filtering |
| `entity`     | VARCHAR(255) | No         | **NO**          | Entity name                            | Breaks entity-based filtering |
| `entity_id`  | UUID         | No         | **NO**          | For searching                          | Breaks entity-scoped search   |
| `details`    | JSONB        | **YES**    | **Conditional** | May contain PII in descriptive context | Admin audit view must decrypt |
| `created_at` | TIMESTAMPTZ  | No         | **NO**          | Timestamp                              | Breaks sorting/filtering      |

### 2.13 Table: `system_settings`

| All columns | JSONB/VARCHAR | No | **NO** | System configuration | Breaks system settings read |

### 2.14 Competition-specific Tables

All tables: `competition_judges`, `competition_judge_assignments`, `competition_sessions`, `competition_session_judge_scores`, `competition_round_contestants`, `competition_round_criteria`

| Assessment                                                             | Encrypt? | Reason         |
| ---------------------------------------------------------------------- | -------- | -------------- |
| All columns contain only UUIDs, enums, booleans, timestamps, or scores | **NO**   | No PII present |

---

## 3. Sensitive Columns Summary — Encrypt These

| #   | Table                | Column             | Sensitivity             | Encryption Impact                     |
| --- | -------------------- | ------------------ | ----------------------- | ------------------------------------- |
| 1   | `users`              | `email`            | High — personal contact | Login must decrypt before auth lookup |
| 2   | `users`              | `organizer_name`   | Medium — personal name  | Admin organizer list must decrypt     |
| 3   | `users`              | `position`         | Medium — job title      | Admin organizer list must decrypt     |
| 4   | `event_participants` | `first_name`       | Medium — personal name  | Voter list must decrypt               |
| 5   | `event_participants` | `last_name`        | Medium — personal name  | Voter list must decrypt               |
| 6   | `event_participants` | `metadata` (JSONB) | High — custom form PII  | Information form must decrypt         |
| 7   | `invitations`        | `temp_password`    | High — credential       | Invitation resend must decrypt        |
| 8   | `candidates`         | `biography`        | Medium — personal bio   | Candidate management must decrypt     |
| 9   | `candidates`         | `platform`         | Medium — campaign info  | Candidate management must decrypt     |
| 10  | `poll_answers`       | `answer`           | Medium — free text      | Poll responses must decrypt           |
| 11  | `audit_logs`         | `details` (JSONB)  | Medium — contextual PII | Audit log view must decrypt           |

---

## 4. Modules Affected by Encryption

### 4.1 Authentication Module (`auth.service.js`, `user.service.js`)

- **Impact**: Login flow reads `users.email` → must decrypt email before comparing
- **Files affected**: `backend/src/services/auth.service.js`, `backend/src/services/user.service.js`
- **Encryption point**: `findUserByEmail()` must decrypt email field after query
- **Decryption point**: `sanitizeUser()` should decrypt email before returning to client

### 4.2 Admin Module (`admin.service.js`)

- **Impact**: Organizer list reads `email`, `organizer_name`, `position` → must decrypt
- **Files affected**: `backend/src/services/admin.service.js`, `backend/src/controllers/admin.controller.js`
- **Encryption point**: `createOrganizer()` must encrypt before insert
- **Decryption point**: `getOrganizersList()` must decrypt after query

### 4.3 Invitation Module (`invitation.service.js`)

- **Impact**: `temp_password` must be encrypted when stored, decrypted when resent
- **Files affected**: `backend/src/services/invitation.service.js`, `backend/src/services/csv-import.service.js`
- **Encryption point**: Before `invitations` insert/update
- **Decryption point**: When reading temp_password for email resend

### 4.4 Election Module (`election.service.js`)

- **Impact**: Candidate `biography` and `platform` need encryption
- **Files affected**: `backend/src/services/election.service.js`, `backend/src/controllers/election-organizer.controller.js`
- **Encryption point**: `createCandidate()`, `updateCandidate()` before DB write
- **Decryption point**: `listCandidates()`, `getVoterBallot()`, `listEventVoters()`

### 4.5 Competition Module (`competition.service.js`)

- **Impact**: Candidate info (biography/platform) if applicable
- **Files affected**: `backend/src/services/competition.service.js`, `backend/src/services/pageant.service.js`

### 4.6 Polling Module (`polling.service.js`)

- **Impact**: Free-text poll answers may contain PII
- **Files affected**: `backend/src/services/polling.service.js`
- **Encryption point**: `submitPollAnswer()` / answer submission
- **Decryption point**: Poll results/analytics/export

### 4.7 Voter Dashboard (`voter.service.js`)

- **Impact**: Receives decrypted data from election/polling services
- **Files affected**: `backend/src/services/voter.service.js`
- **Note**: No encryption logic — receives already-decrypted data from sub-services

### 4.8 Organizer Profile Module (`organizer-profile.service.js`)

- **Impact**: Reads/writes `organizer_name`, `position` on users table
- **Files affected**: `backend/src/services/organizer-profile.service.js`
- **Encryption point**: Before update
- **Decryption point**: After select

### 4.9 CSV Import (`csv-import.service.js`)

- **Impact**: Bulk creation of voter accounts → encrypts emails
- **Files affected**: `backend/src/services/csv-import.service.js`

### 4.10 Audit Module (`audit.js` foundation)

- **Impact**: `details` JSONB may contain sensitive information
- **Files affected**: `backend/src/foundation/audit.js`
- **Encryption point**: Before insert in `recordAudit()`
- **Decryption point**: After select in `listAuditTrail()`

### 4.11 Reports & Exports

- **Impact**: All exports that include encrypted fields must decrypt before generating CSV/Excel/PDF
- **Files affected**: `backend/src/services/reports-organizer.service.js`, export utilities

---

## 5. Features That Will Break Without Proper Decryption

| Feature                   | Reason                                      | Required Fix                                                            |
| ------------------------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| **Login by email**        | `findUserByEmail()` queries `users.email`   | Decrypt all emails, then compare (OR store SHA-256 of email for lookup) |
| **Admin organizer list**  | Reads `email`, `organizer_name`, `position` | Decrypt in `getOrganizersList()`                                        |
| **Voter list**            | Reads `first_name`, `last_name`             | Decrypt in `listEventVoters()`                                          |
| **Candidate cards**       | Reads `biography`, `platform`               | Decrypt in `listCandidates()`                                           |
| **Invitation resend**     | Reads `temp_password`                       | Decrypt in `resendVoterInvitation()`                                    |
| **Poll analytics/export** | Reads `answer` text                         | Decrypt in poll results service                                         |
| **Audit log view**        | Reads `details` JSONB                       | Decrypt in `listAuditTrail()`                                           |
| **Organizer profile**     | Reads `organizer_name`, `position`          | Decrypt in `getOrganizerProfile()`                                      |
| **Change password flow**  | Reads `email` for verification              | Decrypt email before comparison                                         |
| **Search by email**       | Direct DB query by email field              | Impossible with encryption — must use SHA-256 index                     |

---

## 6. Searchability Impact & Mitigation

### Problem

Encrypting `users.email` breaks `WHERE email = 'user@example.com'` lookups.

### Mitigation Strategy

For the **email field only**, store a deterministic SHA-256 hash alongside the encrypted value:

```sql
ALTER TABLE users ADD COLUMN email_hash VARCHAR(64);
CREATE INDEX idx_users_email_hash ON users (email_hash);
```

- `email_hash = SHA-256(LOWER(email))` — used only for lookup queries
- `email = AES-256-GCM(LOWER(email))` — actual encrypted value
- The hash is one-way; original email cannot be derived from it
- The hash alone is not enough for authentication (attacker also needs the encryption key)

### Other Fields

Fields like `organizer_name`, `first_name`, `last_name`, `biography`, `platform` are **display-only** and not searched directly via SQL WHERE clauses. They can be encrypted without lookup impact.

---

## 7. Data Flow Diagrams

### Write Path (Encrypt)

```
Client → API Request → Controller → Service → encryptField() → Supabase insert/update → DB
```

### Read Path (Decrypt)

```
Client ← API Response ← Controller ← Service ← decryptField() ← Supabase select ← DB
```

### Authentication Path (Decrypt + Compare)

```
Client Login → findUserByEmail(email) → decrypt all user emails → compare → return matched user
```

---

## 8. Environment Variables Required

| Variable             | Purpose                        | Example                       |
| -------------------- | ------------------------------ | ----------------------------- |
| `ENCRYPTION_KEY`     | 256-bit AES key (64 hex chars) | `a1b2c3d4e5f6...` (64 chars)  |
| `ENCRYPTION_KEY_DEV` | Separate key for development   | Same format (different value) |

---

## 9. Column Storage Format

Each encrypted value stored as a combined string:

```
base64(iv + authTag + ciphertext)
```

Where:

- `iv` = 12 bytes (96-bit GCM nonce)
- `authTag` = 16 bytes (GCM authentication tag)
- `ciphertext` = encrypted payload

Total overhead: ~36 bytes per encrypted value (base64-encoded).
