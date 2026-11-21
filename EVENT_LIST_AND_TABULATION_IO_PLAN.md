# Plan: Consistent organizer event lists (item 4) and tabulation export/import (item 5)

Status: items 1–3 and **item 4 are implemented**. Item 5 **phase 1 (export) is implemented**; phases 2–5 (import) are still plan only and wait on the open decisions below.

---

## Item 4 — Inconsistent event list actions (Organizer)

### What is wrong today

| | Election (`ElectionEventsPage.jsx`) | Polling (`PollingEventsPage.jsx`) | Competition (`CompetitionEventsPage.jsx`) |
|---|---|---|---|
| Edit/open button | **"Manage"** (always, filled primary button, pencil icon) | **"Edit"** or **"View"** depending on `isSetupLocked(status)` | **"Edit"** or **"View"** depending on `isSetupLocked(status)` |
| Draft shortcut | "Continue setup" (secondary link) | "Continue setup" (filled primary) | "Continue setup" (filled primary) |
| Status | Badge component | Plain capitalised text | Plain capitalised text |
| Card | Shared `EventCard` component | Inline markup | Inline markup |
| Page title | "Events" | "Polls" | "Competition Scoring events" |
| "New event" button | `v-btn`-style link | hand-rolled classes | hand-rolled classes |
| Loading state | Skeleton cards | Spinner | Spinner |

Root cause: three copy-pasted pages. Only Polling and Competition use the setup-lock rule (`isSetupLocked` in `frontend/src/utils/constants.js`), so Election says "Manage" even when its setup is locked and the page is effectively read-only.

### Recommended wording

Use the lock rule everywhere, since it is the truth about what the next screen allows:

- Setup editable (draft only, per `isSetupLocked`): **Edit**
- Setup locked (scheduled / active / completed / cancelled / archived): **View**
- Do not use "Manage" for this button. It is vague, and it hides that an active event cannot be edited.

Keep the secondary actions as they are: **Preview**, **Continue setup** (draft only), **Live Control** (competition, not read-only).

### Steps

