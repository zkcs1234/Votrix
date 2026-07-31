# VOTRIX AES-256 Encryption — Implementation Plan

## Overview

This document outlines a **phased implementation roadmap** for adding AES-256-GCM encryption to VOTRIX. Each phase is incremental, reversible, and preserves all existing functionality.

**Architecture Decision**: Application-layer encryption (encrypt/decrypt in Node.js service layer before DB operations) — NOT database-layer or hybrid.

**Why**:

1. The existing architecture already has a clear service layer separation
2. Supabase PostgreSQL does not natively support transparent data encryption (TDE)
3. Application-layer encryption works regardless of database provider
4. The encryption key stays server-side only, never in the database

---

## Phase 0 — Encryption Utility Module

**Goal**: Create a reusable `encryption.utils.js` that all services will use.

### Files to Create

**`backend/src/utils/encryption.js`**

- AES-256-GCM encrypt/decrypt functions
- IV (nonce) generation using `crypto.randomBytes(12)`
- Combined output format: `base64(iv + authTag + ciphertext)`
- Deterministic hash function for email lookup: `sha256(email)`
- Key loading from environment variable

### Components

```javascript
// encrypt(text) → "base64(iv + authTag + ciphertext)"
// decrypt(encryptedString) → plaintext
// hashEmail(email) → "sha256-hex" (for lookup queries)
```

### Env Config Addition

In `backend/src/config/env.js`:

```javascript
encryption: {
  key: process.env.ENCRYPTION_KEY || '', // 64 hex chars = 256 bits
  algorithm: 'aes-256-gcm',
}
```

### Rollback

- Delete `backend/src/utils/encryption.js`
- Remove `ENCRYPTION_KEY` from env config
- Restore previous service files from git

### Testing

- Unit tests: encrypt('test') → decrypt(result) === 'test'
- Edge cases: empty string, null, very long strings
- Key rotation test: decrypt with old key after re-encrypting with new key

---

## Phase 1 — Users Table: Email Encryption

**Goal**: Encrypt `users.email` with AES-256-GCM and add `email_hash` column for lookup.

### Database Migration

**File**: `backend/src/database/migrations/033_aes256_email_encryption.sql`

```sql
BEGIN;

-- Add email_hash column for deterministic lookup
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_hash VARCHAR(64);

-- Create index on email_hash
CREATE INDEX IF NOT EXISTS idx_users_email_hash ON users (email_hash);

-- Backfill email_hash for existing records
-- NOTE: This will be done by the migration script via application code
-- SQL hint-only: the actual hash computation uses SHA-256 via pgcrypto
UPDATE users SET email_hash = ENCODE(
  digest(LOWER(email), 'sha256'), 'hex'
) WHERE email_hash IS NULL AND email IS NOT NULL;

ANALYZE users;

COMMIT;
```

### Service Changes

1. **`backend/src/services/user.service.js`**:
   - `findUserByEmail(email)` → hash email, query by `email_hash`
   - `createOrganizer()` → encrypt email before insert, store hash
   - `sanitizeUser()` → decrypt email before returning

2. **`backend/src/services/auth.service.js`**:
   - `login()` → uses `findUserByEmail()` which already handles decryption

3. **`backend/src/services/admin.service.js`**:
   - `getOrganizersList()` → decrypt emails in results
   - `createOrganizer()` → already delegated to `user.service.js`

4. **`backend/src/services/csv-import.service.js`**:
   - Email comparison/validation uses normalized string, then hash-based lookup

5. **`backend/src/services/invitation.service.js`**:
   - All email-based lookups go through `findUserByEmail()` which handles decryption

### Migration Script

**File**: `backend/src/scripts/migrate_encrypt_emails.mjs`

```javascript
// 1. Read all users with email
// 2. For each: encrypt email, compute email_hash
// 3. Batch update
// 4. Verify by decrypting and comparing
// 5. Rollback: restore from backup if verification fails
```

### Rollback

- Revert migration `033_aes256_email_encryption.sql`
- Run `backend/src/scripts/rollback_encrypt_emails.mjs` to restore plaintext emails from backup
- Revert service file changes

### Testing

- ✅ Login with email works
- ✅ Admin organizer list shows decrypted emails
- ✅ Voter invitation by email works (new and existing)
- ✅ CSV import with email lookup works
- ✅ Cannot read encrypted email directly from database (SELECT shows gibberish)

