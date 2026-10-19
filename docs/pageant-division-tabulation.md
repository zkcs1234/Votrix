# Separate native Pageant calculations

Native Pageant tabulation now carries the registered division and number into the official engine and enables its existing per-division ranking mode. Each judge assigns placements within that division. Final ranks, numeric/rank carry, deductions and ties remain independent for Men and Women. Other native competition types retain their current scope.

Overview and Matrix display separate compact division tables. Ranking/tie review, finalized results, public results, and CSV/Excel/PDF reports retain division identity. Sharing first place across different divisions is not a tie. Top N and top percent advancement apply separately per division, including boundary ties. Existing frozen target-roster restrictions remain enforced.

## Apply

1. Apply `backend/src/database/migrations/130_pageant_division_tabulation.sql` in the Supabase SQL Editor after the existing migrations through 129. It requires the native tabulation/deduction/automatic-calculation functions from 124, 126 and 127.
2. Deploy/restart the updated backend and refresh/deploy the frontend.
3. Open the source round in Tabulation. Complete numeric Pageant sources with a stale combined calculation reconcile through the existing automatic-calculation path. A new immutable calculation version is saved. Reconfirm source-round qualifications as needed before later rounds.
4. Independently verify, finalize and explicitly publish the corrected version. Existing submitted score records, calculation history, reviews and publication records are not rewritten.

Division membership and registered numbers are included in calculation evidence and its source fingerprint. Unassigned Pageant contestants produce `PAGEANT CONTESTANT DIVISION REQUIRED`; the engine does not silently fall back to event-wide ranking. Old backend output without division calculation metadata is rejected by the new SQL guard. Private frozen roster membership is not included in public result projections.

## Verification

- 64 backend and 71 frontend tests passed, including independent judge placements/winners, changes isolated to one division, numeric carry, placement deductions, division cutoffs, tie review, exports and public grouping.
- `node backend/scripts/test-pageant-division-tabulation-local.mjs` verified migration reruns, new source fingerprints, replacement of a previously finalized combined calculation with a new current version, unchanged historical calculation records, SQL guards, cutoffs, public ties and permissions. It proves a synthetic localhost database identity and rolls back all changes.
- Scoped ESLint and the production build passed. The existing build chunk-size warning remains.
- `node backend/scripts/test-pageant-tabulation-browser.mjs` checked real native engine output in isolated visual fixtures at 1440, 390 and 320 pixels. Both division tables start at first place, with no horizontal page overflow. Evidence: `audits/pageant-tabulation-2026-10-19/`.

The migration has not been applied to Supabase by this task.