1. Create `frontend/src/components/organizer/EventListCard.jsx`: title link, status `Badge`, optional description, and an `actions` area. It owns the Edit/View button via `isSetupLocked(status)`, so a module cannot drift again.
2. Create a shared `EventListPage` shell (header with title + "New event", draft banner slot, error and retry, empty state, skeleton loading). Each module passes only its service, labels and extra actions.
3. Migrate Election, Polling and Competition to it. Keep per-module extras (Election's `electionStatus` badge, Competition's Live Control, each module's Preview modal).
4. Titles: "Elections", "Polls", "Competitions" (matching the sidebar names).
5. Make "Continue setup" the same variant in all three. Done as the single primary action on draft cards (Polling and Competition already did this); everything else is secondary.
6. Tests: one test per page asserting Edit for draft/scheduled and View for active/completed; a shared card test. Existing election page tests that look for "Manage" get updated.

Files: the three `*EventsPage.jsx` files, the two new components, and their tests. No backend change.

Effort: small to medium (about half a day).

---

## Item 5 — Better export, plus an import format for judges' scores

### What already exists (important, so we extend rather than rebuild)

- **Excel workbook export** — `backend/src/services/competition-workbook.service.js` (`GET .../workflow/excel`). Sheets include Raw Scores, Judge Worksheets, Score Matrix, Rankings, Computation Breakdown, and one `Judge Sheet N` per judge per round, with live formulas and division colours.
- **Excel "import" is verify-only** — `POST .../workflow/excel/verify`. It compares an uploaded workbook to what the system would generate and reports matches/mismatches. It **never writes scores**.
- **Native CSV exports** — `competition-native-exports.js` (`judge`, `worksheets`, `tabulation`, `final`). Long, wide, one-row-per-score-target records with many metadata columns, gated on a current source digest and, for official kinds, on publication.
- **Frontend** — `utils/exportReport.js` offers CSV, `.xls` (HTML-based, not real xlsx) and PDF. `competition-native-results.service.js` exposes the CSV kinds.
- **Import patterns to reuse** — admin voter import uses preview then confirm (`CsvImportPreview`, `CsvImportResults`, `csvImportLimiter`, `uploadSingle`).
- Backend already has the `xlsx` and `csv-stringify` packages and `multer` for uploads.

### Problems to fix in export

1. The `.xls` download is an HTML table renamed `.xls`; Excel shows a format warning. Replace with true `.xlsx` generated from the same data.
2. The native CSV is audit-oriented (dozens of metadata columns, mixed record types in one file). Organizers want a readable sheet. Offer two export styles:
   - **Score matrix (readable):** one row per contestant, one column per judge per criterion, plus judge total, final score and rank.
   - **Long / audit format:** the existing format, unchanged.
3. Export scope is unclear. Add explicit choices: this round or all rounds; one judge or all judges.
4. Filenames use IDs (`competition-<uuid>-single-judge.csv`). Use event title + round + date.
5. Always include a README / "Info" sheet: event, round, rule version, scoring method, precision, export time.

### Recommended import format (judges' scores, for the tabulation stage)

Use case: judges scored on paper, or a judge's device failed, and the organizer or a scorer must enter scores in bulk.

**Format: one row per contestant, one file (or sheet) per judge per round.** It matches a paper score sheet and is the layout that survives being edited in Excel.

```
Header block (rows 1–4, read-only, used for validation)
Template        VOTRIX-competition-import-1
Event ID        <uuid>
Round ID        <uuid or "overall">
Judge ID        <uuid>
Rule version    <id>

Table (row 6 onward)
Entry ID | Entry No. | Entry Name | <Criterion A> (30%) | <Criterion B> (20%) | ... | Remarks
<uuid>   | 1         | Ana Cruz   | 8.5                 | 9.0                 | ... |
```

For criteria that have minor criteria, use one column per minor, headed `Criterion A › Minor 1 (max 10)` so the maximum is visible next to the cell.

Rules:
- **Entry ID is the key**, not the name or number. Name and number are shown for the human only and are ignored on import.
- **Template generated by the system**, pre-filled with the contestants and criteria for that judge's scope (it already knows scope via `scopeAllows`). Organizers download the template, fill the score cells, upload it. This avoids free-form CSVs entirely.
- Scores are plain numbers. No formulas, no merged cells in the data table.
- **Rank-based events:** one column "Rank" instead of criteria.
- **Manual events:** one column "Placement".
- Accept `.xlsx` (primary) and `.csv` (same columns, header block as the first lines).

### Import flow (always preview, never direct write)

1. Download template (`GET .../workflow/import-template?roundId&judgeId`).
2. Upload (`POST .../workflow/import/preview`) → server returns a per-row result: valid, warning, or error, with cell addresses. Nothing is saved.
3. Validation: template version, event/round/judge IDs match, no unknown or duplicate Entry IDs, score is numeric and within each criterion's min/max, every in-scope contestant present (missing → error unless "allow partial" is chosen), file ≤ 5 MB (the existing workbook limit), formulas rejected (the existing `checkZip` and formula checks).
4. Organizer reviews the preview, then confirms (`POST .../workflow/import/commit` with the preview token).
5. Commit writes scores through the **same submission path as a live judge** so lock, revision, source digest and recalculation all behave identically. Every row is tagged `source = 'import'` with the importing user and batch ID, and an audit entry is recorded (`competition.scores.import`).
6. Existing safeguards continue to apply: rate limiter, setup/status locks, "calculation becomes stale" handling.

### Open decisions for you (these change the design)

1. **Should imported scores count as official judge submissions, or only as a draft the judge must confirm?** Counting them directly is faster but weakens "the judge submitted this". Recommended: imported rows land as *pending*, and the organizer marks the batch "verified against signed paper sheets" (recorded in the audit log) before they count.
2. **Who may import?** Recommended: organizer only (and officers acting inside the organizer workspace), never judges.
3. **Is import allowed after calculation or publication?** Recommended: no. Require reopening the round first, as today.
4. **xlsx only, or xlsx and csv?** Recommended: both, template-driven.
5. **Keep `.xls` and PDF exports?** Recommended: keep PDF for printing; drop the fake `.xls`.

### Implementation phases

| Phase | Work | Files (expected) |
|---|---|---|
| 1 | Real `.xlsx` export + readable score-matrix style + readable filenames + Info sheet | `exportReport.js`, `competition-workbook.service.js`, `NativeTabulationWorkspace.jsx` |
| 2 | Import template generator (per judge per round) | `competition-workbook.service.js` (new `buildImportTemplate`), route + controller |
| 3 | Import preview + validation (no writes) with an error table in the UI | new `competition-import.service.js`, `competition-workbook-upload.js`, new `TabulationImportDialog.jsx` |
| 4 | Commit path, pending/verified status, audit entries, source tagging | competition submission service + migration for the source/batch columns |
| 5 | Tests: template round-trip (export → fill → import → same totals), bounds errors, wrong judge/round, duplicates, formula injection, stale source digest | backend `__tests__`, frontend dialog tests |

A DB migration is needed in phase 4 (batch/source columns). It needs your review before it runs.

Effort: phase 1 small, phases 2–3 medium, phase 4 medium to large (the integrity decisions above drive it).

---

## Suggested order

1. Item 4 (small, no backend).
2. Item 5 phase 1 (export improvements, no risk to scoring data).
3. Answer the open decisions, then phases 2–5.