---

## Phase 2 — Users Table: Name & Position Encryption

**Goal**: Encrypt `users.organizer_name` and `users.position`.

### Service Changes

1. **`backend/src/services/user.service.js`**:
   - `sanitizeUser()` → decrypt `organizer_name`, `position` before returning
   - `createOrganizer()` → encrypt before insert

2. **`backend/src/services/admin.service.js`**:
   - `getOrganizersList()` → decrypt `organizer_name`, `position`

3. **`backend/src/services/organizer-profile.service.js`**:
   - `getOrganizerProfile()` → decrypt both fields after select
   - `updateOrganizerProfile()` → encrypt both fields before update
   - `isOrganizerProfileComplete()` → decrypt before checking completeness

### Rollback

- Revert changes to `sanitizeUser()`, `organizer-profile.service.js`

### Testing

- ✅ Admin organizer list shows correct names and positions
- ✅ Organizer profile page loads with decrypted values
- ✅ Profile update saves encrypted values to database
- ✅ Profile completion check works correctly
- ✅ Database shows encrypted (gibberish) values

---

## Phase 3 — Candidate Biography & Platform Encryption

**Goal**: Encrypt `candidates.biography` and `candidates.platform`.

### Service Changes

1. **`backend/src/services/election.service.js`**:
   - `mapCandidate()` → decrypt `biography`, `platform` after mapping
   - `createCandidate()` → encrypt before insert
   - `updateCandidate()` → encrypt before update
   - `listCandidates()` → decryption happens in `mapCandidate()`

2. **`backend/src/controllers/election-organizer.controller.js`**:
   - No changes needed if encryption is in service layer

### Rollback

- Revert changes to `mapCandidate()` and create/update functions

### Testing

- ✅ Candidate management shows correct biography and platform
- ✅ Voter ballot shows decrypted candidate info
- ✅ Database shows encrypted values
- ✅ Candidate update preserves encryption

---

## Phase 4 — Event Participants: first_name, last_name, metadata Encryption

**Goal**: Encrypt `event_participants.first_name`, `last_name`, and `metadata` JSONB.

### Service Changes

1. **`backend/src/services/participant.service.js`**:
   - `registerParticipant()` → encrypt `first_name`, `last_name`, `metadata` before insert
   - `updateParticipantInformation()` → encrypt `metadata` before update
   - `listEventParticipants()` → decrypt fields after select
   - `findEventParticipant()` → decrypt fields after select

2. **`backend/src/services/election.service.js`**:
   - `listEventVoters()` → decrypt `first_name`, `last_name` in the voter list response

3. **`backend/src/services/invitation.service.js`**:
   - When reading participant data for email, decrypt first_name/last_name

### Handling JSONB metadata encryption

The `metadata` JSONB field requires special handling:

- Encrypt the entire JSON object as a string
- Store as a special format: `__ENCRYPTED__:base64_string` prefix to distinguish from plain JSON
- Or add a separate encrypted_metadata column

**Recommendation**: Encrypt the entire JSON object and store in the same column with a prefix marker. The old `v_event_voters` view may need updating to not expose raw metadata.

### Rollback

- Revert participant service changes
- If using prefix marker, can identify and restore encrypted values

### Testing

- ✅ Voter list shows correct first_name and last_name
- ✅ Information form builder shows correct field values
- ✅ Dynamic participant table shows correct names
- ✅ Database shows encrypted values (gibberish or `__ENCRYPTED__` prefix)

---

## Phase 5 — Invitations: temp_password Encryption

**Goal**: Encrypt `invitations.temp_password`.

### Service Changes

