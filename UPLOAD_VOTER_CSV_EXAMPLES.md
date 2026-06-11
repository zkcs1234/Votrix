# CSV examples: voter uploads per module

This project enrolls “voters” (participants) into an event by uploading a CSV of user emails (optionally with names). The CSV headers are normalized (trim → lowercase → spaces to underscores), and the importer uses these fields:

- `email` (required)
- `first_name` or `firstname` (optional)
- `last_name` or `lastname` (optional)

> Important: “first_name” vs “firstname” is accepted because the code checks both variants.

---

## 1) Election Module — Voters CSV (enroll voters)

### CSV columns

| Column                        | Required | Notes                                               |
| ----------------------------- | -------: | --------------------------------------------------- |
| `email`                       |       ✅ | Used to create/find the user and invite/enroll them |
| `first_name` (or `firstname`) | optional | Saved to event enrollment `first_name`              |
| `last_name` (or `lastname`)   | optional | Saved to event enrollment `last_name`               |

### Example CSV

```csv
email,first_name,last_name
john.dela.cruz@example.com,John,Dela Cruz
jane.santos@example.com,Jane,Santos
```

---

## 2) Polling Module — Voters CSV (enroll voters)

The polling event enrollment uses the same concept as election enrollment in this repo (event-voter enrollment by email). Use the same voter CSV schema:

### CSV columns

| Column                        | Required | Notes    |
| ----------------------------- | -------: | -------- |
| `email`                       |       ✅ | Required |
| `first_name` (or `firstname`) | optional | Optional |
| `last_name` (or `lastname`)   | optional | Optional |

### Example CSV

```csv
email,first_name,last_name
mark.reyes@example.com,Mark,Reyes
```

---

## 3) Competition Scoring / Pageant Module — “Voters” CSV for judges (import judges accounts)

In this codebase, the competition scoring CSV importer imports **judges** (judges are stored as event-voters with `is_judge=true`).

### CSV columns

| Column                        | Required | Notes                    |
| ----------------------------- | -------: | ------------------------ |
| `email`                       |       ✅ | Required                 |
| `first_name` (or `firstname`) | optional | Used when inviting judge |
| `last_name` (or `lastname`)   | optional | Used when inviting judge |

### Example CSV

```csv
email,first_name,last_name
judge.one@example.com,Judge,One
judge.two@example.com,Judge,Two
```

---

## Validation rules you should expect

- `email` must be present and look like a valid email.
- Duplicate `email` rows in the same CSV cause validation failure (for the pageant/competition judge importer).

---

## Minimal templates

### Minimal election/polling voter CSV

```csv
email
```

### Minimal competition scoring judge CSV

```csv
email
```
