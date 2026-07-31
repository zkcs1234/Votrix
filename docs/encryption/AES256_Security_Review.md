# VOTRIX AES-256 Encryption — Security Review

## 1. Cryptographic Design

### 1.1 Algorithm Selection

**Chosen**: **AES-256-GCM** (Galois/Counter Mode)

| Feature                        | AES-256-GCM               | AES-256-CBC                   | AES-256-CTR |
| ------------------------------ | ------------------------- | ----------------------------- | ----------- |
| Confidentiality                | ✅                        | ✅                            | ✅          |
| Integrity (authentication tag) | ✅                        | ❌ (requires HMAC separately) | ❌          |
| Built-in IV/nonce              | ✅ (12 bytes recommended) | ✅ (16 bytes)                 | ✅          |
| Parallelizable                 | ✅                        | ❌                            | ✅          |
| Authenticated encryption       | ✅                        | ❌                            | ❌          |
| Recommended by NIST            | ✅ (since 2007)           | ✅ (legacy)                   | ✅          |

**Why GCM over CBC**:

1. GCM provides **authenticated encryption** — the authentication tag ensures ciphertext has not been tampered with (prevents bit-flipping attacks)
2. CBC requires a separate HMAC for integrity, adding complexity and risk
3. GCM is faster on modern hardware with AES-NI instructions
4. GCM is the modern standard recommended by cryptographers

### 1.2 IV/Nonce Generation

```javascript
const iv = crypto.randomBytes(12); // 96 bits = NIST recommended for GCM
```

- **Never reuse an IV with the same key** (catastrophic for GCM — leaks the authentication key)
- Each encryption call generates a fresh random IV
- IV is stored alongside the ciphertext (prepended in the combined format)

### 1.3 Authentication Tag

- GCM produces a 16-byte (128-bit) authentication tag
- Stored after the IV in the combined output
- Verified on every decryption — if tampered, decryption throws
- **Warning**: Always verify the authentication tag before using decrypted data

### 1.4 Key Derivation

- Encryption key: 256-bit (32 bytes) from environment variable
- Format: 64 hex characters
- Example: `ENCRYPTION_KEY="a1b2c3d4e5f6...64chars..."`

---

## 2. Key Management

### 2.1 Key Storage

| Location                                              | Allowed?           | Reason                                                           |
| ----------------------------------------------------- | ------------------ | ---------------------------------------------------------------- |
| Environment variables                                 | ✅ **RECOMMENDED** | Standard practice, encrypted at rest by platform (Vercel/Render) |
| `.env` file (local dev)                               | ✅ **ACCEPTABLE**  | Must be in `.gitignore`                                          |
| Secret manager (AWS Secrets Manager, HashiCorp Vault) | ✅ **BEST**        | Adds key rotation, audit, access control                         |
| Hardcoded in source code                              | ❌ **FORBIDDEN**   | Committed to Git                                                 |
| Database                                              | ❌ **FORBIDDEN**   | Defeats the purpose of encryption                                |
| Frontend/browser                                      | ❌ **FORBIDDEN**   | Exposes key to users                                             |

### 2.2 Key Rotation Strategy

**Scheduled rotation**: Every 90 days in production

**Rotation procedure**:

1. Generate new key → add as `ENCRYPTION_KEY_NEW` environment variable
2. Deploy application with both old key (for decryption) and new key (for encryption)
3. Data written with new key; old data remains decryptable with old key
4. Batch re-encrypt old data (migrate from old key to new key) during maintenance window
5. Remove old key once all data is re-encrypted

**Emergency rotation**: If key is compromised, immediately:

1. Generate new key
2. Re-encrypt all data with new key
3. Invalidate all sessions (increment `token_version` for all users)

### 2.3 Key Separation

| Environment | Key Variable             | Purpose                |
| ----------- | ------------------------ | ---------------------- |
| Development | `ENCRYPTION_KEY_DEV`     | Local development      |
| Staging     | `ENCRYPTION_KEY_STAGING` | Pre-production testing |
| Production  | `ENCRYPTION_KEY`         | Live data              |

**Never share keys between environments**. A developer's laptop compromise should not expose production data.

### 2.4 Backup Considerations

- **Encryption keys must be backed up separately from encrypted data**
- Store backup keys in a secure vault (e.g., Bitwarden, 1Password Teams)
- Include key backup instructions in the team's disaster recovery plan
- Without the encryption key, encrypted backups are unrecoverable

---

## 3. Security Risks Assessment

### 3.1 Weak Key Storage