1. **`backend/src/services/invitation.service.js**:
   - `inviteVoterToEvent()` → encrypt `temp_password` before storing (if stored)
   - `resendVoterInvitation()` → decrypt `temp_password` before sending email
   - `sendVoterInvitation()` → decrypt before email
   - `sendAllPendingInvitations()` → decrypt before email

### Note

The invitation flow already stores `temp_password: null` in most cases. The `temp_password` is only stored when explicitly provided. Currently, the system generates a temp password, hashes it for the user record, and sends the plaintext via email — but the plaintext is not stored in the database. This means:

- If `temp_password` is `null` → no encryption needed
- If `temp_password` is provided → encrypt before insert, decrypt before resend

### Rollback

- Revert invitation service changes

### Testing

- ✅ Voter invitation flow works (new accounts)
- ✅ Invitation resend works
- ✅ Send all pending invitations works
- ✅ Database does not contain plaintext temp passwords

---

## Phase 6 — Poll Answers Encryption

**Goal**: Encrypt free-text `poll_answers.answer`.

### Service Changes

1. **`backend/src/services/polling.service.js`**:
   - Submission endpoint → encrypt `answer` before insert
   - Poll results/analytics → decrypt answers after select
   - CSV export → decrypt before export

### Rollback

- Revert polling service changes

### Testing

- ✅ Poll submission stores encrypted answers
- ✅ Poll results show decrypted answers
- ✅ Poll analytics export contains decrypted text
- ✅ Database shows encrypted values

---

## Phase 7 — Audit Log Details Encryption (Optional)

**Goal**: Encrypt sensitive audit log `details` JSONB.

### Service Changes

1. **`backend/src/foundation/audit.js`**:
   - `recordAudit()` → encrypt `details` before insert
   - `listAuditTrail()` → decrypt `details` after select

### Complexity

The audit log stores structured JSONB in `details`. The approach:

- Encrypt the entire JSON object as a string
- Add an `is_encrypted` boolean column or use a prefix marker
- The `v_audit_log_with_user` view may need updating

**Alternative**: Only encrypt specific sensitive audit actions (e.g., those containing email addresses or personal info) rather than all audit details.

### Rollback

- Revert audit.js changes

### Testing

- ✅ Audit log writing still works
- ✅ Admin audit log view shows decrypted details
- ✅ Database shows encrypted details

---

## Phase 8 — Email Search Optimization

**Problem**: After encrypting emails, the `findUserByEmail()` function can no longer query by plaintext email directly.

### Solution: Two-Phase Email Lookup

```javascript
async function findUserByEmail(email) {
  const emailHash = hashEmail(email);

  // Phase 1: Find by hash (fast, indexed)
  const { data: candidates } = await db()
    .from("users")
    .select("*")
    .eq("email_hash", emailHash);

  // Phase 2: Decrypt and verify (prevents hash collision)
  for (const user of candidates ?? []) {
    const decryptedEmail = decrypt(user.email);
    if (decryptedEmail === email) {
      return { ...user, email: decryptedEmail }; // Return with decrypted email
    }
  }

  return null; // Not found
}
```

### Why Not Just Use the Hash?

- SHA-256 is one-way and safe, but emails are low-entropy
- An attacker with the hash could still do a rainbow table attack on common emails
- **Mitigation**: The hash is only useful for lookup if you already know the email; knowing the hash alone doesn't reveal the email
- **Additional mitigation**: Use a pepper (secret salt) in the hash: `SHA-256(LOWER(email) + PEPPER)`

### Rollback

- Revert to direct email column queries (if encryption is removed)

---

## Data Migration Strategy

### Pre-Migration (Backup)

```bash
pg_dump -h $DB_HOST -U $DB_USER -d votrix --data-only -f backup_pre_encryption.sql
```

### Migration Script Pattern

```javascript
// scripts/migrate_encrypt_column.mjs
import { createClient } from "@supabase/supabase-js";
import { encrypt } from "../src/utils/encryption.js";

async function migrate() {
  const batchSize = 100;
  let offset = 0;
  let total = 0;

  while (true) {
    const { data: rows, error } = await supabase
      .from("users")
      .select("id, email")
      .range(offset, offset + batchSize - 1);

    if (error) throw error;
    if (!rows?.length) break;

    for (const row of rows) {
      const encrypted = encrypt(row.email);
      const emailHash = hashEmail(row.email);

      await supabase
        .from("users")
        .update({ email: encrypted, email_hash: emailHash })
        .eq("id", row.id);
    }

    total += rows.length;
    offset += batchSize;
    console.log(`Migrated ${total} rows...`);
  }

  console.log(`Migration complete: ${total} rows encrypted`);
}

