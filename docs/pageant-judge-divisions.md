# Pageant judge division display

The native scoring RPC returns a competition participation number for each entry. The scoring service now also loads the registered contestant number and division metadata, scoped to the event and only the master contestant IDs already authorized by that RPC. These are presentation fields; score writes, draft keys, locks, eligibility and submissions retain their original participation IDs.

The judge session bar has a horizontally scrollable Event Wide / Men / Women selector before the connection state. Other configured divisions keep their own labels. Event Wide sorts registered numbers with Men before Women, producing 1, 1, 2, 2 when both divisions use those registered numbers. Each division filter shows only its contestants and retains their registered numbers, including qualification gaps. It does not silently reassign official numbers.

Rows retain the existing continuous scoring-table layout, criterion groups, ranges, input controls, locks and deductions. Blue Men and pink Women labels distinguish the divisions; unknown custom divisions use their configured label/color, and missing division metadata is never inferred from names or photos. Filtering only controls visibility. Hidden contestants remain required for whole-round submission and their scores remain in the draft state. The filter resets when switching scoring contexts.

No SQL migration or data rewrite is required. Deploy/restart the backend and deploy the frontend together so the scorer receives registration metadata.

Validation: 50 frontend scoring/workspace tests and 16 backend scoring service tests passed. Scoped ESLint and the production build passed. Isolated browser checks passed at 1440, 390 and 320 pixels, verifying paired numbers, division filters, unchanged table headers and contained horizontal scrolling. Evidence is under `audits/pageant-divisions-2026-10-19/`; no database writes were performed.