| Risk                                    | Severity     | Recommendation                                                      |
| --------------------------------------- | ------------ | ------------------------------------------------------------------- |
| Key stored in `.env` committed to Git   | **CRITICAL** | Add `ENCRYPTION_KEY` to `.gitignore`; use a `.env.example` template |
| Key visible in process management tools | **HIGH**     | Restrict access to production servers; use secret manager           |
| Key logged in error traces              | **HIGH**     | Ensure `sanitizeUser()` and logging filters strip encryption keys   |
| Key passed via command-line args        | **CRITICAL** | Only use environment variables                                      |

### 3.2 Cryptographic Risks

| Risk                   | Severity     | Explanation                                              | Mitigation                                                                       |
| ---------------------- | ------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| IV reuse               | **CRITICAL** | Reusing IV with same key in GCM leaks authentication key | ALWAYS use `crypto.randomBytes(12)` for each encryption                          |
| No authentication tag  | **CRITICAL** | Attacker can modify ciphertext                           | GCM always produces 16-byte tag; verify on decrypt                               |
| Weak key (low entropy) | **HIGH**     | Brute-force attack becomes feasible                      | Enforce 64 hex chars (256 bits); validate on startup                             |
| Timing side-channel    | **MEDIUM**   | Attacker measures decryption time                        | Node.js `crypto` module is constant-time for AES-NI                              |
| Memory exposure        | **MEDIUM**   | Key in memory dump                                       | Use `Buffer.alloc()` and clear after use (though V8 GC may not immediately wipe) |

### 3.3 Implementation Risks

| Risk                                 | Severity     | Scenario                                         | Recommendation                                             |
| ------------------------------------ | ------------ | ------------------------------------------------ | ---------------------------------------------------------- |
| Encrypting twice                     | **MEDIUM**   | Middleware encrypts, then service encrypts again | Use a flag or wrapper to prevent double encryption         |
| Returning encrypted data to frontend | **HIGH**     | API response contains raw encrypted string       | Always decrypt in service layer before controller response |
| Logging encrypted values             | **LOW**      | Console.log shows encrypted blob (safe)          | No action needed — encrypted values are safe to log        |
| Logging decrypted values             | **HIGH**     | Audit log shows plaintext PII                    | Ensure audit logs never log decrypted plaintext            |
| Decryption failure crash             | **MEDIUM**   | Invalid ciphertext causes app crash              | Wrap decrypt in try/catch; return 500 error gracefully     |
| Missing IV                           | **CRITICAL** | Old data without IV prefix                       | Migration script must handle legacy data check             |

### 3.4 Application-Level Risks

| Risk                                          | Severity   | Recommendation                                                              |
| --------------------------------------------- | ---------- | --------------------------------------------------------------------------- |
| Encrypted email breaks login                  | **HIGH**   | Use email_hash for lookup; decrypt+verify as second step                    |
| Encrypted fields break CSV export             | **MEDIUM** | Decrypt before writing to export file                                       |
| Encrypted fields break search                 | **MEDIUM** | Email uses hash lookup; other fields are not searchable                     |
| Poll answer encryption breaks analytics       | **LOW**    | Analytics queries must decrypt first                                        |
| Candidate biography encryption breaks reports | **LOW**    | Reports must decrypt before generating                                      |
| Sorting by encrypted field                    | **N/A**    | Encrypted fields should never be sortable; use plaintext fields for sorting |

### 3.5 Key Rotation Risks

| Risk                        | Severity     | Recommendation                                                      |
| --------------------------- | ------------ | ------------------------------------------------------------------- |
| Data encrypted with old key | **MEDIUM**   | Keep old key available until all data is re-encrypted               |
| Lost key = lost data        | **CRITICAL** | Store backup key in secure offline location                         |
| Partial rotation            | **HIGH**     | Track which rows have been re-encrypted; use a `key_version` column |

---

## 4. AES-256-GCM Implementation Specification

### 4.1 Encryption Function

```javascript
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits — NIST recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_ENCODING = "hex";

function getKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be 64 hex characters (256 bits)");
  }
  return Buffer.from(key, KEY_ENCODING);
}

export function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined) return null;
  if (plaintext === "") return "";

  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag();

  // Format: base64(iv + authTag + ciphertext)
  const combined = Buffer.concat([
    iv,
    authTag,
    Buffer.from(encrypted, "base64"),
  ]);
  return combined.toString("base64");
}

export function decrypt(encryptedString) {
  if (encryptedString === null || encryptedString === undefined) return null;
  if (encryptedString === "") return "";

  const key = getKey();
  const combined = Buffer.from(encryptedString, "base64");

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

export function hashEmail(email) {
  if (!email) return null;
  return crypto
    .createHash("sha256")
    .update(email.toLowerCase().trim())
    .digest("hex");
}
```

### 4.2 Decryption Failure Handling