migrate().catch(console.error);
```

### Verification Script

```javascript
// scripts/verify_encryption.mjs
// 1. Count rows where email does NOT look encrypted (starts with '@')
// 2. Count non-null email_hash where hash doesn't match
// 3. Try decrypting each encrypted email and verify it's valid
```

### Rollback Script

```javascript
// scripts/rollback_encryption.mjs
// 1. Read backup SQL file
// 2. Restore original plaintext values
// 3. Remove email_hash column (if desired)
// 4. Verify all values match backup
```

---

## Deployment Sequence

1. **Phase 0**: Create utility + env config (no DB changes, safe to deploy)
2. **Phase 1**: Migration + user service changes (requires maintenance window)
3. **Phase 2**: Name/position encryption (no new migration needed)
4. **Phase 3-7**: Subsequent phases (each can be deployed independently)

### Downtime Requirements

- **Phase 1**: ~5-10 minutes of read-only mode during email migration
- **Phases 2-7**: No downtime needed (zero-downtime compatible)
- **Total estimated downtime**: One 15-minute maintenance window

---

## Testing Checklist

### Unit Tests

- [ ] `encrypt(plaintext)` returns valid base64 string
- [ ] `decrypt(encrypted)` returns original plaintext
- [ ] `hashEmail(email)` returns consistent 64-char hex
- [ ] Different keys produce different ciphertexts
- [ ] Tampered ciphertext throws decryption error
- [ ] Empty string encryption/decryption works
- [ ] Long text (10KB) encryption/decryption works

### Integration Tests

- [ ] Login flow with encrypted email
- [ ] Organizer creation with encrypted fields
- [ ] Voter invitation by email
- [ ] CSV import with email lookup
- [ ] Candidate biography display
- [ ] Poll answer submission and retrieval
- [ ] Admin organizer list display
- [ ] Organizer profile update and read

### Database Tests

- [ ] All encrypted columns contain non-plaintext values
- [ ] email_hash index is being used in query plans
- [ ] No performance regression on login path
- [ ] Audit trail still functions correctly

### Rollback Tests

- [ ] Rollback script restores all original values
- [ ] System functions normally after rollback
- [ ] No data loss occurs during rollback

---

## Performance Impact Estimates

| Operation                   | Before     | After                       | Overhead |
| --------------------------- | ---------- | --------------------------- | -------- |
| Login (by email)            | 1 DB query | 1 DB query + decrypt        | ~1ms     |
| List 100 organizers         | DB read    | DB read + 100 decrypts      | ~5ms     |
| Create organizer            | 1 insert   | 1 encrypt + 1 insert        | ~0.5ms   |
| List 500 voters with names  | DB read    | DB read + 500 decrypts      | ~25ms    |
| Submit ballot               | 3 inserts  | No encryption (scores only) | 0ms      |
| Poll results (1000 answers) | DB read    | DB read + 1000 decrypts     | ~50ms    |

**Total estimated overhead**: <100ms for typical API responses. Negligible for most operations.

### Optimization Recommendations

1. **Cache decrypted results** for frequently accessed data (e.g., organizer list)
2. **Batch decrypt** in array loops rather than individually
3. Avoid encryption on hot-path write operations (voting, scoring)
4. Consider a read-replica for decrypt-heavy operations

---

## Summary of Files to Modify

| Phase | Files                                                             | Type    |
| ----- | ----------------------------------------------------------------- | ------- |
| 0     | `backend/src/utils/encryption.js`                                 | **NEW** |
| 0     | `backend/src/config/env.js`                                       | Edit    |
| 1     | `backend/scripts/migrate_encrypt_emails.mjs`                      | **NEW** |
| 1     | `backend/scripts/rollback_encryption.mjs`                         | **NEW** |
| 1     | `backend/src/services/user.service.js`                            | Edit    |
| 1     | `backend/src/services/auth.service.js`                            | Edit    |
| 1     | `backend/src/services/admin.service.js`                           | Edit    |
| 1     | `backend/src/services/csv-import.service.js`                      | Edit    |
| 1     | `backend/src/services/invitation.service.js`                      | Edit    |
| 1     | `backend/src/database/migrations/033_aes256_email_encryption.sql` | **NEW** |
| 2     | `backend/src/services/organizer-profile.service.js`               | Edit    |
| 3     | `backend/src/services/election.service.js`                        | Edit    |
| 4     | `backend/src/services/participant.service.js`                     | Edit    |
| 5     | `backend/src/services/invitation.service.js`                      | Edit    |
| 6     | `backend/src/services/polling.service.js`                         | Edit    |
| 7     | `backend/src/foundation/audit.js`                                 | Edit    |
