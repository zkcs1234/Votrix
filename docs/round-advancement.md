# Round advancement and score contributions

In **Rounds & Scoring**, configure two separate choices:

| Setting | Example | Meaning |
| --- | --- | --- |
| Next Round Score Handling: Weighted | Preliminary 30%, Final 70% | Determines how round scores contribute to the combined result. Weights total 100%. |
| Preliminary: Advancement | Top N = 5 | Selects the highest-ranked five contestants for Final, including anyone tied at the cutoff. |
| Preliminary: Advancement | Top percentage = 30% | Selects 30% of the eligible contestants, rounded up, including cutoff ties. This is unrelated to a 30% score contribution. |

Other advancement policies include all contestants, a configured score threshold, and manual selection. Use the configured scoring method to interpret the standings; rank-based scoring compares placements. Pageant advancement applies separately within each division, so Top 5 means five men and five women, subject to cutoff ties and available contestants. Other competition types retain their configured ranking scope.

## Organizer workflow

1. Complete the current round's judge submissions and close its scoring session in **Live Control**. Resolve applicable organizer deductions. Numeric official calculation runs automatically when its source requirements are satisfied; manual placement methods require explicit placements.
2. Open **Tabulation → Finalization**. Assign an independent reviewer if needed. The assigned reviewer verifies the current official calculation; the organizer then finalizes it.
3. Open **Tabulation → Round Advancement**, or the **Advancement to Final** shortcut in the round status header. The page is available before finalization and lists pending requirements. Once finalized it shows **Preliminary tabulation complete**.
4. Click **Review Advancement**. The system proposes qualifiers from finalized standings using the frozen advancement policy. For automatic policies, review the selection; for manual advancement, select contestants explicitly. Enter the advancement decision reason and click **Confirm reviewed qualifiers**.
5. The page shows the confirmed qualifier count and **Qualifiers confirmed** status. Confirmation is saved in the database and remains visible after refresh. Confirmation alone does not open Final scoring.
6. Click **Open Final in Live Control**. This checks that the incoming qualification remains current and opens the correct competition and round. Start that round with the existing Live Control controls and manage contestant/criterion access there. Only confirmed qualifiers enter the next session.

Calculations and proposed qualifiers are automatic. Independent verification, finalization, qualifier confirmation, and starting the next session remain explicit actions. Reopening or correcting the source round invalidates its old advancement readiness; downstream scoring remains blocked until the current source is finalized and its qualifiers confirmed again.

## Deployment and verification

Apply `backend/src/database/migrations/131_native_round_advancement_status.sql` after migration 130 in the intended Supabase project's SQL Editor. Deploy the corresponding frontend changes. The migration adds authorized outgoing advancement/session status without changing score fingerprints or rewriting saved submissions, calculations, reviews, or publications.

Local verification: `node backend/scripts/test-native-round-advancement-local.mjs`. This script requires the identity-verified synthetic PostgreSQL fixture on localhost port 55440, checks division selection and next-round start guards, applies migration 131 twice, and rolls back every database change. It does not deploy to Supabase.
