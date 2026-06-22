# CSV examples: voter uploads per module

This project enrolls "voters" (participants) into an event by uploading a CSV with user emails and temporary passwords. The CSV headers are normalized (trim → lowercase → spaces to underscores), and the importer uses these fields:

- `email` (required)
- `tempassword` or `temporarypassword` or `temp_password` or `temporary_password` (required, min 8 characters)

> Important: The password can be written as any of: `tempassword`, `temporarypassword`, `temp_password`, or `temporary_password`.

---

## 1) Election Module — Voters CSV (enroll voters)

### CSV columns

| Column                                    | Required | Notes                                                      |
| ----------------------------------------- | -------: | ---------------------------------------------------------- |
| `email`                                   |       ✅ | Used to create/find the user and invite/enroll them       |
| `tempassword` (or `temporarypassword`)    |       ✅ | Temporary password for the voter account (min 8 characters) |

### Example CSV

```csv
email,tempassword
john.dela.cruz@example.com,Password123!
jane.santos@example.com,SecurePass456@
```

---

## 2) Polling Module — Voters CSV (enroll voters)

The polling event enrollment uses the same concept as election enrollment in this repo (event-voter enrollment by email). Use the same voter CSV schema:

### CSV columns

| Column                                    | Required | Notes                                                      |
| ----------------------------------------- | -------: | ---------------------------------------------------------- |
| `email`                                   |       ✅ | Required                                                  |
| `tempassword` (or `temporarypassword`)    |       ✅ | Temporary password (min 8 characters)                      |

### Example CSV

```csv
email,tempassword
mark.reyes@example.com,MyPass789!
```

---

## 3) Competition Scoring / Pageant Module — "Voters" CSV for judges (import judges accounts)

In this codebase, the competition scoring CSV importer imports **judges** (judges are stored as event-voters with `is_judge=true`).

### CSV columns

| Column                                    | Required | Notes                                                      |
| ----------------------------------------- | -------: | ---------------------------------------------------------- |
| `email`                                   |       ✅ | Required                                                  |
| `tempassword` (or `temporarypassword`)    |       ✅ | Temporary password for the judge account (min 8 characters) |

### Example CSV

```csv
email,tempassword
judge.one@example.com,JudgePass123@
judge.two@example.com,JudgePass456@
```

---

## Validation rules you should expect

- `email` must be present and look like a valid email.
- `tempassword` must be present and at least 8 characters long.
- Duplicate `email` rows in the same CSV cause validation failure (for the pageant/competition judge importer).

---

## Minimal templates

### Minimal election/polling voter CSV

```csv
email,tempassword
```

### Minimal competition scoring judge CSV

```csv
email,tempassword
```

---

## Notes

- The `first_name` and `last_name` fields mentioned in older documentation are **not supported** in the current CSV import.
- Each voter receives an email invitation with their temporary password to set up their account.
- The temporary password must be at least 8 characters long.