```javascript
// In service layer:
try {
  return decrypt(encryptedValue);
} catch (error) {
  // If decryption fails, the data may be:
  // 1. Plaintext (not yet migrated)
  // 2. Corrupted
  // 3. Encrypted with a different key

  if (isPlaintext(encryptedValue)) {
    // Handle legacy plaintext data gracefully
    return encryptedValue;
  }

  logger.error("Decryption failed", { error: error.message });
  throw new ApiError(500, "Data decryption failed");
}

function isPlaintext(value) {
  // Simple heuristic: if it contains @ (for email), it's plaintext
  // More robust: check if valid base64 + can decode to expected format
  return typeof value === "string" && value.includes("@");
}
```

---

## 5. Defense-in-Depth Recommendations

### 5.1 Additional Security Layers (Beyond Encryption)

| Layer                       | Current Status         | Recommendation                                         |
| --------------------------- | ---------------------- | ------------------------------------------------------ |
| Password hashing (bcrypt)   | ✅ Already implemented | Continue; encryption is additive                       |
| JWT access/refresh tokens   | ✅ Already implemented | No changes needed                                      |
| CSRF protection             | ✅ Already implemented | No changes needed                                      |
| Rate limiting               | ✅ Already implemented | No changes needed                                      |
| Helmet security headers     | ✅ Already implemented | No changes needed                                      |
| Row-Level Security (RLS)    | Partial (some tables)  | Apply RLS to all tables as second layer                |
| Database encryption at rest | Supabase-managed       | Ensure Supabase project has encryption at rest enabled |
| HTTPS/TLS                   | ✅ Already configured  | Ensure TLS 1.3 for all connections                     |
| Input validation            | ✅ Validators exist    | No changes needed                                      |

### 5.2 Recommended Logging Policy

```javascript
// NEVER log:
console.log("Decrypted email:", decryptedEmail); // FORBIDDEN
console.log("Encryption key:", key); // FORBIDDEN
console.log("User password:", password); // FORBIDDEN

// ACCEPTABLE to log:
console.log("Email decrypted successfully for user:", userId);
console.log("Encryption operation completed:", { rowsAffected: count });
console.log("Encrypted value:", encryptedBlob); // Safe — cannot read without key
```

### 5.3 Testing Security

| Test                           | Description                                     | Frequency      |
| ------------------------------ | ----------------------------------------------- | -------------- |
| Unit tests for encrypt/decrypt | Verify round-trip correctness                   | Every commit   |
| Integration tests for login    | Ensure encrypted email doesn't break auth       | Every commit   |
| Penetration test               | Attempt to read encrypted data directly from DB | Quarterly      |
| Key rotation drill             | Practice rotating encryption key                | Every 3 months |
| Dependency scan                | Check for crypto library vulnerabilities        | Weekly         |

---

## 6. Compliance Considerations

### 6.1 Data Privacy

Encrypting the following fields brings VOTRIX closer to compliance with:

- **GDPR** (EU): Email, names, candidate bios — personal data requires protection
- **DPA** (Philippines): Personal Information Controllers must implement security measures
- **FERPA** (US, if applicable): Student education records

### 6.2 Breach Notification

If the database is compromised:

1. Encrypted fields are **safe** — attacker needs the encryption key
2. Email hash (`email_hash`) is **not sufficient** to identify users (one-way)
3. Non-encrypted fields (names, scores) would still be exposed
4. **Mitigation**: Breach impact is limited to non-sensitive fields

---

## 7. Summary of Critical Rules

| #   | Rule                                         | Enforcement                                            |
| --- | -------------------------------------------- | ------------------------------------------------------ |
| 1   | **NEVER hardcode encryption keys**           | Pre-commit hook scans for key patterns                 |
| 2   | **NEVER commit keys to Git**                 | `.gitignore` includes `ENCRYPTION_KEY`                 |
| 3   | **NEVER send keys to the frontend**          | Code review; no encryption imports in frontend         |
| 4   | **ALWAYS generate a fresh random IV**        | `crypto.randomBytes(12)` — enforced by utility         |
| 5   | **ALWAYS verify auth tag on decrypt**        | GCM verification built into utility                    |
| 6   | **NEVER log decrypted values**               | Code review; lint rule `no-console` for sensitive data |
| 7   | **ALWAYS decrypt in service layer**          | Never pass encrypted data to controllers               |
| 8   | **NEVER encrypt values needed for joins**    | Analysis report explicitly excludes keys, FKs, enums   |
| 9   | **ALWAYS backup encryption keys separately** | Disaster recovery documentation                        |
| 10  | **ALWAYS use separate keys per environment** | `ENCRYPTION_KEY` vs `ENCRYPTION_KEY_DEV`               |
